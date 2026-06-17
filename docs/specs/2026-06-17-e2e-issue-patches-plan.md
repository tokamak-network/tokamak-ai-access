# E2E 이슈 패치 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** E2E 스크린샷 리뷰에서 발견된 5개 이슈(커넥터 중복, 뱃지 충돌, Stake 버튼 고착, 온체인 잔액 고착, 스크린샷 누락)를 패치한다.

**Architecture:** 이슈 1·5는 테스트 코드만 수정, 이슈 2·3·4B는 프로덕션 UX 개선(`app/dashboard/page.tsx`), 이슈 4A는 테스트 RPC mock 추가. 각 태스크는 독립적이며 순서대로 커밋.

**Tech Stack:** Next.js 15 App Router, TypeScript, React 19, Playwright E2E, wagmi v2, viem, CSS modules-less globals

**관련 설계 문서:** `docs/specs/2026-06-17-e2e-issue-patches-design.md`

---

## 파일 변경 목록

| 파일 | 태스크 |
|------|--------|
| `tests/e2e/wallet-mock.ts` | Task 1 |
| `app/globals.css` | Task 2 |
| `app/dashboard/page.tsx` | Task 2, Task 3, Task 4B, Task 5 |
| `tests/e2e/fixtures.ts` | Task 4A |
| `tests/e2e/dashboard-purchase.spec.ts` | Task 5 |

---

## Task 1: wallet-mock.ts — window.ethereum 레거시 할당 제거

**파일:**
- Modify: `tests/e2e/wallet-mock.ts:112`

### 배경

wagmi v2가 EIP-6963 `eip6963:announceProvider` 이벤트로 "MetaMask" 커넥터를 등록하는 동시에,
`window.ethereum = provider` 레거시 할당이 `injected()` 커넥터를 추가로 등록해
지갑 모달에 커넥터가 두 개 나타난다.

현재 파일 구조 (`wallet-mock.ts`):
```typescript
// line 110-133
  };

  window.ethereum = provider;   // ← 이 줄 제거

  // EIP-6963: wagmi metaMask() connector listens for 'eip6963:requestProvider'
  function announceProvider() { ... }
  window.addEventListener('eip6963:requestProvider', announceProvider);
  announceProvider();
})();
```

- [ ] **Step 1: 파일 읽기**

`tests/e2e/wallet-mock.ts` 전체를 읽어 line 112의 정확한 내용 확인.

- [ ] **Step 2: window.ethereum 할당 제거**

`tests/e2e/wallet-mock.ts` line 112의 `window.ethereum = provider;` 줄을 삭제한다.
다른 줄은 건드리지 않는다.

- [ ] **Step 3: 타입체크**

```bash
npm run build 2>&1 | tail -5
```
Expected: no TypeScript errors

- [ ] **Step 4: E2E smoke 실행 (선택적, 빠른 검증)**

```bash
npx playwright test tests/e2e/landing.spec.ts --reporter=line 2>&1 | tail -20
```
Expected: 8 tests passed

- [ ] **Step 5: 커밋**

```bash
git add tests/e2e/wallet-mock.ts
git commit -m "fix(e2e): remove window.ethereum assignment to prevent duplicate connectors"
```

---

## Task 2: 구매 유저 aside 뱃지 — badge--grey 추가 및 조건 분기

**파일:**
- Modify: `app/globals.css` — `.badge--grey` 추가
- Modify: `app/dashboard/page.tsx:735` — aside 뱃지 조건 분기

### 배경

`activePurchase === true`인 유저에게 aside가 빨간 "Not eligible" 뱃지를 보여
구매 접근 섹션의 녹색 "Eligible"과 충돌한다.

현재 `globals.css` (line 303-305):
```css
.badge--ok   { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
.badge--no   { background: #fff1f2; color: #9f1239; border: 1px solid #fecdd3; }
.badge--blue { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }
```

현재 `page.tsx` (line 733-738):
```tsx
<span className="n-lbl">Status</span>
<span className="n-val" style={{ marginBottom: "18px" }}>
  <span className={`badge ${balance.eligible ? "badge--ok" : "badge--no"}`}>
    {balance.eligible ? "Eligible" : "Not eligible"}
  </span>
</span>
```

### 수정할 코드

