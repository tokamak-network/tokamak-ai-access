# Scripts

> **주의**: `configure-cli.sh`를 수정할 때는 `public/configure-cli.sh`도 동일하게 갱신해야 합니다. `public/` 파일이 Vercel에서 그대로 서빙됩니다.

---

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
