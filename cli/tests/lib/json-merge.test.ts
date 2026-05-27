import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mergeKeys, removeKeys, readJson, writeJson } from "../../src/lib/json-merge.js";

function makeTmp(): string {
  const dir = join(tmpdir(), `json-merge-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("readJson", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = makeTmp();
    file = join(dir, "settings.json");
  });

  it("returns empty object when file does not exist", () => {
    expect(readJson(join(dir, "nonexistent.json"))).toEqual({});
  });

  it("throws on malformed JSON", () => {
    writeFileSync(file, "{ bad json");
    expect(() => readJson(file)).toThrow(/JSON is corrupted/);
  });
});

describe("mergeKeys", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = makeTmp();
    file = join(dir, "settings.json");
  });

  it("adds keys into nested path", () => {
    writeFileSync(file, JSON.stringify({ theme: "dark" }));
    mergeKeys(file, ["env"], { ANTHROPIC_API_KEY: "sk-test", ANTHROPIC_MODEL: "qwen-3.6" });
    const data = readJson(file) as { env?: Record<string, string>; theme?: string };
    expect(data.env?.["ANTHROPIC_API_KEY"]).toBe("sk-test");
    expect(data.env?.["ANTHROPIC_MODEL"]).toBe("qwen-3.6");
    expect(data.theme).toBe("dark");
  });

  it("returns added/updated correctly", () => {
    writeFileSync(file, JSON.stringify({ env: { ANTHROPIC_API_KEY: "old-key" } }));
    const { added, updated } = mergeKeys(file, ["env"], {
      ANTHROPIC_API_KEY: "new-key",
      ANTHROPIC_MODEL: "qwen-3.6",
    });
    expect(updated).toContain("ANTHROPIC_API_KEY");
    expect(added).toContain("ANTHROPIC_MODEL");
  });

  it("creates file if missing", () => {
    mergeKeys(file, ["env"], { FOO: "bar" });
    const data = readJson(file) as { env?: Record<string, string> };
    expect(data.env?.["FOO"]).toBe("bar");
  });

  it("does not write in dryRun mode", () => {
    writeFileSync(file, JSON.stringify({ env: {} }));
    mergeKeys(file, ["env"], { FOO: "bar" }, true);
    const data = readJson(file) as { env?: Record<string, string> };
    expect(data.env?.["FOO"]).toBeUndefined();
  });
});

describe("removeKeys", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = makeTmp();
    file = join(dir, "settings.json");
  });

  it("removes specified keys from nested path", () => {
    writeFileSync(file, JSON.stringify({
      theme: "dark",
      env: {
        ANTHROPIC_API_KEY: "sk-test",
        ANTHROPIC_MODEL: "qwen-3.6",
        SOME_OTHER_KEY: "kept",
      },
    }));
    const removed = removeKeys(file, ["env"], ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"]);
    expect(removed).toContain("ANTHROPIC_API_KEY");
    expect(removed).toContain("ANTHROPIC_MODEL");
    const data = readJson(file) as { theme?: string; env?: Record<string, string> };
    expect(data.env?.["ANTHROPIC_API_KEY"]).toBeUndefined();
    expect(data.env?.["SOME_OTHER_KEY"]).toBe("kept");
    expect(data.theme).toBe("dark");
  });

  it("removes empty env object", () => {
    writeFileSync(file, JSON.stringify({
      theme: "dark",
      env: { ANTHROPIC_API_KEY: "sk-test" },
    }));
    removeKeys(file, ["env"], ["ANTHROPIC_API_KEY"]);
    const data = readJson(file) as { theme?: string; env?: Record<string, string> };
    expect(data.env).toBeUndefined();
    expect(data.theme).toBe("dark");
  });

  it("returns empty array when file missing", () => {
    const removed = removeKeys(join(dir, "nonexistent.json"), ["env"], ["FOO"]);
    expect(removed).toHaveLength(0);
  });

  it("does not write in dryRun mode", () => {
    writeFileSync(file, JSON.stringify({ env: { FOO: "bar" } }));
    removeKeys(file, ["env"], ["FOO"], true);
    const data = readJson(file) as { env?: Record<string, string> };
    expect(data.env?.["FOO"]).toBe("bar");
  });
});
