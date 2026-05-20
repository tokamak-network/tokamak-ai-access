# L1 TON Staker → LiteLLM API Key Service (PoC)
## Cowork Handoff Document

> **이 문서의 역할**: claude.ai 웹 채팅에서 진행한 PoC 계획·결정사항·실행 스크립트 초안을 Cowork 환경으로 이관하기 위한 단일 핸드오프 문서. Cowork 새 세션 시작 시 이 파일을 첨부하고 §11의 첫 메시지 템플릿대로 지시하면 컨텍스트 손실 없이 작업을 이어갈 수 있다.

---

## 0. TL;DR
- **무엇을 만드는가**: Tokamak Network($TON, ERC-20, Ethereum L1)에 일정 수량 이상 스테이킹한 지갑 보유자에게 LiteLLM virtual API key를 자동 발급하는 웹 서비스. PoC 임계값 **10 TON**.
- **호스팅**: Vercel (Next.js App Router + API Routes로 프론트+서버리스 백엔드 일체화).
- **외부 의존**: 기존 LiteLLM 서버(`https://api2.ai.tokamak.network`) — master key로 `/key/generate` 호출, 모델명 `qwen-3.6`.
- **인증**: SIWE(Sign-In With Ethereum) → 서버에서 서명 검증 + 온체인 잔액 조회.
- **키 정책**: 발급 직후 1회만 노출, 서버는 해시만 저장, 분실 시 재발급.
- **기간**: 3일 PoC. 혼자 작업.
- **현재 위치**: 설계·결정 완료. 다음 단계는 (a) 적격자 스냅샷 추출 스크립트 실행, (b) Day 1 작업 시작.

---

## 1. 확정된 결정사항 (Decisions Log)

| # | 항목 | 결정 | 근거 |
|---|------|------|------|
| D1 | 체인 | Ethereum L1 (Mainnet 주 타깃, Sepolia 보조) | Tokamak $TON은 ERC-20, TON Blockchain 아님 |
| D2 | 자격 임계값 | 사용자 총 staked TON ≥ 10 (모든 Layer2 합산) | PoC 단순화. 운영 시 환경변수로 변경 |
| D3 | 자격 검증 시점 | 지갑 연결 시 실시간 RPC 조회 | 신규 스테이커도 즉시 자격, 스냅샷 lag 회피 |
| D4 | 인증 | SIWE (EIP-4361) + httpOnly cookie 세션 | 표준, 프록시·CSRF 방어 용이 |
| D5 | 키 발급 채널 | 자체 서버 없이 Vercel Serverless에서 LiteLLM master key 보관 후 `/key/generate` 프록시 호출 | master key 노출 차단, 별도 인프라 불필요 |
| D6 | 키 노출 정책 | 발급 즉시 1회 표시. 서버는 해시(SHA-256)만 저장. 분실 시 재발급(기존 키는 revoke). | 보안 표준, UX 약간 양보 |
| D7 | LiteLLM 모델 | alias `qwen-poc` → 실제 `qwen-3.6` (env로 매핑) | 향후 모델 확장 대비 추상화 |
| D8 | Rate limit | Vercel edge middleware로 IP 기반 60 req/min + LiteLLM key TPM/RPM | 정상 사용은 허용, DDoS만 차단 |
| D9 | DB | Vercel KV (Upstash Redis) — nonce, session, 발급 메타데이터 | SQLite는 서버리스 부적합. Postgres는 PoC 과잉 |
| D10 | 적격자 스냅샷 | PoC 코드와 별도 산출물로 분리. Dune SQL + 로컬 Python 스크립트 둘 다 제공 | 빠른 1회성(Dune) + 재현·자동화(Python) |

---

## 2. 핵심 가정 (Assumptions)
- **Layer2 합산 방식**: `SeigManagerV1_3.stakeOf(layer2, account)` (반환: WTON, 27 decimals) 또는 `DepositManagerV1_1`의 user-staked 뷰 함수를 사용. Day 1 초반에 etherscan에서 verified ABI로 정확한 함수명 확정 필요.
- **WTON ↔ TON 환산**: 1 WTON = 1 TON, 단 WTON은 ray(27 decimals), TON은 wei(18 decimals). 비교 시 같은 단위로 정규화.
- **활성 Layer2 목록**: 메인넷 기준 10개(`tokamak1`, `DXM Corp`, `DSRV`, `Talken`, `staked`, `level`, `decipher`, `DeSpread`, `Danal Fintech`, `Hammer DAO`). 신규 등록은 `Layer2Registry`에서 동적 조회 권장.
- **RPC**: 사용자가 Alchemy 또는 Infura 무료 키 보유. 미보유 시 PoC 시작 전 발급 5분.
- **LiteLLM master key**: 사용자가 별도로 보유 중이며 Vercel env에 주입 가능.

