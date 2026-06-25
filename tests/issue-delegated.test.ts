/**
 * Route handler test — /api/keys/issue-delegated
 * Focused on the mainnet-only gate: Sepolia must mint no key (testnet staking blocked).
 * The gate sits right after the origin check (before SIWE/nonce), so an allowlisted
 * origin is the only setup needed to reach it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockGenerateLiteLLMKey } = vi.hoisted(() => {
  // ALLOWED_ORIGINS is read at module load — set before the route imports.
  process.env.DELEGATED_ALLOWED_ORIGINS = "http://localhost:3000";
  return { mockGenerateLiteLLMKey: vi.fn() };
});

vi.mock("@/lib/litellm", () => ({ generateLiteLLMKey: mockGenerateLiteLLMKey }));

import { POST } from "@/app/api/keys/issue-delegated/route";

const ORIGIN = "http://localhost:3000";

function makeReq(origin: string | null = ORIGIN) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return new NextRequest("http://localhost/api/keys/issue-delegated", {
    method: "POST",
    headers,
    body: JSON.stringify({ message: "x", signature: "0x" }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/keys/issue-delegated — mainnet-only gate", () => {
  it("returns 403 and mints no key on Sepolia (testnet delegated staking blocked)", async () => {
    process.env.NEXT_PUBLIC_CHAIN = "sepolia";
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/sepolia/i);
    expect(mockGenerateLiteLLMKey).not.toHaveBeenCalled();
    // CORS preserved on the gate response
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
  });
});
