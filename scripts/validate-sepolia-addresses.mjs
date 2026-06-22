/**
 * Validate Sepolia contract addresses against:
 *   1. Official deployed-addresses-sepolia.md from ton-staking-v2 repo
 *   2. On-chain bytecode existence (getCode)
 *   3. Layer2Registry: enumerate via numLayer2s+layer2ByIndex, check each LAYER2_OPTIONS operator is registered
 *
 * Usage:
 *   node scripts/validate-sepolia-addresses.mjs
 *   RPC_URL=https://... node scripts/validate-sepolia-addresses.mjs
 */

import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "..");

// ── Load ABI json files ────────────────────────────────────────────────────
const tonAbi       = JSON.parse(readFileSync(join(root, "abi/TON.json"), "utf8"));
const depositAbi   = JSON.parse(readFileSync(join(root, "abi/DepositManagerV1_1.json"), "utf8"));
const seigAbi      = JSON.parse(readFileSync(join(root, "abi/SeigManagerV1_3.json"), "utf8"));
const registryAbi  = JSON.parse(readFileSync(join(root, "abi/Layer2Registry.json"), "utf8"));

// ── Official addresses from deployed-addresses-sepolia.md ──────────────────
// https://github.com/tokamak-network/ton-staking-v2/blob/ton-staking-v2/docs/deployed-addresses-sepolia.md
const OFFICIAL = {
  TON:                 "0xa30fe40285b8f5c0457dbc3b7c8a280373c40044",
  WTON:                "0x79e0d92670106c85e9067b56b8f674340dca0bbd",
  SeigManagerProxy:    "0x2320542ae933FbAdf8f5B97cA348c7CeDA90fAd7",
  SeigManagerV1_3:     "0x8C29A0C04a6A3dfee84b602fA13CD4A5a764B3dA",
  DepositManagerProxy: "0x90ffcc7F168DceDBEF1Cb6c6eB00cA73F922956F",
  DepositManagerV1_1:  "0xfd0c0AA6505125eFab34A2195F1b9C99AFE8fB06",
  Layer2RegistryProxy: "0xA0a9576b437E52114aDA8b0BC4149F2F5c604581",
  Layer2Registry:      "0xAdA189ff3D973753971eff71F6F41A9419a4a1F8",
};

// ── Addresses in codebase ──────────────────────────────────────────────────
const CODEBASE = {
  TON:                 tonAbi._meta.addresses.sepolia.proxy.toLowerCase(),
  WTON:                "0x79e0d92670106c85e9067b56b8f674340dca0bbd",
  SeigManagerProxy:    seigAbi._meta.addresses.sepolia.proxy.toLowerCase(),
  SeigManagerV1_3:     seigAbi._meta.addresses.sepolia.impl.toLowerCase(),
  DepositManagerProxy: depositAbi._meta.addresses.sepolia.proxy.toLowerCase(),
  DepositManagerV1_1:  depositAbi._meta.addresses.sepolia.impl.toLowerCase(),
  Layer2RegistryProxy: registryAbi._meta.addresses.sepolia.proxy.toLowerCase(),
  Layer2Registry:      registryAbi._meta.addresses.sepolia.impl.toLowerCase(),
};

// ── Layer2 operators defined in useStake.ts ────────────────────────────────
const LAYER2_OPTIONS = [
  { label: "TokamakOperator_v2",   address: "0xCBeF7Cc221c04AD2E68e623613cc5d33b0fE1599" },
  { label: "ContractTeam_DAO_v2",  address: "0x277201BF0B20C672b023408Bf7778cFf3779b476" },
  { label: "ContractTeam_DAO2_v2", address: "0x81581558791d423F2BBea52923BfD245DBB9C4F5" },
  { label: "candidate",            address: "0xaeB0463a2Fd96C68369C1347ce72997406Ed6409" },
  { label: "member_DAO",           address: "0xAbD15C021942Ca54aBd944C91705Fe70FEA13f0d" },
];

// ── RPC setup ─────────────────────────────────────────────────────────────
const rpcUrl = process.env.RPC_URL_SEPOLIA
  || process.env.RPC_URL
  || "https://rpc.sepolia.org";
const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });

// ── Helpers ───────────────────────────────────────────────────────────────
const PASS = "\x1b[32m✅ PASS\x1b[0m";
const FAIL = "\x1b[31m❌ FAIL\x1b[0m";
const WARN = "\x1b[33m⚠️  WARN\x1b[0m";

