# PRD — TON AI Access

> **상태**: Draft v1.0
> **작성일**: 2026-05-19
> **작성자**: Theo (lbh4980@gmail.com)
> **용도**: 셀프 체크 + 팀 공유
> **범위**: 3일 PoC (2026-05-19 ~ 2026-05-21)

---

## 1. 배경 및 문제 정의

Tokamak Network는 Ethereum L1 위에서 운영되는 TON(ERC-20) 기반 스테이킹 생태계다. 현재 10개 이상의 Layer2 오퍼레이터가 활성화되어 있고, 수백~수천 개의 지갑이 TON을 스테이킹 중이다.

**문제**: LiteLLM 기반 AI 서비스(`api2.ai.tokamak.network`)를 운영 중이지만, 접근 권한 부여 방식이 수동이다. 생태계 기여자(스테이커)에게 자동으로 API 접근권을 부여할 수단이 없다.

**기회**: TON 스테이킹은 온체인에서 즉시 검증 가능하다. SIWE(Sign-In With Ethereum) 인증과 결합하면, 서버 비밀번호 없이도 "스테이킹 증명 → API 키 발급" 파이프라인을 완전 자동화할 수 있다.

---

## 2. 목표 (Goals)

### PoC 목표 (3일)
- Vercel에 Next.js 앱을 배포하고 외부 접속 가능한 URL 확보
- 적격 지갑: connect → sign → key 발급 → `curl qwen-3.6` → 200 응답 E2E 완성
- 미적격 지갑: "Not eligible" UI + 스테이킹 안내 링크 표시
- 운영 서버(`api2.ai.tokamak.network`) 실제 LiteLLM 키 발급 성공

### 비목표 (Non-goals, PoC 범위 외)
- TON 스테이킹 기능 자체 구현
- 다중 체인 지원 (Ethereum L1 전용)
- 관리자 대시보드 / 키 사용량 통계
- 이메일·소셜 로그인
- 모바일 최적화 UI
- 99.9% SLA 인프라

---

## 3. 성공 지표 (PoC 기준)

| 지표 | 기준 | 측정 방법 |
|------|------|-----------|
| 배포 완료 | Day 3 마감 전 Vercel URL 접속 가능 | 브라우저로 확인 |
| E2E 적격 플로우 | connect → sign → issue → curl → HTTP 200 | 수동 E2E (`tests/e2e.md`) |
| E2E 미적격 플로우 | "Not eligible" UI 노출 + 스테이킹 링크 | 수동 E2E |
| API 응답 시간 | 잔액 조회 ≤ 3s, 키 발급 ≤ 5s (p95) | 브라우저 DevTools |
| 키 보안 정책 | 서버에 평문 키 없음 (SHA-256 hash만 KV 저장) | 코드 리뷰 |
| Rate limit 동작 | 동일 IP 60 req/min 초과 시 429 반환 | curl 반복 호출 |

---

## 4. 페르소나

### Persona A — Alex, TON 개인 스테이커

| 항목 | 내용 |
|------|------|
| **역할** | 개인 투자자 겸 DeFi 사용자 |
| **기술 수준** | MetaMask 사용 경험 있음. curl은 알지만 터미널이 주 도구는 아님 |
| **TON 보유** | tokamak1 Layer2에 35 TON 스테이킹 중 |
| **목표** | LiteLLM AI 모델을 빠르게 써보고 싶다. 별도 가입 없이 지갑으로 인증되길 원한다 |
| **불만** | "또 가입 폼이야? 이메일 인증? 그냥 지갑으로 하면 안 되나?" |
| **핵심 JTBD** | 지갑 연결만으로 AI API 키를 받아 즉시 사용하고 싶다 |

### Persona B — Bella, 오퍼레이터 팀 개발자

| 항목 | 내용 |
|------|------|
| **역할** | Tokamak Network 오퍼레이터 팀 소속 백엔드 개발자 |
| **기술 수준** | curl, Claude Code, Codex CLI 등 개발 도구에 익숙 |
| **TON 보유** | 회사 지갑에 500 TON 이상 스테이킹 |
| **목표** | AI 도구를 CI/CD나 내부 스크립트에 연동하고 싶다. 키를 재발급하거나 갱신하는 과정이 자동화되길 원한다 |
| **불만** | "키 발급하려고 슬랙에 DM해야 한다고? API로 해결 안 되나?" |
| **핵심 JTBD** | 온체인 자격을 증명하고 프로그래밍 방식으로 AI API 키를 관리하고 싶다 |

