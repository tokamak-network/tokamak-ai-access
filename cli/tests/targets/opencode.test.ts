import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configure } from "../../src/targets/opencode.js";
import { readJson } from "../../src/lib/json-merge.js";

interface OpencodeConfig {
  $schema?: string;
  model?: string;
  provider?: Record<string, {
    npm?: string;
    name?: string;
    options?: { baseURL?: string; apiKey?: string };
    models?: Record<string, { name?: string }>;
  }>;
  theme?: string;
}

function makeHome(): string {
  const dir = join(tmpdir(), `opencode-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function configPath(home: string): string {
  return join(home, ".config", "opencode", "opencode.json");
}

describe("opencode.configure", () => {
  let home: string;
  let origXdg: string | undefined;

  beforeEach(() => {
    home = makeHome();
    origXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
  });

  afterEach(() => {
    if (origXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = origXdg;
  });

  it("creates opencode.json with $schema and litellm provider", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const data = readJson(configPath(home)) as OpencodeConfig;
    expect(data.$schema).toBe("https://opencode.ai/config.json");
    expect(data.provider?.["litellm"]).toBeDefined();
    expect(data.provider?.["litellm"]?.npm).toBe("@ai-sdk/openai-compatible");
  });

  it("sets model to litellm/<model>", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const data = readJson(configPath(home)) as OpencodeConfig;
    expect(data.model).toBe("litellm/qwen-3.6");
  });

  it("sets provider options baseURL and apiKey", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const data = readJson(configPath(home)) as OpencodeConfig;
    expect(data.provider?.["litellm"]?.options?.baseURL).toBe("https://api2.ai.tokamak.network/v1");
    expect(data.provider?.["litellm"]?.options?.apiKey).toBe("sk-test");
  });

  it("adds model entry under provider models", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const data = readJson(configPath(home)) as OpencodeConfig;
    expect(data.provider?.["litellm"]?.models?.["qwen-3.6"]).toEqual({ name: "qwen-3.6" });
  });

  it("respects custom baseUrl", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6", baseUrl: "https://example.com" });
    const data = readJson(configPath(home)) as OpencodeConfig;
    expect(data.provider?.["litellm"]?.options?.baseURL).toBe("https://example.com/v1");
  });

  it("preserves pre-existing keys in opencode.json", () => {
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    writeFileSync(configPath(home), JSON.stringify({ theme: "dark" }));
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const data = readJson(configPath(home)) as OpencodeConfig;
    expect(data.theme).toBe("dark");
  });

  it("does not modify files in dry-run mode", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6", dryRun: true });
    expect(existsSync(configPath(home))).toBe(false);
  });

  it("creates .bak before overwriting existing opencode.json", () => {
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    writeFileSync(configPath(home), JSON.stringify({ theme: "dark" }));
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    const backup = JSON.parse(readFileSync(configPath(home) + ".bak", "utf8"));
    expect(backup.theme).toBe("dark");
  });

  it("does not create .bak when opencode.json does not exist", () => {
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    expect(existsSync(configPath(home) + ".bak")).toBe(false);
  });

  it("throws on malformed opencode.json", () => {
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    writeFileSync(configPath(home), "{ bad json");
    expect(() => configure({ home, apiKey: "sk-test", model: "qwen-3.6" })).toThrow(/JSON is corrupted/);
  });

  it("honors XDG_CONFIG_HOME when set", () => {
    const xdg = join(home, "xdg");
    process.env.XDG_CONFIG_HOME = xdg;
    configure({ home, apiKey: "sk-test", model: "qwen-3.6" });
    expect(existsSync(join(xdg, "opencode", "opencode.json"))).toBe(true);
  });
});
