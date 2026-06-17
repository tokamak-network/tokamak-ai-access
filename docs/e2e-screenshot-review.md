# E2E Screenshot Review

**Run date:** 2026-06-16  
**Test suite:** 36 tests across 4 suites (all passing)  
**Browser:** Chromium (Desktop Chrome)  
**Screenshots:** `test-results/` — one PNG per test at end-of-test state

---

## Summary

| Suite | Tests | Status |
|-------|-------|--------|
| Landing page | 8 | ✅ All pass |
| Dashboard — Eligible staker | 12 | ✅ All pass |
| Dashboard — Ineligible staker | 11 | ✅ All pass |
| Dashboard — Purchase user | 5 | ✅ All pass |

---

## Issues Found

### Issue 1 — Duplicate wallet connectors in modal (Minor / UX)

**Affected test:** `opens wallet modal on Connect Wallet click`  
**Screenshot:** `landing-Landing-page-opens-wallet-modal-on-Connect-Wallet-click-chromium/test-finished-1.png`

Both **MetaMask** and **Injected** connectors appear in the wallet modal. Root cause: the test mock injects both an EIP-6963 provider and sets `window.ethereum` (legacy), causing wagmi to register two connectors for the same wallet.

In production with a real MetaMask extension, only one connector would typically show. But users with both an EIP-6963-aware wallet and a legacy `window.ethereum` provider may see duplicates.

**Recommendation:** Consider deduplicating connectors that resolve to the same provider address, or hiding the generic "Injected" option when a named provider (MetaMask) is already detected.

---

### Issue 2 — Conflicting eligibility labels on purchase dashboard (Minor / UX)

**Affected tests:** All 5 `dashboard-purchase-*` tests  
**Screenshot:** All purchase screenshots

The left column (STAKING STATUS) shows a red **NOT ELIGIBLE** badge, while the right column (ACCESS VIA PURCHASE) shows a green **ELIGIBLE** badge. A user who bought access will see:

```
STAKING STATUS          ACCESS VIA PURCHASE
...                     ELIGIBLE
STATUS
NOT ELIGIBLE ← red      Access expires in 6 day(s) / Renew 30 days →
```

Both labels are technically accurate, but the red NOT ELIGIBLE badge is visually alarming for a user who has paid and has active access. The page works correctly — the user can renew and use their key — but the red badge may cause confusion or support requests.

**Recommendation:** Consider suppressing or softening the NOT ELIGIBLE staking badge when `activePurchase === true`, or adding copy like "You have active purchased access" near the staking status.

---

### Issue 3 — Stake button disabled while on-chain balance loads (Low / Expected)

**Affected tests:** `stake tab shows TON balance and amount input`, `preset button fills amount input`  
**Screenshots:** Ineligible suite stake-panel screenshots

The "Stake 100 TON →" button appears greyed/disabled even after the preset "100" button fills the amount input. The button is waiting for the on-chain wallet TON balance to resolve (shown as `...`). There is no mock for on-chain ERC-20 balance in the test fixtures — the balance never resolves, so the button stays disabled.

This is test-environment-only behavior (no balance mock). In production the balance resolves and the button enables. However, if a user has a slow RPC or no balance, the stuck loading state gives no feedback.

**Recommendation:** Add a timeout or error state to the balance loader so the stake button shows "Balance unavailable — try again" rather than staying indefinitely disabled.

---

### Issue 4 — On-chain balances always show `...` in tests (Informational)

**Affected tests:** All ineligible stake panel tests  
**Affected fields:** "WALLET TON BALANCE" (stake tab) and "STAKED TON (THIS OPERATOR)" (unstake tab)

Both fields display `...` because the test fixtures mock API routes only (Next.js route handlers), not viem/wagmi on-chain calls. The `readContract` / `multicall` calls go to the actual RPC, which the test environment does not stub.

This is expected test behavior. In production both fields resolve. No action required, but if deeper on-chain interaction testing is needed, wagmi's test utilities (`MockConnector` with mock chain) could be used to stub contract reads.

---

### Issue 5 — Active key section not visible in purchase dashboard screenshots (Low / Scroll)

**Affected test:** `active key section visible` (dashboard-purchase suite)  
**Screenshot:** `dashboard-purchase-Dashboa-bba75--active-key-section-visible-chromium/test-finished-1.png`

