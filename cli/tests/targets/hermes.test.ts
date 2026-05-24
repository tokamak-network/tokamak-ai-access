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
});
