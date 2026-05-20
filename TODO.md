# 일일 TODO — TON AI Access PoC

> 상태: ⬜ 미시작 · 🔄 진행 중 · ✅ 완료 · ❌ 블로킹

---

## Day 1 — 2026-05-19 (설계 확정 & 골격)

### 오전
- ✅ **T1.0** HANDOFF.md 기반 Cowork 세션 시작, 컨텍스트 로드
- ✅ **T1.6** Next.js 모노레포 골격 생성 (`app/`, `lib/`, `abi/`, `scripts/`, `docs/`, `tests/`)
- ✅ **T1.P** CLI 설정 플러그인 골격 생성 (`scripts/configure-cli.sh`, `docs/agent-install-guide.md`)
- ✅ **T1.1** 컨트랙트 ABI 확정
  - [x] `abi/SeigManagerV1_3.json` — mainnet+sepolia impl/proxy 주소, stakeOf 셀렉터 `0xce4cb876` 검증
  - [x] `abi/DepositManagerV1_1.json` — Deposited topic0 `0x8752a472...` keccak256 검증
  - [x] `abi/Layer2Registry.json` — layer2sLength `0x8dcbb0da`, layer2sByIndex `0xac8d8c35`, isLayer2 `0x95a97f48` 검증
  - [x] `lib/staking.ts` — mainnet/sepolia 멀티네트워크 지원, ABI JSON import로 전환

### 오후
- ✅ **T1.2** PRD 작성 → `docs/PRD.md` 완성
  - [x] 페르소나 2개 정의 (Alex 개인 스테이커, Bella 오퍼레이터 개발자)
  - [x] 유저 스토리 6개 (US-1~US-6, JTBD 포함)
  - [x] 성공 지표 6개 (배포·E2E·응답시간·보안·Rate limit)
  - [x] In/Out 스코프 명시
- ✅ **T1.3** 기능정의서 → `docs/FunctionalSpec.md` 완성
  - [x] API 6개 정상·실패 케이스 전체 기술 (에러코드 포함)
  - [x] Rate limit 정책 구체화 (IP + 주소 슬라이딩 윈도우)
  - [x] Key lifecycle 상태도 (NONE → ACTIVE → REVOKED → ACTIVE)
  - [x] KV 스키마 상세, LiteLLM 연동 명세, 환경변수 의존성 표
- ✅ **T1.4** 테스트 설계서 → `docs/TestPlan.md` 완성
  - [x] 단위 테스트 매트릭스 (vitest) — siwe 4케이스, staking 7케이스, kv 4케이스
  - [x] 통합 테스트 케이스 (Postman) — API 6개 × 정상+에러, rate limit 3케이스
  - [x] E2E 시나리오 2개 (E1 적격 풀플로우, E2 미적격 안내)
  - [x] 보안 체크리스트 6항목, 알려진 갭 및 PoC 이후 과제
- ✅ **T1.5** 와이어프레임 확정 (0.5h) → `docs/wireframe.html` (인터랙티브 HTML, PATTERN-asymmetric-split.md 기반)
  - [x] 6개 화면 구현 (Landing / Eligible-NoKey / KeyReveal / CLISetup / KeyActive / Ineligible)
  - [x] CLI 설정 패널 — 2탭 (에이전트 실행 / 직접 실행) + 복사 버튼 — 에이전트 위임 방식으로 재설계
  - [x] `design:ux-copy` 스킬로 카피 작성 완료
  - [x] 디자인 토큰 전부 PATTERN 명세 준수 (grid, radius, font, color)
  - [x] Asymmetric Editorial Split 패턴 적용 — 1/3 narrow (메타데이터) + 2/3 wide (콘텐츠)
- ⬜ **T1.7** 적격자 스냅샷 실행 (1h)
  - [ ] `pip install "web3==7.*" python-dotenv`
  - [ ] `RPC_URL` 환경변수 세팅
  - [ ] `python scripts/snapshot_eligible_stakers.py` 실행
  - [ ] `data/eligible_holders.csv` 결과 검토
  - [ ] Dune SQL 병행 실행 → cross-check
