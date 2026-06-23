# TON AI Access — Project Context

Next.js 15 App Router + TypeScript. Stake ≥10 TON on Ethereum L1 → LiteLLM virtual API key.

## Commands

```bash
npm run dev          # dev server → localhost:3000
npm run build        # type-check + build
npm run lint         # ESLint
npm test             # vitest (176 unit tests across 19 files)
npm run test:integration  # requires LITELLM_BASE_URL in .env.local; auto-skipped if missing
```

## Architecture

- `app/` — Next.js App Router (page.tsx = landing, dashboard/page.tsx = dashboard)
- `app/api/` — Route Handlers: auth (SIWE), staking/balance, keys (issue/rotate/me/purchase/renew), cron/check-stakes (stake expiry), proxy/models (model list passthrough)
- `lib/` — siwe.ts (session), staking.ts (viem multicall), litellm.ts, kv.ts, issue-key.ts, key-guards.ts, ratelimit.ts + with-rate-limit.ts (sliding-window IP+wallet), wagmi.ts, hooks/ (React: useSiwe, useStake, useUnstake, usePurchase)
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

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
