# Next.js 15 Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js 14.2.29을 15.5.18로 업그레이드하여 보안 취약점 20개를 해소하고, vitest도 4.x로 올려 esbuild 취약점을 함께 제거한다.

**Architecture:** 이 프로젝트는 App Router 기반이지만 모든 Page 컴포넌트가 `'use client'`이고, API Routes는 `NextRequest`/`NextResponse`를 직접 사용하므로 Next.js 15의 async cookies/headers 변경 영향이 없다. 실제 코드 변경은 `next.config.ts` 한 줄과 패키지 버전 3개 업데이트가 전부다.

**Tech Stack:** Next.js 15.5.18, React 18(유지), Vitest 4.1.6, TypeScript 5, wagmi 2.x, viem 2.x

---

## 영향 범위 사전 정리

Next.js 15 주요 breaking change와 이 프로젝트의 적용 여부:

| Breaking Change | 설명 | 이 프로젝트 영향 |
|----------------|------|----------------|
| `cookies()`, `headers()` async화 | `next/headers`에서 import한 경우만 해당 | ✅ 사용 안 함 — `NextRequest.cookies`는 동기 유지 |
| `params`/`searchParams` Promise화 | Server Component page props | ✅ 모든 Page가 `'use client'` — 무관 |
| fetch 기본 캐시 변경 | `force-cache` → `no-store` | ✅ 서버 fetch 없음 — 무관 |
| GET Route 캐시 제거 | Route Handler GET 기본 캐시 해제 | ✅ 인증 기반 동적 API — 영향 없음 |
| `serverComponentsExternalPackages` | `experimental` 제거됨 | ⚠️ **변경 필요** → `serverExternalPackages` |

---

## Task 1: 현재 상태 베이스라인 확보

**Files:**
- Read: `package.json`
- Run: `npm test`

- [ ] **Step 1: 현재 테스트 통과 여부 확인**

```bash
cd /Users/theo/workspace_tokamak/tokamak-ai-access
npm test 2>&1
```

Expected: 2개 테스트 파일, 11개 테스트 전부 PASS. 이 숫자를 기억한다.

- [ ] **Step 2: 타입 체크 현재 상태 확인**

```bash
npx tsc --noEmit 2>&1
```

Expected: 에러 0개. 에러가 있으면 마이그레이션 전에 먼저 기록한다.

- [ ] **Step 3: 커밋 (작업 시작 전 체크포인트)**

```bash
git add -A
git commit -m "chore: pre-migration baseline checkpoint"
```

---

## Task 2: `next.config.ts` breaking change 수정

**Files:**
- Modify: `next.config.ts`

Next.js 15에서 `experimental.serverComponentsExternalPackages`는 `serverExternalPackages`로 stable 이동했다. `experimental` 블록에 두면 경고가 발생하고 무시된다.

- [ ] **Step 1: next.config.ts 수정**

`next.config.ts`를 다음과 같이 변경한다:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["siwe"],
};

export default nextConfig;
```

- [ ] **Step 2: 타입 에러 없는지 확인**

```bash
npx tsc --noEmit 2>&1
```

Expected: 에러 0개.

---

## Task 3: 패키지 버전 업데이트

**Files:**
- Modify: `package.json`

세 가지 패키지를 업데이트한다:
- `next`: `14.2.29` → `^15.5.18` (보안 취약점 20개 해소)
- `eslint-config-next`: `14.2.29` → `^15.5.18` (glob 취약점 해소, next와 버전 맞춤)
- `vitest`: `^2.1.9` → `^4.1.6` (esbuild 취약점 해소)
- `@vitejs/plugin-react`: `^4.3.4` → `^5.0.0` (vitest 4.x는 vite 6.x 필요, plugin-react 5.x가 vite 6 지원)

React 18은 유지한다. Next.js 15는 React 18과 완전히 호환된다.

- [ ] **Step 1: package.json 수정**

`package.json`의 해당 항목을 다음과 같이 변경한다:

```json
{
  "dependencies": {
    "next": "^15.5.18"
  },
  "devDependencies": {
    "eslint-config-next": "^15.5.18",
    "vitest": "^4.1.6",
    "@vitejs/plugin-react": "^5.0.0"
  }
}
```

(다른 항목은 그대로 유지한다.)

- [ ] **Step 2: 패키지 설치**

```bash
npm install 2>&1
```

Expected: 에러 없이 완료. peer dependency 경고가 있으면 내용을 기록한다.

- [ ] **Step 3: 설치 후 취약점 확인**

```bash
npm audit 2>&1 | grep -E "^(next|vitest|esbuild|glob)" | head -20
```

Expected: next, vitest, esbuild, glob 관련 high 취약점 사라짐. ws/wagmi 관련 moderate은 잔존 가능 (wagmi 3.x 업그레이드는 이 작업 범위 밖).

---

## Task 4: 마이그레이션 후 검증

**Files:**
- Run: `npm test`, `npx tsc --noEmit`, `npm run build`

- [ ] **Step 1: 테스트 재실행**

```bash
npm test 2>&1
```

Expected: Task 1에서 확인한 것과 동일하게 11개 테스트 전부 PASS.

실패 시 — 에러 메시지를 확인하고 아래 트러블슈팅 섹션을 참조한다.

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit 2>&1
```

