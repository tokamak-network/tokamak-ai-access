# Purchase Access — Design

**Date:** 2026-06-15  
**Status:** Approved

## Problem

API key 취득 경로가 스테이킹(≥100 TON)으로만 한정되어 있어, 스테이킹 의사가 없는 사용자는 서비스를 이용할 수 없다.

## Solution

TON ERC-20 on-chain 결제(5 TON → 30일)를 두 번째 자격 경로로 추가한다. 스테이킹과 구매 중 하나를 충족하면 동일한 API key를 발급받는다. 기존 스테이커의 UX는 변경하지 않는다.

---

## Section 1: 사용자 플로우

### 1-1. Eligible 스테이커 (기존 → 변경 없음)

```
지갑 연결 → SIWE → 대시보드
  → Key 상태 카드 (Active / Expiring / Expired / No key)
  → [Extend key] [New key] 카드 선택 → 확장 패널
```

구매 경로 미노출.

### 1-2. Ineligible / 미스테이킹 사용자 (신규)

```
지갑 연결 → SIWE → 대시보드
  → "Not eligible" 상태
  → [Stake TON] [Buy Access] 카드 병렬 표시 (Option B 레이아웃)
  → 카드 선택 → 해당 패널 확장

Buy Access 선택 시:
  → "Pay 5 TON →" 클릭
  → wagmi writeContract (TON ERC-20 transfer to TREASURY)
  → 지갑 서명 → tx 브로드캐스트
  → POST /api/keys/purchase { txHash }
  → 백엔드 on-chain 검증 → KV 기록 → 키 발급
  → 대시보드 갱신 (Eligible via Purchase 상태)
```

### 1-3. 구매자 갱신 플로우

```
만료 7일 전: "Expires in N days" 배너
  → [Renew 30 days (+5 TON) →] 버튼 (primary CTA)
  → 동일 결제 플로우 → PUT /api/keys/purchase/renew
  → expiresAt +30일 + LiteLLM key TTL +30일 (키 번호 유지)

만료 후:
  → Expired 상태 카드
  → [Renew access →] CTA
```

---

## Section 2: UI 설계

### 2-1. 레이아웃 분기

| 조건 | 화면 |
|------|------|
| staked ≥ 100 TON | 기존 대시보드 (Key 상태 카드 + Extend/New 카드) |
| staked < 100 TON AND no active purchase | [Stake TON] [Buy Access] 카드 병렬 |
| active purchase (`expiresAt > now`) | Eligible via Purchase 대시보드 |

### 2-2. Key 상태 카드 — 4가지 상태

| State | 색상 | Primary CTA |
|-------|------|-------------|
| No key | 회색 점선 | Issue API key → |
| Active (>7일) | 초록 | — |
| Expiring (<7일) | 노랑 배너 | Extend now (+30d) → |
| Expired | 빨강 | Renew access → |

### 2-3. 액션 카드 (계층 통일)

Eligible 대시보드의 `[Extend key]` `[New key]` 카드와  
Not-eligible 대시보드의 `[Stake TON]` `[Buy Access]` 카드가  
동일한 선택 카드 패턴을 사용한다. 카드 클릭 → 하단 패널 확장.

`New key`(rotate) 카드 확장 패널에는 파괴적 액션 경고 표시.

---

## Section 3: KV 스키마

### 신규: `purchase:{address}`

```typescript
interface PurchaseRecord {
  txHash:    string;  // on-chain ERC-20 transfer tx hash (최근 결제)
  paidAt:    number;  // unix ms
  expiresAt: number;  // unix ms (paidAt + 30 * 24 * 60 * 60 * 1000)
}
```

### 신규: `txhash:{hash}`

txHash 재사용(replay attack) 방지용 글로벌 deduplicate 레코드.  
`purchase:{address}` 갱신 시 덮어쓰이는 문제를 방지하기 위해 별도 키로 유지한다.

```typescript
// value: { address: string, usedAt: number }
// KV TTL 없음 — 영구 보관
```