**globals.css** — `.badge--blue` 바로 뒤에 추가:
```css
.badge--grey { background: #1e293b; color: #94a3b8; border: 1px solid #334155; }
```

**page.tsx** — aside 뱃지 및 activePurchase 안내 문구:
```tsx
<span className="n-lbl">Status</span>
<span className="n-val" style={{ marginBottom: "18px" }}>
  <span className={`badge ${
    balance.eligible
      ? "badge--ok"
      : balance.activePurchase
        ? "badge--grey"
        : "badge--no"
  }`}>
    {balance.eligible
      ? "Eligible"
      : balance.activePurchase
        ? "Not staking"
        : "Not eligible"}
  </span>
</span>
{balance.activePurchase && (
  <span className="n-lbl" style={{ fontSize: "0.6875rem", color: "var(--muted)", marginTop: "-12px" }}>
    Stake ≥{balance.minTon} TON for permanent free access
  </span>
)}
```

- [ ] **Step 1: 파일 읽기**

`app/globals.css` line 292-310 읽기.
`app/dashboard/page.tsx` line 724-744 읽기.

- [ ] **Step 2: badge--grey CSS 추가**

`app/globals.css`에서 `.badge--blue { ... }` 줄 바로 뒤에 `.badge--grey` 규칙을 추가한다:
```css
.badge--grey { background: #1e293b; color: #94a3b8; border: 1px solid #334155; }
```

- [ ] **Step 3: aside 뱃지 조건 수정**

`app/dashboard/page.tsx`의 aside Status 뱃지 부분을 수정한다.
기존:
```tsx
<span className={`badge ${balance.eligible ? "badge--ok" : "badge--no"}`}>
  {balance.eligible ? "Eligible" : "Not eligible"}
</span>
```
교체:
```tsx
<span className={`badge ${
  balance.eligible
    ? "badge--ok"
    : balance.activePurchase
      ? "badge--grey"
      : "badge--no"
}`}>
  {balance.eligible
    ? "Eligible"
    : balance.activePurchase
      ? "Not staking"
      : "Not eligible"}
</span>
```

- [ ] **Step 4: activePurchase 안내 문구 추가**

aside 뱃지 `</span>` 닫힘 직후(`</span>` 바로 뒤, `<span className="n-lbl">Network</span>` 앞)에 추가:
```tsx
{balance.activePurchase && (
  <span className="n-lbl" style={{ fontSize: "0.6875rem", color: "var(--muted)", marginTop: "-12px" }}>
    Stake ≥{balance.minTon} TON for permanent free access
  </span>
)}
```

- [ ] **Step 5: 타입체크 + 빌드**

```bash
npm run build 2>&1 | tail -5
```
Expected: no errors

- [ ] **Step 6: 커밋**

```bash
git add app/globals.css app/dashboard/page.tsx
git commit -m "feat(dashboard): use grey badge for active-purchase users in staking status aside"
```

---

## Task 3: StakePanel — 10초 balanceTimedOut 타임아웃

**파일:**
- Modify: `app/dashboard/page.tsx` — StakePanel 컴포넌트 (line ~277–539)

### 배경

`tonBalance.isLoading`이 해소되지 않으면 `hasEnough`가 영원히 `false`로 고착되어
Stake 버튼이 disabled 상태로 남는다. 타임아웃 후 적절한 피드백을 제공해야 한다.

현재 관련 코드 (`page.tsx` ~line 286-305):
```tsx
const tonBalance = useTonBalance(address as `0x${string}` | undefined);
// ...
const isLoading = status === "pending" || status === "confirming";
const balanceReady = !tonBalance.isLoading && !tonBalance.isError;
const walletTON = parseFloat(tonBalance.formatted);
const inputAmount = parseFloat(amount) || 0;
const hasEnough = balanceReady && inputAmount > 0 && walletTON >= inputAmount;
```

현재 잔액 표시 (`page.tsx` ~line 383-386):
```tsx
<span style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 700, color: "var(--ink)" }}>
  {tonBalance.isLoading ? "…" : `${tonBalance.formatted} TON`}
</span>
```

현재 Stake 버튼 (`page.tsx` ~line 482-491):
```tsx
<button
  className="btn-primary"
  onClick={handleStake}
  disabled={isLoading || !hasEnough}
  style={{ alignSelf: "flex-start" }}
>
  {status === "pending"    ? "Confirm in wallet…" :
   status === "confirming" ? "Confirming tx…" :
                             `Stake ${amount || "—"} TON →`}
</button>
```

