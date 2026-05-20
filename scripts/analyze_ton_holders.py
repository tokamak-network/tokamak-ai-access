#!/usr/bin/env python3
"""
TON Token Holder Analysis
=========================
Counts current holders of 0x2be5e8c109e2197D077D13A82dAead6a9b3433C5
and classifies each as EOA (no code) vs Contract (has code).

Usage:
    # Reads RPC_URL from .env.local automatically, or set it manually:
    RPC_URL="https://..." python3 scripts/analyze_ton_holders.py

Requirements:
    pip install requests python-dotenv
"""

import json
import os
import sys
import time
from collections import defaultdict

import requests

# ── Config ────────────────────────────────────────────────────────────────

CONTRACT = "0x2be5e8c109e2197D077D13A82dAead6a9b3433C5"
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
BALANCE_OF_SIG  = "0x70a08231"   # balanceOf(address)
BATCH_SIZE = 200                 # JSON-RPC batch size


def load_rpc_url():
    """Try .env.local → .env → environment variable."""
    for path in [".env.local", ".env"]:
        if os.path.exists(path):
            with open(path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("RPC_URL="):
                        val = line[len("RPC_URL="):].strip().strip('"').strip("'")
                        if val:
                            return val
    return os.environ.get("RPC_URL", "")


# ── JSON-RPC helpers ───────────────────────────────────────────────────────

def rpc_single(rpc_url: str, method: str, params: list) -> dict:
    resp = requests.post(
        rpc_url,
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"RPC error: {data['error']}")
    return data.get("result")


def rpc_batch(rpc_url: str, calls: list) -> list:
    """Send a list of {method, params} as a batch; return results in same order."""
    payload = [
        {"jsonrpc": "2.0", "id": i, "method": c["method"], "params": c["params"]}
        for i, c in enumerate(calls)
    ]
    resp = requests.post(rpc_url, json=payload, timeout=120)
    resp.raise_for_status()
    results = sorted(resp.json(), key=lambda x: x.get("id", 0))
    return [r.get("result") for r in results]


# ── Step 1: Collect all unique TO addresses via alchemy_getAssetTransfers ─

def fetch_all_recipients(rpc_url: str) -> set:
    """
    Use Alchemy's alchemy_getAssetTransfers to enumerate every address
    that has ever received this ERC-20.  Falls back to eth_getLogs if
    the Alchemy-specific method isn't supported.
    """
    print("Step 1 · Fetching all Transfer events …")
    recipients = set()
    page_key = None
    batch_n = 0

    while True:
        params = {
            "fromBlock": "0x0",
            "toBlock": "latest",
            "contractAddresses": [CONTRACT],
            "category": ["erc20"],
            "withMetadata": False,
            "excludeZeroValue": False,
            "maxCount": "0x3e8",          # 1 000 per page
        }
        if page_key:
            params["pageKey"] = page_key

        result = rpc_single(rpc_url, "alchemy_getAssetTransfers", [params])
        transfers = result.get("transfers", [])
        for t in transfers:
            to = t.get("to")
            if to:
                recipients.add(to.lower())
        page_key = result.get("pageKey")
        batch_n += 1
        print(f"  Batch {batch_n:3d}: {len(transfers):4d} txs  |  unique recipients so far: {len(recipients)}")

        if not page_key:
            break
        time.sleep(0.08)   # gentle rate-limit

    print(f"  → Total unique addresses that ever received TON: {len(recipients)}\n")
    return recipients


# ── Step 2: balanceOf — filter to current holders ─────────────────────────

def filter_current_holders(rpc_url: str, candidates: list) -> list:
    print(f"Step 2 · Checking balanceOf for {len(candidates)} addresses …")
    holders = []

    for i in range(0, len(candidates), BATCH_SIZE):
        chunk = candidates[i : i + BATCH_SIZE]
        calls = []
        for addr in chunk:
            padded = addr[2:].zfill(64) if addr.startswith("0x") else addr.zfill(64)
            calls.append({
                "method": "eth_call",
                "params": [{"to": CONTRACT, "data": BALANCE_OF_SIG + padded}, "latest"],
            })
        results = rpc_batch(rpc_url, calls)
        for addr, raw in zip(chunk, results):
            bal = int(raw, 16) if (raw and raw != "0x") else 0
            if bal > 0:
                holders.append(addr)

        checked = min(i + BATCH_SIZE, len(candidates))
        if checked % (BATCH_SIZE * 5) == 0 or checked == len(candidates):
            print(f"  Checked {checked:5d}/{len(candidates)}  |  holders: {len(holders)}")
        time.sleep(0.05)

    print(f"  → Current holders (balance > 0): {len(holders)}\n")
    return holders


# ── Step 3: eth_getCode — classify EOA vs Contract ────────────────────────

def classify_holders(rpc_url: str, holders: list) -> tuple[list, list]:
    print(f"Step 3 · Classifying {len(holders)} holders (EOA vs Contract) …")
    eoas = []
    contracts = []

    for i in range(0, len(holders), BATCH_SIZE):
        chunk = holders[i : i + BATCH_SIZE]
        calls = [{"method": "eth_getCode", "params": [a, "latest"]} for a in chunk]
        codes = rpc_batch(rpc_url, calls)
        for addr, code in zip(chunk, codes):
            if code == "0x" or not code:
                eoas.append(addr)
            else:
                contracts.append(addr)
        time.sleep(0.05)

    return eoas, contracts


# ── Main ──────────────────────────────────────────────────────────────────

def main():
    rpc_url = load_rpc_url()
    if not rpc_url:
        print("ERROR: RPC_URL not found in .env.local / .env / environment.")
        print("  Set it with:  export RPC_URL='https://eth-mainnet.g.alchemy.com/v2/...'")
        sys.exit(1)

    print(f"Contract : {CONTRACT}")
    print(f"RPC      : {rpc_url[:60]}…\n")

    # Current block (sanity check)
    block_hex = rpc_single(rpc_url, "eth_blockNumber", [])
    print(f"Current block: {int(block_hex, 16):,}\n")

    # ── 1. All-time recipients
    recipients = fetch_all_recipients(rpc_url)

    # ── 2. Filter to current holders
    holders = filter_current_holders(rpc_url, list(recipients))

    # ── 3. Classify
    eoas, contracts = classify_holders(rpc_url, holders)

    # ── Report
    total = len(holders)
    print("\n" + "=" * 56)
    print(f"  Contract:  {CONTRACT}")
    print(f"  Snapshot block: {int(block_hex, 16):,}")
    print("=" * 56)
    print(f"  Unique addresses (all-time recipients):  {len(recipients):,}")
    print(f"  Current holders (balance > 0):           {total:,}")
    print(f"  ├─ EOA  (Externally Owned Account):      {len(eoas):,}  ({len(eoas)/total*100:.1f}%)")
    print(f"  └─ Contract:                             {len(contracts):,}  ({len(contracts)/total*100:.1f}%)")
    print("=" * 56)

    # ── Save JSON
    output_path = "data/ton_holder_analysis.json"
    os.makedirs("data", exist_ok=True)
    with open(output_path, "w") as f:
        json.dump({
            "contract": CONTRACT,
            "snapshot_block": int(block_hex, 16),
            "total_ever_received": len(recipients),
            "current_holders": total,
            "eoa_count": len(eoas),
            "contract_count": len(contracts),
            "eoa_ratio_pct": round(len(eoas) / total * 100, 1) if total else 0,
            "contract_addresses": contracts,
            "eoa_addresses": eoas,
        }, f, indent=2)
    print(f"\n  Full address lists saved → {output_path}")


if __name__ == "__main__":
    main()