---

## 3. 컨트랙트 레퍼런스

### 3.1 Mainnet (chainId=1)
| Name | Address |
|---|---|
| TON (ERC20) | `0x2be5e8c109e2197D077D13A82dAead6a9b3433C5` |
| WTON | `0xc4A11aaf6ea915Ed7Ac194161d2fC9384F15bff2` |
| SeigManagerProxy | `0x0b55a0f463b6defb81c6063973763951712d0e5f` |
| SeigManagerV1_3 (impl) | `0xce18C6F84F10881eA47A43AF7311A29bb116F628` |
| DepositManagerProxy | `0x0b58ca72b12f01fc05f8f252e226f3e2089bd00e` |
| DepositManagerV1_1 (impl) | `0x74bC3031b9369e6b898e82784106257D4D37Eac5` |
| Layer2RegistryProxy | `0x7846c2248a7b4de77e9c2bae7fbb93bfc286837b` |

### 3.2 Layer2 (operator) — Mainnet
| Name | Layer2 Address |
|---|---|
| tokamak1 | `0xf3B17FDB808c7d0Df9ACd24dA34700ce069007DF` |
| DXM Corp | `0x44e3605d0ed58FD125E9C47D1bf25a4406c13b57` |
| DSRV | `0x2B67D8D4E61b68744885E243EfAF988f1Fc66E2D` |
| Talken | `0x36101b31e74c5E8f9a9cec378407Bbb776287761` |
| staked | `0x2c25A6be0e6f9017b5bf77879c487eed466F2194` |
| level | `0x0F42D1C40b95DF7A1478639918fc358B4aF5298D` |
| decipher | `0xbc602C1D9f3aE99dB4e9fD3662CE3D02e593ec5d` |
| DeSpread | `0xC42cCb12515b52B59c02eEc303c887C8658f5854` |
| Danal Fintech | `0xf3CF23D896Ba09d8EcdcD4655d918f71925E3FE5` |
| Hammer DAO | `0x06D34f65869Ec94B3BA8c0E08BCEb532f65005E2` |

### 3.3 Sepolia (chainId=11155111)
| Name | Address |
|---|---|
| TON | `0xa30fe40285b8f5c0457dbc3b7c8a280373c40044` |
| WTON | `0x79e0d92670106c85e9067b56b8f674340dca0bbd` |
| SeigManagerProxy | `0x2320542ae933FbAdf8f5B97cA348c7CeDA90fAd7` |
| DepositManagerProxy | `0x90ffcc7F168DceDBEF1Cb6c6eB00cA73F922956F` |
| Layer2RegistryProxy | `0xA0a9576b437E52114aDA8b0BC4149F2F5c604581` |

> 정식 출처: https://github.com/tokamak-network/ton-staking-v2/tree/ton-staking-v2/docs

---

## 4. 시스템 아키텍처 (요약)

```
[사용자 브라우저]
   │  (1) MetaMask 연결
   │  (2) SIWE 메시지 서명
   ▼
[Vercel — Next.js]
   │  ├ App Router pages (/, /dashboard)
   │  └ Route Handlers
   │      ├ POST /api/auth/nonce
   │      ├ POST /api/auth/verify   ──→ siwe lib + Vercel KV (nonce)
   │      ├ GET  /api/staking/balance ──→ viem RPC (Alchemy)
   │      ├ POST /api/keys/issue   ──→ (a) 잔액 재검증
   │      │                            (b) LiteLLM /key/generate 호출 (master key)
   │      │                            (c) Vercel KV에 hash + meta 저장
   │      └ POST /api/keys/rotate
   ▼
[LiteLLM Server]  https://api2.ai.tokamak.network
   └ virtual key 발급 → 사용자가 직접 /chat/completions 호출

[Ethereum L1 RPC]  Alchemy/Infura
```