### 추가할 코드

**state 추가** (기존 `const [layer2, ...` 선언들 바로 뒤):
```tsx
const [balanceTimedOut, setBalanceTimedOut] = useState(false);
```

**useEffect 추가** (기존 `useEffect([status, onSuccess, reset])` 바로 뒤):
```tsx
useEffect(() => {
  if (!tonBalance.isLoading) {
    setBalanceTimedOut(false);
    return;
  }
  const t = setTimeout(() => setBalanceTimedOut(true), 10_000);
  return () => clearTimeout(t);
}, [tonBalance.isLoading]);
```

**hasEnough 수정**:
```tsx
const hasEnough =
  balanceTimedOut ||
  (balanceReady && inputAmount > 0 && walletTON >= inputAmount);
```

**잔액 표시 수정**:
```tsx
{tonBalance.isLoading
  ? balanceTimedOut ? "—" : "…"
  : `${tonBalance.formatted} TON`}
```

**에러 배너 추가** (잔액 표시 `</div>` 바로 뒤, Amount input `<div>` 앞):
```tsx
{balanceTimedOut && (
  <p style={{ fontSize: "0.8125rem", color: "#dc2626", margin: "0" }}>
    Balance unavailable — RPC timeout.{" "}
    <button
      onClick={() => { setBalanceTimedOut(false); tonBalance.refetch(); }}
      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", textDecoration: "underline", padding: 0, font: "inherit" }}
    >
      Retry
    </button>
  </p>
)}
```

**Stake 버튼 레이블 수정**:
```tsx
{status === "pending"    ? "Confirm in wallet…" :
 status === "confirming" ? "Confirming tx…" :
 balanceTimedOut         ? `Stake ${amount || "—"} TON → (unverified)` :
                           `Stake ${amount || "—"} TON →`}
```

- [ ] **Step 1: 파일 읽기**

`app/dashboard/page.tsx` line 277-539 읽기.

- [ ] **Step 2: balanceTimedOut state 추가**

기존 state 선언들(`const [amount, ...]`, `const [layer2, ...]`, ...) 바로 뒤에 추가:
```tsx
const [balanceTimedOut, setBalanceTimedOut] = useState(false);
```

- [ ] **Step 3: useEffect 추가**

기존 `useEffect(() => { if (status === "success") ... }, [status, onSuccess, reset]);` 바로 뒤에 추가:
```tsx
useEffect(() => {
  if (!tonBalance.isLoading) {
    setBalanceTimedOut(false);
    return;
  }
  const t = setTimeout(() => setBalanceTimedOut(true), 10_000);
  return () => clearTimeout(t);
}, [tonBalance.isLoading]);
```

- [ ] **Step 4: hasEnough 조건 수정**

기존:
```tsx
const hasEnough = balanceReady && inputAmount > 0 && walletTON >= inputAmount;
```
교체:
```tsx
const hasEnough =
  balanceTimedOut ||
  (balanceReady && inputAmount > 0 && walletTON >= inputAmount);
```

- [ ] **Step 5: 잔액 표시 수정**

기존:
```tsx
{tonBalance.isLoading ? "…" : `${tonBalance.formatted} TON`}
```
교체:
```tsx
{tonBalance.isLoading
  ? balanceTimedOut ? "—" : "…"
  : `${tonBalance.formatted} TON`}
```

- [ ] **Step 6: 타임아웃 에러 배너 추가**

잔액 `<span>` 표시 `</div>` 닫힘 태그 바로 뒤, Amount input `{/* Amount input */}` 주석 앞에 삽입:
```tsx
{balanceTimedOut && (
  <p style={{ fontSize: "0.8125rem", color: "#dc2626", margin: "0" }}>
    Balance unavailable — RPC timeout.{" "}
    <button
      onClick={() => { setBalanceTimedOut(false); tonBalance.refetch(); }}
      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", textDecoration: "underline", padding: 0, font: "inherit" }}
    >
      Retry
    </button>
  </p>
)}
```

- [ ] **Step 7: Stake 버튼 레이블 수정**

