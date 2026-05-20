# 업무 산출물 리스트 — TON AI Access PoC

> 상태: ⬜ 미생성 · 🔄 초안 · ✅ 완료
> 마지막 업데이트: 2026-05-19

---

## 1. 문서 (docs/)

| 상태 | 파일 | 설명 | 담당 태스크 |
|------|------|------|------------|
| ✅ | `docs/PRD.md` | 페르소나·유저스토리·성공지표·스코프 | T1.2 |
| ✅ | `docs/FunctionalSpec.md` | API 6개 정상·실패 케이스, 상태도 | T1.3 |
| ✅ | `docs/TestPlan.md` | 단위·통합·E2E 테스트 매트릭스 | T1.4 |
| ✅ | `docs/wireframe.html` | 인터랙티브 HTML 와이어프레임 — 6화면, CLI 패널 3탭, PATTERN 토큰 준수 | T1.5 |
| ✅ | `docs/agent-install-guide.md` | Claude Code·Codex 에이전트 실행 설치 가이드 | T1.P |
| ✅ | `HANDOFF.md` | PoC 전체 계획서 (변경 금지) | — |
| 🔄 | `README.md` | 프로젝트 개요·Quick Start·구조도 | T3.5 |

---

## 2. 스냅샷 산출물 (data/)

| 상태 | 파일 | 설명 | 담당 태스크 |
|------|------|------|------------|
| ⬜ | `data/eligible_holders.csv` | 메인넷 적격 스테이커 목록 (address, staked_ton, layers) | T1.7 |

---

## 3. 스크립트 (scripts/)

| 상태 | 파일 | 설명 | 담당 태스크 |
|------|------|------|------------|
| ✅ | `scripts/snapshot_eligible_stakers.py` | Phase1 이벤트 스캔 + Phase2 stakeOf 호출 + Phase3 CSV 출력 | T1.7 |
| ✅ | `scripts/README.md` | 스냅샷 스크립트 실행 가이드 | T1.7 |
| ✅ | `scripts/configure-cli.sh` | Claude Code·Codex CLI 자동 설정 (대화형·비대화형) | T2.7 |

---

## 4. ABI (abi/)

| 상태 | 파일 | 설명 | 담당 태스크 |
|------|------|------|------------|
| ✅ | `abi/SeigManagerV1_3.json` | stakeOf ABI — mainnet+sepolia 주소 확정, 셀렉터 검증 완료 | T1.1 |
| ✅ | `abi/DepositManagerV1_1.json` | Deposited 이벤트 ABI — topic0 해시 검증 완료 | T1.1 |
| ✅ | `abi/Layer2Registry.json` | layer2sLength / layer2sByIndex / isLayer2 ABI — 셀렉터 검증 완료 | T1.1 |

---

## 5. 서버 API (app/api/)

| 상태 | 라우트 | 설명 | 담당 태스크 |
|------|--------|------|------------|
| 🔄 | `POST /api/auth/nonce` | nonce 생성 + KV 저장 | T2.1 |
| 🔄 | `POST /api/auth/verify` | SIWE 서명 검증 + 세션 쿠키 발급 | T2.1 |
| 🔄 | `GET  /api/staking/balance` | viem multicall → totalStakedTON + eligible | T2.2 |
| 🔄 | `POST /api/keys/issue` | 잔액 재검증 → LiteLLM key/generate → hash 저장 | T2.3 |
| 🔄 | `POST /api/keys/rotate` | 기존 키 revoke → 신규 발급 | T2.3 |
| 🔄 | `GET  /api/keys/me` | 키 보유 여부 + lastFour 조회 | T2.3 |

---

## 6. 라이브러리 모듈 (lib/)

