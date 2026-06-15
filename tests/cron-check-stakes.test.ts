/**
 * Tests for GET/POST /api/cron/check-stakes — hourly key revocation for unstaked addresses (F-01)
 * vitest + vi.hoisted mocks
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ---- Hoisted mocks ----
const {
  mockKvKeys,
  mockKvGet,
  mockKvSet,
  mockKvDecr,
  mockGetTotalStakedTON,
  mockRevokeLiteLLMKey,
} = vi.hoisted(() => ({
  mockKvKeys: vi.fn(),
  mockKvGet: vi.fn(),
  mockKvSet: vi.fn(),
  mockKvDecr: vi.fn(),
  mockGetTotalStakedTON: vi.fn(),
  mockRevokeLiteLLMKey: vi.fn(),
}));

vi.mock("@vercel/kv", () => ({
  kv: {
    keys: mockKvKeys,
    set: vi.fn(),
  },
}));

vi.mock("@/lib/kv", () => ({
  kv: {
    keys: mockKvKeys,
    set: mockKvSet,
  },
  kvGet: mockKvGet,
  kvSet: mockKvSet,
  kvDecr: mockKvDecr,
}));

vi.mock("@/lib/staking", () => ({
  getTotalStakedTON: mockGetTotalStakedTON,
  MIN_TON: 10n,
}));

vi.mock("@/lib/litellm", () => ({
  revokeLiteLLMKey: mockRevokeLiteLLMKey,
}));

import { GET, POST } from "@/app/api/cron/check-stakes/route";

// ---- Helpers ----
function makeReq(method: string, auth?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) {
    headers.authorization = auth;
  }
  return new NextRequest("http://localhost/api/cron/check-stakes", {
    method,
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  mockKvSet.mockResolvedValue(undefined);
  mockKvDecr.mockResolvedValue(9); // mock return value from decr
  mockRevokeLiteLLMKey.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/check-stakes (F-01)", () => {
  describe("Authorization", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const req = makeReq("GET");
      const res = await GET(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 401 when Authorization header is wrong", async () => {
      const req = makeReq("GET", "Bearer wrong-secret");
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it("returns 401 when CRON_SECRET is not set", async () => {
      delete process.env.CRON_SECRET;
      const req = makeReq("GET", "Bearer test-secret");
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it("returns 200 when Authorization header is correct", async () => {
      mockKvKeys.mockResolvedValue([]);
      const req = makeReq("GET", "Bearer test-secret");
      const res = await GET(req);
      expect(res.status).toBe(200);
    });
  });

  describe("Key revocation logic", () => {
    it("revokes key for unstaked address", async () => {
      const keyRecord = {
        liteLlmKeyId: "sk-abc123",
        hash: "hash-abc",
        keySlice: "abc",
        createdAt: Date.now(),
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      };

      mockKvKeys.mockResolvedValue(["key:0xabc"]);
      mockKvGet.mockResolvedValue(keyRecord);
      mockGetTotalStakedTON.mockResolvedValue(0n); // below MIN_TON_WEI (10 * 10^18)

      const req = makeReq("GET", "Bearer test-secret");
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(mockRevokeLiteLLMKey).toHaveBeenCalledWith("sk-abc123");
      expect(mockKvSet).toHaveBeenCalledWith(
        "key:0xabc",
        expect.objectContaining({ revokedAt: expect.any(Number) }),
      );

      const body = await res.json();
      expect(body.revoked).toBe(1);
      expect(body.total).toBe(1);
      expect(body.activeCount).toBe(0);
    });

    it("does NOT revoke key for staked address", async () => {
      const keyRecord = {
        liteLlmKeyId: "sk-def456",
        hash: "hash-def",
        keySlice: "def",
        createdAt: Date.now(),
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      };

      mockKvKeys.mockResolvedValue(["key:0xdef"]);
      mockKvGet.mockResolvedValue(keyRecord);
      // 10 * 10^18 = minimum TON_WEI (matches MIN_TON_WEI)
      mockGetTotalStakedTON.mockResolvedValue(10n * 10n ** 18n);

      const req = makeReq("GET", "Bearer test-secret");
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(mockRevokeLiteLLMKey).not.toHaveBeenCalled();

      const body = await res.json();
      expect(body.revoked).toBe(0);
      expect(body.total).toBe(1);
      expect(body.activeCount).toBe(1);
    });

    it("skips keys with :lock suffix", async () => {
      mockKvKeys.mockResolvedValue(["key:0xabc:lock"]);

      const req = makeReq("GET", "Bearer test-secret");
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(mockKvGet).not.toHaveBeenCalled();
      expect(mockRevokeLiteLLMKey).not.toHaveBeenCalled();

      const body = await res.json();
      expect(body.revoked).toBe(0);
      expect(body.total).toBe(0);
    });

    it("skips already-revoked keys", async () => {
      const keyRecord = {
        liteLlmKeyId: "sk-xyz789",
        hash: "hash-xyz",
        keySlice: "xyz",
        createdAt: Date.now(),
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        revokedAt: Date.now() - 1000, // already revoked
      };

      mockKvKeys.mockResolvedValue(["key:0xxyz"]);
      mockKvGet.mockResolvedValue(keyRecord);

      const req = makeReq("GET", "Bearer test-secret");
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(mockRevokeLiteLLMKey).not.toHaveBeenCalled();
      expect(mockKvDecr).not.toHaveBeenCalled();

      const body = await res.json();
      expect(body.revoked).toBe(0);
    });

    it("continues processing when one key revocation fails", async () => {
      const keyRecord1 = {
        liteLlmKeyId: "sk-fail",
        hash: "hash-1",
        keySlice: "fail",
        createdAt: Date.now(),
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      };

      const keyRecord2 = {
        liteLlmKeyId: "sk-success",
        hash: "hash-2",
        keySlice: "success",
        createdAt: Date.now(),
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      };

      mockKvKeys.mockResolvedValue(["key:0xfail", "key:0xsuccess"]);
      mockKvGet
        .mockResolvedValueOnce(keyRecord1)
        .mockResolvedValueOnce(keyRecord2);
      mockGetTotalStakedTON.mockResolvedValue(0n);
      mockRevokeLiteLLMKey
        .mockRejectedValueOnce(new Error("LiteLLM API error"))
        .mockResolvedValueOnce(undefined);

      const req = makeReq("GET", "Bearer test-secret");
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(mockRevokeLiteLLMKey).toHaveBeenCalledTimes(2);

      // Both keys should be marked revoked despite the first failure
      expect(mockKvSet).toHaveBeenCalledWith(
        "key:0xfail",
        expect.objectContaining({ revokedAt: expect.any(Number) }),
      );
      expect(mockKvSet).toHaveBeenCalledWith(
        "key:0xsuccess",
        expect.objectContaining({ revokedAt: expect.any(Number) }),
      );

      const body = await res.json();
      expect(body.revoked).toBe(2);
    });
  });

  describe("POST method", () => {
    it("POST also works with correct authorization", async () => {
      mockKvKeys.mockResolvedValue([]);
      const req = makeReq("POST", "Bearer test-secret");
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it("POST returns 401 when Authorization is missing", async () => {
      const req = makeReq("POST");
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe("Edge cases", () => {
    it("returns success with empty key list", async () => {
      mockKvKeys.mockResolvedValue([]);
      const req = makeReq("GET", "Bearer test-secret");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.revoked).toBe(0);
      expect(body.total).toBe(0);
    });

    it("returns success when kv.keys returns null", async () => {
      mockKvKeys.mockResolvedValue(null);
      const req = makeReq("GET", "Bearer test-secret");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.revoked).toBe(0);
      expect(body.total).toBe(0);
    });

    it("corrects stats:active-keys count at end", async () => {
      const keyRecord = {
        liteLlmKeyId: "sk-test",
        hash: "hash-test",
        keySlice: "test",
        createdAt: Date.now(),
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      };

      mockKvKeys.mockResolvedValue(["key:0xtest1", "key:0xtest2"]);
      mockKvGet
        .mockResolvedValueOnce(keyRecord)
        .mockResolvedValueOnce({ ...keyRecord, revokedAt: Date.now() });
      mockGetTotalStakedTON.mockResolvedValue(0n);

      const req = makeReq("GET", "Bearer test-secret");
      const res = await GET(req);

      expect(res.status).toBe(200);
      // Final drift correction call to set stats:active-keys
      expect(mockKvSet).toHaveBeenCalledWith("stats:active-keys", expect.any(Number));
    });
  });
});
