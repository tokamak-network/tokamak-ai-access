/**
 * One-time migration: re-key existing prefix-less KV data to the `{chain}:` schema
 * introduced in lib/kv.ts (chain-scoped keys so mainnet/sepolia share one KV instance).
 *
 * Without this, data written before the prefix change (key/purchase/txhash/stats)
 * becomes unreadable → existing users locked out. Run ONCE against the production KV
 * of the chain that owns the existing data.
 *
 * Scope: only PERSISTENT keys are migrated. Ephemeral TTL keys (nonce 5min,
 * session 24h) are skipped — losing them just forces a cheap re-authentication,
 * and copying them would drop their TTL (making sessions immortal). Already-prefixed
 * keys and chain-agnostic ratelimit:* keys are left untouched (idempotent).
 *
 * Usage:
 *   # dry run (default) — prints what WOULD migrate, writes nothing
 *   NEXT_PUBLIC_CHAIN=mainnet KV_REST_API_URL=... KV_REST_API_TOKEN=... node scripts/migrate-kv-chain-prefix.mjs
 *   # apply
 *   ... APPLY=1 node scripts/migrate-kv-chain-prefix.mjs
 */

// Persistent, chain-owned key families that must carry the {chain}: prefix.
const PERSISTENT = ["key:", "purchase:", "txhash:", "stats:"];
const CHAINS = ["mainnet:", "sepolia:"];

/**
 * Decide the target key for a bare KV key, or null to skip.
 * @returns {string|null} prefixed target key, or null if the key should be left alone
 */
export function targetKey(key, chainPrefix) {
  if (CHAINS.some((c) => key.startsWith(c))) return null; // already migrated
  if (key.startsWith("ratelimit:")) return null;          // chain-agnostic by design
  if (!PERSISTENT.some((p) => key.startsWith(p))) return null; // ephemeral (nonce/session) or unknown → skip
  return chainPrefix + key;
}

// ── self-check (node --test or inline) ──────────────────────────────────────
function demo() {
  const assert = (c, m) => { if (!c) throw new Error("self-check failed: " + m); };
  assert(targetKey("key:0xabc", "mainnet:") === "mainnet:key:0xabc", "key migrates");
  assert(targetKey("purchase:0xabc", "sepolia:") === "sepolia:purchase:0xabc", "purchase migrates");
  assert(targetKey("stats:active-keys", "mainnet:") === "mainnet:stats:active-keys", "stats migrates");
  assert(targetKey("nonce:0xabc", "mainnet:") === null, "nonce skipped (ephemeral)");
  assert(targetKey("session:abc", "mainnet:") === null, "session skipped (ephemeral)");
  assert(targetKey("ratelimit:ip:1.2.3.4", "mainnet:") === null, "ratelimit skipped");
  assert(targetKey("mainnet:key:0xabc", "mainnet:") === null, "already-prefixed skipped (idempotent)");
  console.log("self-check passed");
}

async function main() {
  if (process.argv.includes("--self-check")) return demo();

  const chain = process.env.NEXT_PUBLIC_CHAIN === "sepolia" ? "sepolia:" : "mainnet:";
  const apply = process.env.APPLY === "1";
  const { kv } = await import("@vercel/kv");

  const all = await kv.keys("*");
  const targets = all
    .map((k) => ({ from: k, to: targetKey(k, chain) }))
    .filter((t) => t.to !== null);

  console.log(`[migrate] chain=${chain} apply=${apply} — ${targets.length}/${all.length} keys to migrate`);
  let migrated = 0;
  for (const { from, to } of targets) {
    if (await kv.exists(to)) { console.log(`  skip (target exists): ${from}`); continue; }
    if (apply) {
      const val = await kv.get(from);
      if (val === null) continue;
      await kv.set(to, val);
    }
    migrated++;
    console.log(`  ${apply ? "migrated" : "would migrate"}: ${from} -> ${to}`);
  }
  console.log(`[migrate] done — ${migrated} ${apply ? "migrated" : "pending"}. ${apply ? "" : "Set APPLY=1 to write."}`);
}

main();
