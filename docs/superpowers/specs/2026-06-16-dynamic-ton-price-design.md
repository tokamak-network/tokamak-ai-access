# Dynamic TON Price — Design Spec

**Goal:** Replace hardcoded 5 TON purchase price with a $5 USD target, dynamically converted to TON at current market rate via CoinGecko, shown to the user at purchase time and validated server-side.

**Architecture:** A shared `lib/ton-price.ts` helper fetches the TON/USD rate from CoinGecko. A new `/api/price/ton` route proxies this with a 60-second in-memory cache for client consumption. The purchase and renew routes replace their fixed `minValue` with a dynamically-fetched rate at verification time. The `usePurchase` hook fetches the current rate before each transaction to determine the exact transfer amount.

**Tech Stack:** CoinGecko Simple Price API (free, no key), Next.js Route Handlers, vitest

---

## Files

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `lib/ton-price.ts` | CoinGecko fetch + `usdToTonWei()` conversion helper |
| Create | `app/api/price/ton/route.ts` | GET proxy with 60s module-level cache |
| Modify | `app/api/keys/purchase/route.ts` | Replace fixed `minValue` with dynamic rate |
| Modify | `app/api/keys/purchase/renew/route.ts` | Same |
| Modify | `lib/hooks/usePurchase.ts` | Fetch rate before each tx, use dynamic amount |
| Modify | `app/dashboard/page.tsx` | Display "N.NNNN TON ($5)" instead of "5 TON" |
| Modify | `.env.example` | Replace `PURCHASE_PRICE_TON` with `PURCHASE_USD_PRICE` |

---

## Component Design

### `lib/ton-price.ts`

```typescript
const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=tokamak-network&vs_currencies=usd";

export async function fetchTonUsdRate(): Promise<number>
// Fetches current TON/USD rate. Throws if CoinGecko is unavailable.

export function usdToTonWei(usdAmount: number, rate: number): bigint
// Converts a USD amount to TON wei (BigInt).
// Rounds UP to avoid under-payment: ceil(usdAmount / rate * 1e18).
```

### `app/api/price/ton/route.ts`

- **GET** — returns `{ usdPerTon: number, tonRequired: number, updatedAt: number }`
- `tonRequired` = `Number(usdToTonWei(usdPrice, usdPerTon)) / 1e18` — derived from `usdToTonWei` helper, displayed to 4 decimal places
- Module-level cache: `{ data, timestamp }`, TTL 60 seconds
- CoinGecko failure → 503 `{ error: "Price oracle unavailable" }`
- No auth required (public rate info)

### `app/api/keys/purchase/route.ts` & `renew/route.ts`

Replace:
```typescript
const minValue = priceTon * 10n ** 18n;
```
With:
```typescript
const rate = await fetchTonUsdRate().catch(() => null);
if (!rate) return NextResponse.json({ error: "Price oracle unavailable" }, { status: 503 });
const usdPrice = Number(process.env.PURCHASE_USD_PRICE ?? "5");
const minValue = usdToTonWei(usdPrice * 0.8, rate); // 20% slippage tolerance
```

Remove reads of `PURCHASE_PRICE_TON` env var from both routes.

### `lib/hooks/usePurchase.ts`

- Remove `PRICE_TON` constant derived from `NEXT_PUBLIC_PURCHASE_PRICE_TON`
- `purchase()` and `renew()` each call `GET /api/price/ton` before `writeContractAsync`
- Transfer amount = `BigInt(Math.ceil(tonRequired * 1e18))`
- If rate fetch fails → set `error` + `status: "error"`, do not proceed to wallet signing

### `app/dashboard/page.tsx`

- Add `priceData: { tonRequired: number; usdPerTon: number } | null` state
- Fetch `/api/price/ton` when "Buy Access" card is expanded (`selectedCard === "buy"`)
- Display: `"{tonRequired} TON"` with subtext `"≈ $5 · Rate updates every 60s"`
- Button label: `"Pay {tonRequired} TON →"`
- While loading: `"Loading price..."` + button disabled
- On fetch error: `"Price unavailable — try again"` + button disabled

---

## Error Cases

| Situation | Client behavior | Server response |
|-----------|----------------|-----------------|
| CoinGecko down at price fetch | "Price unavailable" · button disabled | — |
| CoinGecko down at verification | tx sent but server returns 503 | 503 `Price oracle unavailable` |
| Rate moved >20% between fetch and verify | server rejects | 403 `Valid Transfer event not found` |
| User manipulates transfer amount | — | server minValue check → 403 |

The 403 on rate change returns `{ error: "Insufficient payment amount" }`. The hook displays this message as-is; no special client-side matching needed.

---

## Environment Variables

**Remove:**
```bash
PURCHASE_PRICE_TON=5
NEXT_PUBLIC_PURCHASE_PRICE_TON=5
```

**Add:**
```bash
PURCHASE_USD_PRICE=5   # USD target price; server-side only
```

`NEXT_PUBLIC_` version is not needed — client reads the rate from `/api/price/ton`.

---

## Slippage Rationale

20% tolerance accounts for the time window between:
1. Client fetches `/api/price/ton` (60s cached)
2. User signs and broadcasts the tx (~15s)
3. Tx confirms on-chain (~15s)
4. Server calls CoinGecko to verify (~1s)

Total worst-case: ~90 seconds of rate exposure. TON moving >20% in 90 seconds would be extraordinary; a retry prompt is appropriate in that scenario.

---

## Testing

- `lib/ton-price.ts` — unit tests: mock fetch, verify `usdToTonWei` rounding
- `app/api/price/ton/route.ts` — unit tests: cache behavior (miss → hit → expiry), 503 on CoinGecko failure
- `app/api/keys/purchase/route.ts` — update existing tests: mock `fetchTonUsdRate`, verify minValue uses dynamic rate; test 503 when oracle fails
- `app/api/keys/purchase/renew/route.ts` — same
- `usePurchase` — update existing tests if any; mock `/api/price/ton` response
