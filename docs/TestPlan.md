# Test Plan — TON AI Access

> **상태**: Draft v1.0
> **작성일**: 2026-05-19
> **참조**: [FunctionalSpec.md](./FunctionalSpec.md) · [PRD.md](./PRD.md)
> **테스트 실행 파일**: `tests/siwe.test.ts`, `tests/staking.test.ts`, `tests/e2e.md`

---

## 1. 테스트 전략 개요

```
        ┌──────────────┐
        │  E2E (수동)   │  2개 시나리오 — Day 3 T3.4
        ├──────────────┤
        │  통합 (Postman)│  6개 API × 정상+에러 케이스
        ├──────────────┤
        │  단위 (vitest) │  lib/ 모듈 핵심 로직 집중
        └──────────────┘
```

**원칙**
- 비즈니스 크리티컬 경로(키 발급·보안 경계) 최우선 커버
- 프레임워크 코드(Next.js route handler boilerplate)는 제외
- 단위 테스트는 외부 의존성(KV, RPC, LiteLLM) 모두 mock
- 통합 테스트는 실제 Vercel KV + Alchemy RPC 사용 (LiteLLM만 mock 허용)
- E2E는 운영 환경(`NEXT_PUBLIC_CHAIN=sepolia`) 대상 수동 실행

---

## 2. 커버리지 목표 (PoC 기준)

| 영역 | 목표 | 측정 방법 |
|------|------|-----------|
| `lib/siwe.ts` | 분기 100% | vitest coverage |
| `lib/staking.ts` | 분기 100% | vitest coverage |
| `lib/kv.ts` | 핵심 함수 80%+ | vitest coverage |
| `lib/litellm.ts` | 정상·실패 각 1 케이스 | vitest |
| API 6개 (통합) | 정상 1 + 에러 2 이상 / 엔드포인트 | Postman |
| E2E 시나리오 | 2개 완료 (적격·미적격) | 수동 체크리스트 |

---

## 3. 단위 테스트 (vitest)

### 3.1 `tests/siwe.test.ts` — `lib/siwe.ts`

**테스트 대상**: `getSessionAddress(req: NextRequest): Promise<string | null>`

| # | 케이스 | 입력 | 기대 출력 |
|---|--------|------|-----------|
| U-S1 | 유효한 세션 쿠키 | `session_id` 쿠키 존재, KV에 매핑 주소 있음 | 주소 문자열 반환 |
| U-S2 | 세션 쿠키 없음 | 쿠키 헤더 없음 | `null` 반환 |
| U-S3 | 만료된 세션 | `session_id` 존재하나 KV에 키 없음 (TTL 만료) | `null` 반환 |
| U-S4 | KV 조회 오류 | KV mock이 예외 throw | `null` 반환 (throw 전파 X) |

```typescript
// 예시 구조 (tests/siwe.test.ts)
import { describe, it, expect, vi } from 'vitest'
import { getSessionAddress } from '@/lib/siwe'

vi.mock('@/lib/kv', () => ({
  kvGet: vi.fn(),
}))

describe('getSessionAddress', () => {
  it('returns address for valid session', async () => { /* ... */ })
  it('returns null when no cookie', async () => { /* ... */ })
  it('returns null when session expired (KV miss)', async () => { /* ... */ })
})
```

---

### 3.2 `tests/staking.test.ts` — `lib/staking.ts`

**테스트 대상**: `getTotalStakedTON(address: string): Promise<bigint>`

| # | 케이스 | 입력 | 기대 출력 |
|---|--------|------|-----------|
| U-T1 | 단일 Layer2에 스테이킹 | multicall mock: [100 TON ray, 0, 0, ...] | `100n * 10^18n` |
| U-T2 | 복수 Layer2 합산 | multicall mock: [50 TON, 30 TON, 20 TON, ...] | `100n * 10^18n` |
| U-T3 | 스테이킹 없음 | multicall mock: 전부 0 | `0n` |
| U-T4 | 적격 임계값 정확히 100 TON | multicall mock: 100 TON ray 1개 | `100n * 10^18n` (eligible) |
| U-T5 | multicall 일부 실패 | status: 'failure' 포함된 결과 배열 | 성공 항목만 합산 |
| U-T6 | 캐시 히트 | 동일 주소 2회 호출 | 2번째 호출 시 RPC mock 호출 횟수 1 |
| U-T7 | WTON ray → TON 변환 정확도 | `1_000_000_000_000_000_000_000_000_000n` (1 TON in ray) | `1_000_000_000_000_000_000n` (1 TON in wei) |

