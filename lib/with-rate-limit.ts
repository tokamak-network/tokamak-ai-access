/**
 * Rate-limit guard helpers
 *
 * Usage in a route handler:
 *   const rl = await checkRateLimit(req, address);
 *   if (rl) return rl;   // 429 response
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimitIP, rateLimitAddr } from "./ratelimit";

/**
 * Checks both IP-level and address-level rate limits.
 * Returns a 429 NextResponse if either limit is exceeded, otherwise null.
 *
 * @param req     Incoming request (for IP extraction)
 * @param address Optional wallet address for per-address limiting
 */
export async function checkRateLimit(
  req: NextRequest,
  address?: string | null,
): Promise<NextResponse | null> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  const { success: ipOk } = await rateLimitIP(ip);
  if (!ipOk) {
    return NextResponse.json(
      { error: "Too many requests", retryAfter: 60 },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  if (address) {
    const { success: addrOk } = await rateLimitAddr(address);
    if (!addrOk) {
      return NextResponse.json(
        { error: "Too many requests for this address", retryAfter: 60 },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }
  }

  return null;
}
