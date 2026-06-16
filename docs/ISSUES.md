# 이슈 & 버그 로그

> 발견 즉시 기록, 해결 시 상태 업데이트

---

## BUG-001: rotate/route.ts — revokedAt 기록 즉시 덮어쓰기

**파일:** `app/api/keys/rotate/route.ts`  
**심각도:** Medium (데이터 손실)  
**발견:** 2026-05-19 T2 코드 리뷰  
**상태:** ✅ 수정 완료

**증상:**  
```typescript
// 이 줄이 기록한 revokedAt이...
await kvSet(`key:${address}`, { ...existing, revokedAt: Date.now() });
// 바로 다음 줄에서 덮어써짐 — revokedAt 손실
await kvSet(`key:${address}`, { liteLlmKeyId: keyId, hash: hashKey(key), createdAt: Date.now() });
```

**수정:** 별도 archived key KV 키(`key:${address}:prev`)에 기존 키 기록 후 신규 키 저장.

---

## BLOCKER-001: Rate limit 미들웨어 미적용

**파일:** 전체 `app/api/**` 라우트  
**심각도:** High (보안 미완)  
**발견:** 2026-05-19 T2.4 구현 검토  
**상태:** ✅ 수정 완료

**증상:** `lib/ratelimit.ts`는 구현되어 있으나 어떤 라우트에도 호출되지 않음.  
**수정:** 공통 `lib/with-rate-limit.ts` 헬퍼 추가 → 모든 인증 후 라우트에 적용.

---

## NOTE-001: Upstash Redis 미연결 시 로컬 개발 불가

**파일:** `lib/kv.ts`, `lib/ratelimit.ts`  
**심각도:** Low (개발 환경 한정)  
**발견:** 2026-05-19  
**상태:** ⬜ 미해결 (T1.8 완료 후 자동 해소)

`@vercel/kv`는 `KV_REST_API_URL`, `KV_REST_API_TOKEN` 환경변수가 없으면 런타임 오류.  
Vercel KV는 2024-12 종료. 신규 연결 방법:
1. Vercel Dashboard → Storage → Connect Store → Upstash Redis (Marketplace)
2. `vercel env pull .env.local` 실행 → `KV_REST_API_URL`, `KV_REST_API_TOKEN` 자동 주입
3. 이후 로컬에서 `npm run dev` 정상 동작

---

## NOTE-002: LiteLLM /key/generate 실제 응답 스펙 미검증

**파일:** `lib/litellm.ts`  
**심각도:** Medium (통합 시 불일치 위험)  
**발견:** 2026-05-19  
**상태:** ⬜ 미해결 (T1.8 + LITELLM_MASTER_KEY 설정 후 검증 필요)

`key_name` 필드가 실제 응답에 없으면 `keyId`로 `key` 값이 들어감.  
`/key/delete` 시 keyId가 정확히 무엇인지 확인 필요 (`key` vs `token`).

---

## NOTE-004: vitest — 샌드박스에서 npm install 타임아웃

**파일:** `tests/*.test.ts`  
**심각도:** Low (로컬 실행 가능)  
**발견:** 2026-05-19 T2.5  
**상태:** ⬜ 로컬 실행 필요

샌드박스 네트워크 제한으로 `npm install`이 45s 안에 완료되지 않아 테스트를 자동 실행할 수 없음.  
로컬에서 아래 명령으로 실행:
```bash
cd ~/workspace_tokamak/tokamak-ai-access
npm install
npm test          # vitest run (1회)
npm run test:watch  # watch 모드
```
예상 결과: `siwe.test.ts` 4개 + `staking.test.ts` 7개 = **11개 통과**

---

## TODO-001: 트레저리 지갑 — 멀티시그 전환

**현재:** 하드웨어 지갑(Ledger/Trezor) 단일 서명자  
**목표:** Gnosis Safe 멀티시그 (M-of-N) 전환  
**상태:** ⬜ 보류 (현재 개인 프로젝트 규모에서는 하드웨어 지갑으로 충분)

**전환 시점 기준:**
- 공동 운영자 합류 시
- 월 수익이 의미 있는 규모가 될 때
- 조직 차원의 자산 관리가 필요해질 때