핵심 보안 포인트:
- LiteLLM master key는 Vercel env(`LITELLM_MASTER_KEY`)에만, 브라우저로 절대 노출 안 됨.
- 발급된 virtual key는 응답 1회로만 클라이언트에 전달. 서버 저장은 SHA-256 hash만.

---

## 5. 데이터 모델 (Vercel KV / Redis 키 스키마)

```
nonce:{address}              → { nonce, expiresAt }            TTL 5분
session:{sessionId}          → { address, issuedAt, expiresAt } TTL 24시간
key:{address}                → { liteLlmKeyId, hash, createdAt, revokedAt? }
ratelimit:ip:{ip}            → counter                          TTL 60초
ratelimit:addr:{address}     → counter                          TTL 60초
```

---

## 6. API 명세 (PoC)

| Method | Path | Body | Auth | 응답 | 주요 에러 |
|---|---|---|---|---|---|
| POST | /api/auth/nonce | `{ address }` | none | `{ nonce, statement }` | 400 invalid address |
| POST | /api/auth/verify | `{ message, signature }` | none | `Set-Cookie: session` + `{ ok: true }` | 401 invalid sig / 401 expired nonce |
| GET | /api/staking/balance | — | session | `{ address, totalStakedTON, eligible }` | 401 unauth |
| POST | /api/keys/issue | — | session | `{ key, expiresAt, model: "qwen-3.6" }` *1회만* | 403 ineligible / 409 already issued |
| POST | /api/keys/rotate | — | session | `{ key, expiresAt, model }` (기존 revoke 후 신규) | 403 ineligible |
| GET | /api/keys/me | — | session | `{ hasActiveKey, createdAt, lastFour? }` | 401 unauth |

---

## 7. 화면 와이어프레임 (텍스트)

```
[ Landing / ]
+--------------------------------------------+
|  Tokamak LLM Access                        |
|  Stake >= 10 TON -> Get your API key       |
|                                            |
|  [ Connect Wallet ]                        |
|                                            |
|  How it works:                             |
|  1) Connect EVM wallet                     |
|  2) Sign message (no gas)                  |
|  3) Receive API key for qwen-3.6           |
+--------------------------------------------+

[ Dashboard /dashboard -- eligible ]
+--------------------------------------------+
|  0xabcd...1234       [ Disconnect ]        |
|                                            |
|  Total Staked: 42.7 TON  [OK] Eligible     |
|                                            |
|  +-- Your API Key ----------------------+  |
|  | (no active key)                      |  |
|  | [ Issue API Key ]                    |  |
|  +--------------------------------------+  |
|                                            |
|  Endpoint: https://api2.ai.tokamak.network |
|  Model:    qwen-3.6                        |
+--------------------------------------------+

[ Dashboard -- after issue (1회 노출) ]
+--------------------------------------------+
|  !! Save this key now. It won't be shown   |
|     again.                                 |
|  sk-litellm-xxxxxxxxxxxxxxxx  [ Copy ]     |
|                                            |
|  Example:                                  |
|  curl https://api2.ai.tokamak.network/...  |
|       -H "Authorization: Bearer sk-..."    |
+--------------------------------------------+

[ Dashboard -- ineligible ]
+--------------------------------------------+
|  0xabcd...1234                             |
|  Total Staked: 3.2 TON  [X] Not eligible   |
|  Stake at least 10 TON to receive a key.   |
|  -> tokamak.network/staking                |
+--------------------------------------------+
```

---

## 8. 적격자 스냅샷 추출 — 실행 단계 패키지

지갑 연결 시점의 실시간 검증과는 별개로, **현재 적격자 사전 리스트**를 추출하는 두 가지 방법을 모두 제공한다.

### 8.1 옵션 A — Dune SQL (빠른 1회 스냅샷)

> Dune 가입(무료) 후 New Query에 붙여넣고 실행. 결과는 CSV로 다운로드.
> 컨트랙트 인덱싱이 Dune 측에 되어 있는지 확인 필요. 안 되면 raw logs 쿼리로 fallback.

