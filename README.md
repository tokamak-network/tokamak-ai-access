# TON AI Access

**TON AI Access** — Stake ≥ 100 TON on Ethereum L1 → Receive a LiteLLM virtual API key, then configure Claude Code or Codex in one command.

> PoC. Built in 3 days. See `docs/` for PRD, Functional Spec, and Test Plan.

## Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 14 App Router (TypeScript) |
| Styling | Tailwind CSS |
| Wallet | wagmi v2 + viem |
| Auth | SIWE (EIP-4361) + httpOnly cookie |
| DB | Vercel KV (Upstash Redis) |
| Hosting | Vercel |
| LLM gateway | LiteLLM @ api2.ai.tokamak.network |

## Quick Start (로컬 개발)

```bash
npm install
cp .env.example .env.local   # 환경변수 입력 (아래 참조)
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 열기.

> **사전 조건**: Vercel KV (Upstash Redis) 연결 없이는 세션 쿠키가 저장되지 않아  
> SIWE verify 이후 대시보드가 401을 반환합니다. T1.8 완료 후 전체 플로우 동작 가능.

## 환경변수

| 변수 | 설명 |
|------|------|
| `LITELLM_BASE_URL` | LiteLLM proxy 주소 (예: `https://api2.ai.tokamak.network`) |
| `LITELLM_MASTER_KEY` | LiteLLM master key — 서버 전용, `NEXT_PUBLIC_` 절대 금지 |
| `RPC_URL` | Ethereum mainnet RPC (Alchemy / Infura) |
| `KV_REST_API_URL` | Vercel KV (Upstash) REST URL — Vercel Dashboard에서 자동 주입 |
| `KV_REST_API_TOKEN` | Vercel KV (Upstash) token — Vercel Dashboard에서 자동 주입 |
| `SESSION_SECRET` | 세션 서명 키 (`openssl rand -base64 32`) |
| `MIN_TON` | 최소 스테이킹 TON (기본값: `100`) |

전체 목록과 예시값은 `.env.example` 참조.

## Vercel 배포

```bash
# 1. Vercel CLI로 프로젝트 연결
vercel link

# 2. Upstash Redis 연결 (Vercel Dashboard → Storage → Connect Store)
#    → KV_REST_API_URL, KV_REST_API_TOKEN 자동 주입

# 3. 나머지 환경변수 추가
vercel env add LITELLM_BASE_URL
vercel env add LITELLM_MASTER_KEY
vercel env add RPC_URL
vercel env add SESSION_SECRET   # openssl rand -base64 32

# 4. 배포
vercel --prod
```

## CLI 자동 설정 (키 발급 후)

API 키 발급 후 대시보드에서 에이전트 실행 지시문을 복사해 AI 에이전트에 붙여넣으면  
`configure-cli.sh`가 자동으로 Claude Code + Codex 환경변수를 설정합니다.

직접 실행도 가능합니다:

```bash
TON_API_KEY="sk-litellm-..." \
TON_MODEL="qwen-3.6" \
bash <(curl -fsSL https://tokamak-ai-access.vercel.app/configure-cli.sh) \
  --non-interactive --target claude   # or --target codex
# 새 터미널(또는 세션 종료 후)에서 실행:
#   source ~/.zshrc
```

자세한 내용은 `docs/agent-install-guide.md` 참조.

## 단위 테스트

```bash
npm test          # vitest run (11개 테스트)
npm run test:watch
```

예상 결과: `tests/siwe.test.ts` 4개 + `tests/staking.test.ts` 7개 = **11 pass**.

## Eligible Stakers Snapshot (선택)

```bash
pip install "web3==7.*" python-dotenv
export RPC_URL="https://eth-mainnet.g.alchemy.com/v2/<KEY>"
python scripts/snapshot_eligible_stakers.py
# → data/eligible_holders.csv  (gitignored)
```

`scripts/README.md` 참조.

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/api/auth/nonce` | SIWE nonce 발급 |
| `POST` | `/api/auth/verify` | SIWE 서명 검증 → 세션 쿠키 |
| `GET` | `/api/staking/balance` | 스테이킹 잔액 + 자격 여부 |
| `POST` | `/api/keys/issue` | LiteLLM 키 발급 (1회성 반환) |
| `POST` | `/api/keys/rotate` | 기존 키 폐기 + 신규 발급 |
| `GET` | `/api/keys/me` | 키 존재 여부 + last-four |

Postman 컬렉션: `docs/postman/TON-AI-Access.postman_collection.json`

## 프로젝트 구조

```
tokamak-ai-access/
├── app/
│   ├── layout.tsx                    # Root layout + Providers (wagmi, QueryClient)
│   ├── providers.tsx                 # WagmiProvider + QueryClientProvider
│   ├── globals.css
│   ├── page.tsx                      # 랜딩 — Connect Wallet + SIWE sign-in
│   ├── dashboard/
│   │   └── page.tsx                  # 대시보드 — 잔액·키 발급·CLI 설정 패널
│   └── api/
│       ├── auth/nonce/route.ts       # POST /api/auth/nonce
│       ├── auth/verify/route.ts      # POST /api/auth/verify
│       ├── staking/balance/route.ts  # GET  /api/staking/balance
│       ├── keys/issue/route.ts       # POST /api/keys/issue
│       ├── keys/rotate/route.ts      # POST /api/keys/rotate
│       └── keys/me/route.ts          # GET  /api/keys/me
├── lib/
│   ├── wagmi.ts                      # wagmi v2 config (mainnet, MetaMask)
│   ├── hooks/
│   │   └── useSiwe.ts               # SIWE 플로우 훅 (nonce→sign→verify)
│   ├── siwe.ts                       # 서버: 세션 쿠키 → address 해석
│   ├── staking.ts                    # viem multicall — getTotalStakedTON()
│   ├── litellm.ts                    # LiteLLM /key/generate · /key/delete
│   ├── kv.ts                         # Vercel KV wrapper + hashKey()
│   ├── ratelimit.ts                  # @upstash/ratelimit
│   └── with-rate-limit.ts           # rate limit 미들웨어 헬퍼
├── abi/
│   ├── SeigManagerV1_3.json
│   ├── DepositManagerV1_1.json
│   └── Layer2Registry.json
├── scripts/
│   ├── configure-cli.sh             # Claude Code + Codex env 자동 설정
│   ├── snapshot_eligible_stakers.py
│   └── README.md
├── docs/
│   ├── PRD.md
│   ├── FunctionalSpec.md
│   ├── TestPlan.md
│   ├── NOTES.md                      # 이슈·결정·확인 항목 기록
│   ├── agent-install-guide.md        # 에이전트 실행 가이드
│   ├── wireframe.html                # 인터랙티브 와이어프레임 (6 화면)
│   └── postman/                      # Postman 컬렉션 + 환경변수
├── tests/
│   ├── siwe.test.ts
│   └── staking.test.ts
├── .env.example
├── .gitignore
├── HANDOFF.md
├── TODO.md
└── README.md
```

## Contracts (Ethereum Mainnet)

| Contract | Address |
|----------|---------|
| TON (ERC-20) | `0x2be5e8c109e2197D077D13A82dAead6a9b3433C5` |
| SeigManagerProxy | `0x0b55a0f463b6defb81c6063973763951712d0e5f` |
| DepositManagerProxy | `0x0b58ca72b12f01fc05f8f252e226f3e2089bd00e` |
| Layer2RegistryProxy | `0x7846c2248a7b4de77e9c2bae7fbb93bfc286837b` |

Full list in `HANDOFF.md §3`.