기존:
```tsx
{status === "pending"    ? "Confirm in wallet…" :
 status === "confirming" ? "Confirming tx…" :
                           `Stake ${amount || "—"} TON →`}
```
교체:
```tsx
{status === "pending"    ? "Confirm in wallet…" :
 status === "confirming" ? "Confirming tx…" :
 balanceTimedOut         ? `Stake ${amount || "—"} TON → (unverified)` :
                           `Stake ${amount || "—"} TON →`}
```

- [ ] **Step 8: 타입체크 + 빌드**

```bash
npm run build 2>&1 | tail -5
```
Expected: no TypeScript errors

- [ ] **Step 9: 커밋**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(dashboard): add 10s balance timeout with retry in StakePanel"
```

---

## Task 4A: fixtures.ts — ineligiblePage에 RPC eth_call mock 추가

**파일:**
- Modify: `tests/e2e/fixtures.ts:48-53`

### 배경

wagmi의 `useReadContract` (tonBalance, stakedBalance)는 HTTP public client transport를 통해
외부 RPC URL(`https://eth.llamarpc.com`, `https://rpc.ankr.com/eth` 등)로 `eth_call`을 보낸다.
테스트 환경에서는 이 요청이 응답을 받지 못해 `isLoading`이 영구 지속된다.

`page.route()` 로 모든 POST 요청을 가로채 `eth_call` body를 포함하는 경우 mock 응답을 반환한다.

반환값:
- Wallet TON Balance `250.0` TON → `uint256(250 * 10^18)` hex:
  `0x000000000000000000000000000000000000000000000d8d726b7177a8000000`
- Staked TON `0.0` → 이미 zero word로 충분

multicall 응답은 ABI encoded tuple array이므로, 간단히 하기 위해
단일 `eth_call` 응답으로 인코딩된 `uint256` 1개를 반환한다:

250 TON = 250 * 1e18 = `0xd8d726b7177a8000000`의 32바이트 패딩:
`0x000000000000000000000000000000000000000000000d8d726b7177a8000000`

> **NOTE:** multicall 결과는 `(bool, bytes)[]` 타입. 완전한 인코딩이 복잡하므로
> 가장 간단한 접근: `eth_call`을 인터셉트하지 않고, wagmi config를 테스트용 mock transport로
> 교체하는 방안은 복잡도가 높다.
>
> 현실적 접근: 단순히 250 TON을 uint256으로 ABI 인코딩해 반환. wagmi의 multicall3 결과 파싱이
> 실패하면 `isError=true`가 되어 `—` 표시 fallback으로 연결된다 (Task 4B 결과).
>
> 따라서 **Task 4A의 실용적 목표**: `eth_call`에 응답을 돌려줘 `isLoading`을 해소시킨다.
> 정확한 ABI 인코딩이 아니어도 되며, 파싱 실패 시 `isError=true`로 처리된다.

현재 `ineligiblePage` fixture (`fixtures.ts` line 48-53):
```typescript
ineligiblePage: async ({ page }, use) => {
  await page.addInitScript({ content: buildWalletMockScript(MOCK_ADDRESS) });
  await applyIneligibleMocks(page);
  await page.goto('/dashboard');
  await use(page);
},
```

### 추가할 코드

```typescript
ineligiblePage: async ({ page }, use) => {
  await page.addInitScript({ content: buildWalletMockScript(MOCK_ADDRESS) });
  await applyIneligibleMocks(page);

  // Intercept Ethereum JSON-RPC eth_call to resolve wagmi balance hooks
  await page.route('**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      const body = req.postData() ?? '';
      if (body.includes('"eth_call"')) {
        // Return 250 TON as uint256 ABI encoded (may fail multicall3 parse → isError)
        const uint256_250_ton = '0x000000000000000000000000000000000000000000000d8d726b7177a8000000';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: uint256_250_ton }),
        });
        return;
      }
    }
    await route.continue();
  });

  await page.goto('/dashboard');
  await use(page);
},
```

> **구현 참고:** `page.route('**', ...)` 는 `applyIneligibleMocks` 보다 뒤에 등록하면
> 기존 route mock이 먼저 매칭된다. `eth_call`은 외부 URL로 가는 요청이므로 기존 mock과 겹치지 않는다.
> 단, route 등록 순서에 주의: 특정 URL 패턴이 더 먼저 매칭되므로, 기존 `/api/**` mock이 우선된다.

