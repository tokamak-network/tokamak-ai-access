import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configure, revert } from "../../src/targets/openclaw.js";
import { hasMarkerBlock } from "../../src/lib/markers.js";
import { readJson } from "../../src/lib/json-merge.js";

interface OpenClawConfig {
  models?: {
    providers?: Record<string, unknown>;
  };
  agents?: {
    defaults?: {
      model?: { primary?: string };
    };
  };
  theme?: string;
}

function makeHome(): string {
  const dir = join(tmpdir(), `openclaw-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, ".openclaw"), { recursive: true });
  writeFileSync(join(dir, ".zshrc"), "export FOO=bar\n");
  return dir;
}

describe("openclaw.configure", () => {
  let home: string;

  beforeEach(() => { home = makeHome(); });

  it("adds marker block to shell profile", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const profile = readFileSync(join(home, ".zshrc"), "utf8");
    expect(hasMarkerBlock(profile)).toBe(true);
    expect(profile).toContain("export FOO=bar");
  });

  it("sets models.providers.litellm in openclaw.json", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const data = readJson(join(home, ".openclaw", "openclaw.json")) as OpenClawConfig;
    expect(data.models?.providers?.["litellm"]).toBeDefined();
  });

  it("sets agents.defaults.model.primary to litellm/<model>", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const data = readJson(join(home, ".openclaw", "openclaw.json")) as OpenClawConfig;
    expect(data.agents?.defaults?.model?.primary).toBe("litellm/qwen-3.6");
  });

  it("preserves pre-existing keys in openclaw.json", () => {
    writeFileSync(join(home, ".openclaw", "openclaw.json"), JSON.stringify({ theme: "dark" }));
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const data = readJson(join(home, ".openclaw", "openclaw.json")) as OpenClawConfig;
    expect(data.theme).toBe("dark");
  });

  it("does not modify files in dry-run mode", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6", dryRun: true });
    const profile = readFileSync(join(home, ".zshrc"), "utf8");
    expect(profile).toBe("export FOO=bar\n");
  });
});

describe("openclaw.revert", () => {
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

  it("removes models.providers.litellm from openclaw.json", () => {
    revert({ home, backup: false });
    const data = readJson(join(home, ".openclaw", "openclaw.json")) as OpenClawConfig;
    expect(data.models?.providers?.["litellm"]).toBeUndefined();
  });

  it("removes agents.defaults.model.primary when set by configure", () => {
    revert({ home, backup: false });
    const data = readJson(join(home, ".openclaw", "openclaw.json")) as OpenClawConfig;
    expect(data.agents?.defaults?.model?.primary).toBeUndefined();
  });

  it("preserves agents.defaults.model.primary if not litellm/ prefix", () => {
    const configPath = join(home, ".openclaw", "openclaw.json");
    const existing = readJson(configPath) as OpenClawConfig;
    existing.agents ??= {};
    existing.agents.defaults ??= {};
    existing.agents.defaults.model ??= {};
    existing.agents.defaults.model.primary = "other-provider/model";
    writeFileSync(configPath, JSON.stringify(existing));
    revert({ home, backup: false });
    const data = readJson(configPath) as OpenClawConfig;
    expect(data.agents?.defaults?.model?.primary).toBe("other-provider/model");
  });

  it("prunes empty models and agents objects after revert", () => {
    revert({ home, backup: false });
    const data = readJson(join(home, ".openclaw", "openclaw.json")) as OpenClawConfig;
    expect(data.models).toBeUndefined();
    expect(data.agents).toBeUndefined();
  });

  it("preserves non-litellm providers", () => {
    const configPath = join(home, ".openclaw", "openclaw.json");
    const existing = readJson(configPath) as OpenClawConfig;
    existing.models ??= {};
    existing.models.providers ??= {};
    existing.models.providers["other"] = { baseUrl: "https://other.example.com" };
    writeFileSync(configPath, JSON.stringify(existing));
    revert({ home, backup: false });
    const data = readJson(configPath) as OpenClawConfig;
    expect(data.models?.providers?.["other"]).toBeDefined();
    expect(data.models?.providers?.["litellm"]).toBeUndefined();
  });

  it("round-trip: configure → revert restores original profile content", () => {
    revert({ home, backup: false });
    const profile = readFileSync(join(home, ".zshrc"), "utf8");
    expect(profile.trim()).toBe("export FOO=bar");
  });
});
