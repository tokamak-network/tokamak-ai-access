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

import requests
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

# keccak256("Deposited(address,address,uint256)") -- 검증 완료
DEPOSITED_TOPIC0 = "0x8752a472e571a816aea92eec8dae9baf628e840f4929fbcc2d155e6233ff68a7"

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

# --- Phase 1: 후보 주소 수집 ---
# Alchemy free tier는 eth_getLogs 블록 범위 10개 제한 → alchemy_getAssetTransfers 사용.
# Alchemy 외 RPC(Ankr, LlamaRPC 등)를 쓰는 경우 USE_ALCHEMY=false 로 설정하면
# eth_getLogs 방식(50,000블록 청크)으로 동작합니다.
print("[i] Phase 1: Collecting depositor addresses from DepositManagerProxy...")

IS_ALCHEMY = "alchemy.com" in RPC_URL

def _phase1_alchemy() -> set[str]:
    """alchemy_getAssetTransfers로 DepositManager 에 ERC-20 입금한 주소 수집."""
    found: set[str] = set()
    page_key: str | None = None
    page = 0
    while True:
        params: dict = {
            "toAddress":       DEPOSIT_MANAGER_PROXY,
            "category":        ["erc20"],
            "withMetadata":    False,
            "excludeZeroValue": True,
            "maxCount":        "0x3e8",   # 1,000 per page
        }
        if page_key:
            params["pageKey"] = page_key
        payload = {
            "jsonrpc": "2.0", "id": 1,
            "method":  "alchemy_getAssetTransfers",
            "params":  [params],
        }
        r = requests.post(RPC_URL, json=payload, timeout=60)
        r.raise_for_status()
        data = r.json()
        if "error" in data:
            raise RuntimeError(f"alchemy_getAssetTransfers error: {data['error']}")
        transfers = data["result"]["transfers"]
        for tx in transfers:
            found.add(Web3.to_checksum_address(tx["from"]))
        page += 1
        print(f"  page {page}: +{len(transfers)} transfers, cumulative depositors = {len(found)}")
        page_key = data["result"].get("pageKey")
        if not page_key:
            break
        time.sleep(0.1)
    return found

def _phase1_eth_logs() -> set[str]:
    """eth_getLogs 방식 (Alchemy 외 RPC 또는 PAYG 플랜용)."""
    found: set[str] = set()
    DEPLOY_BLOCK = 12_000_000
    CHUNK = 50_000
    latest_blk = w3.eth.block_number
    start = DEPLOY_BLOCK
    while start <= latest_blk:
        end = min(start + CHUNK - 1, latest_blk)
        try:
            logs = w3.eth.get_logs({
                "fromBlock": start,
                "toBlock":   end,
                "address":   DEPOSIT_MANAGER_PROXY,
                "topics":    [DEPOSITED_TOPIC0],
            })
            for lg in logs:
                if len(lg["topics"]) >= 2:
                    addr = "0x" + lg["topics"][1].hex()[-40:]
                    found.add(Web3.to_checksum_address(addr))
            print(f"  blocks {start}-{end}: cumulative candidates = {len(found)}")
        except Exception as e:
            print(f"  WARN blocks {start}-{end}: {e}. Halving chunk.")
            if CHUNK > 100:
                CHUNK //= 2
                continue
            raise
        start = end + 1
        time.sleep(0.1)
    return found

if IS_ALCHEMY:
    print("[i] Alchemy RPC detected → using alchemy_getAssetTransfers (no block range limit)")
    candidates = _phase1_alchemy()
else:
    print("[i] Non-Alchemy RPC → using eth_getLogs (50,000 block chunks)")
    candidates = _phase1_eth_logs()

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
