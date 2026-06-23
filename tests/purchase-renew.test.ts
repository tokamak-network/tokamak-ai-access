import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetSessionAddress,
  mockKvGet,
  mockKvSet,
  mockKvSetNx,
  mockKvDel,
  mockRenewLiteLLMKey,
  mockGetTransactionReceipt,
  mockParseEventLogs,
  mockFetchTonUsdRate,
} = vi.hoisted(() => {
  // Set before route module loads — CHAIN_ID is a module-level const
  process.env.NEXT_PUBLIC_CHAIN = "sepolia";
  return {
    mockGetSessionAddress: vi.fn(),
    mockKvGet: vi.fn(),
    mockKvSet: vi.fn(),
    mockKvSetNx: vi.fn(),
    mockKvDel: vi.fn(),
    mockRenewLiteLLMKey: vi.fn(),
    mockGetTransactionReceipt: vi.fn(),
    mockParseEventLogs: vi.fn(),
    mockFetchTonUsdRate: vi.fn(),
  };
});

vi.mock("@/lib/siwe", () => ({ getSessionAddress: mockGetSessionAddress }));
vi.mock("@vercel/kv", () => {
  const kvSet = vi.fn(async (_key: string, _value: unknown, opts?: Record<string, unknown>) => {
    if (opts?.nx === true) {
      // kvSetNx internally calls kv.set with nx: true
      const result = await mockKvSetNx(_key, _value, opts);
      return result ? "OK" : null;
    }
    // Normal set (not nx) — delegate to the tracker mock
    await mockKvSet(_key, _value, opts);
    return undefined;
  });
  return {
    kv: {
      get: mockKvGet,
      set: kvSet,
      del: mockKvDel,
    },
  };
});
vi.mock("@/lib/litellm", () => ({ renewLiteLLMKey: mockRenewLiteLLMKey }));
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

import { PUT } from "@/app/api/keys/purchase/renew/route";

const ADDR = "0xdeadbeef00000000000000000000000000000001";
const BURN_ADDRESS = "0x000000000000000000000000000000000000dead";
const TON_ERC20 = "0xa30fe40285b8f5c0457dbc3b7c8a280373c40044"; // Sepolia TON from abi/TON.json
const TX_HASH = "0xnewTxHash00000000000000000000000000000000000000000000000000000001";
const FIVE_TON = 5n * 10n ** 18n;
const NOW = Date.now();
const FUTURE = NOW + 30 * 24 * 60 * 60 * 1000;
const LITELLM_KEY_ID = "sk-litellm-existing-key";

function makeReq(body: object = { txHash: TX_HASH }) {
  return new NextRequest("http://localhost/api/keys/purchase/renew", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PURCHASE_USD_PRICE = "5";

  mockGetSessionAddress.mockResolvedValue(ADDR);
  mockGetTransactionReceipt.mockResolvedValue({ to: TON_ERC20.toLowerCase(), logs: [] });
  mockParseEventLogs.mockReturnValue([
    { address: TON_ERC20.toLowerCase(), args: { from: ADDR, to: BURN_ADDRESS, value: FIVE_TON } },
  ]);
  mockRenewLiteLLMKey.mockResolvedValue({
    expiresAt: "2099-01-01T00:00:00.000Z",
  });
  mockFetchTonUsdRate.mockResolvedValue(1.0); // rate=$1/TON → minValue=4 TON (5 USD * 0.8)
  mockKvSetNx.mockResolvedValue(true); // claim succeeds by default
  mockKvDel.mockResolvedValue(1); // del succeeds by default

  // Default KV state: txhash not used, purchase exists, key record exists
  mockKvGet.mockImplementation((key: string) => {
    if (key.startsWith("txhash:")) return null;
    if (key.startsWith("purchase:")) {
      return Promise.resolve({
        txHash: "0xold",
        paidAt: NOW,
        expiresAt: FUTURE,
      });
    }
    if (key.startsWith("key:")) {
      return Promise.resolve({
        liteLlmKeyId: LITELLM_KEY_ID,
      });
    }
    return Promise.resolve(null);
  });
});

