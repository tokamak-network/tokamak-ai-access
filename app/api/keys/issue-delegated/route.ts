import { NextRequest, NextResponse } from "next/server";
import { SiweMessage, generateNonce } from "siwe";
import { getTotalStakedTON } from "@/lib/staking";
import { generateLiteLLMKey } from "@/lib/litellm";
import { kvGet, kvSet, kvDel, hashKey } from "@/lib/kv";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { z } from "zod";

/**
 * Delegated key issuance for first-party ecosystem apps (e.g. the Toki hub).
 *
 * A partner app that already authenticates the user with their wallet can mint a
 * key without redirecting to this site. Instead of a session cookie, the caller
 * submits a SIWE message + signature the user signed in the partner app. This
 * route verifies that proof, binds it to an allowlisted domain, re-checks the
 * stake, and mints a LiteLLM key — the master key and the per-address key ledger
 * never leave this service. CORS is locked to an explicit origin allowlist.
 *
 *   GET  /api/keys/issue-delegated?address=0x..   → { nonce, statement }  (single-use, 5 min)
 *   POST /api/keys/issue-delegated  { message, signature }  → { key, expiresAt }  (one-time key)
 *
 * Security model:
 *  - The SIWE signature is the real authentication: a key can only ever be minted
 *    for an address the caller can sign for. The CORS allowlist is defense in
 *    depth (it stops other sites' browsers from driving this endpoint) but is not
 *    relied on as an auth boundary, since a non-browser client can spoof Origin.
 *  - The signed message's `domain` is checked against the allowlisted host, so a
 *    signature phished on another domain cannot be replayed here.
 *  - The nonce is server-issued and single-use (deleted on consumption), so a
 *    captured {message, signature} pair cannot be replayed.
 */

const MIN_TON_WEI = BigInt(process.env.MIN_TON ?? "10") * 10n ** 18n;
const SESSION_STATEMENT = "Sign in to Tokamak LLM Access with your Ethereum account.";

// Exact-match origin allowlist (comma-separated), e.g.
// DELEGATED_ALLOWED_ORIGINS="https://toki.tokamak.network,http://localhost:3000"
const ALLOWED_ORIGINS = (process.env.DELEGATED_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// SIWE `domain` is the RFC 4501 authority (host[:port]) — derive it from the
// allowed origins so the signed message must target one of these hosts.
const ALLOWED_HOSTS = ALLOWED_ORIGINS.map((o) => {
  try {
    return new URL(o).host;
  } catch {
    return "";
  }
}).filter(Boolean);

const NonceQuery = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

const IssueBody = z.object({
  message: z.string(),
  signature: z.string(),
});

interface KeyRecord {
  liteLlmKeyId: string;
  hash: string;
  keySlice: string;
  createdAt: number;
  expiresAt: string;
  revokedAt?: number;
}

function withCors(res: NextResponse, origin: string | null): NextResponse {
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  res.headers.append("Vary", "Origin");
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
  }
  return res;
}

function json(body: unknown, status: number, origin: string | null): NextResponse {
  return withCors(NextResponse.json(body, { status }), origin);
}

function originAllowed(origin: string | null): origin is string {
  return !!origin && ALLOWED_ORIGINS.includes(origin);
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return withCors(new NextResponse(null, { status: 204 }), origin);
}

/** Issue a single-use nonce for the address (replay protection for POST). */
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!originAllowed(origin)) return json({ error: "Origin not allowed" }, 403, origin);

  const rl = await checkRateLimit(req);
  if (rl) return withCors(rl, origin);

  const parsed = NonceQuery.safeParse({
    address: req.nextUrl.searchParams.get("address"),
  });
  if (!parsed.success) return json({ error: "Invalid address" }, 400, origin);

  const address = parsed.data.address.toLowerCase();
  const nonce = generateNonce();
  await kvSet(`nonce:${address}`, { nonce, expiresAt: Date.now() + 5 * 60 * 1000 }, 300);

  return json({ nonce, statement: SESSION_STATEMENT }, 200, origin);
}

/** Verify the SIWE proof, re-check the stake, and mint a key. */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!originAllowed(origin)) return json({ error: "Origin not allowed" }, 403, origin);

  const ipRl = await checkRateLimit(req);
  if (ipRl) return withCors(ipRl, origin);

  const body = await req.json().catch(() => ({}));
  const parsed = IssueBody.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid body" }, 400, origin);

  let siweMsg: SiweMessage;
  try {
    siweMsg = new SiweMessage(parsed.data.message);
  } catch {
    return json({ error: "Invalid SIWE message" }, 400, origin);
  }

  // Bind the signature to an allowlisted domain (anti-phishing).
  if (!ALLOWED_HOSTS.includes(siweMsg.domain)) {
    return json({ error: "Invalid domain" }, 401, origin);
  }

  const result = await siweMsg.verify({ signature: parsed.data.signature }).catch(() => null);
  if (!result?.success) return json({ error: "Invalid signature" }, 401, origin);

  const address = siweMsg.address.toLowerCase();

  const addrRl = await checkRateLimit(req, address);
  if (addrRl) return withCors(addrRl, origin);

  // Single-use nonce (replay protection) — same store as /api/auth/verify.
  const stored = await kvGet<{ nonce: string; expiresAt: number }>(`nonce:${address}`);
  if (!stored || stored.nonce !== siweMsg.nonce || Date.now() > stored.expiresAt) {
    return json({ error: "Expired or invalid nonce" }, 401, origin);
  }
  await kvDel(`nonce:${address}`);

  // Re-validate staking balance (realtime).
  const totalWei = await getTotalStakedTON(address);
  if (totalWei < MIN_TON_WEI) return json({ error: "Insufficient stake" }, 403, origin);

  // One active key per address (shared ledger with /api/keys/issue).
  const existing = await kvGet<KeyRecord>(`key:${address}`);
  const isExpired = !!existing?.expiresAt && existing.expiresAt < new Date().toISOString();
  if (existing && !existing.revokedAt && !isExpired) {
    return json({ error: "Key already issued" }, 409, origin);
  }

  const { key, keyId, expiresAt } = await generateLiteLLMKey(address);
  await kvSet(`key:${address}`, {
    liteLlmKeyId: keyId,
    hash: hashKey(key),
    keySlice: key.slice(-4),
    createdAt: Date.now(),
    expiresAt,
  } satisfies KeyRecord);

  return json({ key, expiresAt }, 200, origin);
}
