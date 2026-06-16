import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockFetchTonUsdRate } = vi.hoisted(() => ({
  mockFetchTonUsdRate: vi.fn(),
}));

vi.mock("@/lib/ton-price", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ton-price")>();
  return { ...actual, fetchTonUsdRate: mockFetchTonUsdRate };
});

import { GET } from "@/app/api/price/ton/route";
import { _resetCacheForTest } from "@/lib/price-cache";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  _resetCacheForTest();
  process.env.PURCHASE_USD_PRICE = "5";
  mockFetchTonUsdRate.mockResolvedValue(2.0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/price/ton", () => {
  it("returns usdPerTon, tonRequired, usdPrice, updatedAt on success", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usdPerTon).toBe(2.0);
    expect(body.usdPrice).toBe(5);
    expect(typeof body.tonRequired).toBe("number");
    expect(body.tonRequired).toBeGreaterThan(0);
    expect(typeof body.updatedAt).toBe("number");
  });

  it("tonRequired = ceil($5 / $2.00 * 10000) / 10000 = 2.5", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.tonRequired).toBe(2.5);
  });

  it("returns 503 when CoinGecko is unavailable", async () => {
    mockFetchTonUsdRate.mockRejectedValue(new Error("CoinGecko error: 503"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Price oracle unavailable");
  });

  it("caches result — second call within 60s does not re-fetch", async () => {
    await GET();
    await GET();
    expect(mockFetchTonUsdRate).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after 60s cache TTL expires", async () => {
    await GET();
    vi.advanceTimersByTime(61_000);
    await GET();
    expect(mockFetchTonUsdRate).toHaveBeenCalledTimes(2);
  });

  it("does not cache 503 response — next call retries CoinGecko", async () => {
    mockFetchTonUsdRate.mockRejectedValueOnce(new Error("down"));
    await GET(); // 503
    mockFetchTonUsdRate.mockResolvedValue(2.0);
    const res = await GET(); // should retry
    expect(res.status).toBe(200);
    expect(mockFetchTonUsdRate).toHaveBeenCalledTimes(2);
  });
});