기존 `KeyRecord` (`key:{address}`) 변경 없음.

---

## Section 4: 백엔드 변경

### 4-1. `assertEligibility()` — `lib/key-guards.ts`

기존 `assertStake()`를 `assertEligibility()`로 교체. 두 경로 OR 검사.

```typescript
export async function assertEligibility(address: string): Promise<void> {
  // Path 1: staking
  const minTonWei = BigInt(process.env.MIN_TON ?? "100") * 10n ** 18n;
  const balance = await getTotalStakedTON(address);
  if (balance >= minTonWei) return;

  // Path 2: active purchase
  const purchase = await kv.get<PurchaseRecord>(`purchase:${address}`);
  if (purchase && purchase.expiresAt > Date.now()) return;

  throw NextResponse.json({ error: "Not eligible" }, { status: 403 });
}
```

호출 변경: `app/api/keys/issue/route.ts` 한 줄 교체.

```typescript
// before
await assertStake(address);
// after
await assertEligibility(address);
```

`assertRotateCooldown()`, `assertKeyCapacity()`는 변경 없음.

### 4-2. `POST /api/keys/purchase` — 신규 라우트

```
app/api/keys/purchase/route.ts
```

처리 순서:
1. SIWE 세션에서 `address` 추출
2. `body.txHash` 수신
3. `assertKeyCapacity()` 호출 — **결제 수락 전에 용량 확인** (꽉 차면 결제 없이 거절)
4. viem `getTransactionReceipt` → `to === TON_ERC20_ADDRESS` 검증 (ERC-20 tx의 `to`는 컨트랙트 주소)
5. 로그에서 ERC-20 Transfer 이벤트 파싱:
   - `event.from === address` 검증 (SIWE 세션 주소와 일치해야 함 — replay attack 방지)
   - `event.to === TREASURY_ADDRESS` 검증
   - `event.value >= 5 TON` 검증
6. `txhash:{txHash}` KV 조회 → 이미 있으면 409 (중복 사용 방지)
7. `kv.set(`txhash:${txHash}`, { address, usedAt: Date.now() })`
8. `kv.set(`purchase:${address}`, { txHash, paidAt, expiresAt })`
9. 내부 헬퍼로 키 발급 (`issueKeyForAddress(address)` — issue route와 공유하는 추출 함수)
10. `200 { key, expiresAt }`

환경변수 추가: `TREASURY_ADDRESS`, `TON_ERC20_ADDRESS`

### 4-3. `PUT /api/keys/purchase/renew` — 신규 라우트

```
app/api/keys/purchase/renew/route.ts
```

처리 순서:
1. SIWE 세션에서 `address` 추출
2. 기존 `purchase:{address}` 레코드 존재 확인
3. 신규 `txHash` 검증 (4-2의 4~7번 절차 동일)
4. `expiresAt = Math.max(existing.expiresAt, Date.now()) + 30days`
5. `kv.set(`purchase:${address}`, { txHash, paidAt: Date.now(), expiresAt })`
6. **`renewLiteLLMKey(record.liteLlmKeyId)`** 호출 — LiteLLM key TTL도 +30일 연장  
   (LiteLLM key는 `duration: "30d"`로 발급되므로 KV expiresAt과 함께 LiteLLM TTL도 동기화 필요)
7. `200 { expiresAt }`

키 자체(key ID/value)는 변경 없음. TTL만 갱신.

### 4-4. `app/api/cron/check-stakes/route.ts` — 수정

기존 크론은 `balance < MIN_TON_WEI`이면 무조건 revoke한다.  
구매자는 스테이킹 없이도 유효하므로, revoke 전 `purchase:{address}` 확인이 필요하다.

```typescript
// 기존 (line 73)
if (balance < MIN_TON_WEI) {
  // revoke
}

// 변경 후
if (balance < MIN_TON_WEI) {
  // 구매자 면제: 활성 구매 기록이 있으면 revoke 건너뜀
  const purchase = await kvGet<PurchaseRecord>(`purchase:${address}`);
  if (purchase && purchase.expiresAt > Date.now()) {
    activeCount++;
    continue;
  }
  // revoke
}
```