Expected: 에러 0개.

에러가 있으면 Next.js 15 타입 변경에 의한 것인지 확인한다. 흔한 패턴:
- `NextConfig` 타입에서 제거된 옵션 → 이미 Task 2에서 처리함
- `params`/`searchParams` Promise 타입 → Server Component page에서만 발생, 이 프로젝트는 해당 없음

- [ ] **Step 3: 빌드 확인**

```bash
npm run build 2>&1
```

Expected: 에러 없이 빌드 완료. `Route (app)` 섹션에 모든 라우트가 정상 표시됨.

- [ ] **Step 4: 최종 커밋**

```bash
git add package.json package-lock.json next.config.ts
git commit -m "chore: migrate to Next.js 15.5.18 and vitest 4.1.6

- next: 14.2.29 → 15.5.18 (resolves 20 security vulnerabilities)
- eslint-config-next: 14.2.29 → 15.5.18
- vitest: 2.1.9 → 4.1.6 (resolves esbuild CVE)
- @vitejs/plugin-react: 4.x → 5.x (vite 6 compatibility)
- next.config.ts: serverComponentsExternalPackages → serverExternalPackages"
```

---

## 트러블슈팅

### vitest 4.x 관련 테스트 실패

vitest 4.x는 `globals: true` 옵션이 다를 수 있다. `vitest.config.ts`에 다음이 있어야 한다:

```typescript
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
});
```

이미 설정되어 있으므로 문제 없을 것. 만약 `vi is not defined` 에러가 나오면 `vitest.config.ts`에 `globals: true`가 있는지 재확인한다.

### `@vitejs/plugin-react` peer dependency 에러

만약 npm install 시 peer dependency 충돌이 발생하면:

```bash
npm install --legacy-peer-deps 2>&1
```

이후 테스트와 빌드가 정상이면 문제 없다.

### next.config.ts 타입 에러

Next.js 15의 `NextConfig` 타입에서 특정 옵션이 제거됐을 경우 타입 에러가 발생할 수 있다. 발생 시:

```bash
npx tsc --noEmit 2>&1 | grep "next.config"
```

에러 내용을 보고 해당 옵션을 제거하거나 업데이트된 이름으로 변경한다.

### wagmi/ws 취약점 잔존

ws(WebSocket) 관련 moderate 취약점은 wagmi 2.x의 내부 의존성이다. wagmi 3.x로 업그레이드하면 해소되지만 wagmi 3.x는 별도 마이그레이션 작업이 필요하다. 이 계획의 범위 밖이며, moderate 심각도이므로 즉시 조치 불필요.

---

## 잔여 보안 이슈 (이 계획 범위 밖)

| 취약점 | 심각도 | 해결 방법 | 비고 |
|--------|--------|----------|------|
| `ws@8.x` (wagmi 내부) | Moderate | wagmi 3.x 업그레이드 | 별도 계획 필요 |
| `@vercel/kv` 서비스 종료 | 운영 리스크 | Upstash Redis 직접 연결로 전환 | 별도 계획 필요 |