describe("PUT /api/keys/purchase/renew", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSessionAddress.mockResolvedValue(null);
    const res = await PUT(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 400 when txHash missing", async () => {
    const res = await PUT(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when no existing purchase record", async () => {
    mockKvGet.mockImplementation((key: string) => {
      if (key.startsWith("purchase:")) return Promise.resolve(null);
      return Promise.resolve(null);
    });
    const res = await PUT(makeReq());
    expect(res.status).toBe(404);
  });

  it("returns 409 when txHash already used", async () => {
    mockKvSetNx.mockResolvedValue(false); // claim fails
    const res = await PUT(makeReq());
    expect(res.status).toBe(409);
  });

  it("extends expiresAt from current expiry, calls renewLiteLLMKey, returns 200", async () => {
    const res = await PUT(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    // expiresAt should be FUTURE + 30d
    expect(body.expiresAt).toBeGreaterThan(FUTURE);

    // mockKvSet is called with (key, value, opts)
    expect(mockKvSet).toHaveBeenCalledWith(
      `purchase:${ADDR}`,
      expect.objectContaining({ txHash: TX_HASH }),
      undefined, // no TTL
    );
    expect(mockRenewLiteLLMKey).toHaveBeenCalledWith(LITELLM_KEY_ID);
  });

  it("extends expiresAt from now when purchase already expired", async () => {
    const PAST = NOW - 1000;
    mockKvGet.mockImplementation((key: string) => {
      if (key.startsWith("txhash:")) return Promise.resolve(null);
      if (key.startsWith("purchase:")) {
        return Promise.resolve({
          txHash: "0xold",
          paidAt: NOW,
          expiresAt: PAST,
        });
      }
      if (key.startsWith("key:")) {
        return Promise.resolve({
          liteLlmKeyId: LITELLM_KEY_ID,
        });
      }
      return Promise.resolve(null);
    });
    const res = await PUT(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    // expiresAt should be ~30d from now (not from the past)
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(body.expiresAt).toBeGreaterThanOrEqual(NOW + thirtyDays - 5000);
  });

  it("releases txHash dedup claim when tx verification fails (422)", async () => {
    mockGetTransactionReceipt.mockResolvedValue(null); // tx not found
    const res = await PUT(makeReq());
    expect(res.status).toBe(422);
    // dedup claim should be released
    expect(mockKvDel).toHaveBeenCalledWith(`txhash:${TX_HASH}`);
  });

  it("skips renewLiteLLMKey when key record is missing", async () => {
    mockKvGet.mockImplementation((key: string) => {
      if (key.startsWith("txhash:")) return Promise.resolve(null);
      if (key.startsWith("purchase:")) return Promise.resolve({ txHash: "0xold", paidAt: NOW, expiresAt: FUTURE });
      if (key.startsWith("key:")) return Promise.resolve(null); // no key record
      return Promise.resolve(null);
    });
    const res = await PUT(makeReq());
    expect(res.status).toBe(200);
    expect(mockRenewLiteLLMKey).not.toHaveBeenCalled();
  });

  it("returns 503 when price oracle is unavailable", async () => {
    mockFetchTonUsdRate.mockRejectedValue(new Error("CoinGecko down"));
    const res = await PUT(makeReq());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/price oracle/i);
  });

  it("accepts transfer ≥ dynamic minimum when rate changes (rate=$2/TON → min 2 TON)", async () => {
    mockFetchTonUsdRate.mockResolvedValue(2.0);
    const threeToN = 3n * 10n ** 18n;
    mockParseEventLogs.mockReturnValue([
      { address: TON_ERC20.toLowerCase(), args: { from: ADDR, to: BURN_ADDRESS, value: threeToN } },
    ]);
    const res = await PUT(makeReq());
    expect(res.status).toBe(200);
  });
});
