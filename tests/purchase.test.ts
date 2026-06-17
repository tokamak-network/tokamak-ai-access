import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetSessionAddress,
  mockKvGet,
  mockKvSet,
  mockKvDel,
  mockKvIncr,
  mockAssertKeyCapacity,
  mockIssueKeyForAddress,
  mockGetTransactionReceipt,
  mockParseEventLogs,
  mockFetchTonUsdRate,
} = vi.hoisted(() => ({
  mockGetSessionAddress: vi.fn(),
  mockKvGet: vi.fn(),
  mockKvSet: vi.fn(),
  mockKvDel: vi.fn(),
  mockKvIncr: vi.fn(),
  mockAssertKeyCapacity: vi.fn(),
  mockIssueKeyForAddress: vi.fn(),
  mockGetTransactionReceipt: vi.fn(),
  mockParseEventLogs: vi.fn(),
  mockFetchTonUsdRate: vi.fn(),
}));

vi.mock("@/lib/siwe", () => ({ getSessionAddress: mockGetSessionAddress }));
vi.mock("@vercel/kv", () => ({ kv: { get: mockKvGet, set: mockKvSet, del: mockKvDel, incr: mockKvIncr } }));
vi.mock("@/lib/key-guards", () => ({
  assertKeyCapacity: mockAssertKeyCapacity,
  PurchaseRecord: undefined,
}));
vi.mock("@/lib/issue-key", () => ({ issueKeyForAddress: mockIssueKeyForAddress }));
vi.mock("@/lib/ton-price", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ton-price")>();
  return {
    ...actual,
    fetchTonUsdRate: mockFetchTonUsdRate,
  };
});
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      getTransactionReceipt: mockGetTransactionReceipt,
    })),
    http: vi.fn(),
    parseEventLogs: mockParseEventLogs,
  };
});

import { POST } from "@/app/api/keys/purchase/route";
import { NextResponse } from "next/server";

const ADDR = "0xdeadbeef00000000000000000000000000000001";
const BURN_ADDRESS = "0x000000000000000000000000000000000000dead";
const TON_ERC20 = "0xton00000000000000000000000000000000001";
const TX_HASH = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab";
const FIVE_TON = 5n * 10n ** 18n;

function makeReceipt(overrides: Partial<{
  to: string;
  fromAddr: string;
  toAddr: string;
  value: bigint;
}> = {}) {
  const from = overrides.fromAddr ?? ADDR;
  const to = overrides.toAddr ?? BURN_ADDRESS;
  const value = overrides.value ?? FIVE_TON;
  return {
    to: (overrides.to ?? TON_ERC20).toLowerCase(),
    logs: [
      {
        topics: [
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", // Transfer sig
          `0x000000000000000000000000${from.slice(2).toLowerCase().padStart(64, "0")}`,
          `0x000000000000000000000000${to.slice(2).toLowerCase().padStart(64, "0")}`,
        ],
        data: `0x${value.toString(16).padStart(64, "0")}`,
        address: TON_ERC20.toLowerCase(),
      },
    ],
  };
}

function makeReq(body: object = { txHash: TX_HASH }) {
  return new NextRequest("http://localhost/api/keys/purchase", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TON_ERC20_ADDRESS = TON_ERC20;
  process.env.PURCHASE_USD_PRICE = "5";

  mockGetSessionAddress.mockResolvedValue(ADDR);
  mockAssertKeyCapacity.mockResolvedValue(undefined);
  mockKvGet.mockResolvedValue(null); // no existing key by default
  mockFetchTonUsdRate.mockResolvedValue(1.0); // rate=$1/TON → minValue=4 TON (5 USD * 0.8)
  // kv.set with nx: true returns "OK" on success, null on failure
  mockKvSet.mockImplementation((_key: string, _value: unknown, opts?: any) => {
    if (opts?.nx === true) {
      return Promise.resolve("OK"); // kvSetNx succeeds by default
    }
    return Promise.resolve(undefined); // normal kvSet
  });
  mockKvDel.mockResolvedValue(undefined);
  mockGetTransactionReceipt.mockResolvedValue(makeReceipt());
  mockParseEventLogs.mockReturnValue([
    { address: TON_ERC20.toLowerCase(), args: { from: ADDR, to: BURN_ADDRESS, value: FIVE_TON } },
  ]);
  mockIssueKeyForAddress.mockResolvedValue(
    NextResponse.json({ key: "sk-litellm-xxx", expiresAt: "2099-01-01T00:00:00.000Z" })
  );
});

