# TON AI Access — 스테이킹 통합 시스템 설계

> **버전:** 1.2 | **날짜:** 2026-05-20 | **네트워크:** Ethereum Mainnet (chainId: 1)
> **최소 스테이킹 임계값:** 200 TON (Qwen3.6 오픈 모델 기준 시장가 분석 — [§6.2 참조](#62-접근-제어-로직))

---

## 목차

1. [개요](#1-개요)
2. [시스템 아키텍처](#2-시스템-아키텍처)
3. [기술 스택](#3-기술-스택)
4. [디렉터리 구조](#4-디렉터리-구조)
5. [스테이킹 컨트랙트 통합](#5-스테이킹-컨트랙트-통합)
6. [인증 및 접근 제어](#6-인증-및-접근-제어)
7. [API 설계](#7-api-설계)
8. [데이터 모델](#8-데이터-모델)
9. [캐싱 전략](#9-캐싱-전략)
10. [보안 고려사항](#10-보안-고려사항)
11. [트레이드오프 분석](#11-트레이드오프-분석)
12. [구현 로드맵](#12-구현-로드맵)
13. [참고 자료](#13-참고-자료)

---

## 1. 개요

TON AI Access는 Tokamak Network의 TON 토큰을 스테이킹한 사용자에게 AI 기능 접근권을 부여하는 Next.js 기반 Web DApp입니다.

### 핵심 설계 원칙

- **비수탁형(Non-custodial):** 서버는 사용자의 개인키나 자금을 절대 보관하지 않습니다. 모든 스테이킹 트랜잭션은 사용자 지갑이 직접 서명합니다.
- **온체인 검증:** AI 접근 허가는 서버가 Ethereum RPC를 통해 스테이킹 잔액을 직접 조회해 결정합니다. 클라이언트 측 값을 신뢰하지 않습니다.
- **최소 임계값 접근 제어:** **200 TON 이상** 스테이킹 시 AI 기능을 사용할 수 있습니다. Qwen3.6 오픈 모델 직접 운영 비용(GPU 렌탈 + ollama/litellm) 및 클라우드 API 실비용 기반으로 산출했습니다. (상세 근거: §6.2)

### 사용자 흐름 요약

```
지갑 연결 → SIWE 서명 → 서버 온체인 검증 → AI 기능 해제
                ↑
          앱 내에서 직접 TON 스테이킹 가능
```

---

## 2. 시스템 아키텍처

### 레이어 구성

```
┌─────────────────────────────────────────────────────────────┐
│                  브라우저 (클라이언트)                        │
│                                                             │
│  ┌─────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ Wallet 연결  │  │   Staking UI     │  │   AI 기능 UI  │  │
│  │ wagmi +     │  │ @ton-staking-sdk │  │ (스테이킹 시   │  │
│  │ RainbowKit  │  │   /react-kit     │  │  접근 허용)    │  │
│  └──────┬──────┘  └────────┬─────────┘  └───────┬───────┘  │
│         │ SIWE 서명         │ 트랜잭션 서명        │ API 호출  │
└─────────┼───────────────────┼─────────────────────┼─────────┘
          │                   │                     │
          ▼                   ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                Next.js API 서버 (Vercel)                     │
│                                                             │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │  /api/auth/* │  │ /api/stake/*   │  │  /api/ai/*     │  │
│  │  SIWE 검증   │  │ 잔액 조회(캐시)  │  │ 스테이킹 확인  │  │
│  │  JWT 발급    │  │ Redis TTL 60s  │  │ 후 AI 프록시   │  │
│  └──────┬───────┘  └───────┬────────┘  └───────┬────────┘  │
│         │                  │                    │           │
│  ┌──────▼──────────────────▼────────────────────▼───────┐  │
│  │              middleware.ts (스테이킹 Guard)             │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │ RPC 읽기 / 트랜잭션 수신
          ┌──────────▼──────────┐      ┌───────────────┐
          │  Ethereum Mainnet   │      │  AI Provider  │
          │                     │      │  (Claude API  │
          │  TON / WTON         │      │   / OpenAI)   │
          │  DepositManager     │      └───────────────┘
          │  SeigManager        │
          │  SWTON (Snapshot)   │
          └─────────────────────┘
```

### 트랜잭션 경로 vs 읽기 경로

| 경로 | 흐름 | 비고 |
|------|------|------|
| **스테이킹 트랜잭션** | 브라우저 지갑 → Ethereum 직접 | 서버 미경유, 사용자가 직접 서명 |
| **스테이킹 상태 읽기** | 서버 → Alchemy RPC → 컨트랙트 | 캐시 적용 (Redis TTL 60s) |
| **AI 접근 검증** | 서버 Middleware → JWT 확인 | 만료 시 온체인 재검증 |

---

## 3. 기술 스택

| 카테고리 | 패키지 / 서비스 | 비고 |
|----------|----------------|------|
| 프레임워크 | Next.js 14+ (App Router) | Vercel 배포 |
| 지갑 연결 | wagmi v2 + viem + RainbowKit | EIP-1193 표준 |
| 스테이킹 SDK | `@ton-staking-sdk/core`, `@ton-staking-sdk/react-kit` | In Progress → viem 폴백 필수 |
| 인증 | SIWE (EIP-4361) + jose (JWT) | httpOnly Cookie |
| 캐시 | Upstash Redis (Vercel KV) | TTL 60s |
| RPC | Alchemy Mainnet | 폴백: Infura |
| AI Provider | Anthropic Claude API | 교체 가능 구조 |
| 모니터링 | Vercel Analytics + Alchemy Dashboard | - |

---

## 4. 디렉터리 구조

```
ton-ai-access/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx          # 지갑 연결 + SIWE 인증 페이지
│   ├── dashboard/
│   │   └── page.tsx              # 스테이킹 현황 대시보드
│   ├── ai/
│   │   └── page.tsx              # AI 기능 UI (스테이킹 필요)
│   └── api/
│       ├── auth/
│       │   ├── nonce/route.ts    # SIWE nonce 발급
│       │   ├── verify/route.ts   # 서명 검증 + 스테이킹 확인 + JWT 발급
│       │   ├── session/route.ts  # 현재 세션 조회
│       │   ├── refresh/route.ts  # 온체인 재검증 + JWT 갱신
│       │   └── logout/route.ts   # 세션 종료
│       ├── stake/
│       │   └── status/route.ts   # 스테이킹 현황 (캐시 포함)
│       └── ai/
│           ├── chat/route.ts     # AI Chat (스테이킹 필요)
│           └── analyze/route.ts  # AI 분석 (스테이킹 필요)
│
├── middleware.ts                  # 스테이킹 여부 Guard (/api/ai/* 보호)
│
├── lib/
│   ├── staking/
│   │   ├── client.ts             # SDK + viem 폴백 래퍼
│   │   └── verify.ts             # 스테이킹 잔액 온체인 조회
│   ├── auth/
│   │   └── siwe.ts               # SIWE 메시지 생성·검증
│   ├── cache/
│   │   └── redis.ts              # Redis 캐시 유틸
│   └── ai/
│       └── provider.ts           # AI Provider 추상화 레이어
│
└── components/
    ├── staking/
    │   ├── StakeForm.tsx          # TON 스테이킹 UI
    │   ├── UnstakeForm.tsx        # 언스테이킹 + 출금 UI
    │   ├── RestakeForm.tsx        # 재스테이킹 UI
    │   └── RewardDashboard.tsx    # 시뇨리지 보상 현황
    ├── auth/
    │   └── WalletConnect.tsx      # 지갑 연결 버튼
    └── ai/
        └── StakingGate.tsx        # 스테이킹 미완료 시 안내 UI
```

---

## 5. 스테이킹 컨트랙트 통합

### 5.1 컨트랙트 구조

TokamakStaking v2는 다음 컨트랙트들로 구성됩니다.

| 컨트랙트 | 심볼 | 역할 |
|----------|------|------|
| TON ERC-20 | TON | Tokamak 유틸리티 토큰 (스테이킹 입력) |
| Wrapped TON | WTON | 시뇨리지 보상 토큰 |
| DepositManager | - | 스테이킹 / 출금 요청 진입점 |
| SeigManager | - | 블록당 3.92 TON 시뇨리지 분배 |
| RefactorCoinageSnapshot | SWTON | 스테이킹 잔액 및 시뇨리지 추적 |
| Layer2Registry | - | Operator (Layer2) 주소 관리 |

> 메인넷 컨트랙트 주소는 [deployed-addresses-mainnet.md](https://github.com/tokamak-network/ton-staking-v2/blob/ton-staking-v2/docs/deployed-addresses-mainnet.md) 참조

### 5.2 핵심 함수

#### 스테이킹 — TON으로 직접 스테이킹

`TON.approveAndCall()` 한 번으로 approve와 deposit을 동시 처리합니다.

```typescript
// lib/staking/client.ts
import { encodeFunctionData, parseAbi } from 'viem';

const TON_ABI = parseAbi([
  'function approveAndCall(address spender, uint256 amount, bytes calldata data) returns (bool)',
]);

async function stakeTON(
  walletClient: WalletClient,
  amount: bigint,         // wei 단위
  layer2Address: `0x${string}`
) {
  const encodedData = encodeAbiParameters(
    [{ type: 'address' }],
    [layer2Address]
  );

  return walletClient.writeContract({
    address: TON_ADDRESS,
    abi: TON_ABI,
    functionName: 'approveAndCall',
    args: [DEPOSIT_MANAGER_ADDRESS, amount, encodedData],
  });
}
```

#### 스테이킹 — WTON으로 스테이킹

```typescript
async function stakeWTON(
  walletClient: WalletClient,
  amount: bigint,         // ray 단위 (1e27)
  layer2Address: `0x${string}`
) {
  return walletClient.writeContract({
    address: WTON_ADDRESS,
    abi: WTON_ABI,
    functionName: 'approveAndCall',
    args: [DEPOSIT_MANAGER_ADDRESS, amount, encodedData],
  });
}
```

#### 언스테이킹 — 출금 요청

```typescript
const DEPOSIT_MANAGER_ABI = parseAbi([
  'function requestWithdrawal(address layer2, uint256 amount)',
  'function processRequests(address layer2, uint256 n, bool receiveTON)',
  'function redepositMulti(address layer2, uint256 n)',
]);

// 1단계: 출금 요청 (withdrawalDelay 이후 처리 가능)
async function requestUnstake(
  walletClient: WalletClient,
  layer2Address: `0x${string}`,
  amount: bigint
) {
  return walletClient.writeContract({
    address: DEPOSIT_MANAGER_ADDRESS,
    abi: DEPOSIT_MANAGER_ABI,
    functionName: 'requestWithdrawal',
    args: [layer2Address, amount],
  });
}

// 2단계: 대기 기간 경과 후 출금 실행
async function processWithdrawal(
  walletClient: WalletClient,
  layer2Address: `0x${string}`,
  requestCount: bigint    // 처리할 요청 수
) {
  return walletClient.writeContract({
    address: DEPOSIT_MANAGER_ADDRESS,
    abi: DEPOSIT_MANAGER_ABI,
    functionName: 'processRequests',
    args: [layer2Address, requestCount, false], // false = WTON으로 수령
  });
}
```

#### 재스테이킹 — 대기 중 출금을 다시 스테이킹

```typescript
async function restake(
  walletClient: WalletClient,
  layer2Address: `0x${string}`,
  requestCount: bigint
) {
  return walletClient.writeContract({
    address: DEPOSIT_MANAGER_ADDRESS,
    abi: DEPOSIT_MANAGER_ABI,
    functionName: 'redepositMulti',
    args: [layer2Address, requestCount],
  });
}
```

### 5.3 SDK 사용 (서버 측 읽기)

```typescript
// lib/staking/client.ts
import { TONStaking } from '@ton-staking-sdk/core';

let sdk: TONStaking | null = null;

function getSDK() {
  if (!sdk) {
    sdk = new TONStaking({
      rpcUrl: process.env.ALCHEMY_RPC_URL!,
      chainId: 1,
    });
  }
  return sdk;
}

// SDK 호출 실패 시 viem 직접 호출로 폴백
export async function getStakedAmount(address: `0x${string}`): Promise<bigint> {
  try {
    const amount = await getSDK().getStakedAmount(address);
    return BigInt(amount);
  } catch {
    // SDK 실패 시 viem으로 직접 SWTON balanceOf 조회
    return readContract({
      address: SWTON_ADDRESS,
      abi: SWTON_ABI,
      functionName: 'balanceOf',
      args: [address],
    });
  }
}
```

> **주의:** `@ton-staking-sdk/react-kit`은 현재 개발 진행 중입니다. `package.json`에서 버전을 exact로 고정하고, 위와 같이 viem 폴백을 반드시 구현하세요.

### 5.4 React 클라이언트 측 사용

```tsx
// app/providers.tsx
import { TONStakingProvider } from '@ton-staking-sdk/react-kit';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <TONStakingProvider rpcUrl={process.env.NEXT_PUBLIC_RPC_URL} chainId={1}>
        {children}
      </TONStakingProvider>
    </WagmiProvider>
  );
}
```

```tsx
// components/staking/RewardDashboard.tsx
import { useTotalStaked } from '@ton-staking-sdk/react-kit';
import { useAccount } from 'wagmi';

export function RewardDashboard() {
  const { address } = useAccount();
  const { data: staked } = useTotalStaked(address);

  return (
    <div>
      <p>스테이킹 잔액: {formatTON(staked)} TON</p>
    </div>
  );
}
```

---

## 6. 인증 및 접근 제어

### 6.1 SIWE (Sign-In With Ethereum) 흐름

EIP-4361 표준에 따라 지갑 서명만으로 신원을 증명합니다. 서버는 개인키를 보관하지 않습니다.

```
클라이언트                         서버                        Ethereum
    │                               │                              │
    │── GET /api/auth/nonce ────────▶│                              │
    │◀─ { nonce } ─────────────────│                              │
    │                               │                              │
    │  [지갑으로 SIWE 메시지 서명]    │                              │
    │                               │                              │
    │── POST /api/auth/verify ──────▶│                              │
    │   { message, signature }      │── getStakedAmount(address) ──▶│
    │                               │◀─ stakedWei ─────────────────│
    │                               │                              │
    │                               │  staked > 0 → JWT 발급       │
    │◀─ Set-Cookie: session=JWT ────│                              │
    │                               │                              │
    │── POST /api/ai/chat ──────────▶│                              │
    │   Authorization: Cookie        │  Middleware: JWT 검증        │
    │                               │  + staked 확인               │
    │◀─ AI 응답 ────────────────────│                              │
```

### 6.2 접근 제어 로직

#### 최소 스테이킹 임계값 산출 근거 (Qwen3.6 오픈 모델 기준)

접근 규칙은 **스테이킹 잔액 ≥ 200 TON이면 AI 기능 허용, 아니면 차단**입니다. 비교 기준을 ChatGPT/Claude 등 프리미엄 구독이 아닌 **Qwen3.6 오픈 모델을 직접 이용하는 실제 비용**으로 산정했습니다.

---

**기반 데이터 (2026년 5월 기준)**

| 항목 | 수치 | 출처 |
|------|------|------|
| Tokamak TON 시세 | $0.457/TON (약 660원) | CoinGecko |
| TON 스테이킹 APY | ~31% | Tokamak Seigniorage 수치 |
| Qwen3.6-35B-A3B VRAM | ~21 GB (Q4_K_M) | WillItRunAI |
| RTX 4090 24GB — Vast.ai | $0.29/hr (최저) | Vast.ai 마켓플레이스 |
| RTX 4090 24GB — RunPod Community | $0.34/hr | RunPod |
| OpenRouter Qwen3.6 Plus API | 입력 $0.325, 출력 $1.95 / M tokens | OpenRouter |
| Groq Qwen3 추론 (무료 티어) | Rate-limit 있음, 무료 | Groq |

---

**대안 비용 분석 — "TON AI Access 없이 Qwen3.6을 쓰려면?"**

| 대안 | 사용 시나리오 | 월 비용 |
|------|-------------|---------|
| OpenRouter API (경량 사용, 2M 토큰) | 개인 프로젝트 수준 | ~$1.60/월 |
| OpenRouter API (중간 사용, 10M 토큰) | 일반 업무 수준 | ~$7/월 |
| OpenRouter API (헤비 사용, 50M 토큰) | 전문 개발자 수준 | ~$35/월 |
| Vast.ai RTX 4090 — 하루 8시간만 운영 | 개인 ollama 서버 | ~$70/월 |
| Vast.ai RTX 4090 — 24시간 상시 운영 | 팀 공유 ollama 서버 | ~$212/월 |
| **플랫폼 공유 GPU 비용 (50명 공유)** | TON AI Access 제공 서비스 원가 | **~$4.2/인/월** |

> **핵심 관찰**: Qwen3.6은 OpenRouter에서 월 **$1.60~$7** 수준의 오픈 API로 이미 접근 가능합니다. 따라서 스테이킹 임계값은 "ChatGPT 월정액 대비" 기준이 아닌, **"오픈 모델 API 이용 대비 합리적인 진입 장벽"** 기준으로 설정해야 합니다.

---

**4가지 임계값 모델 (Qwen3.6 기준)**

| 모델 | 산출식 | 결과 |
|------|-------|------|
| **API 대안 커버** (OpenRouter 중간 사용 $7/월) | $84/년 ÷ (31% × $0.457) | ~594 TON |
| **공유 GPU 원가 커버** (50명 공유 $4.2/인/월) | $50/년 ÷ (31% × $0.457) | ~354 TON |
| **자본 약정** (API 6개월치 = $42 잠금) | $42 ÷ $0.457 | ~92 TON |
| **Anti-Sybil** (5개 지갑 생성 비용 $500+ 초과) | $500 ÷ $0.457 | ~1,094 TON |

**권장값: `MIN_STAKE_TON = 200 TON` (≈ $91 ≈ 약 145,000 KRW)**

> 200 TON은 다음 세 가지 기준을 동시에 만족하는 균형점입니다:
>
> - **실질적 접근 장벽**: OpenRouter로 직접 쓰는 것보다 자본 잠금이 있어 "가볍게 해보자"는 시도를 걸러냄
> - **합리적 비용**: 이전 1,000 TON(약 740,000 KRW) 대비 1/5 수준인 **145,000 KRW** — 진지한 TON 생태계 참여자라면 감당 가능한 범위
> - **Sybil 방어**: 10개 지갑 공격 시 $910 비용 → OpenRouter $1.60/월 대비 채산이 맞지 않음
> - **연간 yield**: ~62 TON ≈ $28 → 플랫폼 공유 GPU 원가($50/년)의 약 56% 커버

> **TON 가격 변동 시 조정 가이드:**
> - TON $0.8 이상: 100–150 TON으로 낮추기 (동일 USD 가치 유지)
> - TON $0.2 이하: 500–800 TON으로 올리기
> - 목표 USD 가치 범위: **$80~$120** 유지

#### 구현 코드

```typescript
// lib/auth/siwe.ts
import { SiweMessage } from 'siwe';
import { getStakedAmount } from '@/lib/staking/client';
import { SignJWT } from 'jose';
import { parseUnits } from 'viem';

// 200 TON (18 decimals) — Qwen3.6 오픈 모델 실비용 기반 최소 스테이킹 임계값
// 산출 근거: OpenRouter Qwen3.6 Plus 중간 사용량 $7/월 대비, TON $0.457, APY 31%
// 목표 USD 가치 $80~$120 구간 유지 — TON 가격 변동 시 MIN_STAKE_TON 환경변수 조정
export const MIN_STAKE_WEI = parseUnits(
  process.env.MIN_STAKE_TON ?? '200',
  18
);

export async function verifyAndIssueSession(
  message: string,
  signature: string
): Promise<{ jwt: string; hasStaked: boolean; stakedTON: string }> {
  // 1. SIWE 서명 검증
  const siweMessage = new SiweMessage(message);
  const { data: fields } = await siweMessage.verify({ signature });
  const address = fields.address as `0x${string}`;

  // 2. nonce 재사용 방지
  const nonceUsed = await redis.get(`nonce:${fields.nonce}`);
  if (nonceUsed) throw new Error('Nonce already used');
  await redis.setex(`nonce:${fields.nonce}`, 300, '1');

  // 3. 온체인 스테이킹 잔액 확인 (≥ MIN_STAKE_WEI 여부)
  const stakedWei = await getStakedAmount(address);
  const hasStaked = stakedWei >= MIN_STAKE_WEI;

  // 4. JWT 발급 (TTL 10분)
  const jwt = await new SignJWT({ address, hasStaked, stakedWei: stakedWei.toString() })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('10m')
    .setIssuedAt()
    .sign(JWT_SECRET);

  return { jwt, hasStaked, stakedTON: formatUnits(stakedWei, 18) };
}
```

### 6.3 Middleware — 스테이킹 Guard

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(req: NextRequest) {
  // /api/ai/* 경로만 보호
  if (!req.nextUrl.pathname.startsWith('/api/ai/')) {
    return NextResponse.next();
  }

  const token = req.cookies.get('ton-ai-session')?.value;
  if (!token) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);

    // 스테이킹 확인 (최소 1,000 TON 이상)
    if (!payload.hasStaked) {
      return NextResponse.json(
        {
          error: 'STAKING_REQUIRED',
          message: `최소 ${process.env.MIN_STAKE_TON ?? '200'} TON 이상 스테이킹해야 AI 기능을 사용할 수 있습니다.`,
          minStakeTON: process.env.MIN_STAKE_TON ?? '200',
          stakeUrl: '/dashboard',
        },
        { status: 403 }
      );
    }

    // JWT가 만료됐거나 5분 이상 경과 시 온체인 재검증
    const issuedAt = payload.iat as number;
    if (Date.now() / 1000 - issuedAt > 300) {
      const fresh = await getStakedAmount(payload.address as `0x${string}`);
      const minStakeWei = parseUnits(process.env.MIN_STAKE_TON ?? '200', 18);
      if (fresh < minStakeWei) {
        return NextResponse.json(
          { error: 'STAKING_REQUIRED', minStakeTON: process.env.MIN_STAKE_TON ?? '200' },
          { status: 403 }
        );
      }
    }

    return NextResponse.next();
  } catch {
    return NextResponse.json({ error: 'INVALID_TOKEN' }, { status: 401 });
  }
}

export const config = {
  matcher: ['/api/ai/:path*'],
};
```

---

## 7. API 설계

### 7.1 인증 API

#### `GET /api/auth/nonce`

SIWE 서명에 사용할 일회성 nonce를 발급합니다.

**Response**
```json
{
  "nonce": "a4f9b2c1d8e3",
  "expiresAt": 1716170400
}
```

---

#### `POST /api/auth/verify`

서명을 검증하고 스테이킹 여부를 확인한 후 세션 쿠키를 발급합니다.

**Request**
```json
{
  "message": "ton-ai-access.xyz wants you to sign in...",
  "signature": "0xabc123..."
}
```

**Response (성공 — 스테이킹 O)**
```json
{
  "address": "0x1234...abcd",
  "hasStaked": true,
  "stakedAmount": "1500.00"
}
```

**Response (성공 — 스테이킹 X)**
```json
{
  "address": "0x1234...abcd",
  "hasStaked": false,
  "stakedAmount": "0"
}
```

Set-Cookie: `ton-ai-session=<JWT>; HttpOnly; Secure; SameSite=Strict; Max-Age=600`

---

#### `GET /api/auth/session`

현재 세션 정보를 반환합니다.

**Response**
```json
{
  "address": "0x1234...abcd",
  "hasStaked": true,
  "expiresAt": 1716170400
}
```

---

#### `POST /api/auth/refresh`

온체인 스테이킹 잔액을 재조회하고 JWT를 갱신합니다. 스테이킹 트랜잭션 완료 후 호출합니다.

**Response**
```json
{
  "hasStaked": true,
  "stakedAmount": "2000.00",
  "expiresAt": 1716171000
}
```

---

### 7.2 스테이킹 API

#### `GET /api/stake/status`

현재 스테이킹 현황을 반환합니다. Redis 캐시 (TTL 60s)를 사용합니다.

**Response**
```json
{
  "address": "0x1234...abcd",
  "stakedTON": "1500.00",
  "pendingWithdrawals": [
    {
      "amount": "100.00",
      "requestedAt": 1716080000,
      "processableAt": 1716684800,
      "isProcessable": false
    }
  ],
  "accruedRewards": "12.34",
  "operator": "0xoperator...address",
  "lastUpdated": 1716170340
}
```

---

### 7.3 AI API

모든 `/api/ai/*` 엔드포인트는 Middleware가 스테이킹 여부를 검증합니다.

**공통 에러 응답 (스테이킹 미완료)**
```json
{
  "error": "STAKING_REQUIRED",
  "message": "TON을 스테이킹해야 AI 기능을 사용할 수 있습니다.",
  "stakeUrl": "/dashboard"
}
```

#### `POST /api/ai/chat`

**Request**
```json
{
  "messages": [
    { "role": "user", "content": "안녕하세요" }
  ]
}
```

**Response** — `text/event-stream` (스트리밍)

---

#### `POST /api/ai/analyze`

**Request**
```json
{
  "data": "...",
  "instruction": "다음 데이터를 분석해 주세요."
}
```

**Response**
```json
{
  "result": "..."
}
```

---

## 8. 데이터 모델

### JWT Payload

```typescript
interface StakingSession {
  address: `0x${string}`;    // Ethereum 지갑 주소
  hasStaked: boolean;         // 스테이킹 여부 (> 0 TON)
  stakedWei: string;          // 스테이킹 금액 (wei, string으로 직렬화)
  iat: number;                // 발급 시각 (Unix timestamp)
  exp: number;                // 만료 시각 (iat + 600초)
}
```

### 스테이킹 상태 (캐시 스키마)

```typescript
interface StakingStatus {
  address: string;
  stakedTON: string;                 // 사람이 읽을 수 있는 형식 ("1500.00")
  stakedWei: string;                 // 원본 wei 값
  pendingWithdrawals: {
    amount: string;
    requestedAt: number;
    processableAt: number;           // requestedAt + withdrawalDelay
    isProcessable: boolean;
  }[];
  accruedRewards: string;            // 미수령 시뇨리지 보상
  operator: string;                  // 스테이킹 대상 Layer2 주소
  lastUpdated: number;               // 캐시 업데이트 시각
}
```

### 환경변수

```bash
# .env.local

# RPC
ALCHEMY_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
NEXT_PUBLIC_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY  # 클라이언트 노출용

# 인증
JWT_SECRET=your-32-byte-random-secret

# 캐시
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# 컨트랙트 주소 (Mainnet)
TON_ADDRESS=0x2be5e8c109e2197d077d13a82daead6a9b3433c5
WTON_ADDRESS=0xc4A11aaf6ea915Ed7Ac194161d2fC9384F15bff2
DEPOSIT_MANAGER_ADDRESS=0x56E465f654393fa48f007Ed7346105539b1ECD1
SWIG_MANAGER_ADDRESS=0x0b55a0f463b6defb81c6063973763951712d0e5f
DEFAULT_OPERATOR=0x...    # 기본 Layer2 operator 주소

# 스테이킹 접근 제어
# 최소 스테이킹 임계값 (TON 단위, 18 decimals 변환 후 사용)
# 산출 근거: Qwen3.6 오픈 모델 실비용 비교 (2026-05-20 기준 TON=$0.457, APY=31%)
#   - OpenRouter Qwen3.6 Plus (중간 사용 $7/월) 커버: ~594 TON
#   - 플랫폼 공유 GPU 원가 (50인 공유 $4.2/인/월) 커버: ~354 TON
#   - 자본 약정 (API 6개월치 $42 잠금): ~92 TON
#   → 균형점: 200 TON (≈ $91 ≈ 145,000원, 목표 USD 가치 $80~$120)
# TON 가격 $0.8 이상 시 100-150으로, $0.2 이하 시 500-800으로 조정 권장
MIN_STAKE_TON=200

# AI
ANTHROPIC_API_KEY=sk-ant-...
```

---

## 9. 캐싱 전략

### 캐시 레이어 설계

```typescript
// lib/cache/redis.ts
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const CACHE_KEYS = {
  stakingStatus: (address: string) => `staking:status:${address.toLowerCase()}`,
  nonce: (nonce: string) => `nonce:${nonce}`,
} as const;

const TTL = {
  stakingStatus: 60,    // 60초
  nonce: 300,           // 5분 (SIWE nonce 유효기간)
} as const;

export async function getCachedStakingStatus(
  address: string
): Promise<StakingStatus | null> {
  return redis.get(CACHE_KEYS.stakingStatus(address));
}

export async function setCachedStakingStatus(
  address: string,
  status: StakingStatus
): Promise<void> {
  await redis.setex(
    CACHE_KEYS.stakingStatus(address),
    TTL.stakingStatus,
    JSON.stringify(status)
  );
}

// 스테이킹 트랜잭션 완료 후 캐시 즉시 무효화
export async function invalidateStakingCache(address: string): Promise<void> {
  await redis.del(CACHE_KEYS.stakingStatus(address));
}
```

### 캐시 무효화 트리거

| 이벤트 | 처리 |
|--------|------|
| 스테이킹 트랜잭션 완료 | `/api/auth/refresh` 호출 → 캐시 무효화 + JWT 갱신 |
| 언스테이킹 트랜잭션 완료 | `/api/auth/refresh` 호출 → 캐시 무효화 + JWT 갱신 |
| JWT 만료 (10분) | 다음 API 요청 시 온체인 재검증 후 자동 갱신 |
| TTL 60초 경과 | Redis 자동 만료 → 다음 조회 시 온체인 신규 조회 |

---

## 10. 보안 고려사항

| 위협 | 대응 방안 |
|------|-----------|
| **스테이킹 금액 위조** | 서버가 Alchemy RPC로 온체인 직접 조회. 클라이언트 전송값 미사용. |
| **SIWE 리플레이 공격** | nonce를 사용 즉시 Redis에 기록, 5분 TTL로 재사용 방지. |
| **JWT 쿠키 도용** | `HttpOnly; Secure; SameSite=Strict` 설정. |
| **언스테이킹 후 무단 사용** | JWT TTL 10분 + 매 5분 온체인 재검증. 캐시 무효화는 클라이언트가 `/api/auth/refresh` 호출로 처리. |
| **RPC 과부하** | Redis 캐시 TTL 60초로 중복 RPC 호출 차단. |
| **악의적 Operator** | 기본 Operator를 Tokamak 공식 주소로 고정. 임의 Operator 지정 불가. |
| **환경변수 노출** | `NEXT_PUBLIC_` 접두어가 없는 변수는 서버 전용. RPC URL은 서버 측 변수 사용. |

---

## 11. 트레이드오프 분석

### 캐시 TTL: 정확성 vs 비용

| 옵션 | RPC 비용 | 정확도 | 채택 |
|------|----------|--------|------|
| 캐시 없음 (매 요청 조회) | 높음 | 100% 실시간 | ✗ |
| TTL 60초 | 낮음 | 언스테이킹 후 최대 60초 오차 | **✓** |
| TTL 5분 | 매우 낮음 | 오차 구간이 너무 길어 보안 취약 | ✗ |

언스테이킹 후 최대 60초 동안 AI 기능이 유지되는 것은 허용 범위로 판단합니다.

### SDK 안정성: 편의 vs 위험

`@ton-staking-sdk`가 아직 In Progress 상태이므로 SDK + viem 폴백을 병행합니다.

```
SDK 호출 성공 ──→ 결과 반환
SDK 호출 실패 ──→ viem 직접 컨트랙트 호출 ──→ 결과 반환
```

SDK 안정화 이후 viem 폴백 코드를 단계적으로 제거합니다.

### Operator 선택: UX vs 탈중앙화

기본 Operator를 Tokamak 공식 메인넷 L2 주소로 고정합니다. 사용자 실수를 방지하고 UX를 단순화하는 것을 우선합니다. 고급 설정 페이지에서 다른 Operator 선택을 허용하되, 기본값은 고정합니다.

---

## 12. 구현 로드맵

| Phase | 기간 | 주요 작업 |
|-------|------|-----------|
| **Phase 1** | 1~2주 | 지갑 연결 (wagmi + RainbowKit), SIWE 인증, `/api/auth/*` 완성 |
| **Phase 2** | 2~3주 | 스테이킹 UI 컴포넌트, `@ton-staking-sdk` 통합, viem 폴백 구현 |
| **Phase 3** | 1주 | Middleware Guard, Redis 캐시 연동, `/api/stake/status` |
| **Phase 4** | 1~2주 | AI Provider 연동, `/api/ai/*` 구현, `StakingGate` UI |
| **Phase 5** | 1주 | E2E 테스트 (Hardhat Mainnet Fork), 보안 검토, 모니터링 설정 |

**총 예상 기간:** 약 6~9주

### Phase 5 테스트 체크리스트

- [ ] Mainnet Fork에서 스테이킹 → AI 접근 허용 확인
- [ ] 언스테이킹 → 60초 이후 AI 접근 차단 확인
- [ ] SIWE nonce 재사용 공격 방어 확인
- [ ] RPC 장애 시 폴백 동작 확인
- [ ] Redis 장애 시 그레이스풀 디그레이드 확인

---

## 13. 참고 자료

- [TokamakStaking 메인 레포지토리](https://github.com/tokamak-network/TokamakStaking)
- [ton-staking-v2 컨트랙트](https://github.com/tokamak-network/ton-staking-v2/tree/ton-staking-v2)
- [컨트랙트 개발자 가이드](https://github.com/tokamak-network/ton-staking-v2/blob/ton-staking-v2/docs/developer-guide/README.md)
- [메인넷 배포 주소](https://github.com/tokamak-network/ton-staking-v2/blob/ton-staking-v2/docs/deployed-addresses-mainnet.md)
- [TON Staking SDK Monorepo](https://github.com/tokamak-network/ton-staking-sdk-monorepo)
- [Etherscan 사용 가이드](https://github.com/tokamak-network/TokamakStaking/blob/main/docs/EN/README.md)
- [SIWE EIP-4361](https://eips.ethereum.org/EIPS/eip-4361)
- [Tokamak Cryptoeconomics Whitepaper](https://github.com/tokamak-network/papers/blob/master/cryptoeconomics/tokamak-cryptoeconomics-en.md)