---

## Section 5: 라이프사이클 정의

구매자의 key 상태가 어떻게 흘러가는지 명시한다.

```
[purchase 라우트] → KV purchase:{address} 생성 + LiteLLM key 발급 (TTL 30d)
        ↓
   [크론 hourly] → balance < MIN_TON_WEI AND purchase.expiresAt > now → SKIP (revoke 안 함)
        ↓
   [renew 라우트] → purchase.expiresAt +30d + LiteLLM TTL +30d
        ↓
   [크론 hourly] → balance < MIN_TON_WEI AND purchase.expiresAt ≤ now → REVOKE
```

스테이커가 구매도 한 경우: 스테이킹 경로가 먼저 통과하므로 구매 만료 여부 무관.

---

## Section 6: 프론트엔드 훅

### `lib/hooks/usePurchase.ts` — 신규

```typescript
// wagmi useWriteContract → TON ERC-20 transfer → txHash
// → POST /api/keys/purchase
// returns: { purchase, isLoading, error, execute }
```

### `lib/hooks/usePurchaseRenew.ts` — 신규 (또는 usePurchase 내 renew 함수)

```typescript
// 동일 패턴 → PUT /api/keys/purchase/renew
```

### `app/dashboard/page.tsx` — 변경

- `eligible` 판단 로직: staking OR active purchase
- Not-eligible 상태: `[Stake TON] [Buy Access]` 카드 렌더링
- Eligible 상태 Key 카드: 상태 4종 분기 + `[Extend key] [New key]` 카드
- 구매자 만료 임박 배너 추가

---

## Section 7: 환경변수

```bash
# .env.example 추가
TREASURY_ADDRESS=0x...        # TON 결제 수신 지갑
TON_ERC20_ADDRESS=0x...       # Ethereum L1 TON ERC-20 컨트랙트 주소
```

---

## Section 8: 크론 설정

### 현재 상태

`vercel.json`에 크론이 선언되어 있으나 **비활성 상태**다.

```json
{
  "crons": [
    {
      "path": "/api/cron/check-stakes",
      "schedule": "0 * * * *"
    }
  ]
}
```

### 활성화 조건

크론은 **Vercel Pro 이상** 플랜에서만 동작한다. Hobby 플랜은 크론 미지원.

활성화 절차:
1. Vercel 대시보드 → Project → Settings → Cron Jobs 확인
2. `CRON_SECRET` 환경변수 설정 (현재 핸들러가 `Authorization: Bearer {CRON_SECRET}` 검증)
3. Pro 플랜에서 배포하면 vercel.json의 crons 선언이 자동 등록됨

### 크론 비활성 시 동작

크론이 꺼진 상태에서도 purchase 기능은 정상 동작한다. 단, 스테이킹이 줄어든 사용자의 키가 자동 취소되지 않는다 — 키가 만료될 때까지 계속 유효하다. 이는 크론 활성화 전 개발/테스트 환경에서 허용 가능한 동작이다.

### 크론 수동 실행 (개발/테스트용)

```bash
curl -X POST http://localhost:3000/api/cron/check-stakes \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## Section 9: E2E 테스트 시나리오

### T-01 구매 정상 플로우

```
전제: 지갑 연결, SIWE 완료, 스테이킹 < 100 TON

1. 대시보드 진입 → [Stake TON] [Buy Access] 카드 표시 확인
2. [Buy Access] 클릭 → 패널 확장 확인
3. "Pay 5 TON →" 클릭 → 지갑 서명 프롬프트 확인
4. 서명 완료 → "Confirming on-chain…" 상태 확인
5. tx 확정 → "Payment verified" 성공 메시지 확인
6. 대시보드 자동 갱신 → "Eligible via Purchase" 상태 + API key 표시 확인
7. 발급된 key로 LiteLLM API 호출 → 200 확인
```

### T-02 Replay Attack 방지

```
전제: T-01의 txHash 재사용 시도