---

## 5. 유저 스토리

### US-1. 지갑 연결 및 SIWE 로그인
> **As** Alex (개인 스테이커),
> **I want to** MetaMask로 지갑을 연결하고 SIWE 메시지에 서명해서 로그인하고 싶다,
> **So that** 이메일·비밀번호 없이 Ethereum 지갑으로 서비스를 이용할 수 있다.

**Acceptance Criteria:**
- Connect Wallet 버튼 클릭 시 MetaMask 팝업이 뜬다
- 서명 완료 후 서버가 SIWE 서명을 검증하고 httpOnly 세션 쿠키를 발급한다
- 재로드 시 세션이 유지된다 (24시간)
- 서명 거부 시 오류 메시지가 표시된다

---

### US-2. 스테이킹 잔액 및 자격 확인
> **As** Alex,
> **I want to** 대시보드에서 내 총 스테이킹 잔액(TON)과 자격 여부를 확인하고 싶다,
> **So that** API 키를 발급받을 수 있는지 즉시 알 수 있다.

**Acceptance Criteria:**
- 로그인 직후 모든 Layer2의 stakeOf 합산 결과가 표시된다
- 총 스테이킹 ≥ 100 TON이면 "✅ Eligible" 표시
- 총 스테이킹 < 100 TON이면 "❌ Not Eligible" + 스테이킹 안내 링크
- 잔액 조회는 60초 캐시 (동일 지갑 재호출 시 캐시 사용)

---

### US-3. API 키 발급
> **As** Alex (자격 있는 스테이커),
> **I want to** 버튼 하나로 LiteLLM API 키를 발급받고 싶다,
> **So that** 즉시 qwen-3.6 모델을 curl로 호출해볼 수 있다.

**Acceptance Criteria:**
- "Issue API Key" 버튼이 적격자에게만 표시된다
- 키는 화면에 1회만 표시되고 Copy 버튼이 함께 제공된다
- "이 키는 다시 표시되지 않습니다" 경고 문구 노출
- 이미 발급된 키가 있을 때 재발급 시도 시 409 에러 + Rotate 안내

---

### US-4. API 키 교체 (Rotate)
> **As** Bella (개발자),
> **I want to** 기존 키를 폐기하고 새 키를 발급받고 싶다,
> **So that** 키가 유출되었거나 분실했을 때 보안을 유지할 수 있다.

**Acceptance Criteria:**
- "Rotate Key" 버튼 클릭 시 확인 다이얼로그가 뜬다
- 확인 후 기존 LiteLLM 키가 revoke되고 새 키가 발급된다
- 새 키는 1회만 화면에 표시된다
- Rotate 중 자격 재검증이 이루어진다 (< 100 TON이면 403)

---

### US-5. Claude Code / Codex CLI 자동 설정
> **As** Bella,
> **I want to** 발급된 API 키로 Claude Code와 Codex CLI를 자동 설정하고 싶다,
> **So that** 터미널에서 환경변수를 수동으로 편집하지 않아도 바로 AI 도구를 쓸 수 있다.

**Acceptance Criteria:**
- 키 발급 직후 "Configure Claude Code / Codex" 패널이 표시된다
- 원클릭 복사 가능한 shell 명령이 제공된다
- `--non-interactive` 모드로 실행 시 env 블록이 idempotent하게 쉘 프로파일에 추가된다
- `~/.claude/settings.json`과 `~/.codex/config.toml`이 자동 업데이트된다

---

### US-6. 미적격 사용자 안내
> **As** 자격 미달 스테이커,
> **I want to** 내가 왜 API 키를 받을 수 없는지 이해하고 어떻게 자격을 갖출 수 있는지 알고 싶다,
> **So that** Tokamak 스테이킹 페이지로 이동해 TON을 추가 스테이킹할 수 있다.

**Acceptance Criteria:**
- 현재 스테이킹 잔액과 필요 잔액(100 TON)이 명시된다
- "Stake on Tokamak" 링크가 `tokamak.network/staking`으로 연결된다
- 키 발급 버튼은 비활성화 또는 숨김 처리된다

---

## 6. 시스템 범위

### In Scope (PoC 포함)

