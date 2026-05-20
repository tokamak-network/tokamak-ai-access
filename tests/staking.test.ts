/**
 * Unit tests — staking balance reader (동적 Layer2Registry 버전)
 * vitest + mock viem multicall / readContract
 *
 * 호출 순서:
 *   1. readContract(layer2sLength)      → mockReadContract
 *   2. multicall(layer2sByIndex × N)   → mockMulticall (1st call per describe block)
 *   3. multicall(stakeOf × N)          → mockMulticall (2nd call)
 *
 * Layer2 캐시(1h)는 beforeEach에서 invalidateLayer2Cache()로 초기화.
 * 잔액 캐시(60s)는 beforeEach에서 invalidateStakingCache()로 초기화.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock viem ----
const mockMulticall    = vi.fn();
const mockReadContract = vi.fn();

vi.mock("viem", async (importOriginal) => {
  const original = await importOriginal<typeof import("viem")>();
  return {
    ...original,
    createPublicClient: vi.fn(() => ({
      multicall:    mockMulticall,
      readContract: mockReadContract,
    })),
  };
});

// Env before module import
process.env.RPC_URL = "https://eth-mainnet.example.com/test";
process.env.NEXT_PUBLIC_CHAIN = "mainnet";

import {
  getTotalStakedTON,
  invalidateStakingCache,
  invalidateLayer2Cache,
} from "@/lib/staking";

// ---- Helpers ----
const TON_18  = 10n ** 18n;
const WTON_RAY = 10n ** 9n;
function wton(ton: bigint): bigint { return ton * WTON_RAY; }

// 10 dummy Layer2 addresses for registry mock
const MOCK_LAYER2S = Array.from(
  { length: 10 },
  (_, i) => `0x${String(i + 1).padStart(40, "0")}` as `0x${string}`,
);

/**
 * Sets up Layer2Registry mocks for one invocation of getLayer2Addresses().
 * - readContract → layer2sLength = n
 * - mockMulticall → layer2sByIndex results (queued as next multicall call)
 */
function mockRegistry(n = 10) {
  mockReadContract.mockResolvedValueOnce(BigInt(n));
  mockMulticall.mockResolvedValueOnce(
    MOCK_LAYER2S.slice(0, n).map((addr) => ({ status: "success" as const, result: addr })),
  );
}

/**
 * Builds a stakeOf multicall result: first `successes.length` entries succeed,
 * remaining entries fail.
 */
function stakeOfResult(successes: bigint[], total: number) {
  return [
    ...successes.map((v) => ({ status: "success" as const, result: v })),
    ...Array(total - successes.length).fill({ status: "failure", error: new Error("reverted") }),
  ];
}

beforeEach(() => {
  invalidateStakingCache();   // clear per-address balance cache
  invalidateLayer2Cache();    // clear Layer2 list cache
  vi.clearAllMocks();
});

describe("getTotalStakedTON — dynamic Layer2Registry", () => {
  it("sums stakeOf across all registered Layer2s (10 layers × 5 TON = 50 TON)", async () => {
    mockRegistry(10);
    mockMulticall.mockResolvedValueOnce(
      Array(10).fill({ status: "success", result: wton(5n) }),
    );
    const result = await getTotalStakedTON("0xabc");
    expect(result).toBe(50n * TON_18);
  });

  it("returns 0n when all stakeOf return 0", async () => {
    mockRegistry(10);
    mockMulticall.mockResolvedValueOnce(
      Array(10).fill({ status: "success", result: 0n }),
    );
    const result = await getTotalStakedTON("0xzero");
    expect(result).toBe(0n);
  });

  it("correctly converts 27-decimal WTON ray to 18-decimal TON", async () => {
    // stakeOf returns 1e27 (1 TON in ray); lib divides by 1e9 → 1e18
    mockRegistry(10);
    mockMulticall.mockResolvedValueOnce([
      { status: "success", result: wton(1n) },
      ...Array(9).fill({ status: "success", result: 0n }),
    ]);
    const result = await getTotalStakedTON("0xone");
    expect(result).toBe(TON_18);
  });

  it("reuses Layer2 cache and balance cache — multicall called only twice total for two fetches", async () => {
    // First call: registry (readContract + multicall) + stakeOf (multicall)
    mockRegistry(10);
    mockMulticall.mockResolvedValue(
      Array(10).fill({ status: "success", result: wton(10n) }),
    );
    const addr = "0xcache";
    await getTotalStakedTON(addr);
    await getTotalStakedTON(addr); // both caches hit → no additional multicall
    // calls: 1× layer2sByIndex + 1× stakeOf = 2 total
    expect(mockMulticall).toHaveBeenCalledTimes(2);
  });

  it("re-queries stakeOf (not Layer2 registry) after balance cache is invalidated", async () => {
    mockRegistry(10); // only called once — Layer2 cache persists
    mockMulticall.mockResolvedValue(
      Array(10).fill({ status: "success", result: wton(10n) }),
    );
    const addr = "0xinvalidate";
    await getTotalStakedTON(addr);          // call 1: layer2s + stakeOf (2 multicalls)
    invalidateStakingCache(addr);
    await getTotalStakedTON(addr);          // call 2: layer2 cache hit, stakeOf re-queried (+1)
    // calls: 1× layer2sByIndex + 2× stakeOf = 3 total
    expect(mockMulticall).toHaveBeenCalledTimes(3);
  });

  it("handles partial multicall failures — sums only successful stakeOf results", async () => {
    // 5 success (3 TON each) + 5 failure → 15 TON
    mockRegistry(10);
    mockMulticall.mockResolvedValueOnce(stakeOfResult(Array(5).fill(wton(3n)), 10));
    const result = await getTotalStakedTON("0xpartial");
    expect(result).toBe(15n * TON_18);
  });

  it("handles all-failure stakeOf — returns 0n without throwing", async () => {
    mockRegistry(10);
    mockMulticall.mockResolvedValueOnce(
      Array(10).fill({ status: "failure", error: new Error("reverted") }),
    );
    const result = await getTotalStakedTON("0xfail");
    expect(result).toBe(0n);
  });

  it("returns 0n when Layer2Registry reports 0 registered Layer2s", async () => {
    mockReadContract.mockResolvedValueOnce(0n); // layer2sLength = 0
    // No multicall for layer2sByIndex; no multicall for stakeOf either
    const result = await getTotalStakedTON("0xempty");
    expect(result).toBe(0n);
    expect(mockMulticall).not.toHaveBeenCalled();
  });

  it("throws if RPC_URL env var is not set", async () => {
    const saved = process.env.RPC_URL;
    delete process.env.RPC_URL;
    invalidateLayer2Cache(); // ensure fresh registry call attempt
    await expect(getTotalStakedTON("0xnoenv")).rejects.toThrow("RPC_URL");
    process.env.RPC_URL = saved;
  });
});
