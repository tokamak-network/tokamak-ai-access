# E2E 이슈 패치 설계 문서

**날짜:** 2026-06-17  
**범위:** E2E 스크린샷 리뷰에서 발견된 5개 이슈 패치  
**관련 문서:** `docs/e2e-screenshot-review.md`

---

## 개요

36개 E2E 테스트 전체 통과 후 스크린샷 리뷰에서 발견된 5개 이슈를 패치한다.
이슈 1·5는 테스트 전용, 이슈 2·3은 프로덕션 UX, 이슈 4는 둘 다 해당한다.

---

## 이슈 1 — 지갑 모달 커넥터 중복

### 현상
wallet-mock.ts가 EIP-6963 프로바이더 발표와 `window.ethereum` 레거시 할당을 동시에 수행해
wagmi v2가 "MetaMask"와 "Injected" 두 개의 커넥터를 등록한다.

### 수정
**파일:** `tests/e2e/wallet-mock.ts`

mock 프로바이더 설정에서 `window.ethereum` 할당을 제거한다.
EIP-6963 `eip6963:announceProvider` 이벤트만 유지한다.
프로덕션 코드 변경 없음.

### 성공 기준
- 지갑 모달에 MetaMask 커넥터가 정확히 1개만 표시된다.
- 기존 36개 테스트 모두 통과한다.

---

## 이슈 2 — 구매 유저 자격 레이블 충돌

### 현상
`activePurchase === true`인 구매 유저에게 스테이킹 상태 aside가 빨간 "Not eligible" 뱃지를 표시하고,
메인 섹션이 녹색 "Eligible" 뱃지를 표시해 두 신호가 충돌한다.

### 수정
**파일:** `app/dashboard/page.tsx` — 스테이킹 상태 aside (lines ~724–744)

조건 분기를 세 가지로 분리한다:

| 조건 | 뱃지 | 클래스 |
|------|------|--------|
| `balance.eligible` | Eligible | `badge--ok` |
| `!balance.eligible && balance.activePurchase` | Not staking | `badge--grey` (신규) |
| `!balance.eligible && !balance.activePurchase` | Not eligible | `badge--no` |

`badge--grey` CSS: `background: #1e293b; color: #94a3b8; border: 1px solid #334155`

`activePurchase` 시 aside 하단에 유도 문구 추가:
`"Stake ≥100 TON for permanent free access"`

### 성공 기준
- 구매 유저 대시보드에서 aside 뱃지가 회색 "Not staking"으로 표시된다.
- 순수 비자격 유저(스테이킹·구매 모두 없음) aside 뱃지는 여전히 빨간 "Not eligible"이다.
- 5개 purchase 테스트 모두 통과한다.

---

## 이슈 3 — Stake 버튼 무한 비활성화

### 현상
`tonBalance.isLoading`이 해소되지 않으면 Stake 버튼의 `hasEnough`가 영원히 false로 고착된다.
타임아웃이나 에러 상태가 없어 유저에게 아무런 피드백이 없다.

### 수정
**파일:** `app/dashboard/page.tsx` — StakePanel 컴포넌트 (lines ~277–539)

1. `balanceTimedOut` state 추가 (`useState(false)`)
2. `useEffect`로 10초 타임아웃 설정: `tonBalance.isLoading`이 true인 채로 10초 경과 시 `balanceTimedOut = true`
3. 잔액 표시: `balanceTimedOut` 시 `…` 대신 `—` 렌더링
4. 에러 배너: `balanceTimedOut` 시 "잔액 조회 실패 — RPC 타임아웃" + "Retry" 링크 (`tonBalance.refetch()`) 표시
5. 버튼 활성화 조건 수정:
   ```ts
   const hasEnough =
     balanceTimedOut ||
     (balanceReady && inputAmount > 0 && walletTON >= inputAmount);
   ```
6. 버튼 레이블: `balanceTimedOut` 시 `"Stake {amount} TON → (unverified)"` 추가
7. `tonBalance.isLoading`이 false로 전환되면(재시도 성공) `balanceTimedOut`을 `false`로 리셋