| 영역 | 항목 |
|------|------|
| **인증** | SIWE EIP-4361, httpOnly 세션 쿠키 (24h TTL) |
| **자격 검증** | viem multicall → SeigManagerV1_3.stakeOf (mainnet 10개 Layer2 합산) |
| **키 관리** | 발급 · 교체 · 보유 여부 조회 (LiteLLM `/key/generate`, `/key/delete`) |
| **보안** | 평문 키 서버 미보관, SHA-256 hash만 KV 저장, master key Vercel env only |
| **Rate limit** | IP 기반 · 주소 기반 슬라이딩 윈도우 60 req/min |
| **CLI 설정** | configure-cli.sh, agent-install-guide.md |
| **테스트넷** | Sepolia 지원 (`NEXT_PUBLIC_CHAIN=sepolia` 전환) |
| **배포** | Vercel (Next.js App Router Serverless) + Vercel KV |

### Out of Scope (PoC 제외)

| 항목 | 이유 |
|------|------|
| TON 스테이킹 UI | 외부 서비스 (tokamak.network) |
| 이메일/소셜 로그인 | PoC 타깃이 아님 |
| 관리자 콘솔 (키 사용량, 사용자 목록) | Day 3 이후 과제 |
| 다중 체인 (Polygon, Base 등) | 미확정 |
| 키 만료 자동화 (cron revoke) | 운영 과제 |
| 모바일 반응형 최적화 | 개발 도구 사용자 타깃으로 데스크톱 우선 |
| GDPR / 개인정보 정책 | PoC 단계 제외 |

---

## 7. 기술 스택 요약

| 구분 | 선택 | 근거 |
|------|------|------|
| 프레임워크 | Next.js 14 App Router | Serverless API + SSR 일체화, Vercel 최적 |
| 인증 | siwe + iron-session | EIP-4361 표준, httpOnly 쿠키 |
| 온체인 | viem + wagmi v2 | TypeScript 타입 안전성, multicall 지원 |
| DB | Vercel KV (Upstash Redis) | Serverless 호환, TTL 기본 지원 |
| AI 프록시 | LiteLLM (기존 서버) | 기 운영 중, `/key/generate` API 제공 |
| Rate limit | @upstash/ratelimit | Vercel KV 연동, sliding window |
| 배포 | Vercel | Next.js 공식 호스팅, env 관리 통합 |

---

## 8. 핵심 제약 사항

1. **LiteLLM master key**는 Vercel 환경변수(`LITELLM_MASTER_KEY`)에만 존재. 브라우저로 절대 노출 금지.
2. **발급 키 평문**은 서버에 저장하지 않음. 응답 1회 후 SHA-256 hash만 KV에 보관.
3. **스테이킹 임계값** 100 TON은 `MIN_TON` 환경변수로 변경 가능 (PoC 기본값).
4. **Layer2 목록**은 현재 하드코딩 10개. `Layer2Registry` 동적 조회는 T2.2 TODO.
5. **`data/eligible_holders.csv`**는 gitignore 필수 (지갑 주소 포함).

---

## 9. 리스크 및 완화 방안

| 리스크 | 발생 가능성 | 영향 | 완화 |
|--------|------------|------|------|
| LiteLLM `/key/generate` 응답 스펙 불일치 | 중 | 高 | Day 2 초반 master key로 1회 실호출, 스펙 확인 선행 |
| Alchemy RPC free tier 속도 제한 | 중 | 中 | 60s 캐시로 중복 호출 억제; 스냅샷은 별도 스크립트 |
| SIWE ↔ viem 메시지 포맷 불일치 | 저 | 高 | EIP-4361 표준 포맷 고수, siwe-js 공식 예제 참조 |
| Vercel KV cold start 지연 | 저 | 低 | nonce TTL 5분으로 충분한 여유 |
| 적격 Layer2 신규 추가 시 누락 | 저 | 中 | T2.2에서 Layer2Registry 동적 조회로 전환 예정 |

---

## 10. 3일 마일스톤

| Day | 완료 기준 |
|-----|----------|
| **Day 1** (설계 + 골격) | ABI 확정, 문서 완성, 스냅샷 스크립트 실행, Vercel 프로젝트 생성 |
| **Day 2** (API 구현) | SIWE 인증, staking 조회, 키 발급/교체 API 로컬 동작 확인 |
| **Day 3** (프론트 + 배포) | wagmi 연동, 대시보드 UI, E2E 적격/미적격 시연, `vercel --prod` 배포 |

**PoC 성공 조건**: Day 3 마감 전 Vercel URL에서 E2E 플로우(connect → sign → issue → curl → 200) 재현 가능.

---

*참조: [HANDOFF.md](../HANDOFF.md) · [FunctionalSpec.md](./FunctionalSpec.md) · [TestPlan.md](./TestPlan.md)*
