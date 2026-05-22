import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { backupFile, makeTimestamp } from "../../src/lib/backup.js";

describe("makeTimestamp", () => {
  it("returns a string matching YYYYMMDD-HHMMSS format", () => {
    expect(makeTimestamp()).toMatch(/^\d{8}-\d{6}$/);
  });
});

describe("backupFile", () => {
  it("creates a .bak-<timestamp> copy", () => {
    const dir = join(tmpdir(), `backup-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "settings.json");
    writeFileSync(file, '{"key":"value"}');

    const bak = backupFile(file);
    expect(bak).not.toBeNull();
    expect(bak).toMatch(/\.bak-\d{8}-\d{6}$/);
    expect(existsSync(bak!)).toBe(true);
  });

  it("returns null when file does not exist", () => {
    const result = backupFile("/nonexistent/path/file.json");
    expect(result).toBeNull();
  });
});
