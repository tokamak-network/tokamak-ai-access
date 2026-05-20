/**
 * Rate-limit helpers — §1 D8
 *
 * Strategy: sliding window, 60 req/min per IP and per wallet address.
 * Uses @upstash/ratelimit backed by Upstash Redis (Vercel Marketplace 연결).
 *
 * Usage in a route handler:
 *   const ip = req.headers.get("x-forwarded-for") ?? "unknown";
 *   const { success } = await rateLimitIP(ip);
 *   if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 */
import { Ratelimit } from "@upstash/ratelimit";
import { kv } from "@vercel/kv";

const WINDOW_REQUESTS = 60;
const WINDOW_DURATION = "1 m";

// Lazy singletons — constructed on first call to avoid build-time KV access
let _ipRatelimit: Ratelimit | null = null;
let _addrRatelimit: Ratelimit | null = null;

function getIPRatelimit(): Ratelimit {
  if (!_ipRatelimit) {
    _ipRatelimit = new Ratelimit({
      redis: kv,
      limiter: Ratelimit.slidingWindow(WINDOW_REQUESTS, WINDOW_DURATION),
      prefix: "ratelimit:ip",
    });
  }
  return _ipRatelimit;
}

function getAddrRatelimit(): Ratelimit {
  if (!_addrRatelimit) {
    _addrRatelimit = new Ratelimit({
      redis: kv,
      limiter: Ratelimit.slidingWindow(WINDOW_REQUESTS, WINDOW_DURATION),
      prefix: "ratelimit:addr",
    });
  }
  return _addrRatelimit;
}

export async function rateLimitIP(ip: string) {
  return getIPRatelimit().limit(ip);
}

export async function rateLimitAddr(address: string) {
  return getAddrRatelimit().limit(address.toLowerCase());
}
