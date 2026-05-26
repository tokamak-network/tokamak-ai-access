import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configure } from "../../src/targets/hermes.js";

function makeHome(): string {
  const dir = join(tmpdir(), `hermes-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, ".hermes"), { recursive: true });
  writeFileSync(join(dir, ".zshrc"), "export FOO=bar\n");
  return dir;
}

describe("hermes.configure", () => {
  let home: string;

  beforeEach(() => { home = makeHome(); });

  it("does not modify shell profile", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const profile = readFileSync(join(home, ".zshrc"), "utf8");
    expect(profile).toBe("export FOO=bar\n");
  });

  it("writes model section to config.yaml", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const config = readFileSync(join(home, ".hermes", "config.yaml"), "utf8");
    expect(config).toContain("model:");
    expect(config).toContain("qwen-3.6");
    expect(config).toContain("provider: custom");
  });

  it("model: is the first key when creating fresh config", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const config = readFileSync(join(home, ".hermes", "config.yaml"), "utf8");
    expect(config.trimStart()).toMatch(/^model:/);
  });

  it("preserves pre-existing config.yaml content", () => {
    writeFileSync(join(home, ".hermes", "config.yaml"), "theme: dark\n");
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const config = readFileSync(join(home, ".hermes", "config.yaml"), "utf8");
    expect(config).toContain("theme: dark");
    expect(config).toContain("model:");
  });

  it("is idempotent: second configure replaces model section", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    configure({ home, apiKey: "sk-test-2", model: "gpt-4" });
    const config = readFileSync(join(home, ".hermes", "config.yaml"), "utf8");
    const count = (config.match(/^model:/gm) ?? []).length;
    expect(count).toBe(1);
    expect(config).toContain("gpt-4");
    expect(config).not.toContain("qwen-3.6");
  });

  it("does not modify files in dry-run mode", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6", dryRun: true });
    const profile = readFileSync(join(home, ".zshrc"), "utf8");
    expect(profile).toBe("export FOO=bar\n");
    expect(existsSync(join(home, ".hermes", "config.yaml"))).toBe(false);
  });

  it("creates .bak before overwriting existing config.yaml", () => {
    const configPath = join(home, ".hermes", "config.yaml");
    writeFileSync(configPath, "theme: dark\n");
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const backup = readFileSync(configPath + ".bak", "utf8");
    expect(backup).toBe("theme: dark\n");
  });

  it("does not create .bak when config.yaml does not exist", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    expect(existsSync(join(home, ".hermes", "config.yaml.bak"))).toBe(false);
  });

  it("throws on malformed config.yaml", () => {
    writeFileSync(join(home, ".hermes", "config.yaml"), "{ bad: yaml: content: [[\n");
    expect(() => configure({ home, apiKey: "sk-test", model: "qwen-3.6" })).toThrow(/YAML이 손상/);
  });

  it("writes tokamak entry to custom_providers", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const config = readFileSync(join(home, ".hermes", "config.yaml"), "utf8");
    expect(config).toContain("custom_providers:");
    expect(config).toContain("name: tokamak");
    expect(config).toContain("api_mode: chat_completions");
  });

  it("custom_providers: second configure replaces tokamak entry, not duplicate", () => {
    configure({ home, apiKey: "sk-first", model: "qwen-3.6" });
    configure({ home, apiKey: "sk-second", model: "qwen-3.6" });
    const config = readFileSync(join(home, ".hermes", "config.yaml"), "utf8");
    const count = (config.match(/name: tokamak/g) ?? []).length;
    expect(count).toBe(1);
    expect(config).toContain("sk-second");
    expect(config).not.toContain("sk-first");
  });

  it("custom_providers: preserves non-tokamak entries", () => {
    writeFileSync(
      join(home, ".hermes", "config.yaml"),
      "custom_providers:\n  - name: other-provider\n    base_url: https://example.com\n",
    );
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const config = readFileSync(join(home, ".hermes", "config.yaml"), "utf8");
    expect(config).toContain("name: other-provider");
    expect(config).toContain("name: tokamak");
  });
});
