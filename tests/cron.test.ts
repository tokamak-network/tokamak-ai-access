import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const {
  mockKvKeys,
  mockKvGet,
  mockKvSet,
  mockGetTotalStakedTON,
  mockRevokeLiteLLMKey,
} = vi.hoisted(() => ({
  mockKvKeys: vi.fn(),
  mockKvGet: vi.fn(),
  mockKvSet: vi.fn(),
  mockGetTotalStakedTON: vi.fn(),
  mockRevokeLiteLLMKey: vi.fn(),
}));

vi.mock("@/lib/kv", () => ({
  kvKeys: mockKvKeys,
  kvGet: mockKvGet,
  kvSet: mockKvSet,
}));
vi.mock("@/lib/staking", () => ({
  getTotalStakedTON: mockGetTotalStakedTON,
}));
vi.mock("@/lib/litellm", () => ({
  revokeLiteLLMKey: mockRevokeLiteLLMKey,
}));

import { GET as checkStakes } from "@/app/api/cron/check-stakes/route";

const CRON_SECRET = "test-cron-secret";
const ADDR = "0xdeadbeef00000000000000000000000000000001";
const ADDR2 = "0xdeadbeef00000000000000000000000000000002";
const MIN_TON = 10n * 10n ** 18n;

const ACTIVE_RECORD = {
  liteLlmKeyId: "sk-litellm-abc123",
  hash: "a".repeat(64),
  keySlice: "abc1",
  createdAt: 1_700_000_000_000,
  expiresAt: "2099-01-01T00:00:00.000Z",
};

function makeReq(secret?: string): NextRequest {
  return new NextRequest("http://localhost/api/cron/check-stakes", {
    method: "GET",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.MIN_TON = "10";
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/check-stakes", () => {
  it("returns 401 with wrong secret", async () => {
    const res = await checkStakes(makeReq("wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 401 with no auth header", async () => {
    const res = await checkStakes(makeReq());
    expect(res.status).toBe(401);
  });

  it("revokes keys for addresses below minimum stake", async () => {
    mockKvKeys.mockResolvedValue([`key:${ADDR}`, `key:${ADDR}:prev`]);
    mockKvGet.mockResolvedValue(ACTIVE_RECORD);
    mockGetTotalStakedTON.mockResolvedValue(MIN_TON - 1n);
    mockRevokeLiteLLMKey.mockResolvedValue(undefined);
    mockKvSet.mockResolvedValue(undefined);

    const res = await checkStakes(makeReq(CRON_SECRET));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ checked: 1, revoked: 1 });
    expect(mockRevokeLiteLLMKey).toHaveBeenCalledWith(ACTIVE_RECORD.liteLlmKeyId);
    expect(mockKvSet.mock.calls[0][1]).toHaveProperty("revokedAt");
  });

  it("skips :prev keys and does not count them", async () => {
    mockKvKeys.mockResolvedValue([`key:${ADDR}:prev`]);

    const res = await checkStakes(makeReq(CRON_SECRET));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ checked: 0, revoked: 0 });
    expect(mockKvGet).not.toHaveBeenCalled();
  });

  it("skips addresses with sufficient stake", async () => {
    mockKvKeys.mockResolvedValue([`key:${ADDR}`]);
    mockKvGet.mockResolvedValue(ACTIVE_RECORD);
    mockGetTotalStakedTON.mockResolvedValue(MIN_TON + 1n);

    const res = await checkStakes(makeReq(CRON_SECRET));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ checked: 1, revoked: 0 });
    expect(mockRevokeLiteLLMKey).not.toHaveBeenCalled();
  });

  it("skips already-revoked records", async () => {
    mockKvKeys.mockResolvedValue([`key:${ADDR}`]);
    mockKvGet.mockResolvedValue({
      ...ACTIVE_RECORD,
      revokedAt: Date.now() - 1000,
    });

    const res = await checkStakes(makeReq(CRON_SECRET));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ checked: 0, revoked: 0 });
    expect(mockGetTotalStakedTON).not.toHaveBeenCalled();
  });

  it("continues processing when one address throws", async () => {
    mockKvKeys.mockResolvedValue([`key:${ADDR}`, `key:${ADDR2}`]);
    mockKvGet.mockResolvedValue(ACTIVE_RECORD);
    mockGetTotalStakedTON
      .mockRejectedValueOnce(new Error("RPC down"))
      .mockResolvedValueOnce(MIN_TON - 1n);
    mockRevokeLiteLLMKey.mockResolvedValue(undefined);
    mockKvSet.mockResolvedValue(undefined);

    const res = await checkStakes(makeReq(CRON_SECRET));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.revoked).toBe(1);
  });
});