```typescript
// 예시 — WTON 변환 케이스 (tests/staking.test.ts)
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('viem', async () => {
  const actual = await vi.importActual('viem')
  return { ...actual, createPublicClient: vi.fn(() => ({
    multicall: vi.fn(),
  }))}
})

describe('getTotalStakedTON', () => {
  it('correctly converts WTON ray to TON wei', async () => {
    const ONE_TON_RAY = 10n ** 27n
    mockMulticall([{ status: 'success', result: ONE_TON_RAY }])
    const result = await getTotalStakedTON('0xabc...')
    expect(result).toBe(10n ** 18n)
  })
})
```

---

### 3.3 `tests/kv.test.ts` — `lib/kv.ts` (선택)

| # | 케이스 | 기대 결과 |
|---|--------|-----------|
| U-K1 | `hashKey('sk-abc')` | 동일 입력 → 동일 64자 hex 출력 |
| U-K2 | `hashKey` 다른 입력 | 다른 결과 |
| U-K3 | `kvSet` → `kvGet` | 저장한 값 동일하게 반환 (KV mock) |
| U-K4 | `kvGet` miss | `null` 반환 |

---

## 4. 통합 테스트 (Postman 컬렉션)

**전제**: 로컬 `next dev` 또는 Vercel Preview 환경. Vercel KV 연결 필수. LiteLLM은 실제 또는 mock 서버.

### 4.1 `POST /api/auth/nonce`

| # | 케이스 | 요청 | 기대 응답 |
|---|--------|------|-----------|
| I-N1 | 정상 | `{ "address": "0xf39Fd6...92266" }` | 200 `{ nonce, statement }` |
| I-N2 | 주소 없음 | `{}` | 400 `INVALID_ADDRESS` |
| I-N3 | 잘못된 주소 형식 | `{ "address": "notanaddress" }` | 400 `INVALID_ADDRESS` |

### 4.2 `POST /api/auth/verify`

| # | 케이스 | 요청 | 기대 응답 |
|---|--------|------|-----------|
| I-V1 | 유효한 서명 | 올바른 SIWE message + signature | 200 + `Set-Cookie: session_id` |
| I-V2 | 만료된 nonce | nonce 발급 5분+ 후 요청 | 401 `NONCE_EXPIRED` |
| I-V3 | 잘못된 서명 | 올바른 message + 조작된 signature | 401 `INVALID_SIGNATURE` |
| I-V4 | nonce 재사용 | I-V1 성공 후 동일 요청 재시도 | 401 `INVALID_NONCE` |

### 4.3 `GET /api/staking/balance`

| # | 케이스 | 전제 | 기대 응답 |
|---|--------|------|-----------|
| I-B1 | 적격 지갑 (≥ 100 TON) | 유효 세션, mainnet 스테이킹 지갑 | 200 `{ eligible: true, totalStakedTON: "..." }` |
| I-B2 | 미적격 지갑 (< 100 TON) | 유효 세션, 스테이킹 없는 지갑 | 200 `{ eligible: false }` |
| I-B3 | 세션 없음 | 쿠키 없음 | 401 `UNAUTHORIZED` |
| I-B4 | 캐시 동작 확인 | I-B1 직후 재호출 | 200, RPC 재호출 없음 (응답 시간 < 100ms) |

### 4.4 `POST /api/keys/issue`

| # | 케이스 | 전제 | 기대 응답 |
|---|--------|------|-----------|
| I-I1 | 최초 발급 (적격) | 유효 세션, eligible, KV 키 없음 | 200 `{ key: "sk-litellm-...", model, endpoint }` |
| I-I2 | 중복 발급 | I-I1 이후 동일 세션 재요청 | 409 `KEY_EXISTS` |
| I-I3 | 미적격 지갑 | 유효 세션, ineligible | 403 `INELIGIBLE` |
| I-I4 | 세션 없음 | 쿠키 없음 | 401 `UNAUTHORIZED` |
| I-I5 | 키 보안 검증 | I-I1 성공 후 KV 조회 | KV에 평문 키 없음, hash만 존재 |

### 4.5 `POST /api/keys/rotate`

| # | 케이스 | 전제 | 기대 응답 |
|---|--------|------|-----------|
| I-R1 | 정상 교체 | 유효 세션, 기존 키 존재 | 200 새 `key` 반환 (I-I1 키와 다름) |
| I-R2 | 키 없음 상태에서 rotate | KV에 key:{address} 없음 | 404 `NO_KEY` |
| I-R3 | 미적격 지갑 | eligible → ineligible 후 rotate 시도 | 403 `INELIGIBLE` |

### 4.6 `GET /api/keys/me`

| # | 케이스 | 전제 | 기대 응답 |
|---|--------|------|-----------|
| I-M1 | 키 있음 | 유효 세션, 발급된 키 존재 | 200 `{ hasActiveKey: true, createdAt, lastFour }` |
| I-M2 | 키 없음 | 유효 세션, 미발급 | 200 `{ hasActiveKey: false }` |
| I-M3 | 세션 없음 | 쿠키 없음 | 401 `UNAUTHORIZED` |

