import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configure, revert } from "../../src/targets/claude.js";
import { hasMarkerBlock } from "../../src/lib/markers.js";
import { readJson } from "../../src/lib/json-merge.js";

interface ClaudeSettings {
  env?: Record<string, string>;
  theme?: string;
}

function makeHome(): string {
  const dir = join(tmpdir(), `claude-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".zshrc"), "export FOO=bar\n");
  return dir;
}

describe("claude.configure", () => {
  let home: string;

  beforeEach(() => { home = makeHome(); });

  it("adds ANTHROPIC_* to shell profile", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const profile = readFileSync(join(home, ".zshrc"), "utf8");
    expect(hasMarkerBlock(profile)).toBe(true);
    expect(profile).toContain("ANTHROPIC_API_KEY");
    expect(profile).toContain("export FOO=bar");
  });

  it("writes 7 keys to settings.json env", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const data = readJson(join(home, ".claude", "settings.json")) as ClaudeSettings;
    expect(Object.keys(data.env ?? {}).filter(k => k.startsWith("ANTHROPIC_"))).toHaveLength(7);
  });

  it("preserves pre-existing settings.json keys", () => {
    writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify({ theme: "dark" }));
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const data = readJson(join(home, ".claude", "settings.json")) as ClaudeSettings;
    expect(data.theme).toBe("dark");
  });

  it("does not modify files in dry-run mode", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6", dryRun: true });
    const profile = readFileSync(join(home, ".zshrc"), "utf8");
    expect(profile).toBe("export FOO=bar\n");
    expect(existsSync(join(home, ".claude", "settings.json"))).toBe(false);
  });
});

describe("claude.revert", () => {
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

  it("removes 7 ANTHROPIC_* keys from settings.json", () => {
    revert({ home, backup: false });
    const data = readJson(join(home, ".claude", "settings.json")) as ClaudeSettings;
    expect(Object.keys(data.env ?? {})).toHaveLength(0);
  });

  it("preserves non-ANTHROPIC keys in settings.json", () => {
    const settingsPath = join(home, ".claude", "settings.json");
    const existing = readJson(settingsPath) as ClaudeSettings;
    existing.theme = "dark";
    writeFileSync(settingsPath, JSON.stringify(existing));

    revert({ home, backup: false });
    const data = readJson(settingsPath) as ClaudeSettings;
    expect(data.theme).toBe("dark");
  });

  it("round-trip: configure → revert restores original profile content", () => {
    revert({ home, backup: false });
    const profile = readFileSync(join(home, ".zshrc"), "utf8");
    expect(profile.trim()).toBe("export FOO=bar");
  });

  it("creates backup by default", () => {
    revert({ home });
    const dir = join(home, ".claude");
    const files = readdirSync(join(home, ".claude"));
    expect(files.some((f: string) => f.includes(".bak-"))).toBe(true);
  });
});