- [ ] **Step 1: 파일 읽기**

`tests/e2e/fixtures.ts` 전체 읽기.

- [ ] **Step 2: ineligiblePage fixture에 route 추가**

`fixtures.ts`의 `ineligiblePage` fixture를 위의 코드로 교체한다.
`page.goto('/dashboard')` 호출을 route 등록 이후로 이동한다.

- [ ] **Step 3: 타입체크**

```bash
npm run build 2>&1 | tail -5
```
Expected: no errors

- [ ] **Step 4: 커밋**

```bash
git add tests/e2e/fixtures.ts
git commit -m "test(e2e): mock eth_call in ineligiblePage fixture to resolve balance loading"
```

---

## Task 4B: StakePanel/UnstakePanel — 8초 contractTimedOut 타임아웃

**파일:**
- Modify: `app/dashboard/page.tsx` — StakePanel 컴포넌트 (line ~277–539)

### 배경

Task 3의 `balanceTimedOut`과 동일한 패턴을 `stakedBalance` (Unstake 탭)에도 적용한다.

현재 stakedBalance 관련 코드 (`page.tsx` ~line 296-297):
```tsx
const stakedBalance = useStakedBalance(address as `0x${string}` | undefined, unstakeLayer2);
```

Unstake 탭에서 staked balance 표시 부분을 찾아야 한다.

> **구현 참고:** Unstake 탭의 정확한 줄 번호를 먼저 확인한다. `stakedBalance.isLoading`을
> 검색해 해당 렌더링 위치를 파악한다.

추가할 코드 (state):
```tsx
const [contractTimedOut, setContractTimedOut] = useState(false);
```

추가할 useEffect (기존 balanceTimedOut useEffect 뒤):
```tsx
useEffect(() => {
  if (!stakedBalance.isLoading) {
    setContractTimedOut(false);
    return;
  }
  const t = setTimeout(() => setContractTimedOut(true), 8_000);
  return () => clearTimeout(t);
}, [stakedBalance.isLoading]);
```

Unstake 탭의 stakedBalance 표시 수정:
```tsx
{stakedBalance.isLoading
  ? contractTimedOut ? "—" : "…"
  : `${stakedBalance.formatted} TON`}
```

contractTimedOut 에러 배너 (stakedBalance 표시 뒤):
```tsx
{contractTimedOut && (
  <p style={{ fontSize: "0.8125rem", color: "#dc2626", margin: "0" }}>
    Balance unavailable — RPC timeout.{" "}
    <button
      onClick={() => { setContractTimedOut(false); stakedBalance.refetch(); }}
      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", textDecoration: "underline", padding: 0, font: "inherit" }}
    >
      Retry
    </button>
  </p>
)}
```

- [ ] **Step 1: 파일 읽기**

`app/dashboard/page.tsx` line 277-539 읽기. Unstake 탭에서 `stakedBalance.isLoading` 렌더링 위치를 확인한다.

- [ ] **Step 2: contractTimedOut state 추가**

Task 3에서 추가한 `balanceTimedOut` state 선언 바로 뒤에:
```tsx
const [contractTimedOut, setContractTimedOut] = useState(false);
```

- [ ] **Step 3: useEffect 추가**

Task 3에서 추가한 balanceTimedOut useEffect 바로 뒤에:
```tsx
useEffect(() => {
  if (!stakedBalance.isLoading) {
    setContractTimedOut(false);
    return;
  }
  const t = setTimeout(() => setContractTimedOut(true), 8_000);
  return () => clearTimeout(t);
}, [stakedBalance.isLoading]);
```

- [ ] **Step 4: Unstake 탭 stakedBalance 표시 수정**

`stakedBalance.isLoading ? "…"` 또는 `stakedBalance.formatted` 렌더링 부분을 찾아:
```tsx
{stakedBalance.isLoading
  ? contractTimedOut ? "—" : "…"
  : `${stakedBalance.formatted} TON`}
```
으로 교체한다.

- [ ] **Step 5: contractTimedOut 에러 배너 추가**

stakedBalance 표시 `</div>` 바로 뒤에 삽입:
```tsx
{contractTimedOut && (
  <p style={{ fontSize: "0.8125rem", color: "#dc2626", margin: "0" }}>
    Balance unavailable — RPC timeout.{" "}
    <button
      onClick={() => { setContractTimedOut(false); stakedBalance.refetch(); }}
      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", textDecoration: "underline", padding: 0, font: "inherit" }}
    >
      Retry
    </button>
  </p>
)}
```

