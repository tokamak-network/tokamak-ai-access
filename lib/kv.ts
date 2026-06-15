/**
 * Upstash Redis wrapper (via @vercel/kv)
 *
 * Vercel KV was discontinued in Dec 2024. New projects connect via Vercel Marketplace → Upstash Redis.
 * The @vercel/kv package uses the Upstash REST API internally — no code changes required.
 * Env vars: KV_REST_API_URL, KV_REST_API_TOKEN (injected automatically via Marketplace or vercel env pull)
 *
 * Key schema (§8):
 *   nonce:{address}          TTL 5 min
 *   session:{sessionId}      TTL 24 h
 *   key:{address}            no TTL (key metadata)
 *   key:{address}:prev       no TTL (archived previous key on rotate)
 *   ratelimit:ip:{ip}        TTL 60 s  (managed by Upstash internally)
 *   ratelimit:addr:{addr}    TTL 60 s  (managed by Upstash internally)
 */
import { kv } from "@vercel/kv";
import { createHash } from "crypto";

export async function kvGet<T>(key: string): Promise<T | null> {
  return kv.get<T>(key);
}

/** @param ttlSeconds  optional; omit for no expiry */
export async function kvSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  if (ttlSeconds !== undefined) {
    await kv.set(key, value, { ex: ttlSeconds });
  } else {
    await kv.set(key, value);
  }
}

export async function kvDel(key: string): Promise<void> {
  await kv.del(key);
}

/** SHA-256 hash of a plaintext key (stored server-side instead of plaintext). */
export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function kvKeys(pattern: string): Promise<string[]> {
  return kv.keys(pattern);
}

/**
 * SET NX — returns true if the key was set, false if it already existed.
 * @param ttlSeconds optional; omit for no expiry
 * Used for TOCTOU issue lock: SET key:{address}:lock 1 NX EX 10
 * Used for dedup: SET txhash:{hash} {...} NX (no TTL = permanent)
 */
export async function kvSetNx(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
  const opts: Record<string, unknown> = { nx: true };
  if (ttlSeconds !== undefined) {
    opts.ex = ttlSeconds;
  }
  const result = await kv.set(key, value, opts as Parameters<typeof kv.set>[2]);
  return result !== null;
}

/** Atomically increment a counter. Returns new value. */
export async function kvIncr(key: string): Promise<number> {
  return kv.incr(key);
}

/** Atomically decrement a counter. Returns new value. */
export async function kvDecr(key: string): Promise<number> {
  return kv.decr(key);
}