1. 동일 txHash로 POST /api/keys/purchase 재요청
2. 응답: 409 Conflict
```

### T-03 타인 txHash 도용 방지

```
전제: 다른 지갑 A가 보낸 5 TON txHash를 지갑 B가 제출

1. 지갑 B SIWE 세션으로 POST /api/keys/purchase { txHash: A의tx }
2. 응답: 403 (event.from !== B의 address)
```

### T-04 부족한 결제 금액

```
전제: 3 TON만 전송한 txHash 제출

1. POST /api/keys/purchase { txHash }
2. 응답: 403 (event.value < 5 TON)
```

### T-05 크론 — 구매자 키 보존

```
전제: T-01 완료 후 purchase.expiresAt > now

1. 크론 수동 실행: POST /api/cron/check-stakes
2. 응답 { revoked: 0 } 확인 (구매자 키 revoke 안 됨)
3. 발급된 key로 API 호출 → 여전히 200 확인
```

### T-06 크론 — 구매 만료 후 키 취소

```
전제: purchase.expiresAt을 과거로 조작 (KV 직접 수정)

1. 크론 수동 실행
2. 응답 { revoked: 1 } 확인
3. 발급됐던 key로 API 호출 → 401/403 확인
```

### T-07 갱신 플로우

```
전제: 활성 구매 보유, 새 txHash (5 TON 전송)

1. [Renew 30 days (+5 TON) →] 클릭 → 지갑 서명
2. PUT /api/keys/purchase/renew → 200 { expiresAt }
3. expiresAt = 기존 만료일 + 30일 확인
4. 기존 key로 API 호출 → 여전히 200 확인 (key ID 동일)
5. 크론 실행 → 갱신된 expiresAt 기준으로 SKIP 확인
```

### T-08 용량 초과 시 결제 전 거절

```
전제: MAX_ACTIVE_KEYS=1로 환경변수 설정, 기존 키 1개 존재

1. POST /api/keys/purchase 요청
2. 응답: 503 "Service at capacity" (on-chain 전송 없이 거절)
```

### T-09 스테이킹 + 구매 병존

```
전제: 스테이킹 ≥ 10 TON AND 활성 구매 보유

1. 대시보드 → 기존 스테이커 화면 표시 (구매 UI 없음) 확인
2. 크론 실행 → 스테이킹 경로 통과 → SKIP (purchase 미조회)
3. purchase.expiresAt을 과거로 조작 후 크론 재실행 → 스테이킹 유효 → 여전히 SKIP
```

---

## Section 10: 범위 외

- 환불 처리 — 없음 (on-chain 결제 확정 후 비가역적)
- 구매자 전용 rate limit 차등 — 없음 (스테이커와 동일)
- 멀티 플랜 (가격 티어) — 없음 (단일 플랜: 5 TON / 30일)
- 가격 변경 — 환경변수 `PURCHASE_PRICE_TON`으로 추후 대응 가능하나 현재 하드코딩

---

## 변경 파일 요약

| 파일 | 변경 종류 |
|------|----------|
| `lib/key-guards.ts` | `assertStake` → `assertEligibility` 교체 |
| `app/api/keys/issue/route.ts` | 호출 이름 변경 + 키 발급 로직을 `issueKeyForAddress()` 헬퍼로 추출 |
| `app/api/keys/purchase/route.ts` | 신규 |
| `app/api/keys/purchase/renew/route.ts` | 신규 |
| `app/api/cron/check-stakes/route.ts` | revoke 전 purchase 면제 로직 추가 |
| `lib/hooks/usePurchase.ts` | 신규 |
| `app/dashboard/page.tsx` | 레이아웃 분기 + 카드 UI 추가 |
| `.env.example` | `TREASURY_ADDRESS`, `TON_ERC20_ADDRESS` 추가 |