The end-of-test screenshot shows the expiry banner and CONFIGURE AI TOOLS section, but the "Active key" card (with last-four digits and expiry date) is not visible. The test passes (Playwright assertions succeed), so the element exists in the DOM and is visible to Playwright — it is simply above the viewport in the final screenshot, which captures the page at scroll position 0 after the assertion.

No functional issue. If you want the screenshot to capture the active key section, add a `page.locator(...)scrollIntoView()` call before the test ends.

---

## Confirmed Working — Per Suite

### Landing page

| State | Observation |
|-------|-------------|
| Hero | "Your stake earns you AI." heading, model cards (qwen-3.6, deepseek-v4-flash, gemma-4), How it Works steps, footer all render |
| Disconnected | "Connect Wallet →" CTA visible; no Sign In button |
| Wallet modal | Opens on click; MetaMask + Injected connectors listed |
| Modal dismiss | Click at (50, 400) on overlay closes modal correctly |
| After connect | Address `0xf39F…2266` in topbar; "Sign in" button appears; Connect button gone |
| SIWE sign-in | Redirects to `/dashboard` |
| Disconnect | Returns to disconnected state; Connect Wallet button reappears |
| 100 TON copy | "100 TON" minimum requirement visible on landing |

### Dashboard — Eligible staker (150 TON staked)

| State | Observation |
|-------|-------------|
| No-key state | "No key issued yet. Issue one to access qwen-3.6…" + "Issue API key →" button |
| One-time reveal | "Save this key — it won't be shown again" heading, yellow warning banner, key value, endpoint (`api2.ai.tokamak.network`), CLI configure command |
| Copy feedback | "Copy API key →" button changes to "Copied ✓ — scroll to setup ↓" on click |
| Active key | "Active key" + ACTIVE badge, truncated key (`...7890`), "Issued 5/17/2026 · Expires 7/17/2026", Extend/New key buttons |
| Sign out | Returns to landing with wallet still connected (shows "Sign in", not "Connect Wallet") |
| Refresh | Resets to no-key state as expected |

### Dashboard — Ineligible staker (0 TON staked)

| State | Observation |
|-------|-------------|
| Status badge | "0 TON STAKED · NOT ELIGIBLE" (red) |
| CTA copy | "Get API access by staking ≥100 TON or buying a 30-day pass." |
| Option cards | STAKE TON (Free, while staked ≥100 TON) and BUY ACCESS (≈$5 in TON, 30 days) |
| StakePanel | STAKE/UNSTAKE tabs, amount input with "min 100" placeholder, 100/200/500/MAX presets, operator select |
| Preset fill | Clicking "100" preset fills input with "100" |
| Unstake tab | "STAKED TON (THIS OPERATOR)", operator select, amount input, "Request Withdrawal" button |
| Card toggle | Clicking Buy Access collapses StakePanel |
| Buy panel | "BUY 30-DAY ACCESS", "Sends 42 TON ERC-20 to treasury…", "= $5 · Rate updates every 60s", "Pay 42 TON →" |
| Loading state | "Loading price..." button disabled while price API is delayed |

### Dashboard — Purchase user (0 TON staked, active purchase expiring in 6 days)

| State | Observation |
|-------|-------------|
| ELIGIBLE badge | Green "ELIGIBLE" badge next to "ACCESS VIA PURCHASE" label |
| Expiry banner | Yellow banner: "Access expires in 6 day(s)" with "Renew 30 days →" CTA |
| Processing state | Button changes to greyed "Processing..." during renew API call |
| CLI tools section | CONFIGURE AI TOOLS with `npx @tokamak-network/ai-access-cli configure` and revert commands |

---

## Test Fixes Applied This Session

These issues were diagnosed and fixed during the E2E setup, recorded here for reference:

| Fix | Root Cause | Resolution |
|-----|-----------|------------|
| 9 landing tests failed with auto-connected wallet | wagmi v2 auto-connects when `eth_accounts` returns an address | Added `autoConnect: false` to `landingPage` fixture |
| `closes modal when overlay is clicked` failed | `.section { position: relative; z-index: 1 }` creates stacking context; click at `(5,5)` hit 56px sticky topbar | Changed click coordinate to `(50, 400)` |
| BigInt NaN crash on price loading | `tonRequired / usdPerTon` with missing `usdPerTon` field | Added `usdPerTon: 0.12` to all `/api/price/ton` mock responses |
| Screenshots not captured | `--screenshot=always` CLI flag not supported in this Playwright version | Added `screenshot: 'on'` to `playwright.config.ts` `use` block |