### 성공 기준
- 10초 후 잔액 필드가 `—`로 바뀌고 Retry 링크가 나타난다.
- 타임아웃 후 Stake 버튼이 활성화된다.
- 정상 로딩(isLoading이 10초 내 해소)에서는 기존 동작 유지.

---

## 이슈 4 — 온체인 잔액 `…` 고착

### 현상
테스트 환경에서 viem `readContract`가 실제 RPC URL로 `eth_call`을 시도하지만 응답이 없어
Wallet TON Balance와 Staked TON 두 필드가 영원히 `…`를 표시한다.

### 수정 A — 테스트
**파일:** `tests/e2e/fixtures.ts` (또는 신규 `tests/e2e/contract-mocks.ts`)

`page.route()`로 RPC URL을 향한 `eth_call` 요청을 인터셉트해 고정 hex 값을 반환한다:
- Wallet TON Balance: `250.0` TON (hex 인코딩 uint256)
- Staked TON (this operator): `0.0` TON

인터셉트 패턴: `.env.local`의 `NEXT_PUBLIC_RPC_URL` 또는 공통 Alchemy/Infura 패턴 매칭.
`ineligiblePage` fixture에 적용한다 (해당 테스트가 StakePanel 필드를 검증).

### 수정 B — 프로덕션
**파일:** `app/dashboard/page.tsx` — StakePanel + UnstakePanel 잔액 필드

이슈 3과 동일한 타임아웃 패턴 적용 (8초):
- `contractTimedOut` state 추가
- 8초 후 `…` → `—` + "Retry" 링크 (`refetch()`)
- Wallet TON Balance, Staked TON 두 필드에 모두 적용

### 성공 기준
- 테스트에서 StakePanel 잔액 필드가 숫자로 표시된다.
- 프로덕션에서 8초 후 `…` 대신 `—` + Retry 링크가 표시된다.

---

## 이슈 5 — 구매 유저 스크린샷 Active key 누락

### 현상
`active key section visible` 테스트가 통과하지만, 테스트 종료 시 스크롤 위치가 0으로 복원되어
스크린샷에 Active key 카드가 찍히지 않는다.

### 수정
**파일:** `tests/e2e/dashboard-purchase.spec.ts`

`expect(...).toBeVisible()` 검증 직후 1줄 추가:
```ts
await page.locator('[data-testid="active-key-card"]').scrollIntoViewIfNeeded();
```

`data-testid="active-key-card"` 어트리뷰트가 없으면 `app/dashboard/page.tsx` (line ~922)
Active key 카드 루트 요소에 추가한다. 기능 변경 없음.

### 성공 기준
- `active-key-section-visible` 테스트의 최종 스크린샷에 Active key 카드가 표시된다.

---

## 파일 변경 목록

| 파일 | 변경 유형 | 이슈 |
|------|-----------|------|
| `tests/e2e/wallet-mock.ts` | 수정 | #1 |
| `app/dashboard/page.tsx` | 수정 | #2, #3, #4B |
| `tests/e2e/fixtures.ts` | 수정 (또는 신규 `contract-mocks.ts`) | #4A |
| `tests/e2e/dashboard-purchase.spec.ts` | 수정 | #5 |

---

## 테스트 전략

- 이슈 1·5: 기존 E2E 테스트가 회귀 검증을 수행한다. 추가 테스트 불필요.
- 이슈 2: 구매 유저 E2E 테스트에 aside 뱃지 텍스트 검증 1개 추가.
- 이슈 3: 단위 테스트에서 10초 타임아웃 후 버튼 활성화 검증 (타이머 모킹).
- 이슈 4A: 잔액 필드 숫자 표시 E2E 검증 추가.
- 이슈 4B: 단위 테스트에서 8초 타임아웃 후 `—` + Retry 표시 검증.

전체 패치 완료 후 `npm test` + `npm run build` 통과를 완료 기준으로 한다.
