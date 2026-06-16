import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.stubGlobal("fetch", mockFetch);

import { fetchTonUsdRate, usdToTonWei } from "@/lib/ton-price";

describe("fetchTonUsdRate", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("returns the usd rate from CoinGecko", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ "tokamak-network": { usd: 2.13 } }),
    });
    const rate = await fetchTonUsdRate();
    expect(rate).toBe(2.13);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("tokamak-network"),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("throws when CoinGecko returns non-ok status", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429 });
    await expect(fetchTonUsdRate()).rejects.toThrow("CoinGecko error: 429");
  });

  it("throws when rate field is missing", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ "tokamak-network": {} }),
    });
    await expect(fetchTonUsdRate()).rejects.toThrow("Invalid rate");
  });

  it("throws when rate is zero or negative", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ "tokamak-network": { usd: 0 } }),
    });
    await expect(fetchTonUsdRate()).rejects.toThrow("Invalid rate");
  });
});

describe("usdToTonWei", () => {
  it("converts $5 at rate $2.00 → 2.5 TON wei (exact)", () => {
    expect(usdToTonWei(5, 2.0)).toBe(2500000000000000000n);
  });

  it("rounds UP when division is not exact ($5 / $3.00)", () => {
    // 5/3 TON = 1.666... → ceil → 1666666666666666667n
    const result = usdToTonWei(5, 3.0);
    expect(result).toBe(1666666666666666667n);
    // Must be strictly greater than floor value
    expect(result).toBeGreaterThan(1666666666666666666n);
  });

  it("uses integer arithmetic — exact at $5 / $2.13", () => {
    // 5_000_000 / 2_130_000 * 1e18 — should not lose precision
    const result = usdToTonWei(5, 2.13);
    // Must be > floor value and ≤ floor+1
    const floorWei = (5000000n * 10n ** 18n) / 2130000n;
    expect(result).toBeGreaterThanOrEqual(floorWei);
    expect(result).toBeLessThanOrEqual(floorWei + 1n);
  });

  it("computes slippage-adjusted amount: $4 / $2.00 → 2.0 TON", () => {
    // 20% slippage: usdToTonWei(5 * 0.8, rate) = usdToTonWei(4, 2.0)
    expect(usdToTonWei(4, 2.0)).toBe(2000000000000000000n);
  });
});