function checkAddresses() {
  console.log("\n=== 1. Static address comparison (codebase vs official doc) ===\n");
  let allMatch = true;
  for (const [name, official] of Object.entries(OFFICIAL)) {
    const code = CODEBASE[name];
    const match = code && code === official.toLowerCase();
    if (!match) allMatch = false;
    console.log(`${match ? PASS : FAIL}  ${name}`);
    if (!match) {
      console.log(`       official : ${official}`);
      console.log(`       codebase : ${code ?? "(missing)"}`);
    }
  }
  return allMatch;
}

async function checkBytecode() {
  console.log("\n=== 2. On-chain bytecode existence (getCode) ===\n");
  const checks = [
    { name: "TON proxy",             addr: OFFICIAL.TON },
    { name: "WTON",                  addr: OFFICIAL.WTON },
    { name: "SeigManager proxy",     addr: OFFICIAL.SeigManagerProxy },
    { name: "DepositManager proxy",  addr: OFFICIAL.DepositManagerProxy },
    { name: "Layer2Registry proxy",  addr: OFFICIAL.Layer2RegistryProxy },
  ];

  let allOk = true;
  for (const { name, addr } of checks) {
    try {
      const code = await client.getCode({ address: addr });
      const ok = code && code !== "0x" && code.length > 4;
      if (!ok) allOk = false;
      console.log(`${ok ? PASS : FAIL}  ${name} (${addr})`);
    } catch (e) {
      allOk = false;
      console.log(`${FAIL}  ${name} — RPC error: ${e.message.slice(0, 80)}`);
    }
  }
  return allOk;
}

async function checkLayer2Registry() {
  console.log("\n=== 3. Layer2Registry: numLayer2s + enumerate operators ===\n");

  const registryAddress = OFFICIAL.Layer2RegistryProxy;
  const numAbi = [{
    name: "numLayer2s",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  }];
  const byIndexAbi = [{
    name: "layer2ByIndex",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ type: "address" }],
  }];

  let count;
  try {
    count = await client.readContract({
      address: registryAddress, abi: numAbi, functionName: "numLayer2s",
    });
    console.log(`${PASS}  Total registered Layer2s: ${count.toString()}`);
  } catch (e) {
    console.log(`${FAIL}  numLayer2s() failed: ${e.message.slice(0, 80)}`);
    return false;
  }

  // Read first 20 layer2s to check if our operators appear
  const sampleSize = Math.min(Number(count), 200);
  console.log(`\n  Sampling first ${sampleSize} layer2s to locate LAYER2_OPTIONS operators...\n`);

  const calls = Array.from({ length: sampleSize }, (_, i) => ({
    address: registryAddress,
    abi: byIndexAbi,
    functionName: "layer2ByIndex",
    args: [BigInt(i)],
  }));

  let registeredSet;
  try {
    const results = await client.multicall({ contracts: calls, allowFailure: true });
    registeredSet = new Set(
      results
        .filter(r => r.status === "success" && r.result)
        .map(r => r.result.toLowerCase())
    );
  } catch (e) {
    console.log(`${FAIL}  multicall failed: ${e.message.slice(0, 80)}`);
    return false;
  }

  let allRegistered = true;
  for (const { label, address } of LAYER2_OPTIONS) {
    const found = registeredSet.has(address.toLowerCase());
    if (!found) allRegistered = false;
    console.log(`${found ? PASS : FAIL}  ${label} (${address})`);
  }
  return allRegistered;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("Validating Sepolia contract addresses...");
  console.log(`RPC: ${rpcUrl}\n`);

  const r1 = checkAddresses();
  const r2 = await checkBytecode();
  const r3 = await checkLayer2Registry();

  console.log("\n=== Summary ===\n");
  console.log(`Static match   : ${r1 ? PASS : FAIL}`);
  console.log(`On-chain code  : ${r2 ? PASS : FAIL}`);
  console.log(`Operators reg. : ${r3 ? PASS : FAIL}`);

  if (!r1 || !r2 || !r3) {
    console.log("\n\x1b[31mOne or more checks failed.\x1b[0m");
    process.exit(1);
  } else {
    console.log("\n\x1b[32mAll checks passed.\x1b[0m");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
