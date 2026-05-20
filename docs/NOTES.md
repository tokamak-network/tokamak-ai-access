# 개발 노트 — TON AI Access PoC

> 진행 중 발견된 이슈·결정·확인 항목을 기록합니다.
> 상태: 🟡 확인 필요 · ✅ 해결 · ❌ 블로킹

---

## NOTE-001 — SIWE 메시지 포맷 (해결됨)
**상태**: ✅  
`siwe` 라이브러리의 `SiweMessage` 클래스 대신 EIP-4361 스펙에 맞는 문자열을 직접 빌드하는 방식 채택.  
서버(`lib/siwe.ts`)와 클라이언트(`lib/hooks/useSiwe.ts`) 양쪽에서 동일한 포맷을 사용해야 함.

---

## NOTE-002 — LiteLLM `/key/generate` 응답 스펙 확인 필요
**상태**: 🟡  
`lib/litellm.ts`는 응답에서 `data.key` 필드를 읽음.  
실제 LiteLLM 버전에 따라 필드명이 `data.token` 또는 `data.api_key`일 수 있음.  
**확인 방법**: T1.8(Vercel + LiteLLM env) 완료 후 `curl -X POST $LITELLM_BASE_URL/key/generate -H "Authorization: Bearer $LITELLM_MASTER_KEY"` 로 실제 응답 확인.

---

## NOTE-003 — wagmi SSR hydration 주의
**상태**: 🟡  
`lib/wagmi.ts`에 `ssr: true` 설정됨. Next.js App Router에서 wagmi v2 SSR 사용 시 `useAccount` 등의 훅이 서버에서는 `undefined`를 반환할 수 있음.  
**증상**: 첫 렌더 시 address가 undefined → 연결 상태 판단 오류.  
**완화**: `isConnected` 를 분기 조건으로 사용하고 있음 (page.tsx 참조). 필요 시 `mounted` 상태 guard 추가.

---

## NOTE-004 — vitest 로컬 실행 검증 필요
**상태**: 🟡  
샌드박스 `node_modules` 손상(`ajv` ENOTEMPTY 오류)으로 `npm test` 실행 불가.  
**확인 방법**: 로컬에서 `npm install && npm test` → 11개 테스트 통과 확인.  
예상 결과: siwe 4개 + staking 7개 = 11 pass.

---

## NOTE-005 — Layer2Registry 동적 조회 커버리지
**상태**: ✅  
`getTotalStakedTON()`은 `Layer2Registry.layer2sLength` 기준으로 전체 Layer2를 동적 조회.  
Dune SQL 결과(2024-05 기준 32개 Layer2)와 일치 확인. 하드코딩된 Layer2 목록 제거됨.

---

## NOTE-006 — 샌드박스 node_modules 손상 (Day 3 이슈)
**상태**: 🟡  
**발생**: Day 3 T3.1 진행 중 `npm install` 실행 시 `ajv` 디렉토리 rename 충돌 (`ENOTEMPTY`, `Operation not permitted`).  
**영향**: 샌드박스 내 `tsc --noEmit` 실행 불가. `npm test` 실행 불가.  
**완화**: 코드 정적 분석(라인 수·import 구조) 통과 확인. 파일은 사용자 워크스페이스에 정상 저장됨.  
**확인 방법**: 로컬에서 `npm install && npm run build` 로 TypeScript 컴파일 오류 확인 필요.  
**예상 이슈**: `@tanstack/react-query`가 package.json에 추가됐으나 `npm install` 재실행 필요.

---

## NOTE-007 — CLI Setup 패널 배포 URL 하드코딩
**상태**: ✅  
`app/dashboard/page.tsx`의 `CliSetupPanel` 및 `docs/wireframe.html`에 배포 URL이  
`https://ton-ai-access.vercel.app`으로 하드코딩되어 있음.  
T1.8(Vercel 프로젝트 생성) 완료 후 실제 URL로 교체 필요.  
**교체 위치**:
- `app/dashboard/page.tsx` — `directCommand` 문자열 내 curl URL
- `docs/wireframe.html` — CLI 설정 패널 `agent-prompt__cmd` 내 curl URL
