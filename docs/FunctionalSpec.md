# Functional Spec — TON AI Access

> **상태**: Draft v1.0
> **작성일**: 2026-05-19
> **참조**: [HANDOFF.md §4–6](../HANDOFF.md) · [PRD.md](./PRD.md)
> **대상 독자**: 구현 담당자 (셀프), 팀 리뷰어

---

## 1. 개요

TON AI Access는 Ethereum L1 TON 스테이커에게 LiteLLM virtual API key를 자동 발급하는 웹 서비스다. 이 문서는 6개 API 엔드포인트의 정확한 입출력·에러 케이스, Rate limit 정책, 키 생명주기(Lifecycle)를 명시한다.

---

## 2. 기능적 요구사항 (Functional Requirements)

| ID | 요구사항 | 관련 API / 모듈 | 우선순위 |
|----|----------|----------------|----------|
| FR-01 | 사용자는 EVM 호환 지갑(MetaMask)을 연결하고 SIWE 메시지에 서명하여 로그인할 수 있다 | `POST /api/auth/nonce`, `POST /api/auth/verify` | Must |
| FR-02 | 서버는 SIWE 서명을 검증하고 httpOnly 세션 쿠키(TTL 24h)를 발급한다 | `lib/siwe.ts` | Must |
| FR-03 | nonce는 발급 후 5분 이내에만 유효하며 1회 사용 후 즉시 폐기된다 | `POST /api/auth/nonce`, KV | Must |
| FR-04 | 인증된 사용자의 모든 Layer2 스테이킹 잔액을 합산하여 반환한다 (mainnet 10개 Layer2) | `GET /api/staking/balance`, `lib/staking.ts` | Must |
| FR-05 | 아래 3-tier 중 하나라도 충족하면 `eligible: true`를 반환한다 (ADR-002). **Tier1** 실시간 stakeOf 합산 ≥ MIN_TON(10 TON). **Tier2** 스냅샷 화이트리스트(CSV 사전 로드) 포함. **Tier3** TON ERC-20 잔액 ≥ MIN_TON×10(100 TON). 응답에 `eligibleTier: 1\|2\|3\|null` 포함. | `GET /api/staking/balance`, `lib/staking.ts` | Must |
| FR-05a | 스테이킹 서비스 UI 중단으로 신규 스테이킹이 어려운 상황을 고려해 Tier3(TON 보유)을 허용하되, 임계값은 스테이킹 요구량의 10배(100 TON)로 설정한다 | `lib/staking.ts`, 대시보드 안내 | Must |
| FR-06 | 자격이 있는 사용자는 LiteLLM virtual key를 최초 1회 발급받을 수 있다 | `POST /api/keys/issue` | Must |
| FR-07 | 발급된 API 키는 응답에서 1회만 평문으로 노출되며 서버는 SHA-256 hash만 저장한다 | `POST /api/keys/issue`, `lib/kv.ts` | Must |
| FR-08 | 이미 키를 보유한 사용자가 재발급 시도 시 409를 반환하고 rotate를 안내한다 | `POST /api/keys/issue` | Must |
| FR-09 | 사용자는 기존 키를 폐기하고 새 키를 발급받을 수 있다 (rotate) | `POST /api/keys/rotate` | Must |
| FR-10 | rotate 시 자격을 재검증하며 스테이킹 미달이면 403을 반환한다 | `POST /api/keys/rotate` | Must |
| FR-11 | 사용자는 키 보유 여부와 생성일시, hash 앞 4자리를 조회할 수 있다 | `GET /api/keys/me` | Must |
| FR-12 | 미적격 사용자에게는 현재 잔액, 필요 잔액, 스테이킹 안내 링크를 표시한다 | 프론트엔드 대시보드 | Must |
| FR-13 | 키 발급 후 Claude Code / Codex CLI 자동 설정 스크립트 및 안내가 제공된다 | `configure-cli.sh`, `agent-install-guide.md` | Should |
| FR-14 | `NEXT_PUBLIC_CHAIN=sepolia` 환경변수로 Sepolia 테스트넷 전환이 가능하다 | `lib/staking.ts` | Should |
| FR-15 | 잔액 조회 결과는 동일 주소에 대해 60초간 캐시된다 | `lib/staking.ts` | Should |