```sql
-- Dune Query: Tokamak L1 -- eligible stakers (>=10 TON net deposit)
-- Note: 결과의 staked_ton은 WTON ray(27 decimals)에서 정규화한 값.
-- DepositManagerProxy 이벤트 기준 net deposit. 시뇨리지 반영분은 ±수% 차이.
-- 정확한 시뇨리지 반영 잔액은 SeigManager.stakeOf 실시간 호출로 검증.

WITH deposits AS (
  SELECT
    "to"        AS account,
    layer2      AS layer2,
    amount/1e27 AS amount_ton
  FROM ethereum.logs_decoded
  WHERE contract_address = 0x0b58ca72b12f01fc05f8f252e226f3e2089bd00e
    AND event_name = 'Deposited'
),
withdrawals AS (
  SELECT
    "from"      AS account,
    layer2      AS layer2,
    amount/1e27 AS amount_ton
  FROM ethereum.logs_decoded
  WHERE contract_address = 0x0b58ca72b12f01fc05f8f252e226f3e2089bd00e
    AND event_name IN ('WithdrawalProcessed','WithdrawalRequested')
),
net AS (
  SELECT account, SUM(amount_ton) AS staked_ton FROM deposits  GROUP BY account
  EXCEPT
  SELECT account, SUM(amount_ton)              FROM withdrawals GROUP BY account
)
SELECT
  account,
  SUM(staked_ton) AS staked_ton
FROM net
GROUP BY account
HAVING SUM(staked_ton) >= 10
ORDER BY staked_ton DESC;
```

**주의**: 위 쿼리는 Dune의 `logs_decoded` 테이블이 DepositManagerProxy ABI를 디코딩하고 있다고 가정한다. 디코딩 안 되어 있으면:
1. Dune에서 컨트랙트 등록 요청 또는
2. raw `ethereum.logs`로 topic0 기반 필터링 + manual decode 필요 (verified ABI의 event signature hash 추출 필요)

### 8.2 옵션 B — 로컬 Python 스크립트 (재현 가능, 자동화 가능)

다음 파일들을 Cowork에서 그대로 생성한 후 실행. 결과는 `data/eligible_holders.csv`.

#### `scripts/snapshot_eligible_stakers.py`

