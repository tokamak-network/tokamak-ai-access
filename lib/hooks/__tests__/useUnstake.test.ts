import { describe, it, expect } from "vitest";
import { wtonToTon } from "../useUnstake";

describe("wtonToTon", () => {
  it("converts 27-decimal WTON ray to 18-decimal TON", () => {
    const wton = 100n * 10n ** 27n;
    expect(wtonToTon(wton)).toBe(100n * 10n ** 18n);
  });

  it("returns 0n for 0 input", () => {
    expect(wtonToTon(0n)).toBe(0n);
  });

  it("truncates sub-unit WTON remainder (no rounding)", () => {
    // 5 * 10^8 WTON is less than 10^9, so it maps to 0 in 18-dec TON
    const wton = 100n * 10n ** 27n + 5n * 10n ** 8n;
    expect(wtonToTon(wton)).toBe(100n * 10n ** 18n);
  });
});
