/**
 * Tests for POST /api/auth/verify — SIWE domain/nonce/time binding (F-06)
 * vitest + vi.hoisted mocks
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---- Hoisted mocks ----
const { mockSiweVerify, mockKvGet, mockKvDel, mockKvSet, mockRateLimit } = vi.hoisted(() => ({
  mockSiweVerify: vi.fn(),
  mockKvGet: vi.fn(),
  mockKvDel: vi.fn(),
  mockKvSet: vi.fn(),
  mockRateLimit: vi.fn(),
}));

vi.mock("siwe", () => {
  return {
    SiweMessage: class {
      nonce = "abc123";
      address = "0xDeAdBeEf00000000000000000000000000000001";
      verify = mockSiweVerify;
      constructor(message: string) {}
    },
  };
});

vi.mock("@/lib/kv", () => ({
  kvGet: mockKvGet,
  kvSet: mockKvSet,
  kvDel: mockKvDel,
}));

vi.mock("@/lib/with-rate-limit", () => ({
  checkRateLimit: mockRateLimit,
}));

import { POST as verifyRoute } from "@/app/api/auth/verify/route";

// ---- Helpers ----
function makeReq(host: string, body: { message: string; signature: string }) {
  return new NextRequest("http://localhost/api/auth/verify", {
    method: "POST",
    headers: {
      "host": host,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue(null); // no rate limit
  process.env.APP_DOMAIN = "example.com";
});

afterEach(() => {
  delete process.env.APP_DOMAIN;
});

describe("POST /api/auth/verify — domain binding (F-06)", () => {
  it("passes domain, nonce, and time to siweMsg.verify", async () => {
    mockSiweVerify.mockResolvedValue({ success: true });
    mockKvGet.mockResolvedValue({ nonce: "abc123", expiresAt: Date.now() + 60_000 });
    mockKvDel.mockResolvedValue(undefined);
    mockKvSet.mockResolvedValue(undefined);

    await verifyRoute(
      makeReq("example.com", { message: "test-siwe-message", signature: "0xsig" }),
    );

    expect(mockSiweVerify).toHaveBeenCalledWith(
      expect.objectContaining({
        signature: "0xsig",
        domain: "example.com",
        nonce: "abc123",
        time: expect.any(String),
      }),
    );
  });

  it("returns 401 when domain verification fails (simulated via verify rejection)", async () => {
    mockSiweVerify.mockRejectedValue(new Error("Domain mismatch"));

    const res = await verifyRoute(
      makeReq("evil.com", { message: "test-siwe-message", signature: "0xsig" }),
    );
    expect(res.status).toBe(401);
  });
});