### 4.7 Rate Limit

| # | 케이스 | 방법 | 기대 결과 |
|---|--------|------|-----------|
| I-RL1 | IP 초과 | 동일 IP에서 `/api/auth/nonce` 61회 연속 호출 | 61번째 429 `RATE_LIMITED` |
| I-RL2 | 주소 초과 | 동일 세션으로 `/api/staking/balance` 61회 | 61번째 429 |
| I-RL3 | 초기화 확인 | 60초 대기 후 재호출 | 200 정상 응답 |

---

## 5. E2E 시나리오 (수동, Day 3 T3.4)

> 실행 환경: Vercel Preview 또는 `next dev`. Sepolia 테스트넷 지갑 사용 권장.
> 상세 체크리스트: [`tests/e2e.md`](../tests/e2e.md)

### 시나리오 E1 — 적격 지갑 풀 플로우

```
1. 브라우저에서 / 접속
2. "Connect Wallet" 클릭 → MetaMask 팝업 승인
3. SIWE 메시지 서명 → 대시보드 이동
4. "Total Staked: XX.X TON  ✅ Eligible" 확인
5. "Issue API Key" 클릭 → 키 1회 표시, Copy 버튼 확인
6. 키 복사 후 curl 실행:
   curl https://api2.ai.tokamak.network/v1/chat/completions \
     -H "Authorization: Bearer <key>" \
     -H "Content-Type: application/json" \
     -d '{"model":"qwen-3.6","messages":[{"role":"user","content":"respond with: ok"}]}'
7. HTTP 200, choices[0].message.content 비어있지 않음 확인
8. 페이지 새로고침 → 키 표시 사라짐, "Rotate Key" 버튼만 표시
9. CLI 설정 패널 → "Configure Claude Code" 명령 복사·실행 확인
```

**통과 기준**: 모든 단계에서 오류 없이 진행, Step 7 HTTP 200

### 시나리오 E2 — 미적격 지갑

```
1. 스테이킹 없는 지갑으로 로그인
2. 대시보드: "X.X TON  ❌ Not Eligible" 확인
3. "Issue API Key" 버튼 비활성화 또는 숨김 확인
4. "Stake on Tokamak" 링크 클릭 → 외부 페이지 이동 확인
```

**통과 기준**: 키 발급 불가, 안내 UI 정상 표시

---

## 6. 보안 테스트 (코드 리뷰 체크리스트)

| # | 항목 | 검증 방법 |
|---|------|-----------|
| S1 | `LITELLM_MASTER_KEY` 브라우저 미노출 | `NEXT_PUBLIC_` prefix 없음 확인, 빌드 번들 grep |
| S2 | 평문 API 키 KV 미저장 | `lib/kv.ts` `hashKey()` 호출 경로만 저장 확인 |
| S3 | 세션 쿠키 `HttpOnly`, `Secure` 설정 | `Set-Cookie` 응답 헤더 확인 |
| S4 | nonce 1회성 | 동일 nonce로 verify 2회 시도 → 2번째 401 |
| S5 | SIWE 도메인·체인ID 검증 | 잘못된 domain/chainId SIWE 메시지 → 401 |
| S6 | Rate limit 우회 불가 | X-Forwarded-For 조작 시도 |

---

## 7. 테스트 실행 순서 (Day별)

| Day | 작업 | 실행 대상 |
|-----|------|-----------|
| Day 1 | 스텁 작성 | `tests/siwe.test.ts`, `tests/staking.test.ts` (todo 상태) |
| Day 2 T2.5 | 단위 테스트 구현 | vitest 전체 통과 목표 |
| Day 2 T2.6 | 통합 테스트 | Postman 컬렉션 6개 API, I-I5 보안 검증 포함 |
| Day 3 T3.4 | E2E 수동 시나리오 | E1 + E2 체크리스트 전체 통과 |

---

## 8. 알려진 갭 및 PoC 이후 과제

| 갭 | 영향 | PoC 이후 대응 |
|----|------|--------------|
| LiteLLM 실제 서버 mock 의존 | I-I1~I-R1 정확도 제한 | Day 2 실호출로 응답 스펙 확인 후 보정 |
| Layer2 목록 하드코딩 | 신규 Layer2 추가 시 단위 테스트 누락 | T2.2 동적 조회 전환 후 파라미터화 테스트 추가 |
| 프론트엔드 컴포넌트 테스트 없음 | wagmi 훅·UI 분기 미검증 | Playwright 도입 후 컴포넌트 테스트 추가 |
| 부하 테스트 없음 | Rate limit 임계값 실측 불가 | k6 또는 Artillery로 슬라이딩 윈도우 검증 |

---

*참조: [FunctionalSpec.md](./FunctionalSpec.md) · [tests/e2e.md](../tests/e2e.md) · [PRD.md](./PRD.md)*