```python
"""
Tokamak Network -- Eligible Stakers Snapshot

전제: Alchemy/Infura mainnet RPC URL 보유.

실행:
  pip install web3==7.* python-dotenv
  export RPC_URL="https://eth-mainnet.g.alchemy.com/v2/<KEY>"
  export MIN_TON=10
  python scripts/snapshot_eligible_stakers.py

출력:
  data/eligible_holders.csv  (address, total_staked_ton, layers)
"""

from __future__ import annotations
import csv
import json
import os
import sys
import time
from decimal import Decimal, getcontext
from pathlib import Path

from web3 import Web3
from web3.exceptions import ContractLogicError

getcontext().prec = 50

RPC_URL = os.environ.get("RPC_URL")
if not RPC_URL:
    sys.exit("RPC_URL env var required (Alchemy/Infura mainnet URL)")

MIN_TON = Decimal(os.environ.get("MIN_TON", "10"))
OUT_DIR = Path("data")
OUT_DIR.mkdir(exist_ok=True)

# --- Contracts (mainnet) ---
SEIG_MANAGER_PROXY    = Web3.to_checksum_address("0x0b55a0f463b6defb81c6063973763951712d0e5f")
DEPOSIT_MANAGER_PROXY = Web3.to_checksum_address("0x0b58ca72b12f01fc05f8f252e226f3e2089bd00e")
LAYER2_REGISTRY_PROXY = Web3.to_checksum_address("0x7846c2248a7b4de77e9c2bae7fbb93bfc286837b")

# Hardcoded layer2 list. Layer2RegistryProxy에서 동적 조회로 교체 권장.
LAYER2S = {
    "tokamak1":      "0xf3B17FDB808c7d0Df9ACd24dA34700ce069007DF",
    "DXM Corp":      "0x44e3605d0ed58FD125E9C47D1bf25a4406c13b57",
    "DSRV":          "0x2B67D8D4E61b68744885E243EfAF988f1Fc66E2D",
    "Talken":        "0x36101b31e74c5E8f9a9cec378407Bbb776287761",
    "staked":        "0x2c25A6be0e6f9017b5bf77879c487eed466F2194",
    "level":         "0x0F42D1C40b95DF7A1478639918fc358B4aF5298D",
    "decipher":      "0xbc602C1D9f3aE99dB4e9fD3662CE3D02e593ec5d",
    "DeSpread":      "0xC42cCb12515b52B59c02eEc303c887C8658f5854",
    "Danal Fintech": "0xf3CF23D896Ba09d8EcdcD4655d918f71925E3FE5",
    "Hammer DAO":    "0x06D34f65869Ec94B3BA8c0E08BCEb532f65005E2",
}

# DepositManager event topic0 후보 -- verified ABI에서 정확한 값 확인 후 교체.
# keccak("Deposited(address,address,uint256)") 등.
DEPOSITED_TOPIC_CANDIDATES = [
    "0x8752a472e571a816aea92eec8dae9baf628e840f4929fbcc2d155e6233ff68a7",
]

SEIG_MANAGER_ABI = json.loads("""[
  {"inputs":[{"name":"layer2","type":"address"},{"name":"account","type":"address"}],
   "name":"stakeOf","outputs":[{"name":"","type":"uint256"}],
   "stateMutability":"view","type":"function"}
]""")

w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={"timeout": 30}))
if not w3.is_connected():
    sys.exit("RPC connection failed")
print(f"[i] Connected. Latest block: {w3.eth.block_number}")

seig = w3.eth.contract(address=SEIG_MANAGER_PROXY, abi=SEIG_MANAGER_ABI)

# --- Phase 1: 후보 주소 수집 -- DepositManagerProxy Deposited 이벤트 풀스캔 ---
print("[i] Phase 1: Collecting depositor addresses from DepositManagerProxy logs...")

DEPLOY_BLOCK = 12_000_000   # etherscan에서 정확한 deploy block 확인 후 교체하면 단축
CHUNK = 50_000

latest = w3.eth.block_number
candidates: set[str] = set()

start = DEPLOY_BLOCK
while start <= latest:
    end = min(start + CHUNK - 1, latest)
    try:
        logs = w3.eth.get_logs({
            "fromBlock": start,
            "toBlock": end,
            "address": DEPOSIT_MANAGER_PROXY,
            "topics": [DEPOSITED_TOPIC_CANDIDATES],
        })
        for lg in logs:
            if len(lg["topics"]) >= 2:
                addr = "0x" + lg["topics"][1].hex()[-40:]
                candidates.add(Web3.to_checksum_address(addr))
        print(f"  blocks {start}-{end}: cumulative candidates = {len(candidates)}")
    except Exception as e:
        print(f"  WARN blocks {start}-{end}: {e}. Halving chunk.")
        if CHUNK > 1000:
            CHUNK //= 2
            continue
        raise
    start = end + 1
    time.sleep(0.1)

print(f"[i] Phase 1 done. Unique depositors: {len(candidates)}")

# --- Phase 2: SeigManager.stakeOf(layer2, account) 호출, layer2별 합산 ---
print(f"[i] Phase 2: Querying current stakes for {len(candidates)} addresses...")

WTON_DECIMALS = 27
SCALE = Decimal(10) ** WTON_DECIMALS

results: dict[str, dict] = {}
for i, addr in enumerate(sorted(candidates), 1):
    total = Decimal(0)
    layers_with_stake = []
    for name, layer2 in LAYER2S.items():
        l2 = Web3.to_checksum_address(layer2)
        try:
            raw = seig.functions.stakeOf(l2, addr).call()
            if raw > 0:
                amt = Decimal(raw) / SCALE
                total += amt
                layers_with_stake.append(f"{name}:{amt:.4f}")
        except ContractLogicError:
            pass
        except Exception as e:
            print(f"  ! {addr} {name}: {e}")
    if total >= MIN_TON:
        results[addr] = {"staked_ton": total, "layers": "|".join(layers_with_stake)}
    if i % 25 == 0:
        print(f"  progress {i}/{len(candidates)}  eligible so far: {len(results)}")

# --- Phase 3: CSV 출력 ---
out = OUT_DIR / "eligible_holders.csv"
with out.open("w", newline="") as f:
    wr = csv.writer(f)
    wr.writerow(["address", "total_staked_ton", "layers"])
    for addr, row in sorted(results.items(), key=lambda x: -x[1]["staked_ton"]):
        wr.writerow([addr, f"{row['staked_ton']:.6f}", row["layers"]])

print(f"[OK] Done. {len(results)} eligible addresses -> {out}")
```

