import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockRateLimitIP, mockRateLimitAddr } = vi.hoisted(() => ({
  mockRateLimitIP:   vi.fn(),
  mockRateLimitAddr: vi.fn(),
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimitIP:   mockRateLimitIP,
  rateLimitAddr: mockRateLimitAddr,
}));

import { checkRateLimit } from "@/lib/with-rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimitIP.mockResolvedValue({ success: true });
  mockRateLimitAddr.mockResolvedValue({ success: true });
});

function makeReq(headers: Record<string, string>) {
  return new NextRequest("http://localhost/", { headers });
}

describe("checkRateLimit IP extraction", () => {
  it("prefers x-real-ip over x-forwarded-for", async () => {
    const req = makeReq({
      "x-real-ip": "1.2.3.4",
      "x-forwarded-for": "9.9.9.9, 10.0.0.1",
    });
    await checkRateLimit(req);
    expect(mockRateLimitIP).toHaveBeenCalledWith("1.2.3.4");
  });

  it("falls back to rightmost XFF value when x-real-ip is absent", async () => {
    const req = makeReq({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" });
    await checkRateLimit(req);
    // rightmost = "10.0.0.1" (client cannot forge this position on Vercel)
    expect(mockRateLimitIP).toHaveBeenCalledWith("10.0.0.1");
  });

  it("uses 'unknown' when no IP headers are present", async () => {
    const req = makeReq({});
    await checkRateLimit(req);
    expect(mockRateLimitIP).toHaveBeenCalledWith("unknown");
  });
});