- ⬜ **T1.8** Vercel 프로젝트 생성 + env 설정 (0.5h)
  - [ ] `vercel link` 또는 대시보드에서 프로젝트 생성
  - [ ] `LITELLM_BASE_URL`, `LITELLM_MASTER_KEY` 설정
  - [ ] `RPC_URL` 설정
  - [ ] Upstash Redis 연결 (Vercel Dashboard → Storage → Connect Store → Upstash Redis) → `KV_REST_API_URL`, `KV_REST_API_TOKEN` 자동 주입
  - [ ] `SESSION_SECRET` 생성 (`openssl rand -base64 32`)

---

## Day 2 — 2026-05-20 (Serverless API + LiteLLM 연동)

- ✅ **T2.1** SIWE 통합 + nonce/verify 라우트
  - [x] `siwe` 라이브러리 연동 완료 (nonce/route.ts, verify/route.ts, lib/siwe.ts)
  - [x] Rate limit 적용 (checkRateLimit)
  - [ ] 로컬 쿠키 테스트 ← T1.8(Vercel KV) 완료 후 가능
- ✅ **T2.2** `lib/staking.ts` 완성
  - [x] `getTotalStakedTON()` multicall 구현 (27→18 decimal 변환)
  - [x] Layer2Registry 동적 조회 (`layer2sLength + layer2sByIndex`) — 하드코딩 제거
  - [x] Layer2 목록 캐시 1시간 + 잔액 캐시 60s 분리, `invalidateLayer2Cache()` 추가
  - [x] `GET /api/staking/balance` — `minTon` 필드 추가
  - [x] Dune 크로스체크 → 동적 조회로 전체 Layer2 커버 (NOTE-005 참조)
  - [ ] 실지갑 multicall 검증 ← T1.8 완료 후
