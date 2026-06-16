# ADR-002: 스테이킹 서비스 중단 상황에서의 접근 자격 전략

**Status:** Proposed  
**Date:** 2026-05-19  
**Decider:** Theo  
**Relates to:** FunctionalSpec FR-05, lib/staking.ts, GET /api/staking/balance

---

## Context

TON AI Access는 Ethereum L1 TON 스테이커에게 LLM API 키를 발급하는 서비스다.  
그런데 TON 스테이킹 공식 UI가 현재 중단 상태이며, 컨트랙트·가이드·코드만 공개되어 있다.  
신규 스테이킹을 하려면 Etherscan에서 `approveAndCall`을 직접 호출해야 한다.

**결과적 모순:**

> "LLM 키를 얻으려면 ≥100 TON 스테이킹이 필요하다.  
> 스테이킹하려면 스마트 컨트랙트를 직접 호출해야 한다."

이 장벽은 PoC 전환율을 실질적으로 0으로 만든다.

**참고 자료:**
- TokamakStaking 가이드: https://github.com/tokamak-network/TokamakStaking/blob/main/docs/EN/README.md
- 스테이킹 방법: `approveAndCall` 함수, DepositManager 컨트랙트 직접 호출

---

## Options Considered

### Option A: 현상 유지 (Stake-or-nothing)
- 구현 비용: 없음
- **문제:** 기존 스테이커 외 아무도 접근 불가. PoC 실패 위험.

### Option B: 스냅샷 화이트리스트 전용
- 스냅샷 CSV를 KV에 적재, 조회만으로 자격 판정
- **문제:** 신규 사용자 완전 차단. 스냅샷 이후 스테이킹 무시.

### Option C (권장): 3-tier 폴백 자격 체계
아래 3개 조건 중 하나라도 충족하면 `eligible: true`.

### Option D: 인앱 스테이킹 UI 내장
wagmi로 `approve` + `approveAndCall` 플로우를 대시보드에 직접 구현.
- **문제:** 3일 PoC 범위 초과. Post-PoC 로드맵 과제.

---

## Decision: Option C — 3-tier 폴백 자격 체계

자격 판정은 아래 순서로 확인하며, 하나라도 통과하면 즉시 `eligible: true`를 반환한다.

| Tier | 설명 | 체크 방법 | 임계값 | 비고 |
|------|------|-----------|--------|------|
| **T1** | 실시간 스테이킹 잔액 | `SeigManager.stakeOf()` multicall | ≥ 100 TON | 기존 로직 유지 |
| **T2** | 스냅샷 화이트리스트 | KV 조회 (CSV 사전 로드) | 스냅샷 당시 ≥ 100 TON | ~10ms, O(1) |
| **T3** | TON ERC-20 잔액 | `TON.balanceOf()` | ≥ 1000 TON | 스테이킹보다 10× 높은 임계값 |

Tier 3 임계값을 10× 높게 설정하는 이유: 스테이킹 없이 단순 보유만으로 접근하는 경우를 허용하되, 진입 비용을 의미 있게 유지하기 위함이다.

---

## Implementation Changes (PoC 범위)

### 1. `lib/staking.ts`
```typescript
// TON ERC-20 mainnet 주소
const TON_ERC20 = "0x2be5e8c109e2197d077d13a82daead6a9b3433c5"

export async function getTotalStakedTON(address: string): Promise<{
  stakedTon: number;
  walletTon: number;
  snapshotEligible: boolean;
  eligible: boolean;
  eligibleTier: 1 | 2 | 3 | null;
}> {
  // Tier 1: 실시간 stakeOf multicall (기존)
  // Tier 2: KV 스냅샷 조회 (data/eligible_holders.csv → KV 사전 로드)
  // Tier 3: TON balanceOf (신규)
}
```

### 2. `GET /api/staking/balance` 응답 확장
```json
{
  "stakedTon": 5.2,
  "walletTon": 120.0,
  "eligible": true,
  "eligibleTier": 3,
  "minStakeTon": 10,
  "minWalletTon": 100
}
```

### 3. `FunctionalSpec.md` FR-05 업데이트
> "총 스테이킹 잔액 ≥ MIN_TON **또는** 스냅샷 화이트리스트 포함 **또는** TON ERC-20 잔액 ≥ MIN_TON×10 이면 `eligible: true`"

### 4. 스냅샷 CSV → KV 로드 스크립트
```bash
# scripts/load_snapshot_to_kv.ts (신규)
# eligible_holders.csv → Vercel KV에 snapshot:{address} = "1" 형태로 벌크 적재
```

### 5. Ineligible UI 안내 문구 추가
> "현재 스테이킹 서비스 UI가 중단되어 있습니다.  
> 100 TON 이상 보유 시 바로 접근할 수 있으며,  
> 스테이킹 방법은 [가이드]를 참조하세요."

---

## Consequences

**쉬워지는 것:**
- 기존 스테이커 → Tier 1/2로 즉시 접근
- TON 보유자 → Tier 3으로 낮은 기술 장벽 접근
- PoC 전환율 정상화
- 스테이킹 서비스 재개 시 Tier 1이 자동으로 주 경로

**나중에 재검토할 것:**
- Tier 3 임계값 조정 (100 TON이 적절한지 토큰 유통량 기반 재검토)
- 스테이킹 서비스 재개 시 Tier 3 deprecated 여부
- Option D (인앱 스테이킹 UI) 로드맵 반영
- 스냅샷 갱신 주기 정책 (분기별? 이벤트 기반?)

---

## Action Items

- [ ] `lib/staking.ts` — Tier 2 (KV 스냅샷 조회) + Tier 3 (TON balanceOf) 추가
- [ ] `scripts/load_snapshot_to_kv.ts` — CSV → KV 벌크 로드 스크립트 생성
- [ ] `GET /api/staking/balance` — `eligibleTier` 필드 추가
- [ ] `docs/FunctionalSpec.md` FR-05 업데이트
- [ ] 대시보드 Ineligible 화면 안내 문구 업데이트 (wireframe 반영)
