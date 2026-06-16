import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const {
  mockGetTotalStakedTON,
  mockKvGet,
} = vi.hoisted(() => ({
  mockGetTotalStakedTON: vi.fn(),
  mockKvGet: vi.fn(),
}));

vi.mock("@/lib/staking", () => ({ getTotalStakedTON: mockGetTotalStakedTON }));
vi.mock("@vercel/kv", () => ({
  kv: { get: mockKvGet, set: vi.fn(), keys: vi.fn() },
}));

import { assertStake, assertRotateCooldown, assertKeyCapacity, assertEligibility } from "@/lib/key-guards";

const ADDR = "0xdeadbeef00000000000000000000000000000001";
const MIN_TON_WEI = 100n * 10n ** 18n;

beforeEach(() => vi.clearAllMocks());

// ── assertStake ──────────────────────────────────────────────────────────────
describe("assertStake", () => {
  it("passes when balance meets minimum", async () => {
    mockGetTotalStakedTON.mockResolvedValue(MIN_TON_WEI + 1n);
    await expect(assertStake(ADDR)).resolves.toBeUndefined();
  });

  it("throws NextResponse 403 when balance is below minimum", async () => {
    mockGetTotalStakedTON.mockResolvedValue(0n);
    const err = await assertStake(ADDR).catch((e) => e);
    expect(err).toBeInstanceOf(NextResponse);
    expect(err.status).toBe(403);
    const body = await err.json();
    expect(body.error).toBe("Insufficient stake");
  });
});

// ── assertRotateCooldown ─────────────────────────────────────────────────────
describe("assertRotateCooldown", () => {
  it("passes when lastRotatedAt is not set", async () => {
    mockKvGet.mockResolvedValue({ createdAt: Date.now() }); // no lastRotatedAt
    await expect(assertRotateCooldown(ADDR)).resolves.toBeUndefined();
  });

  it("passes when 24h have elapsed since lastRotatedAt", async () => {
    const past = Date.now() - 25 * 60 * 60 * 1000; // 25h ago
    mockKvGet.mockResolvedValue({ createdAt: Date.now(), lastRotatedAt: past });
    await expect(assertRotateCooldown(ADDR)).resolves.toBeUndefined();
  });

  it("throws NextResponse 403 with hoursLeft when within 24h", async () => {
    const recent = Date.now() - 2 * 60 * 60 * 1000; // 2h ago
    mockKvGet.mockResolvedValue({ createdAt: Date.now(), lastRotatedAt: recent });
    const err = await assertRotateCooldown(ADDR).catch((e) => e);
    expect(err).toBeInstanceOf(NextResponse);
    expect(err.status).toBe(403);
    const body = await err.json();
    expect(body.error).toBe("Rotation cooldown active");
    expect(body.hoursLeft).toBeCloseTo(22, 0);
  });
});

// ── assertKeyCapacity ────────────────────────────────────────────────────────
describe("assertKeyCapacity", () => {
  const OLD_ENV = process.env;
  beforeEach(() => { process.env = { ...OLD_ENV, MAX_ACTIVE_KEYS: "3" }; });
  afterEach(() => { process.env = OLD_ENV; });

  it("passes when active key count is below the cap", async () => {
    mockKvGet.mockResolvedValue(2);
    await expect(assertKeyCapacity()).resolves.toBeUndefined();
  });

  it("passes when counter key doesn't exist yet (null → 0)", async () => {
    mockKvGet.mockResolvedValue(null);
    await expect(assertKeyCapacity()).resolves.toBeUndefined();
  });

  it("throws NextResponse 503 when at or above cap", async () => {
    mockKvGet.mockResolvedValue(3);
    const err = await assertKeyCapacity().catch((e) => e);
    expect(err).toBeInstanceOf(NextResponse);
    expect(err.status).toBe(503);
    const body = await err.json();
    expect(body.error).toBe("Service at capacity");
  });
});

// ── assertEligibility ────────────────────────────────────────────────────────
describe("assertEligibility", () => {
  const NOW = Date.now();
  const FUTURE = NOW + 30 * 24 * 60 * 60 * 1000;
  const PAST = NOW - 1000;

  it("passes when staking balance meets minimum", async () => {
    mockGetTotalStakedTON.mockResolvedValue(MIN_TON_WEI + 1n);
    mockKvGet.mockResolvedValue(null); // no purchase record
    await expect(assertEligibility(ADDR)).resolves.toBeUndefined();
  });

  it("passes when active purchase exists (no staking)", async () => {
    mockGetTotalStakedTON.mockResolvedValue(0n);
    mockKvGet.mockResolvedValue({ txHash: "0xabc", paidAt: NOW, expiresAt: FUTURE });
    await expect(assertEligibility(ADDR)).resolves.toBeUndefined();
  });

  it("throws 403 when staking insufficient and purchase expired", async () => {
    mockGetTotalStakedTON.mockResolvedValue(0n);
    mockKvGet.mockResolvedValue({ txHash: "0xabc", paidAt: NOW, expiresAt: PAST });
    const err = await assertEligibility(ADDR).catch((e) => e);
    expect(err).toBeInstanceOf(NextResponse);
    expect(err.status).toBe(403);
    const body = await err.json();
    expect(body.error).toBe("Not eligible");
  });

  it("throws 403 when staking insufficient and no purchase", async () => {
    mockGetTotalStakedTON.mockResolvedValue(0n);
    mockKvGet.mockResolvedValue(null);
    const err = await assertEligibility(ADDR).catch((e) => e);
    expect(err).toBeInstanceOf(NextResponse);
    expect(err.status).toBe(403);
  });
});
