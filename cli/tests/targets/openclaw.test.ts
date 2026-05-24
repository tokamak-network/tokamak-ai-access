import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configure } from "../../src/targets/openclaw.js";
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
  let origShell: string | undefined;

  beforeEach(() => {
    home = makeHome();
    origShell = process.env.SHELL;
    process.env.SHELL = "/bin/zsh";
  });

  afterEach(() => {
    if (origShell === undefined) delete process.env.SHELL;
    else process.env.SHELL = origShell;
  });

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
