import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeEnvBlock, removeMarkerBlock, revertShellProfile, generateCleanupBlock, injectCleanupBlock } from "../../src/lib/shell-profile.js";
import { hasMarkerBlock } from "../../src/lib/markers.js";

function makeTmp(): string {
  const dir = join(tmpdir(), `shell-profile-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("removeMarkerBlock", () => {
  it("removes marker block from content", () => {
    const content = [
      "export FOO=bar",
      "",
      "# TON AI Access — auto-configured — 2026-01-01 | target: claude | model: qwen-3.6",
      "export ANTHROPIC_API_KEY=sk-test",
      "# ///TON AI Access",
      "",
      "export BAZ=qux",
    ].join("\n");

    const result = removeMarkerBlock(content);
    expect(result).not.toContain("ANTHROPIC_API_KEY");
    expect(result).not.toContain("TON AI Access");
    expect(result).toContain("export FOO=bar");
    expect(result).toContain("export BAZ=qux");
  });

  it("is idempotent when no marker block", () => {
    const content = "export FOO=bar\nexport BAZ=qux\n";
    expect(removeMarkerBlock(content)).toBe(content);
  });
});

describe("writeEnvBlock", () => {
  let dir: string;
  let profile: string;

  beforeEach(() => {
    dir = makeTmp();
    profile = join(dir, ".zshrc");
    writeFileSync(profile, "export FOO=bar\n");
  });

  it("appends marker block to profile", () => {
    writeEnvBlock(profile, { target: "claude", model: "qwen-3.6", extraLines: ['export ANTHROPIC_API_KEY="test"'], date: "2026-01-01" });
    const content = readFileSync(profile, "utf8");
    expect(hasMarkerBlock(content)).toBe(true);
    expect(content).toContain("ANTHROPIC_API_KEY");
    expect(content).toContain("export FOO=bar");
  });

  it("replaces existing block on second write (idempotent)", () => {
    writeEnvBlock(profile, { target: "claude", model: "qwen-3.6", extraLines: ['export ANTHROPIC_API_KEY="v1"'], date: "2026-01-01" });
    writeEnvBlock(profile, { target: "claude", model: "qwen-3.6", extraLines: ['export ANTHROPIC_API_KEY="v2"'], date: "2026-01-02" });
    const content = readFileSync(profile, "utf8");
    const count = (content.match(/# TON AI Access — auto-configured/g) ?? []).length;
    expect(count).toBe(1);
    expect(content).toContain('"v2"');
    expect(content).not.toContain('"v1"');
  });

  it("does not write in dryRun mode", () => {
    writeEnvBlock(profile, { target: "claude", model: "qwen-3.6", extraLines: ['export ANTHROPIC_API_KEY="dry"'], dryRun: true });
    const content = readFileSync(profile, "utf8");
    expect(content).not.toContain("ANTHROPIC_API_KEY");
  });
});

describe("revertShellProfile", () => {
  let dir: string;
  let profile: string;

  beforeEach(() => {
    dir = makeTmp();
    profile = join(dir, ".zshrc");
  });

  it("removes marker block and returns true", () => {
    writeFileSync(profile, [
      "export FOO=bar",
      "# TON AI Access — auto-configured — 2026-01-01 | target: claude | model: qwen-3.6",
      'export ANTHROPIC_API_KEY="sk-test"',
      "# ///TON AI Access",
      "export BAZ=qux",
    ].join("\n") + "\n");

    const result = revertShellProfile(profile, { backup: false });
    expect(result).toBe(true);
    const content = readFileSync(profile, "utf8");
    expect(content).not.toContain("ANTHROPIC_API_KEY");
    expect(content).toContain("export FOO=bar");
    expect(content).toContain("export BAZ=qux");
  });

  it("returns false when no marker block", () => {
    writeFileSync(profile, "export FOO=bar\n");
    const result = revertShellProfile(profile, { backup: false });
    expect(result).toBe(false);
  });

  it("returns false when profile does not exist", () => {
    const result = revertShellProfile(join(dir, "nonexistent"), { backup: false });
    expect(result).toBe(false);
  });

  it("creates backup file when backup=true", () => {
    writeFileSync(profile, [
      "# TON AI Access — auto-configured — 2026-01-01 | target: claude | model: qwen-3.6",
      "# ///TON AI Access",
    ].join("\n"));
    const backupPaths: string[] = [];
    revertShellProfile(profile, {
      backup: true,
      backupFile: (p) => { const bak = `${p}.bak-test`; require("node:fs").copyFileSync(p, bak); backupPaths.push(bak); return bak; },
    });
    expect(backupPaths).toHaveLength(1);
  });
});

describe("generateCleanupBlock", () => {
  it("returns unset commands for all 7 ANTHROPIC env vars", () => {
    const block = generateCleanupBlock("/Users/test/.zshrc");
    expect(block).toContain("unset ANTHROPIC_API_KEY");
    expect(block).toContain("unset ANTHROPIC_BASE_URL");
    expect(block).toContain("unset ANTHROPIC_MODEL");
    expect(block).toContain("unset ANTHROPIC_SMALL_FAST_MODEL");
    expect(block).toContain("unset ANTHROPIC_DEFAULT_HAIKU_MODEL");
    expect(block).toContain("unset ANTHROPIC_DEFAULT_SONNET_MODEL");
    expect(block).toContain("unset ANTHROPIC_DEFAULT_OPUS_MODEL");
  });

  it("includes self-removal sed command with profile path", () => {
    const profile = "/Users/test/.zshrc";
    const block = generateCleanupBlock(profile);
    expect(block).toContain("sed -i ''");
    expect(block).toContain(profile);
    expect(block).toContain("# TON AI Access — oneshot cleanup");
    expect(block).toContain("# ///TON AI Access cleanup");
  });

  it("joins lines with newlines", () => {
    const block = generateCleanupBlock("/test/.profile");
    const lines = block.split("\n");
    expect(lines.length).toBeGreaterThan(7);
  });
});

describe("injectCleanupBlock", () => {
  let dir: string;
  let profile: string;

  beforeEach(() => {
    dir = makeTmp();
    profile = join(dir, ".zshrc");
  });

  it("appends cleanup block to profile and returns true", () => {
    writeFileSync(profile, "export FOO=bar\n");
    const result = injectCleanupBlock(profile);
    expect(result).toBe(true);
    const content = readFileSync(profile, "utf8");
    expect(content).toContain("# TON AI Access — oneshot cleanup");
    expect(content).toContain("unset ANTHROPIC_API_KEY");
    expect(content).toContain("export FOO=bar");
  });

  it("is idempotent — returns false when block already present", () => {
    writeFileSync(profile, "export FOO=bar\n");
    injectCleanupBlock(profile);
    const result = injectCleanupBlock(profile);
    expect(result).toBe(false);
    const content = readFileSync(profile, "utf8");
    // Count block starts by looking for the oneshot cleanup comment followed by unset
    const blockMatches = content.match(/# TON AI Access — oneshot cleanup\nunset/g);
    expect(blockMatches?.length).toBe(1);
  });

  it("returns false when profile does not exist", () => {
    const result = injectCleanupBlock(join(dir, "nonexistent"));
    expect(result).toBe(false);
  });

  it("does not write in dryRun mode", () => {
    writeFileSync(profile, "export FOO=bar\n");
    const result = injectCleanupBlock(profile, { dryRun: true });
    expect(result).toBe(true);
    const content = readFileSync(profile, "utf8");
    expect(content).not.toContain("# TON AI Access — oneshot cleanup");
    expect(content).toContain("export FOO=bar");
  });
});
