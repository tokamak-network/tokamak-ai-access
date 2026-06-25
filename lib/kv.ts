/**
 * Upstash Redis wrapper (via @vercel/kv)
 *
 * Vercel KV was discontinued in Dec 2024. New projects connect via Vercel Marketplace → Upstash Redis.
 * The @vercel/kv package uses the Upstash REST API internally — no code changes required.
 * Env vars: KV_REST_API_URL, KV_REST_API_TOKEN (injected automatically via Marketplace or vercel env pull)
 *
 * Key schema (§8) — every key is chain-scoped via a `{chain}:` prefix added below,
 * so mainnet and testnet data never collide when they share one KV instance:
 *   {chain}:nonce:{address}        TTL 5 min
 *   {chain}:session:{sessionId}    TTL 24 h
 *   {chain}:key:{address}          no TTL (key metadata)
 *   {chain}:key:{address}:prev     no TTL (archived previous key on rotate)
 *   {chain}:purchase:{address}     no TTL (paid access record)
 *   {chain}:txhash:{hash}          no TTL (payment dedup)
 *   {chain}:stats:active-keys      no TTL (counter)
 *   ratelimit:ip:{ip}              TTL 60 s  (chain-agnostic; managed by lib/ratelimit.ts, NOT prefixed)
 *   ratelimit:addr:{addr}          TTL 60 s  (chain-agnostic; managed by lib/ratelimit.ts, NOT prefixed)
 */
import { kv } from "@vercel/kv";
import { createHash } from "crypto";

/**
 * Chain-scoped key prefix. `mainnet:` or `sepolia:`, matching lib/staking.ts's CHAIN rule.
 * Read at call time (not module load) so unit tests can set NEXT_PUBLIC_CHAIN per case.
 */
function chainPrefix(): string {
  return (process.env.NEXT_PUBLIC_CHAIN === "sepolia" ? "sepolia" : "mainnet") + ":";
}

export async function kvGet<T>(key: string): Promise<T | null> {
  return kv.get<T>(chainPrefix() + key);
}

/** @param ttlSeconds  optional; omit for no expiry */
export async function kvSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const k = chainPrefix() + key;
  if (ttlSeconds !== undefined) {
    await kv.set(k, value, { ex: ttlSeconds });
  } else {
    await kv.set(k, value);
  }
}

export async function kvDel(key: string): Promise<void> {
  await kv.del(chainPrefix() + key);
}

/** SHA-256 hash of a plaintext key (stored server-side instead of plaintext). */
export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Glob over chain-scoped keys. The `{chain}:` prefix is added to the pattern and
 * stripped from the results, so callers see (and parse) bare keys like `key:{address}`.
 */
export async function kvKeys(pattern: string): Promise<string[]> {
  const p = chainPrefix();
  const keys = await kv.keys(p + pattern);
  return keys.map((k) => (k.startsWith(p) ? k.slice(p.length) : k));
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
  const result = await kv.set(chainPrefix() + key, value, opts as Parameters<typeof kv.set>[2]);
  return result !== null;
}

/** Atomically increment a counter. Returns new value. */
export async function kvIncr(key: string): Promise<number> {
  return kv.incr(chainPrefix() + key);
}

/** Atomically decrement a counter. Returns new value. */
export async function kvDecr(key: string): Promise<number> {
  return kv.decr(chainPrefix() + key);
}
