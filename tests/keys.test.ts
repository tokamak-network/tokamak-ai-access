/**
 * Route handler tests — /api/keys/{issue,me,rotate}
 * vitest + mocked dependencies (KV, LiteLLM, staking, session)
 *
 * Covers: auth gates, eligibility checks, key lifecycle (issue → me → rotate)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks (hoisted so vi.mock factories can reference them) ──────────────────
const {
  mockGetSessionAddress,
  mockGetTotalStakedTON,
  mockGenerateLiteLLMKey,
  mockRevokeLiteLLMKey,
  mockRenewLiteLLMKey,
  mockKvGet,
  mockKvSet,
  mockKvIncr,
  mockCheckRateLimit,
} = vi.hoisted(() => ({
  mockGetSessionAddress:  vi.fn(),
  mockGetTotalStakedTON:  vi.fn(),
  mockGenerateLiteLLMKey: vi.fn(),
  mockRevokeLiteLLMKey:   vi.fn(),
  mockRenewLiteLLMKey:    vi.fn(),
  mockKvGet:              vi.fn(),
  mockKvSet:              vi.fn(),
  mockKvIncr:             vi.fn(),
  mockCheckRateLimit:     vi.fn(),
}));

vi.mock("@/lib/siwe",          () => ({ getSessionAddress: mockGetSessionAddress }));
vi.mock("@/lib/staking",       () => ({ getTotalStakedTON: mockGetTotalStakedTON }));
vi.mock("@/lib/litellm",       () => ({
  generateLiteLLMKey: mockGenerateLiteLLMKey,
  revokeLiteLLMKey:   mockRevokeLiteLLMKey,
  renewLiteLLMKey:    mockRenewLiteLLMKey,
}));
vi.mock("@vercel/kv",          () => ({ kv: { get: mockKvGet, set: mockKvSet, del: vi.fn(), incr: mockKvIncr } }));
vi.mock("@/lib/with-rate-limit", () => ({ checkRateLimit: mockCheckRateLimit }));

// Modules imported AFTER mocks are registered
import { POST as issueKey }  from "@/app/api/keys/issue/route";
import { GET  as getMe }     from "@/app/api/keys/me/route";
import { POST as rotateKey } from "@/app/api/keys/rotate/route";
import { POST as renewKey }  from "@/app/api/keys/renew/route";

// ── Test helpers ─────────────────────────────────────────────────────────────
const ADDR       = "0xdeadbeef00000000000000000000000000000001";
const MIN_TON    = 100n * 10n ** 18n;  // matches route default (MIN_TON env unset)
const ENOUGH_TON = MIN_TON + 1n;

const MOCK_KEY = {
  key:       "sk-litellm-abc123xyz",
  keyId:     "key-abc123",
  expiresAt: "2099-01-01T00:00:00.000Z",
};

const STORED_RECORD = {
  liteLlmKeyId: MOCK_KEY.keyId,
  hash:         "a".repeat(64),   // fake sha256
  keySlice:     "xyz",
  createdAt:    1_700_000_000_000,
  expiresAt:    "2099-01-01T00:00:00.000Z",
};

function makeReq(method = "POST"): NextRequest {
  return new NextRequest(`http://localhost/api/keys/test`, { method });
}

// ── Setup ────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  // Default: rate limit passes
  mockCheckRateLimit.mockResolvedValue(null);
});

// ── POST /api/keys/issue ─────────────────────────────────────────────────────
describe("POST /api/keys/issue", () => {
  it("issues key for eligible staker with no existing key", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    mockKvGet.mockResolvedValue(null);                    // no existing key
    mockGenerateLiteLLMKey.mockResolvedValue(MOCK_KEY);
    mockKvSet.mockResolvedValue(undefined);

    const res  = await issueKey(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.key).toBe(MOCK_KEY.key);
    expect(body.expiresAt).toBe(MOCK_KEY.expiresAt);
    expect(mockKvSet).toHaveBeenCalledTimes(2);
    // hash only — never the plaintext key
    expect(mockKvSet.mock.calls[1][1]).not.toHaveProperty("key");
    expect(mockKvSet.mock.calls[1][1]).toHaveProperty("hash");
    expect(mockKvIncr).toHaveBeenCalledOnce();
    expect(mockKvIncr).toHaveBeenCalledWith("stats:active-keys");
  });

  it("returns 401 when no session", async () => {
    mockGetSessionAddress.mockResolvedValue(null);

    const res = await issueKey(makeReq());
    expect(res.status).toBe(401);
    expect(mockGenerateLiteLLMKey).not.toHaveBeenCalled();
  });

  it("returns 403 when stake is below minimum and no purchase", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(MIN_TON - 1n);
    mockKvGet.mockResolvedValue(null);  // no purchase record, no existing key

    const res = await issueKey(makeReq());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/not eligible/i);
    expect(mockGenerateLiteLLMKey).not.toHaveBeenCalled();
  });

  it("returns 409 when active key already exists", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    mockKvGet.mockResolvedValue(STORED_RECORD);           // existing key, no revokedAt

    const res = await issueKey(makeReq());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already issued/i);
    expect(mockGenerateLiteLLMKey).not.toHaveBeenCalled();
  });

  it("re-issues if previous key was revoked", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    mockKvGet.mockResolvedValue({ ...STORED_RECORD, revokedAt: Date.now() - 1000 });
    mockGenerateLiteLLMKey.mockResolvedValue(MOCK_KEY);
    mockKvSet.mockResolvedValue(undefined);

    const res = await issueKey(makeReq());
    expect(res.status).toBe(200);
    expect((await res.json()).key).toBe(MOCK_KEY.key);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    const { NextResponse } = await import("next/server");
    mockCheckRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );

    const res = await issueKey(makeReq());
    expect(res.status).toBe(429);
  });

  it("stores expiresAt in KV when issuing key", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    mockKvGet.mockResolvedValue(null);
    mockGenerateLiteLLMKey.mockResolvedValue(MOCK_KEY);
    mockKvSet.mockResolvedValue(undefined);

    await issueKey(makeReq());

    expect(mockKvSet.mock.calls[1][1]).toHaveProperty("expiresAt", MOCK_KEY.expiresAt);
  });

  it("re-issues if existing key is TTL-expired", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    mockKvGet.mockResolvedValue({ ...STORED_RECORD, expiresAt: "2020-01-01T00:00:00.000Z" });
    mockGenerateLiteLLMKey.mockResolvedValue(MOCK_KEY);
    mockKvSet.mockResolvedValue(undefined);

    const res = await issueKey(makeReq());
    expect(res.status).toBe(200);
    expect((await res.json()).key).toBe(MOCK_KEY.key);
  });

  it("returns 503 when global key cap is reached", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    mockKvGet.mockImplementation((key: string) => {
      if (key === "stats:active-keys") return Promise.resolve(1000);
      return Promise.resolve(null);
    });

    const res = await issueKey(makeReq());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Service at capacity");
  });

  it("returns 409 when TOCTOU lock is already held", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    mockKvGet.mockImplementation((key: string) => {
      if (key === "stats:active-keys") return Promise.resolve(0);
      return Promise.resolve(null);
    });
    // SET NX returns null = lock already held by another request
    mockKvSet.mockResolvedValue(null);

    const res = await issueKey(makeReq());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Issue in progress");
  });

  it("calls generateLiteLLMKey with 'stake' keyType", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    mockKvGet.mockResolvedValue(null);
    mockGenerateLiteLLMKey.mockResolvedValue({ key: "sk-litellm-abc", keyId: "sk-litellm-abc", expiresAt: undefined });
    mockKvSet.mockResolvedValue(undefined);
    mockKvIncr.mockResolvedValue(undefined);

    await issueKey(makeReq());

    expect(mockGenerateLiteLLMKey).toHaveBeenCalledWith(ADDR, "stake");
  });

  it("does not store expiresAt in KV when stake key has no expiry", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    mockKvGet.mockResolvedValue(null);
    mockGenerateLiteLLMKey.mockResolvedValue({ key: "sk-litellm-abc", keyId: "sk-litellm-abc", expiresAt: undefined });
    mockKvSet.mockResolvedValue(undefined);
    mockKvIncr.mockResolvedValue(undefined);

    await issueKey(makeReq());

    // mockKvSet.calls[0] = lock set (kvSetNx), calls[1] = key record
    const storedRecord = mockKvSet.mock.calls[1][1];
    expect(storedRecord).not.toHaveProperty("expiresAt");
  });
});

// ── GET /api/keys/me ─────────────────────────────────────────────────────────
describe("GET /api/keys/me", () => {
  it("returns hasActiveKey true with metadata for active key", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockKvGet.mockResolvedValue(STORED_RECORD);

    const res  = await getMe(makeReq("GET"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.hasActiveKey).toBe(true);
    expect(body.createdAt).toBe(new Date(STORED_RECORD.createdAt).toISOString());
    expect(body.lastFour).toBe(STORED_RECORD.keySlice);
    // plaintext key must never appear
    expect(JSON.stringify(body)).not.toContain("sk-litellm");
  });

  it("returns hasActiveKey false when no record exists", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockKvGet.mockResolvedValue(null);

    const res  = await getMe(makeReq("GET"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.hasActiveKey).toBe(false);
  });

  it("returns hasActiveKey false for revoked key", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockKvGet.mockResolvedValue({ ...STORED_RECORD, revokedAt: Date.now() - 1000 });

    const res  = await getMe(makeReq("GET"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.hasActiveKey).toBe(false);
  });

  it("returns 401 when no session", async () => {
    mockGetSessionAddress.mockResolvedValue(null);

    const res = await getMe(makeReq("GET"));
    expect(res.status).toBe(401);
  });

  it("returns expiresAt for active key", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockKvGet.mockResolvedValue(STORED_RECORD);

    const body = await (await getMe(makeReq("GET"))).json();
    expect(body.expiresAt).toBe(STORED_RECORD.expiresAt);
  });

  it("returns hasActiveKey false when key is TTL-expired", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockKvGet.mockResolvedValue({ ...STORED_RECORD, expiresAt: "2020-01-01T00:00:00.000Z" });

    const body = await (await getMe(makeReq("GET"))).json();
    expect(body.hasActiveKey).toBe(false);
  });
});

// ── POST /api/keys/rotate ────────────────────────────────────────────────────
describe("POST /api/keys/rotate", () => {
  it("revokes old key and issues a new one", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    mockKvGet.mockResolvedValue(STORED_RECORD);
    mockRevokeLiteLLMKey.mockResolvedValue(undefined);
    mockGenerateLiteLLMKey.mockResolvedValue({ ...MOCK_KEY, key: "sk-litellm-new456" });
    mockKvSet.mockResolvedValue(undefined);

    const res  = await rotateKey(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.key).toBe("sk-litellm-new456");

    // old key must be revoked
    expect(mockRevokeLiteLLMKey).toHaveBeenCalledWith(STORED_RECORD.liteLlmKeyId);

    // KV should be written twice: archive to :prev, then new record
    expect(mockKvSet).toHaveBeenCalledTimes(2);
    const [prevCall, newCall] = mockKvSet.mock.calls;
    expect(prevCall[0]).toContain(":prev");
    expect(prevCall[1]).toHaveProperty("revokedAt");
    expect(newCall[0]).not.toContain(":prev");
    expect(newCall[1]).not.toHaveProperty("revokedAt");
    expect(newCall[1]).toHaveProperty("expiresAt", MOCK_KEY.expiresAt);
  });

  it("issues new key even with no prior key in KV", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    mockKvGet.mockResolvedValue(null);                    // no prior key
    mockGenerateLiteLLMKey.mockResolvedValue(MOCK_KEY);
    mockKvSet.mockResolvedValue(undefined);

    const res = await rotateKey(makeReq());
    expect(res.status).toBe(200);
    expect(mockRevokeLiteLLMKey).not.toHaveBeenCalled();
    expect(mockKvSet).toHaveBeenCalledOnce();
  });

  it("returns 401 when no session", async () => {
    mockGetSessionAddress.mockResolvedValue(null);

    const res = await rotateKey(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 403 when stake falls below minimum and no purchase", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(0n);
    mockKvGet.mockResolvedValue(null); // no key record, no purchase record

    const res = await rotateKey(makeReq());
    expect(res.status).toBe(403);
    expect(mockGenerateLiteLLMKey).not.toHaveBeenCalled();
  });

  it("allows rotation when active purchase exists and stake is 0", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(0n);
    const FUTURE = Date.now() + 30 * 24 * 60 * 60 * 1000;
    mockKvGet.mockImplementation((key: string) =>
      key.startsWith("purchase:")
        ? Promise.resolve({ txHash: "0xabc", paidAt: Date.now(), expiresAt: FUTURE })
        : Promise.resolve(null),
    );
    mockGenerateLiteLLMKey.mockResolvedValue(MOCK_KEY);
    mockKvSet.mockResolvedValue(undefined);

    const res = await rotateKey(makeReq());
    expect(res.status).toBe(200);
    expect((await res.json()).key).toBe(MOCK_KEY.key);
    expect(mockGenerateLiteLLMKey).toHaveBeenCalled();
  });

  it("blocks rotation when stake is 0 and purchase has expired", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(0n);
    const PAST = Date.now() - 1000;
    mockKvGet.mockImplementation((key: string) =>
      key.startsWith("purchase:")
        ? Promise.resolve({ txHash: "0xabc", paidAt: Date.now() - 31 * 24 * 60 * 60 * 1000, expiresAt: PAST })
        : Promise.resolve(null),
    );

    const res = await rotateKey(makeReq());
    expect(res.status).toBe(403);
    expect(mockGenerateLiteLLMKey).not.toHaveBeenCalled();
  });

  it("allows rotation for purchase user with no stake", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(0n);
    const ACTIVE_PURCHASE = { txHash: "0xabc", paidAt: Date.now() - 1000, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
    mockKvGet.mockImplementation((key: string) => {
      if (key === `key:${ADDR}`) return Promise.resolve(STORED_RECORD);
      if (key === `purchase:${ADDR}`) return Promise.resolve(ACTIVE_PURCHASE);
      return Promise.resolve(null);
    });
    mockRevokeLiteLLMKey.mockResolvedValue(undefined);
    mockGenerateLiteLLMKey.mockResolvedValue({ ...MOCK_KEY, key: "sk-litellm-purchase123" });
    mockKvSet.mockResolvedValue(undefined);

    const res = await rotateKey(makeReq());
    expect(res.status).toBe(200);
    expect((await res.json()).key).toBe("sk-litellm-purchase123");
  });

  it("still issues new key if LiteLLM revocation call fails (best-effort)", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    mockKvGet.mockResolvedValue(STORED_RECORD);
    mockRevokeLiteLLMKey.mockRejectedValue(new Error("LiteLLM unreachable"));
    mockGenerateLiteLLMKey.mockResolvedValue(MOCK_KEY);
    mockKvSet.mockResolvedValue(undefined);

    const res = await rotateKey(makeReq());
    // revokeLiteLLMKey failure is caught (.catch(console.error)) — must not 500
    expect(res.status).toBe(200);
    expect((await res.json()).key).toBe(MOCK_KEY.key);
  });

  it("returns 403 with hoursLeft when rotate cooldown is active", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    mockKvGet.mockResolvedValue({ ...STORED_RECORD, lastRotatedAt: twoHoursAgo });

    const res = await rotateKey(makeReq());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Rotation cooldown active");
    expect(body.hoursLeft).toBeGreaterThan(20);
    expect(body.hoursLeft).toBeLessThanOrEqual(22);
    expect(mockGenerateLiteLLMKey).not.toHaveBeenCalled();
  });

  it("allows rotation when cooldown has passed (25h since last rotation)", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
    mockKvGet.mockResolvedValue({ ...STORED_RECORD, lastRotatedAt: twentyFiveHoursAgo });
    mockRevokeLiteLLMKey.mockResolvedValue(undefined);
    mockGenerateLiteLLMKey.mockResolvedValue({ ...MOCK_KEY, key: "sk-litellm-new789" });
    mockKvSet.mockResolvedValue(undefined);

    const res = await rotateKey(makeReq());
    expect(res.status).toBe(200);
    expect((await res.json()).key).toBe("sk-litellm-new789");

    // Verify lastRotatedAt was updated
    const newCall = mockKvSet.mock.calls[mockKvSet.mock.calls.length - 1];
    expect(newCall[1]).toHaveProperty("lastRotatedAt");
    expect(newCall[1].lastRotatedAt).toBeGreaterThan(Date.now() - 1000);
  });

  it("uses 'stake' keyType when no active purchase record", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    // STORED_RECORD.expiresAt is a string; PurchaseRecord.expiresAt is number
    // string > Date.now() === false → keyType = 'stake'
    mockKvGet.mockResolvedValue(STORED_RECORD);
    mockRevokeLiteLLMKey.mockResolvedValue(undefined);
    mockGenerateLiteLLMKey.mockResolvedValue({ ...MOCK_KEY, key: "sk-litellm-stake1" });
    mockKvSet.mockResolvedValue(undefined);

    await rotateKey(makeReq());

    expect(mockGenerateLiteLLMKey).toHaveBeenCalledWith(ADDR, "stake");
  });

  it("uses 'purchase' keyType when active purchase record exists", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    const FUTURE = Date.now() + 30 * 24 * 60 * 60 * 1000;
    mockKvGet.mockImplementation((key: string) => {
      if (key === `key:${ADDR}`) return Promise.resolve(STORED_RECORD);
      if (key === `purchase:${ADDR}`) return Promise.resolve({ txHash: "0xabc", paidAt: Date.now(), expiresAt: FUTURE });
      return Promise.resolve(null);
    });
    mockRevokeLiteLLMKey.mockResolvedValue(undefined);
    mockGenerateLiteLLMKey.mockResolvedValue({ ...MOCK_KEY, key: "sk-litellm-purch1" });
    mockKvSet.mockResolvedValue(undefined);

    await rotateKey(makeReq());

    expect(mockGenerateLiteLLMKey).toHaveBeenCalledWith(ADDR, "purchase");
  });
});

// ── POST /api/keys/renew ─────────────────────────────────────────────────────
describe("POST /api/keys/renew", () => {
  const RENEWED_EXPIRES = "2099-07-01T00:00:00.000Z";
  // createdAt older than 30 days → renewable
  const OLD_RECORD = { ...STORED_RECORD, createdAt: Date.now() - 31 * 24 * 60 * 60 * 1000 };
  // createdAt within 30 days → not yet renewable
  const FRESH_RECORD = { ...STORED_RECORD, createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000 };

  it("renews key and updates expiresAt when 30+ days have passed", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    mockKvGet.mockResolvedValue(OLD_RECORD);
    mockRenewLiteLLMKey.mockResolvedValue({ expiresAt: RENEWED_EXPIRES });
    mockKvSet.mockResolvedValue(undefined);

    const res  = await renewKey(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.expiresAt).toBe(RENEWED_EXPIRES);
    // renewLiteLLMKey called with the stored key ID
    expect(mockRenewLiteLLMKey).toHaveBeenCalledWith(OLD_RECORD.liteLlmKeyId);
    // KV updated with new expiresAt
    expect(mockKvSet).toHaveBeenCalledOnce();
    expect(mockKvSet.mock.calls[0][1]).toHaveProperty("expiresAt", RENEWED_EXPIRES);
  });

  it("does not change the key value — same liteLlmKeyId preserved in KV", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    mockKvGet.mockResolvedValue(OLD_RECORD);
    mockRenewLiteLLMKey.mockResolvedValue({ expiresAt: RENEWED_EXPIRES });
    mockKvSet.mockResolvedValue(undefined);

    await renewKey(makeReq());

    expect(mockKvSet.mock.calls[0][1]).toHaveProperty("liteLlmKeyId", OLD_RECORD.liteLlmKeyId);
    // no new key returned to client
    expect(await (await renewKey(makeReq())).json()).not.toHaveProperty("key");
  });

  it("returns 403 with daysLeft when < 30 days since issuance", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    mockKvGet.mockResolvedValue(FRESH_RECORD);

    const res  = await renewKey(makeReq());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/not yet renewable/i);
    expect(body.daysLeft).toBeGreaterThan(0);
    expect(mockRenewLiteLLMKey).not.toHaveBeenCalled();
  });

  it("returns 401 when no session", async () => {
    mockGetSessionAddress.mockResolvedValue(null);

    const res = await renewKey(makeReq());
    expect(res.status).toBe(401);
    expect(mockRenewLiteLLMKey).not.toHaveBeenCalled();
  });

  it("returns 403 when stake is below minimum and no purchase", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(MIN_TON - 1n);
    mockKvGet.mockResolvedValue(null); // no purchase record

    const res = await renewKey(makeReq());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/not eligible/i);
    expect(mockRenewLiteLLMKey).not.toHaveBeenCalled();
  });

  it("allows renewal when active purchase exists and stake is 0", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(0n);
    const FUTURE = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const OLD_CREATED = Date.now() - 31 * 24 * 60 * 60 * 1000;
    mockKvGet.mockImplementation((key: string) => {
      if (key.startsWith("purchase:")) {
        return Promise.resolve({ txHash: "0xabc", paidAt: Date.now(), expiresAt: FUTURE });
      }
      return Promise.resolve({ ...STORED_RECORD, createdAt: OLD_CREATED });
    });
    mockRenewLiteLLMKey.mockResolvedValue({ expiresAt: "2099-07-01T00:00:00.000Z" });
    mockKvSet.mockResolvedValue(undefined);

    const res = await renewKey(makeReq());
    expect(res.status).toBe(200);
    expect(mockRenewLiteLLMKey).toHaveBeenCalled();
  });

  it("blocks renewal when stake is 0 and purchase has expired", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(0n);
    const PAST = Date.now() - 1000;
    mockKvGet.mockImplementation((key: string) =>
      key.startsWith("purchase:")
        ? Promise.resolve({ txHash: "0xabc", paidAt: Date.now() - 31 * 24 * 60 * 60 * 1000, expiresAt: PAST })
        : Promise.resolve(null),
    );

    const res = await renewKey(makeReq());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/not eligible/i);
    expect(mockRenewLiteLLMKey).not.toHaveBeenCalled();
  });

  it("renews key for purchase user with no stake", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(0n);
    const ACTIVE_PURCHASE = { txHash: "0xabc", paidAt: Date.now() - 1000, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
    mockKvGet.mockImplementation((key: string) => {
      if (key === `purchase:${ADDR}`) return Promise.resolve(ACTIVE_PURCHASE);
      if (key === `key:${ADDR}`) return Promise.resolve(OLD_RECORD);
      return Promise.resolve(null);
    });
    mockRenewLiteLLMKey.mockResolvedValue({ expiresAt: RENEWED_EXPIRES });
    mockKvSet.mockResolvedValue(undefined);

    const res = await renewKey(makeReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.expiresAt).toBe(RENEWED_EXPIRES);
  });

  it("returns 404 when no key exists", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    mockKvGet.mockResolvedValue(null);

    const res = await renewKey(makeReq());
    expect(res.status).toBe(404);
    expect(mockRenewLiteLLMKey).not.toHaveBeenCalled();
  });

  it("returns 404 when key has been revoked", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    mockKvGet.mockResolvedValue({ ...OLD_RECORD, revokedAt: Date.now() - 1000 });

    const res = await renewKey(makeReq());
    expect(res.status).toBe(404);
    expect(mockRenewLiteLLMKey).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    const { NextResponse } = await import("next/server");
    mockCheckRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );

    const res = await renewKey(makeReq());
    expect(res.status).toBe(429);
  });

  it("preserves createdAt in KV after renewal", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    mockKvGet.mockResolvedValue(OLD_RECORD);
    mockRenewLiteLLMKey.mockResolvedValue({ expiresAt: RENEWED_EXPIRES });
    mockKvSet.mockResolvedValue(undefined);

    await renewKey(makeReq());

    expect(mockKvSet.mock.calls[0][1]).toHaveProperty("createdAt", OLD_RECORD.createdAt);
  });

  it("returns noOp:true and expiresAt:null for staking keys (no expiresAt in record)", async () => {
    mockGetSessionAddress.mockResolvedValue(ADDR);
    mockGetTotalStakedTON.mockResolvedValue(ENOUGH_TON);
    // Staking key: no expiresAt field
    const STAKE_RECORD = { ...OLD_RECORD, expiresAt: undefined };
    mockKvGet.mockResolvedValue(STAKE_RECORD);

    const res  = await renewKey(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.noOp).toBe(true);
    expect(body.expiresAt).toBeNull();
    expect(mockRenewLiteLLMKey).not.toHaveBeenCalled();
    expect(mockKvSet).not.toHaveBeenCalled();
  });
});
