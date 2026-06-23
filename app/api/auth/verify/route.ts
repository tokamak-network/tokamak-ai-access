import { NextRequest, NextResponse } from "next/server";
import { SiweMessage } from "siwe";
import { kvGet, kvSet, kvDel } from "@/lib/kv";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { randomUUID } from "crypto";
import { z } from "zod";

const SESSION_TTL_SEC = 24 * 60 * 60; // 24 hours
const SESSION_COOKIE = "session_id";

const BodySchema = z.object({
  message: z.string(),
  signature: z.string(),
});

/**
 * POST /api/auth/verify
 * Body: { message: string, signature: string }
 * Sets httpOnly session cookie on success.
 *
 * §4 flow:
 *  1. Parse SIWE message
 *  2. Verify signature via siwe lib
 *  3. Cross-check nonce against KV store (replay protection)
 *  4. Delete used nonce
 *  5. Write session to KV
 *  6. Set Set-Cookie header
 */
export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { message, signature } = parsed.data;
  let siweMsg: SiweMessage;
  try {
    siweMsg = new SiweMessage(message);
  } catch {
    return NextResponse.json({ error: "Invalid SIWE message" }, { status: 400 });
  }

  // Resolve domain from trusted config; Host header as fallback only
  const domain = process.env.APP_DOMAIN || req.headers.get("host") || "";

  // Fetch stored nonce before crypto verify (so we can pass server-issued nonce)
  const address = siweMsg.address.toLowerCase();
  const stored = await kvGet<{ nonce: string; expiresAt: number }>(`nonce:${address}`);
  if (!stored || Date.now() > stored.expiresAt) {
    return NextResponse.json({ error: "Expired or invalid nonce" }, { status: 401 });
  }

  // Verify signature with server-trusted domain and server-issued nonce
  let result: Awaited<ReturnType<typeof siweMsg.verify>> | null = null;
  try {
    result = await siweMsg.verify({
      signature,
      domain,
      nonce: stored.nonce,
      time: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[verify] siwe.verify threw:", err);
  }

  if (!result?.success) {
    console.error("[verify] failed", {
      serverDomain: domain,
      msgDomain: siweMsg.domain,
      msgNonce: siweMsg.nonce,
      storedNonce: stored.nonce,
      msgAddress: siweMsg.address,
      errorType: result?.error?.type,
      errorExpected: (result?.error as { expected?: string })?.expected,
      errorReceived: (result?.error as { received?: string })?.received,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  await kvDel(`nonce:${address}`);

  // Create session
  const sessionId = randomUUID();
  const expiresAt = Date.now() + SESSION_TTL_SEC * 1000;
  await kvSet(
    `session:${sessionId}`,
    { address, issuedAt: Date.now(), expiresAt },
    SESSION_TTL_SEC,
  );

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_SEC,
    path: "/",
  });
  return res;
}