describe("POST /api/keys/purchase", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSessionAddress.mockResolvedValue(null);
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 400 when txHash missing", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("returns 409 when address already has an active key", async () => {
    mockKvGet.mockResolvedValue({
      liteLlmKeyId: "key-abc",
      hash: "hash",
      keySlice: "xxxx",
      createdAt: Date.now() - 1000,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const res = await POST(makeReq());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/active key/i);
  });

  it("returns 503 when at capacity", async () => {
    mockAssertKeyCapacity.mockRejectedValue(
      NextResponse.json({ error: "Service at capacity" }, { status: 503 })
    );
    const res = await POST(makeReq());
    expect(res.status).toBe(503);
  });

  it("returns 422 when tx.to is not the TON ERC-20 contract", async () => {
    mockGetTransactionReceipt.mockResolvedValue(makeReceipt({ to: "0xother000" }));
    const res = await POST(makeReq());
    expect(res.status).toBe(422);
  });

  it("returns 403 when event.from does not match session address", async () => {
    mockGetTransactionReceipt.mockResolvedValue(
      makeReceipt({ fromAddr: "0xother00000000000000000000000000000002" })
    );
    mockParseEventLogs.mockReturnValue([
      { address: TON_ERC20.toLowerCase(), args: { from: "0xother00000000000000000000000000000002", to: BURN_ADDRESS, value: FIVE_TON } },
    ]);
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
  });

  it("returns 403 when event.to is not the treasury", async () => {
    mockGetTransactionReceipt.mockResolvedValue(
      makeReceipt({ toAddr: "0xother00000000000000000000000000000003" })
    );
    mockParseEventLogs.mockReturnValue([
      { address: TON_ERC20.toLowerCase(), args: { from: ADDR, to: "0xother00000000000000000000000000000003", value: FIVE_TON } },
    ]);
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
  });

  it("returns 403 when payment amount is insufficient", async () => {
    const insufficientValue = 3n * 10n ** 18n; // 3 TON < 5 TON minimum (at rate 1.0)
    mockGetTransactionReceipt.mockResolvedValue(makeReceipt({ value: insufficientValue }));
    mockParseEventLogs.mockReturnValue([
      { address: TON_ERC20.toLowerCase(), args: { from: ADDR, to: BURN_ADDRESS, value: insufficientValue } },
    ]);
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
  });

  it("accepts transfer ≥ dynamic minimum when rate changes (rate=$2/TON → min 2 TON)", async () => {
    mockFetchTonUsdRate.mockResolvedValue(2.0); // $2/TON → minValue = usdToTonWei(4, 2.0) = 2 TON
    const threeToN = 3n * 10n ** 18n;
    mockGetTransactionReceipt.mockResolvedValue(makeReceipt({ value: threeToN }));
    mockParseEventLogs.mockReturnValue([
      { address: TON_ERC20.toLowerCase(), args: { from: ADDR, to: BURN_ADDRESS, value: threeToN } },
    ]);
    const res = await POST(makeReq());
    expect(res.status).toBe(200); // 3 TON passes because dynamic minValue is only 2.5 TON
  });

  it("returns 503 when price oracle is unavailable", async () => {
    mockFetchTonUsdRate.mockRejectedValue(new Error("CoinGecko down"));
    const res = await POST(makeReq());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/price oracle/i);
  });

  it("returns 409 when txHash already used", async () => {
    mockKvSet.mockImplementation((_key: string, _value: unknown, opts?: any) => {
      if (opts?.nx === true) {
        return Promise.resolve(null); // claim fails — already taken
      }
      return Promise.resolve(undefined);
    });
    const res = await POST(makeReq());
    expect(res.status).toBe(409);
  });

  it("saves txhash dedup record and purchase record, issues key on success", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);

    // txhash:{hash} claimed via kv.set with nx: true
    expect(mockKvSet).toHaveBeenCalledWith(
      expect.stringContaining("txhash:"),
      expect.objectContaining({ address: ADDR }),
      expect.objectContaining({ nx: true }),
    );
    // purchase:{address} written with expiresAt ~30 days from now
    expect(mockKvSet).toHaveBeenCalledWith(
      `purchase:${ADDR}`,
      expect.objectContaining({ txHash: TX_HASH }),
    );
    // issueKeyForAddress called
    expect(mockIssueKeyForAddress).toHaveBeenCalledWith(ADDR);
    // kvDel NOT called on success (only on failure)
    expect(mockKvDel).not.toHaveBeenCalled();
  });
});