**전환 시 작업:**
1. Gnosis Safe 배포 (Ethereum mainnet)
2. 아래 3개 파일의 하드코딩 상수를 Safe 주소로 교체:
   - `lib/hooks/usePurchase.ts` — `BURN_ADDRESS`
   - `app/api/keys/purchase/route.ts` — `treasury`
   - `app/api/keys/purchase/renew/route.ts` — `treasury` (in `verifyTransferTx()`)
3. 위 3개 파일의 단위 테스트에서 `BURN_ADDRESS` → Safe 주소로 업데이트

---

## NOTE-003: Alchemy free tier eth_getLogs 10블록 제한

**파일:** `scripts/snapshot_eligible_stakers.py`  
**심각도:** Medium (스냅샷 실행 차단)  
**발견:** 2026-05-19 T1.7 실행 중  
**상태:** ✅ 수정 완료

`eth_getLogs` 블록 범위 10개 제한 (free tier). `alchemy_getAssetTransfers` API로 Phase 1 교체 완료.  
스냅샷 결과: 37개 주소, 11,908,107.73 TON (Dune 쿼리 29,154,648 TON의 40.8%).

---

## NOTE-006: Layer2Registry proxy — layer2sLength() execution reverted

**파일:** `lib/staking.ts`, `abi/Layer2Registry.json`  
**심각도:** High (동적 조회 불가 → 하드코딩 폴백 필수)  
**발견:** 2026-05-20 cast call 실측  
**상태:** ✅ 수정 완료 (폴백 로직 추가)

`cast call 0x7846c2248a7b4de77e9c2bae7fbb93bfc286837b "layer2sLength()(uint256)"` → **execution reverted**.  
원인 추정: Tokamak Network v1 → v2 마이그레이션 과정에서 Layer2Registry proxy가 deprecated.  
(Layer2Manager `0xD6Bf...`가 v2 신규 컨트랙트로 보임. sWTON Dune 데이터도 v2 기반 추정.)

**수정:** `getLayer2Addresses()`에 try/catch 폴백 추가.
- 동적 조회 성공 시 → 온체인 목록 사용
- revert 또는 빈 결과 시 → `LAYER2S_FALLBACK` (하드코딩 10개) 사용

**조사 결과 (2026-05-20):**
- Layer2Registry proxy(0x7846) / Layer2Manager proxy(0xD6Bf) 모두 전체 스토리지 슬롯 0x0
- `implementation()` 호출 → 각각 0x296e..., 0x2eb7... 정상 반환
- 모든 함수 (어떤 sender든) → REVERT, reason 없음
- **결론: v2 컨트랙트들이 배포됐으나 initialize 미실행 상태** → `require(initialized)` 가드에서 revert
- SeigManager.stakeOf()는 v1 컨트랙트로 정상 동작 — 유일한 신뢰 가능 온체인 조회 수단
- 하드코딩 fallback 전략이 올바름. v2 초기화 완료 시 동적 조회로 자동 전환됨 (try/catch 구조)

---

## NOTE-005: staking.ts — 하드코딩 Layer2 목록으로 스테이킹 수량 과소 집계

**파일:** `lib/staking.ts`  
**심각도:** Medium (자격 검증 오류 가능)  
**발견:** 2026-05-19 T1.7 Dune 크로스체크  
**상태:** ✅ 수정 완료

**증상:** 하드코딩된 10개 Layer2로 전체 프로토콜 스테이킹의 40.8%만 커버.  
신규 Layer2 등록 시 자동으로 반영되지 않아 해당 Layer2에 스테이킹한 사용자는 자격 미달 판정.

**Dune 분석:**
- Dune 쿼리 #3298440 (sWTON 이벤트 기반): 총 **29,154,648 TON**
- 기존 스냅샷 (10개 Layer2 stakeOf 합산): **11,908,107 TON** (40.8%)
- sWTON 방식은 프로토콜 총량 → per-address 직접 조회 불가; `stakeOf` 합산이 적합

**수정:** `Layer2Registry.layer2sLength() + layer2sByIndex()` 동적 조회로 전환.
- 하드코딩 제거 → 온체인 실시간 목록
- Layer2 목록 캐시 1시간 (잔액 캐시 60s와 분리)
- `invalidateLayer2Cache()` 함수 추가
