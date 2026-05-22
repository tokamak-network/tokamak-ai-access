import { describe, it, expect } from "vitest";
import { hasMarkerBlock, hasFileMarker, makeBlockStart } from "../../src/lib/markers.js";

describe("hasMarkerBlock", () => {
  it("returns true when both markers present", () => {
    const content = "# TON AI Access — auto-configured — 2026-01-01 | target: claude | model: q\n# ///TON AI Access\n";
    expect(hasMarkerBlock(content)).toBe(true);
  });

  it("returns false when only start marker", () => {
    expect(hasMarkerBlock("# TON AI Access — auto-configured\n")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(hasMarkerBlock("")).toBe(false);
  });
});

describe("hasFileMarker", () => {
  it("returns true when file starts with marker", () => {
    const content = "# TON AI Access — auto-configured — 2026-01-01\nmodel = \"qwen-3.6\"\n";
    expect(hasFileMarker(content)).toBe(true);
  });

  it("returns false when marker is not at start", () => {
    const content = "# My custom config\n# TON AI Access — auto-configured\n";
    expect(hasFileMarker(content)).toBe(false);
  });

  it("returns true with leading whitespace", () => {
    const content = "  # TON AI Access — auto-configured — 2026-01-01\n";
    expect(hasFileMarker(content)).toBe(true);
  });
});

describe("makeBlockStart", () => {
  it("includes target and model in start line", () => {
    const line = makeBlockStart("claude", "qwen-3.6", "2026-01-01");
    expect(line).toContain("target: claude");
    expect(line).toContain("model: qwen-3.6");
    expect(line).toContain("2026-01-01");
  });
});