- ✅ **T2.3** API keys/* 라우트 완성
  - [x] `POST /api/keys/issue` — 잔액 재검증 → LiteLLM → hash 저장
  - [x] `POST /api/keys/rotate` — BUG-001(revokedAt 덮어쓰기) 수정, :prev 키에 아카이브
  - [x] `GET /api/keys/me` — hasActiveKey, lastFour 반환
  - [x] Rate limit 전체 라우트 적용
  - [ ] LiteLLM 실호출 응답 스펙 검증 ← NOTE-002, T1.8 완료 후
- ✅ **T2.4** Rate limit 미들웨어
  - [x] `lib/with-rate-limit.ts` — IP + 주소 양방향 checkRateLimit() 헬퍼
  - [x] 6개 API 라우트 전체 적용 (nonce, verify, balance, issue, rotate, me)
- ✅ **T2.5** 단위 테스트 (vitest)
  - [x] `tests/siwe.test.ts` — 4케이스 구현 (valid, no-cookie, null-kv, expired)
  - [x] `tests/staking.test.ts` — 7케이스 구현 (sum, zero, decimal, cache, invalidate, partial-fail, all-fail)
  - [ ] `npm test` 로컬 실행 검증 ← NOTE-004 참조
- ✅ **T2.6** Postman 컬렉션 작성 (1h)
  - [x] 6개 API 엔드포인트 전체 등록 (`docs/postman/TON-AI-Access.postman_collection.json`)
  - [x] 환경변수 (baseUrl, litellmBaseUrl, testAddress, lastNonce, issuedKey) 세팅 (`docs/postman/TON-AI-Access.postman_environment.json`)
  - [x] 각 요청 Test script (상태코드 + 필드 검증), Pre-request script 포함
  - [x] E2E 시나리오 폴더 (E1: nonce → 잔액 → 발급 → LiteLLM 직접 호출)
- ✅ **T2.7** CLI 설정 스크립트 실동작 검증 (0.5h)
  - [x] `--non-interactive` 모드 실행 테스트 → 정상 (TON_API_KEY 미설정 시 오류, 정상 입력 시 ok)
  - [x] Claude Code 미설치 환경 → warn만 출력, exit code 0 (스크립트 중단 없음)
  - [x] 환경변수 블록 idempotent 확인 → 2차 실행 시 기존 블록 삭제 후 새 블록 1개만 기록
  - [x] `~/.claude/settings.json` env 블록 정상 저장 확인
  - [ ] 대화형 실행 (`bash scripts/configure-cli.sh`) ← 로컬에서만 가능 (tty 필요)

### ADR-002 (스테이킹 장벽 완화) — 나중에 진행
- ⬜ `lib/staking.ts` — Tier 2 (KV 스냅샷 조회) + Tier 3 (TON balanceOf) 추가
- ⬜ `scripts/load_snapshot_to_kv.ts` — CSV → KV 벌크 로드 스크립트
- ⬜ `GET /api/staking/balance` — `eligibleTier` 필드 추가
- ⬜ Ineligible UI 안내 문구 업데이트

---

## Day 3 — 2026-05-20 (프론트 통합 + 마감)

- ✅ **T3.1** wagmi 지갑 연결 (1.5h)
  - [x] `lib/wagmi.ts` — createConfig (mainnet, MetaMask + injected, ssr: true)
  - [x] `app/providers.tsx` — WagmiProvider + QueryClientProvider
  - [x] `app/layout.tsx` — Providers 래퍼 적용, 타이틀 "TON AI Access"로 업데이트
  - [x] `package.json` — `@tanstack/react-query` 명시적 추가
- ✅ **T3.2** SIWE 서명 플로우 (1h)
  - [x] `lib/hooks/useSiwe.ts` — nonce fetch → buildSiweMessage → signMessageAsync → verify POST
  - [x] `app/page.tsx` — useAccount/useConnect/useDisconnect + useSiwe 완전 연동
  - [x] 상태 레이블 (fetching-nonce / signing / verifying / success) UI 표시
  - [x] 사용자 서명 거부 시 친화적 에러 메시지 처리
  - [ ] 세션 쿠키 수령 end-to-end 확인 ← T1.8(Vercel KV) 완료 후
- ✅ **T3.3** 대시보드 UI 완성 (2.5h)
  - [x] `app/dashboard/page.tsx` — useAccount/useDisconnect 연동, 401 시 / 리다이렉트
  - [x] 잔액 조회 자동 실행 (mount 시 fetchAll — balance + key status 병렬)
  - [x] 자격/미자격 분기 표시 (Eligible / Not eligible 뱃지)
  - [x] 키 발급/rotate 버튼, 1회 노출 키 박스 + Copy 버튼
  - [x] **CLI 설정 패널** — "에이전트 실행" / "직접 실행" 2탭 (에이전트 위임 방식)
  - [ ] 실지갑 end-to-end 동작 확인 ← T1.8 완료 후
- ⬜ **T3.4** E2E 시연 (1h) ← T1.8 완료 후
  - [ ] 적격 지갑: connect → sign → issue → curl qwen-3.6 → 200 확인
  - [ ] 미적격 지갑: connect → sign → "Not eligible" UI 확인
- ✅ **T3.5** README + 문서 업데이트 (1h)
  - [x] `README.md` — Quick Start(npm), 환경변수 표, Vercel 배포 절차, API 표, 구조 업데이트
  - [x] `docs/NOTES.md` 생성 — NOTE-001~007 (이슈·결정·확인 항목)
  - [ ] GIF 또는 스크린샷 캡처 ← T3.4 완료 후
- ⬜ **T3.6** 버퍼 (1.5h) ← T1.8 완료 후
  - [ ] NOTE-002: LiteLLM `/key/generate` 응답 필드명 검증
  - [ ] NOTE-004: `npm install && npm test` 로컬 11 pass 확인
  - [ ] NOTE-006: `npm install && npm run build` TypeScript 컴파일 확인
  - [ ] NOTE-007: 배포 URL 실제 값으로 교체 (dashboard + wireframe)
  - [ ] `vercel --prod` 배포 최종 확인
