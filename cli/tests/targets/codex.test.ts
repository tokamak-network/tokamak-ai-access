import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configure, revert } from "../../src/targets/codex.js";
import { hasMarkerBlock } from "../../src/lib/markers.js";

function makeHome(): string {
  const dir = join(tmpdir(), `codex-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, ".codex"), { recursive: true });
  writeFileSync(join(dir, ".zshrc"), "export FOO=bar\n");
  return dir;
}

let origShell: string | undefined;
beforeEach(() => { origShell = process.env.SHELL; process.env.SHELL = "/bin/zsh"; });
afterEach(() => { if (origShell === undefined) delete process.env.SHELL; else process.env.SHELL = origShell; });

describe("codex.configure", () => {
  let home: string;

  beforeEach(() => { home = makeHome(); });

  it("adds OPENAI_* exports to shell profile", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const profile = readFileSync(join(home, ".zshrc"), "utf8");
    expect(hasMarkerBlock(profile)).toBe(true);
    expect(profile).toContain("OPENAI_API_KEY");
    expect(profile).toContain("OPENAI_BASE_URL");
    expect(profile).toContain("export FOO=bar");
  });

  it("writes config.toml with TON AI Access marker", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const config = readFileSync(join(home, ".codex", "config.toml"), "utf8");
    expect(config).toContain("TON AI Access");
    expect(config).toContain("qwen-3.6");
  });

  it("writes the model's context window into config.toml", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const config = readFileSync(join(home, ".codex", "config.toml"), "utf8");
    expect(config).toContain("model_context_window = 262144");
  });

  it("writes gemma-4's context window", () => {
    configure({ home, apiKey: "sk-test", model: "gemma-4" });
    const config = readFileSync(join(home, ".codex", "config.toml"), "utf8");
    expect(config).toContain("model_context_window = 262144");
  });

  it("writes deepseek-v4-flash's context window", () => {
    configure({ home, apiKey: "sk-test", model: "deepseek-v4-flash" });
    const config = readFileSync(join(home, ".codex", "config.toml"), "utf8");
    expect(config).toContain("model_context_window = 262144");
  });

  it("writes glm-5.2's context window", () => {
    configure({ home, apiKey: "sk-test", model: "glm-5.2" });
    const config = readFileSync(join(home, ".codex", "config.toml"), "utf8");
    expect(config).toContain("model_context_window = 262144");
  });

  it("omits model_context_window for an unknown model", () => {
    configure({ home, apiKey: "sk-test", model: "some-future-model" });
    const config = readFileSync(join(home, ".codex", "config.toml"), "utf8");
    expect(config).not.toContain("model_context_window");
  });

  it("does not modify files in dry-run mode", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6", dryRun: true });
    const profile = readFileSync(join(home, ".zshrc"), "utf8");
    expect(profile).toBe("export FOO=bar\n");
    expect(existsSync(join(home, ".codex", "config.toml"))).toBe(false);
  });
});

describe("codex.revert", () => {
  let home: string;

  beforeEach(() => {
    home = makeHome();
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
  });

  it("removes marker block from shell profile", () => {
    revert({ home, backup: false });
    const profile = readFileSync(join(home, ".zshrc"), "utf8");
    expect(hasMarkerBlock(profile)).toBe(false);
    expect(profile).toContain("export FOO=bar");
  });

  it("deletes config.toml when TON AI Access marker present", () => {
    revert({ home, backup: false });
    expect(existsSync(join(home, ".codex", "config.toml"))).toBe(false);
  });

  it("preserves config.toml when marker absent", () => {
    const configPath = join(home, ".codex", "config.toml");
    writeFileSync(configPath, "# my custom config\nmodel = \"other\"\n");
    revert({ home, backup: false });
    expect(existsSync(configPath)).toBe(true);
    expect(readFileSync(configPath, "utf8")).toContain("my custom config");
  });

  it("round-trip: configure → revert restores original profile content", () => {
    revert({ home, backup: false });
    const profile = readFileSync(join(home, ".zshrc"), "utf8");
    expect(profile.trim()).toBe("export FOO=bar");
  });
});