#### `scripts/README.md`

```markdown
# Eligible Stakers Snapshot

## Prerequisites
- Python 3.10+
- Alchemy/Infura mainnet RPC URL (free tier OK)
- 10-30 minutes runtime (depending on RPC throughput)

## Install
pip install web3==7.* python-dotenv

## Run
export RPC_URL="https://eth-mainnet.g.alchemy.com/v2/<YOUR_KEY>"
export MIN_TON=10
python scripts/snapshot_eligible_stakers.py

## Output
data/eligible_holders.csv -- columns: address, total_staked_ton, layers

## Known issues / TODOs
1. DEPLOY_BLOCK: 보수적으로 12_000_000. 실제 deploy block을 etherscan에서 확인 후 교체하면 스캔 시간 단축.
2. DEPOSITED_TOPIC_CANDIDATES: DepositManagerProxy verified ABI에서 정확한 event topic0 확인 후 보정. 잘못된 topic이면 Phase 1 후보가 비어 있다.
3. Layer2 목록: 신규 추가 가능. Layer2RegistryProxy.layer2sLength() + layer2sByIndex(i) 동적 조회로 교체 권장.
4. stakeOf는 시뇨리지 반영 현재 잔액이므로 별도 WithdrawalRequested 차감 불필요.
```

### 8.3 두 방법 비교
| 항목 | Dune SQL | Python 스크립트 |
|---|---|---|
| 환경 | 웹 브라우저만 | 로컬 + RPC key |
| 실행 시간 | 30초~수 분 | 10~30분 |
| 정확도 | 이벤트 net deposit (시뇨리지 미반영) | stakeOf 실시간 (시뇨리지 반영) ← 정확 |
| 재현성 | 쿼리 공유로 가능 | git에 코드 포함 |
| CI 자동화 | 어려움 | 쉬움 |
| 권장 용도 | 빠른 1회 탐색 | 정식 스냅샷, 주기 갱신 |

→ **두 결과를 cross-check 하는 것이 안전.**

---

## 9. PoC 작업 계획 (3일)

### Day 1 — 설계 확정 & 골격 (~8h)
- **T1.1** Tokamak 컨트랙트 ABI 확정 (0.5h) — etherscan에서 SeigManagerV1_3, DepositManagerV1_1, Layer2Registry verified ABI 다운로드. 정확한 view 함수명(`stakeOf`, `totalStakedAmount` 등) 검증.
- **T1.2** PRD 작성 (1.5h) — `docs/PRD.md`. 본 핸드오프 §0, §1, §2를 확장하여 페르소나·유저스토리·성공지표·In/Out 스코프 명시.
- **T1.3** 기능정의서 (1.5h) — `docs/FunctionalSpec.md`. 본 §6 API 명세를 정상·실패 케이스 포함하여 확장.
- **T1.4** 테스트 설계서 (1h) — `docs/TestPlan.md`. 단위/통합/E2E 매트릭스. 본 §6의 모든 API가 1개 이상 케이스 보유.
- **T1.5** 와이어프레임 확정 (0.5h) — 본 §7을 Figma 또는 svg로 옮길지 결정. PoC는 텍스트 와이어 그대로도 OK.
- **T1.6** Next.js 프로젝트 초기화 (1h) — `pnpm create next-app`, App Router, Tailwind, wagmi/viem 설치. Vercel KV 연동.
- **T1.7** 적격자 스냅샷 실행 (1h) — §8의 Python 스크립트로 메인넷 1회 추출, 결과 검토. Dune 쿼리도 병행 실행하여 cross-check.
- **T1.8** Vercel 프로젝트 생성 + env 설정 (0.5h) — `LITELLM_BASE_URL`, `LITELLM_MASTER_KEY`, `RPC_URL`, `KV_*`, `SESSION_SECRET`.

### Day 2 — Serverless API + LiteLLM 연동 (~8h)
- **T2.1** `siwe` 라이브러리 통합 + nonce/verify 라우트 (1.5h)
- **T2.2** viem 기반 staking 조회 모듈 `lib/staking.ts` (1.5h) — `getTotalStakedTON(address): bigint` (18 decimals). 60s 메모리 캐시.
- **T2.3** `POST /api/keys/issue` (2h) — 세션 확인 → 잔액 재검증 → LiteLLM `/key/generate` 호출 → 해시 저장 → 키 1회 반환.
- **T2.4** Rate limit middleware (1h) — `@upstash/ratelimit` (Vercel KV 호환).
- **T2.5** 단위 테스트 (vitest) (1h) — siwe verify, staking conv, hash compare.
- **T2.6** Postman/Insomnia 컬렉션 (1h) — E2E 수동 테스트용.