- [ ] **Step 6: 타입체크 + 빌드**

```bash
npm run build 2>&1 | tail -5
```
Expected: no errors

- [ ] **Step 7: 커밋**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(dashboard): add 8s contract balance timeout with retry in StakePanel unstake tab"
```

---

## Task 5: Active key 스크린샷 — data-testid + scrollIntoViewIfNeeded

**파일:**
- Modify: `app/dashboard/page.tsx:922` — active key 카드 루트에 `data-testid` 추가
- Modify: `tests/e2e/dashboard-purchase.spec.ts:30-34` — scrollIntoViewIfNeeded 추가

### 배경

`active key section visible` 테스트가 통과하지만 Playwright 최종 스크린샷이 scroll position 0에서
찍혀 Active key 카드가 뷰포트 밖에 있다.

현재 `page.tsx` (line ~921-922):
```tsx
{/* Key card */}
<div className="card">
```

현재 `dashboard-purchase.spec.ts` (line 30-34):
```typescript
test('has active key section visible', async ({ purchasePage: page }) => {
  // activePurchase users: the code path shows the expiry banner + CLI setup panel (when keyData?.hasActiveKey)
  await expect(page.getByText('Configure AI tools')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('npx @tokamak-network/ai-access-cli configure')).toBeVisible();
});
```

> **NOTE:** `dashboard-purchase.spec.ts`에서는 `purchasePage` fixture를 사용하지만,
> 현재 구매 유저 플로우에서 Active key 카드는 `balance.activePurchase === true` 분기에서 렌더된다.
> `keyData?.hasActiveKey === true`일 때 표시되는 카드가 아닌, 구매 유저 전용 섹션을 찾아야 한다.
> `page.tsx`에서 `activePurchase` 분기 코드와 `purchasePage` fixture의 mock 응답을 확인한다.

- [ ] **Step 1: 파일 읽기**

`app/dashboard/page.tsx` line 850-1026 읽기. 구매 유저(`activePurchase === true`) 분기에서
어떤 요소가 렌더되는지 확인. `data-testid`를 붙일 적절한 요소를 찾는다.

`tests/e2e/api-mocks.ts`에서 `applyPurchaseMocks` 확인해 `keyData` 구조를 파악한다.

- [ ] **Step 2: data-testid 추가**

`app/dashboard/page.tsx`에서 구매 유저 섹션 또는 Active key 카드 루트 `<div>`에
`data-testid="active-key-card"` 추가:

eligible staker 분기의 키 카드 (line ~922):
```tsx
<div className="card" data-testid="active-key-card">
```

또한 구매 유저 분기(`activePurchase === true`)에서 CLI 설정 패널 또는 해당 섹션 루트에도
`data-testid` 추가가 필요하면 추가한다.

- [ ] **Step 3: scrollIntoViewIfNeeded 추가**

`tests/e2e/dashboard-purchase.spec.ts`의 `has active key section visible` 테스트에 추가:
```typescript
test('has active key section visible', async ({ purchasePage: page }) => {
  await expect(page.getByText('Configure AI tools')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('npx @tokamak-network/ai-access-cli configure')).toBeVisible();
  await page.getByText('Configure AI tools').scrollIntoViewIfNeeded();
});
```

- [ ] **Step 4: 타입체크 + 빌드**

```bash
npm run build 2>&1 | tail -5
```
Expected: no errors

- [ ] **Step 5: 커밋**

```bash
git add app/dashboard/page.tsx tests/e2e/dashboard-purchase.spec.ts
git commit -m "fix(e2e): add scrollIntoViewIfNeeded for active key screenshot and data-testid"
```

---

## 최종 검증

모든 태스크 완료 후 전체 테스트 실행:

```bash
npm test 2>&1 | tail -20
```
Expected: 모든 unit test 통과 (176개)

```bash
npm run build 2>&1 | tail -5
```
Expected: 빌드 성공

---

## 완료 기준

- [ ] `npm test` 전체 통과
- [ ] `npm run build` 성공
- [ ] 5개 커밋 (각 태스크당 1개)