| 상태 | 파일 | 핵심 익스포트 | 담당 태스크 |
|------|------|--------------|------------|
| 🔄 | `lib/siwe.ts` | `getSessionAddress(req)` | T2.1 |
| 🔄 | `lib/staking.ts` | `getTotalStakedTON(address)` | T2.2 |
| 🔄 | `lib/litellm.ts` | `generateLiteLLMKey()` · `revokeLiteLLMKey()` | T2.3 |
| 🔄 | `lib/kv.ts` | `kvGet/Set/Del()` · `hashKey()` | T2.1 |
| 🔄 | `lib/ratelimit.ts` | `rateLimitIP()` · `rateLimitAddr()` | T2.4 |

---

## 7. 프론트엔드 (app/)

| 상태 | 파일 | 설명 | 담당 태스크 |
|------|------|------|------------|
| 🔄 | `app/page.tsx` | 랜딩 — Connect Wallet 버튼 | T3.1, T3.2 |
| 🔄 | `app/dashboard/page.tsx` | 대시보드 — 잔액·자격·키 발급 | T3.3 |

---

## 8. 테스트

| 상태 | 파일 | 설명 | 담당 태스크 |
|------|------|------|------------|
| 🔄 | `tests/siwe.test.ts` | vitest — getSessionAddress 단위 테스트 | T2.5 |
| 🔄 | `tests/staking.test.ts` | vitest — getTotalStakedTON 단위 테스트 | T2.5 |
| ✅ | `tests/e2e.md` | 수동 E2E 체크리스트 | T3.4 |
| ⬜ | Postman 컬렉션 | API 6개 통합 테스트 컬렉션 | T2.6 |

---

## 9. 인프라·설정

| 상태 | 항목 | 설명 | 담당 태스크 |
|------|------|------|------------|
| ✅ | `.env.example` | 전체 환경변수 명세 | — |
| ⬜ | `.env.local` | 실제 값 (로컬, gitignore) | T1.8 |
| ⬜ | Vercel 프로젝트 | 배포 환경 + KV 연결 | T1.8 |
| ✅ | `package.json` | 의존성 정의 (Next 14, wagmi v2, siwe, viem) | — |

---

## 10. CLI 설정 플러그인 (신규 기능)

| 상태 | 항목 | 설명 | 담당 태스크 |
|------|------|------|------------|
| ✅ | `scripts/configure-cli.sh` | 대화형·비대화형 CLI 설정 스크립트 | T2.7 |
| ✅ | `docs/agent-install-guide.md` | 에이전트 파싱 전용 Step-by-Step 가이드 | T1.P |
| ⬜ | 대시보드 CLI 설정 패널 | 키 발급 후 표시되는 Claude Code·Codex 탭 UI | T3.3 |
| ⬜ | 원격 실행 URL (`/configure-cli.sh`) | `curl \| bash` 원라이너 지원 (Vercel public asset) | T3.6 |

**에이전트 실행 흐름**:
```
1. 사용자가 대시보드에서 키 발급
2. 대시보드가 configure-cli.sh 원라이너 + agent-install-guide.md 링크 표시
3. 사용자가 Claude Code 또는 Codex 터미널에 원라이너 붙여넣기
4. 에이전트가 agent-install-guide.md를 파싱하여 Step 0→5 순서로 실행
5. ~/.zshrc, ~/.claude/settings.json, ~/.codex/config.toml 자동 설정 완료
```

---

## 11. 최종 제출물 (Day 3 마감)

| 상태 | 항목 | 확인 기준 |
|------|------|----------|
| ⬜ | Vercel 배포 URL | `https://<project>.vercel.app` 접속 가능 |
| ⬜ | E2E 시연 — 적격 | connect → issue → curl qwen-3.6 → 200 응답 |
| ⬜ | E2E 시연 — 미적격 | "Not eligible" UI + 스테이킹 링크 표시 |
| ⬜ | 데모 GIF / 스크린샷 | `README.md`에 첨부 |
| ⬜ | `data/eligible_holders.csv` | 메인넷 적격자 목록 (스냅샷 기준) |