### Day 3 — 프론트 통합 + 마감 (~8h)
- **T3.1** wagmi 지갑 연결 (1.5h)
- **T3.2** SIWE 서명 플로우 (1h)
- **T3.3** 대시보드 UI: 잔액·자격·키 발급 (2h)
- **T3.4** E2E 시연 (적격 1, 미적격 1 주소) + curl 호출로 qwen-3.6 응답 받기 (1h)
- **T3.5** README + 데모 GIF (1h)
- **T3.6** 버퍼 (1.5h)

### 리스크
- LiteLLM 서버의 `/key/generate` 스펙 차이 → Day 2 초반 1회 호출로 즉시 확인.
- DepositManager event signature 추정 오류 → Day 1 T1.1에서 verified ABI로 확정.
- SIWE viem ↔ siwe-js 메시지 호환성 → EIP-4361 표준 포맷 고수.

---

## 10. 폴더 구조 (제안)

```
ton-llm-key/
├── app/
│   ├── page.tsx                  # Landing
│   ├── dashboard/page.tsx
│   ├── api/
│   │   ├── auth/nonce/route.ts
│   │   ├── auth/verify/route.ts
│   │   ├── staking/balance/route.ts
│   │   ├── keys/issue/route.ts
│   │   ├── keys/rotate/route.ts
│   │   └── keys/me/route.ts
│   └── layout.tsx
├── lib/
│   ├── siwe.ts
│   ├── staking.ts                # viem + ABI
│   ├── litellm.ts                # /key/generate client
│   ├── kv.ts                     # Vercel KV wrapper
│   └── ratelimit.ts
├── abi/
│   ├── SeigManagerV1_3.json
│   ├── DepositManagerV1_1.json
│   └── Layer2Registry.json
├── scripts/
│   ├── snapshot_eligible_stakers.py
│   └── README.md
├── data/
│   └── eligible_holders.csv      # gitignore 권장
├── docs/
│   ├── PRD.md
│   ├── FunctionalSpec.md
│   ├── TestPlan.md
│   └── wireframe.md
├── tests/
│   ├── siwe.test.ts
│   ├── staking.test.ts
│   └── e2e.md
├── .env.example
├── README.md
└── package.json
```

`.env.example`:
```
LITELLM_BASE_URL=https://api2.ai.tokamak.network
LITELLM_MASTER_KEY=sk-...
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/...
RPC_URL_SEPOLIA=https://eth-sepolia.g.alchemy.com/v2/...
KV_URL=...
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
SESSION_SECRET=<openssl rand -base64 32>
MIN_TON=10
```

---

## 11. Cowork 첫 메시지 템플릿

Cowork 새 세션에서 이 핸드오프 문서를 첨부하고 다음 메시지로 시작하면 된다:

> 첨부한 `HANDOFF.md`는 이전 claude.ai 채팅에서 합의한 PoC 계획서다. 모든 결정사항·가정·컨트랙트 주소·API 설계·작업 일정이 들어있다.
>
> 지금부터 너는 이 핸드오프 문서를 정답지로 삼아 작업을 이어간다. 첫 작업으로:
>
> 1. 문서 §10의 폴더 구조대로 `ton-llm-key/` 모노레포 골격을 만들어줘 (Next.js App Router + TypeScript + Tailwind + wagmi/viem).
> 2. 문서 §8.2의 `scripts/snapshot_eligible_stakers.py`와 `scripts/README.md`를 그대로 생성.
> 3. `.env.example`을 §10 명세대로 생성.
> 4. 끝나면 Day 1의 T1.7(스냅샷 스크립트 실행)을 위해 내가 어떤 환경변수를 넣어야 하는지 알려줘.
>
> 시작해.

---

## 12. 변경 이력

| 일시 | 변경 내용 |
|---|---|
| 2026-05-19 | 초기 핸드오프 문서 생성 (PoC 계획 + 적격자 스냅샷 패키지 포함) |
