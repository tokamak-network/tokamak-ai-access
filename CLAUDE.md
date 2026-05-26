# TON AI Access — Project Context

Next.js 15 App Router + TypeScript. Stake ≥10 TON on Ethereum L1 → LiteLLM virtual API key.

## Commands

```bash
npm run dev          # dev server → localhost:3000
npm run build        # type-check + build
npm run lint         # ESLint
npm test             # vitest (11 unit tests)
npm run test:integration  # requires LITELLM_BASE_URL in .env.local; auto-skipped if missing
```

## Architecture

- `app/` — Next.js App Router (page.tsx = landing, dashboard/page.tsx = dashboard)
- `app/api/` — Route Handlers: auth (SIWE), staking/balance, keys (issue/rotate/me)
- `lib/` — siwe.ts (session), staking.ts (viem multicall), litellm.ts, kv.ts
- `abi/` — SeigManager, DepositManager, Layer2Registry JSON ABIs
- `cli/` — `@tokamak-network/ai-access-cli` npm package (see `cli/CLAUDE.md`)
- `scripts/configure-cli.sh` — **deprecated**; use `npx @tokamak-network/ai-access-cli` instead

## Gotchas

- `LITELLM_MASTER_KEY` must NEVER use `NEXT_PUBLIC_` prefix — server-only
- SIWE session uses `iron-session` + httpOnly cookie stored in Vercel KV
  → Without live KV connection, `/api/auth/verify` succeeds but dashboard returns 401
- Staking balance reads via `viem multicall` — requires valid `RPC_URL`
- `keys/issue` returns the raw key exactly once; it is hashed before storage in KV
- `.git/CLAUDE.md` is auto-managed by claude-mem — do not edit manually

## Key Files

- `lib/staking.ts` — `getTotalStakedTON(address)` via multicall
- `lib/litellm.ts` — `generateKey()` / `deleteKey(keyId)`
- `lib/kv.ts` — `hashKey()` + KV wrapper
- `.env.example` — all required env vars with descriptions