---

## 3. 비기능적 요구사항 (Non-Functional Requirements)

### 3.1 성능

| ID | 요구사항 | 측정 기준 | 우선순위 |
|----|----------|-----------|----------|
| NFR-P1 | 잔액 조회 API 응답 시간 | ≤ 3s (p95, 캐시 미스 기준) | Must |
| NFR-P2 | 키 발급 API 응답 시간 | ≤ 5s (p95, LiteLLM 왕복 포함) | Must |
| NFR-P3 | 인증 API 응답 시간 | ≤ 1s (p95) | Should |
| NFR-P4 | 캐시 히트 시 잔액 조회 응답 시간 | ≤ 100ms | Should |

### 3.2 보안

| ID | 요구사항 | 검증 방법 | 우선순위 |
|----|----------|-----------|----------|
| NFR-S1 | `LITELLM_MASTER_KEY`는 서버 환경변수에만 존재하며 브라우저로 노출되지 않는다 | 빌드 번들 grep, `NEXT_PUBLIC_` prefix 금지 | Must |
| NFR-S2 | 발급된 API 키 평문은 서버에 저장되지 않는다 (SHA-256 hash만 KV 저장) | 코드 리뷰, KV 직접 조회 | Must |
| NFR-S3 | 세션 쿠키는 `HttpOnly`, `Secure`, `SameSite=Lax` 속성을 갖는다 | 응답 헤더 확인 | Must |
| NFR-S4 | nonce는 1회 사용 후 즉시 폐기되어 재사용이 불가능하다 | 통합 테스트 I-V4 | Must |
| NFR-S5 | SIWE 메시지의 도메인, 체인ID가 서버 기대값과 불일치 시 인증을 거부한다 | 보안 테스트 S5 | Must |
| NFR-S6 | 모든 통신은 HTTPS를 통해 이루어진다 (Vercel 자동 적용) | 배포 환경 확인 | Must |

### 3.3 가용성 및 신뢰성

| ID | 요구사항 | 비고 | 우선순위 |
|----|----------|------|----------|
| NFR-A1 | LiteLLM 서버 오류 시 502를 반환하고 사용자에게 명확한 에러 메시지를 제공한다 | 자동 재시도 없음 (PoC 범위) | Must |
| NFR-A2 | RPC(Alchemy) 호출 실패 시 502를 반환한다 | 60s 캐시로 일시적 장애 완화 | Must |
| NFR-A3 | Vercel KV 장애 시 인증·키 발급 기능이 안전하게 실패한다 (silent pass 금지) | Must | Must |

### 3.4 확장성 및 유지보수성

| ID | 요구사항 | 비고 | 우선순위 |
|----|----------|------|----------|
| NFR-M1 | 자격 임계값(`MIN_TON`)은 환경변수로 코드 수정 없이 변경 가능하다 | `.env.example` 명세 | Must |
| NFR-M2 | Layer2 목록은 향후 `Layer2Registry` 동적 조회로 전환 가능한 구조여야 한다 | T2.2 TODO 주석 명시 | Should |
| NFR-M3 | 모델명(`qwen-3.6`)은 LiteLLM alias로 추상화되어 서버 설정 변경만으로 교체 가능하다 | `lib/litellm.ts` | Should |
| NFR-M4 | 환경변수 전체 목록이 `.env.example`에 문서화되어 있다 | 온보딩 필수 | Must |

### 3.5 제약 사항

| ID | 제약 | 근거 |
|----|------|------|
| NFR-C1 | Ethereum Mainnet 전용 (PoC) | Tokamak TON은 ERC-20, 결정 D1 |
| NFR-C2 | 지갑당 활성 키 1개 제한 | 키 관리 단순화, 결정 D6 |
| NFR-C3 | 서버리스 환경 (Vercel) — 영구 프로세스 없음 | in-process 캐시는 인스턴스 재시작 시 초기화됨 |
| NFR-C4 | LiteLLM 서버(`api2.ai.tokamak.network`)는 외부 의존성 — 서비스 SLA에 직접 영향 | 결정 D5 |

