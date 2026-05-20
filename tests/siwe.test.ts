/**
 * Unit tests — SIWE session helper
 * vitest + mock @vercel/kv
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock @vercel/kv before any lib imports ----
const mockKvGet = vi.fn();
vi.mock("@vercel/kv", () => ({
  kv: {
    get: mockKvGet,
    set: vi.fn(),
    del: vi.fn(),
  },
}));

import { getSessionAddress } from "@/lib/siwe";
import { NextRequest } from "next/server";

// Helper: build a minimal NextRequest with a session cookie
function makeReq(sessionId?: string): NextRequest {
  const headers = new Headers();
  if (sessionId) {
    headers.set("cookie", `session_id=${sessionId}`);
  }
  return new NextRequest("http://localhost/api/test", { headers });
}

// Helper: session data factory
function session(overrides: Partial<{ address: string; expiresAt: number }> = {}) {
  return {
    address: "0xDeAdBeEf00000000000000000000000000000001",
    issuedAt: Date.now() - 1000,
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSessionAddress", () => {
  it("returns lowercase address for valid, unexpired session", async () => {
    mockKvGet.mockResolvedValueOnce(session());
    const req = makeReq("valid-uuid");
    const result = await getSessionAddress(req);
    expect(result).toBe("0xdeadbeef00000000000000000000000000000001");
  });

  it("returns null when session cookie is missing", async () => {
    const req = makeReq(); // no cookie
    const result = await getSessionAddress(req);
    expect(result).toBeNull();
    expect(mockKvGet).not.toHaveBeenCalled();
  });

  it("returns null when KV returns null (session not found)", async () => {
    mockKvGet.mockResolvedValueOnce(null);
    const req = makeReq("nonexistent-session");
    const result = await getSessionAddress(req);
    expect(result).toBeNull();
  });

  it("returns null when session is expired", async () => {
    mockKvGet.mockResolvedValueOnce(session({ expiresAt: Date.now() - 1 }));
    const req = makeReq("expired-session");
    const result = await getSessionAddress(req);
    expect(result).toBeNull();
  });
});
