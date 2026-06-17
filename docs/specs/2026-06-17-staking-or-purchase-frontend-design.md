# Frontend Design: Staking-or-Purchase Access Policy

**Date:** 2026-06-17  
**Status:** Approved  
**Files affected:** `app/page.tsx`, `app/dashboard/page.tsx`

## Background

API access policy has changed from "staking only" to "staking OR purchasing". The backend (`lib/key-guards.ts` → `assertEligibility()`) already supports both paths. This spec covers the frontend copy and UI changes needed to reflect the new policy.

No backend changes are needed. No new files are created.

---

## Changed: app/page.tsx

### 1. Hero heading

```
Before: "Your stake\nearns you AI."
After:  "Your wallet.\nYour AI access."
```

### 2. Hero body copy

```
Before: "TON stakers with {MIN_TON} TON or more get a free 30-day API key for using AI — no sign-up, no credit card. Just your wallet."
After:  "Stake ≥{MIN_TON} TON for a free 30-day API key, or buy one for ~$5. No sign-up, no credit card required."
```

### 3. Hero aside metadata

```
Before:
  Access: Free for TON stakers
  Minimum stake: {MIN_TON} TON

After:
  Access: Stake or buy
  Minimum stake: {MIN_TON} TON
  Or buy: ~$5 / 30 days       ← new row added
```

### 4. "How it works" section — Stakers/Buyers tab toggle

Add a tab toggle (`Stakers` | `Buyers`) above the step list. Steps 01 and 02 are identical across tabs. Step 03 differs.

**Stakers tab:**
- Step 03 title: `Stake ≥100 TON`
- Step 03 body: `"Stake across any Layer2. Key issued instantly — free for 30 days, auto-renewable while you stay staked."`
- Aside `Access` row: `"Free while staked"`

**Buyers tab:**
- Step 03 title: `Buy a 30-day pass (~$5 in TON)`
- Step 03 body: `"TON ERC-20 is burned on purchase. Key activates after on-chain confirmation (~15s). No staking required."`
- Aside `Access` row: `"~$5 / 30 days"`

The tab is a client-side `useState` toggle. Default tab: `Stakers`.

### 5. FAQ — two changes

**Update existing item** ("How long is access free?"):

```
Before answer: "As long as you maintain your stake. Each issued key is valid for 30 days — rotate it in the dashboard to renew. Staking is only checked at key issuance."

After answer: "Stakers: free as long as you stay staked — each key is valid for 30 days and auto-renewable. Buyers: 30 days per purchase, renewable anytime from the dashboard."
```

**Add new item:**

```
Q: "What if I buy access instead of staking?"
A: "No staking required. Pay ~$5 in TON ERC-20 — it's burned on purchase. You get the same models, same rate limits, and a 30-day key. Renew from the dashboard anytime."
```

---

## Changed: app/dashboard/page.tsx

### 6. Aside eyebrow — conditional render

```
Before: <span>Staking status</span>  (always hardcoded)

After:
  balance.eligible
    ? "Staking status"
    : balance.activePurchase
      ? "Purchase status"
      : "Staking status"
```

The fallback remains `"Staking status"` for unauthenticated or non-eligible users where neither flag is set.

### 7. Buy panel description copy (line ~922)

```
Before: "Sends TON ERC-20 to treasury. Access activates after on-chain confirmation (~15s)."
After:  "TON ERC-20 is burned on purchase. Access activates after on-chain confirmation (~15s)."
```

Reason: purchased TON is sent to `0x000000000000000000000000000000000000dead` (burn address), not a treasury. "treasury" is factually incorrect.

---

## Out of scope

- No backend changes (`assertEligibility` already supports both paths)
- No new files
- No test changes (UI copy changes; logic paths already covered)
- No changes to `app/api/keys/purchase/route.ts` (internal variable name `treasury` is not user-facing)