---

## 4. 공통 규칙

### 4.1 인증

모든 인증 필요 엔드포인트는 `session_id` httpOnly 쿠키를 요구한다.

```
Cookie: session_id=<uuid>
```

쿠키 없음 또는 KV에 해당 세션 없음 → `401 Unauthorized`

### 4.2 공통 에러 응답 형식

```json
{
  "error": "HUMAN_READABLE_MESSAGE",
  "code": "MACHINE_CODE"
}
```

### 4.3 공통 응답 헤더

```
Content-Type: application/json
```

---

## 5. API 엔드포인트 명세

---

### 5.1 `POST /api/auth/nonce`

**목적**: SIWE 서명용 1회성 nonce 생성 및 KV 저장

**Auth**: 불필요

**Request Body**

```json
{ "address": "0xABCD...1234" }
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `address` | string | EIP-55 체크섬 Ethereum 주소 |

**Success Response — 200**

```json
{
  "nonce": "a3f8c2d1e9b7",
  "statement": "Sign in to TON AI Access"
}
```

KV에 `nonce:{address}` → `{ nonce, expiresAt: now+5min }` 저장

**Error Cases**

| 코드 | 상황 | 응답 |
|------|------|------|
| `400` | address 누락 또는 형식 불일치 (non-hex, 잘못된 길이) | `{ "error": "Invalid address", "code": "INVALID_ADDRESS" }` |
| `429` | Rate limit 초과 | `{ "error": "Too many requests", "code": "RATE_LIMITED" }` |

---

### 5.2 `POST /api/auth/verify`

**목적**: SIWE 메시지 서명 검증 → 세션 쿠키 발급

**Auth**: 불필요

**Request Body**

```json
{
  "message": "localhost wants you to sign in...\nNonce: a3f8c2d1e9b7\n...",
  "signature": "0x4a3b...e7f2"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `message` | string | EIP-4361 표준 포맷 SIWE 메시지 |
| `signature` | string | EIP-191 개인 서명 (65바이트 hex) |

**처리 흐름**

```
1. siwe 라이브러리로 message 파싱 → address, nonce 추출
2. KV에서 nonce:{address} 조회 → 존재 여부 및 만료 확인
3. message의 nonce == KV nonce 일치 검증
4. siwe.verify(message, signature) → 서명 유효성 검증
5. KV nonce 즉시 삭제 (재사용 방지)
6. KV에 session:{uuid} 저장 (TTL 24h)
7. Set-Cookie: session_id=<uuid>; HttpOnly; Secure; SameSite=Lax
```

**Success Response — 200**

```json
{ "ok": true }
```

**Error Cases**

| 코드 | 상황 | 응답 |
|------|------|------|
| `400` | message 또는 signature 누락 | `{ "error": "Missing fields", "code": "MISSING_FIELDS" }` |
| `401` | nonce 만료 (5분 초과) | `{ "error": "Nonce expired", "code": "NONCE_EXPIRED" }` |
| `401` | nonce 불일치 | `{ "error": "Invalid nonce", "code": "INVALID_NONCE" }` |
| `401` | 서명 검증 실패 | `{ "error": "Signature verification failed", "code": "INVALID_SIGNATURE" }` |
| `429` | Rate limit 초과 | `{ "error": "Too many requests", "code": "RATE_LIMITED" }` |

---

### 5.3 `GET /api/staking/balance`

**목적**: 세션 지갑의 현재 스테이킹 잔액 + 자격 여부 반환

**Auth**: 세션 쿠키 필요

**Request**: Body 없음

**처리 흐름**

```
1. session_id 쿠키 → KV에서 address 조회
2. 캐시 확인: cache.get("mainnet:{address}") 존재 & TTL 유효 → 캐시 반환
3. viem multicall:
     SeigManagerProxy.stakeOf(layer2_i, address) × 10개 Layer2
   각 결과 / 10^9 → 18-decimal TON 합산
4. eligible = totalStakedTON >= MIN_TON * 10^18
5. 캐시 갱신 (TTL 60s)
```

**Success Response — 200**

```json
{
  "address": "0xABCD...1234",
  "totalStakedTON": "42700000000000000000",
  "totalStakedTONFormatted": "42.7",
  "eligible": true
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `totalStakedTON` | string | 18-decimal bigint 문자열 (wei 단위) |
| `totalStakedTONFormatted` | string | 표시용 소수점 포맷 |
| `eligible` | boolean | totalStakedTON ≥ MIN_TON × 10^18 |

**Error Cases**

| 코드 | 상황 | 응답 |
|------|------|------|
| `401` | 세션 없음 또는 만료 | `{ "error": "Unauthorized", "code": "UNAUTHORIZED" }` |
| `502` | RPC 호출 실패 (Alchemy 불응답) | `{ "error": "RPC error", "code": "RPC_ERROR" }` |
| `429` | Rate limit 초과 | `{ "error": "Too many requests", "code": "RATE_LIMITED" }` |

---

### 5.4 `POST /api/keys/issue`

**목적**: LiteLLM virtual key 최초 발급 (1회만 평문 반환)

**Auth**: 세션 쿠키 필요

**Request**: Body 없음

**처리 흐름**

```
1. 세션에서 address 확인
2. KV key:{address} 존재 여부 조회
   → 존재 시 409 반환
3. 잔액 재검증 (getTotalStakedTON 호출, 캐시 허용)
   → eligible = false 시 403 반환
4. LiteLLM POST /key/generate (master key 사용):
   { "models": ["qwen-3.6"], "metadata": { "owner": address } }
5. 응답에서 key (sk-litellm-...) 및 key_id 추출
6. KV key:{address} 저장:
   { liteLlmKeyId, hash: sha256(key), createdAt }
7. key를 응답에 포함해 1회 반환 (이후 재조회 불가)
```

**Success Response — 200**

```json
{
  "key": "sk-litellm-xxxxxxxxxxxxxxxxxxxxxxxx",
  "model": "qwen-3.6",
  "endpoint": "https://api2.ai.tokamak.network",
  "createdAt": "2026-05-19T10:00:00Z"
}
```

> ⚠️ `key` 필드는 이 응답에서만 반환됨. 이후 `/api/keys/me`는 hash 기반 `lastFour`만 반환.

**Error Cases**

| 코드 | 상황 | 응답 |
|------|------|------|
| `401` | 세션 없음 | `{ "error": "Unauthorized", "code": "UNAUTHORIZED" }` |
| `403` | 스테이킹 미달 (< 10 TON) | `{ "error": "Insufficient stake", "code": "INELIGIBLE" }` |
| `409` | 이미 발급된 키 존재 | `{ "error": "Key already issued. Use rotate to replace.", "code": "KEY_EXISTS" }` |
| `502` | LiteLLM /key/generate 실패 | `{ "error": "Key generation failed", "code": "LITELLM_ERROR" }` |
| `429` | Rate limit 초과 | `{ "error": "Too many requests", "code": "RATE_LIMITED" }` |

---

### 5.5 `POST /api/keys/rotate`

**목적**: 기존 키 폐기 + 신규 키 발급

**Auth**: 세션 쿠키 필요

**Request**: Body 없음

**처리 흐름**

```
1. 세션에서 address 확인
2. 잔액 재검증 → eligible = false 시 403
3. KV key:{address} 조회 → liteLlmKeyId 획득
4. LiteLLM POST /key/delete: { "keys": [liteLlmKeyId] }
   (실패해도 계속 진행 — 이미 없는 키일 수 있음)
5. LiteLLM POST /key/generate (3.4와 동일)
6. KV key:{address} 갱신:
   { liteLlmKeyId: new, hash: sha256(newKey), createdAt: now, prevRevokedAt: now }
7. 신규 key 1회 반환
```

**Success Response — 200**

```json
{
  "key": "sk-litellm-yyyyyyyyyyyyyyyyyyyyyyyy",
  "model": "qwen-3.6",
  "endpoint": "https://api2.ai.tokamak.network",
  "createdAt": "2026-05-19T12:00:00Z"
}
```

**Error Cases**

| 코드 | 상황 | 응답 |
|------|------|------|
| `401` | 세션 없음 | `{ "error": "Unauthorized", "code": "UNAUTHORIZED" }` |
| `403` | 스테이킹 미달 | `{ "error": "Insufficient stake", "code": "INELIGIBLE" }` |
| `404` | 발급된 키 없음 (issue 먼저 필요) | `{ "error": "No active key found", "code": "NO_KEY" }` |
| `502` | LiteLLM 오류 | `{ "error": "Key rotation failed", "code": "LITELLM_ERROR" }` |
| `429` | Rate limit 초과 | `{ "error": "Too many requests", "code": "RATE_LIMITED" }` |

---

### 5.6 `GET /api/keys/me`

**목적**: 현재 지갑의 키 보유 여부 및 메타데이터 조회

**Auth**: 세션 쿠키 필요

**Request**: Body 없음

**처리 흐름**

```
1. 세션에서 address 확인
2. KV key:{address} 조회
3. 존재하면 hash 앞 4자리를 lastFour로 반환
   (평문 키 비교나 재노출 없음)
```

**Success Response — 200 (키 있음)**

```json
{
  "hasActiveKey": true,
  "createdAt": "2026-05-19T10:00:00Z",
  "lastFour": "a3f8"
}
```

**Success Response — 200 (키 없음)**

```json
{
  "hasActiveKey": false
}
```

**Error Cases**

| 코드 | 상황 | 응답 |
|------|------|------|
| `401` | 세션 없음 | `{ "error": "Unauthorized", "code": "UNAUTHORIZED" }` |
| `429` | Rate limit 초과 | `{ "error": "Too many requests", "code": "RATE_LIMITED" }` |

---

## 6. Rate Limit 정책

| 차원 | 알고리즘 | 한도 | 구현 |
|------|----------|------|------|
| IP 기반 | Sliding Window | 60 req / 60s | `@upstash/ratelimit` + Upstash Redis |
| 지갑 주소 기반 | Sliding Window | 60 req / 60s | `@upstash/ratelimit` + Upstash Redis |

**적용 위치**: Next.js Middleware (`middleware.ts`) — 모든 `/api/*` 경로에 선행 적용

**초과 시 응답**:
```
HTTP 429 Too Many Requests
Retry-After: 60
{ "error": "Too many requests", "code": "RATE_LIMITED" }
```

**예외**: `/api/auth/nonce`, `/api/auth/verify`는 IP 기반만 적용 (세션 없으므로 주소 기반 불가)

---

## 7. 키 생명주기 (Key Lifecycle)

```
                ┌─────────────────────────────────────────┐
                │             지갑 연결 + SIWE 인증         │
                └───────────────────┬─────────────────────┘
                                    │
                          eligible? (≥ 10 TON)
                         ┌──────────┴──────────┐
                        YES                    NO
                         │                     │
                         ▼                     ▼
              ┌─────────────────┐    ┌─────────────────────┐
              │  NONE (발급 전)  │    │  INELIGIBLE (표시만)  │
              └────────┬────────┘    └─────────────────────┘
                       │
              POST /api/keys/issue
                       │
                       ▼
              ┌─────────────────┐
              │  ACTIVE (발급됨)  │◄──────────────────────┐
              │  key 1회 노출    │                        │
              └────────┬────────┘                        │
                       │                                  │
           ┌───────────┴────────────┐                     │
           │                        │                     │
  POST /api/keys/rotate     stake 감소 (< 10 TON)          │
           │                        │                     │
           ▼                        ▼                     │
  ┌─────────────────┐    ┌──────────────────────┐         │
  │ 기존 키 REVOKED  │    │ 키 유지 (서버)         │         │
  │ (LiteLLM delete)│    │ 단, 신규 발급·교체 불가 │         │
  └────────┬────────┘    └──────────────────────┘         │
           │                                               │
           │   신규 ACTIVE key 발급 완료                    │
           └───────────────────────────────────────────────┘
```

### 상태 정의

| 상태 | 조건 | 가능한 전환 |
|------|------|------------|
| `NONE` | `key:{address}` KV 없음 | → `ACTIVE` (issue) |
| `ACTIVE` | KV 존재, `revokedAt` 없음 | → `REVOKED` (rotate 내부), → `ACTIVE` (rotate 완료) |
| `REVOKED` | LiteLLM key_delete 완료, rotate 중간 상태 | → `ACTIVE` (신규 발급 완료) |

---

## 8. Upstash Redis 키 스키마

> **스토리지**: Upstash Redis (Vercel Marketplace 연결).  
> Vercel KV는 2024-12 종료. `@vercel/kv` 패키지는 내부적으로 Upstash REST API를 그대로 사용하므로 코드 변경 불필요.

```
nonce:{address}
  └─ { nonce: string, expiresAt: number }   TTL 5분

session:{sessionId}
  └─ { address: string, issuedAt: string, expiresAt: string }  TTL 24시간

key:{address}
  └─ { liteLlmKeyId: string, hash: string, createdAt: string }  (영구)

key:{address}:prev
  └─ { liteLlmKeyId: string, hash: string, createdAt: string, revokedAt: string }  (rotate 시 이전 키 아카이브)

ratelimit:ip:{ip}          → counter  TTL 60s  (Upstash 내부 관리)
ratelimit:addr:{address}   → counter  TTL 60s  (Upstash 내부 관리)
```

**Upstash Redis 무료 한도** (2026 기준): 요청 10,000건/일, 저장 256MB, 전송 1GB/월.  
이 PoC의 예상 사용량은 한도 대비 1% 미만.

---

## 9. LiteLLM 연동 명세

**Base URL**: `process.env.LITELLM_BASE_URL` (예: `https://api2.ai.tokamak.network`)

**인증**: `Authorization: Bearer {LITELLM_MASTER_KEY}`

### 키 발급

```http
POST /key/generate
Authorization: Bearer {LITELLM_MASTER_KEY}
Content-Type: application/json

{
  "models": ["qwen-3.6"],
  "metadata": { "owner": "0xABCD...1234" }
}
```

**기대 응답**:
```json
{
  "key": "sk-litellm-...",
  "key_name": "...",
  "models": ["qwen-3.6"]
}
```

> ⚠️ 실제 LiteLLM 응답 스펙은 Day 2 T2.3에서 master key로 1회 실호출하여 확인 필요.

### 키 폐기

```http
POST /key/delete
Authorization: Bearer {LITELLM_MASTER_KEY}
Content-Type: application/json

{
  "keys": ["sk-litellm-..."]
}
```

---

## 10. 환경변수 의존성

| 변수 | 사용 위치 | 비고 |
|------|----------|------|
| `LITELLM_BASE_URL` | `lib/litellm.ts` | LiteLLM 서버 주소 |
| `LITELLM_MASTER_KEY` | `lib/litellm.ts` | 서버 전용, 절대 브라우저 노출 금지 |
| `RPC_URL` | `lib/staking.ts` | Alchemy mainnet |
| `RPC_URL_SEPOLIA` | `lib/staking.ts` | Alchemy Sepolia |
| `KV_REST_API_URL` | `lib/kv.ts` | Upstash Redis (Vercel Marketplace 자동 주입) |
| `KV_REST_API_TOKEN` | `lib/kv.ts` | Upstash Redis (Vercel Marketplace 자동 주입) |
| `SESSION_SECRET` | `lib/siwe.ts` | iron-session 암호화 |
| `MIN_TON` | `app/api/staking/balance`, `app/api/keys/issue` | 자격 임계값 (기본 10) |
| `NEXT_PUBLIC_CHAIN` | `lib/staking.ts` | `mainnet` 또는 `sepolia` |

---

*참조: [PRD.md](./PRD.md) · [TestPlan.md](./TestPlan.md) · [HANDOFF.md §4–6](../HANDOFF.md)*
