/**
 * Tokamak Network staking balance reader
 *
 * §2 assumptions:
 *  - SeigManagerV1_3.stakeOf(layer2, account) returns WTON in ray (27 decimals)
 *  - We normalize to 18-decimal bigint (same unit as ETH/TON ERC-20)
 *  - Layer2 목록은 Layer2Registry.layer2sLength + layer2sByIndex 로 온체인에서 동적 조회
 *
 * Dune 쿼리 (#3298440) 분석 결과:
 *  - Dune sWTON 방식 = protocol-level 총량 (per-address 직접 조회 불가)
 *  - stakeOf(layer2, addr) 합산 = per-address에 적합, 원리적 동치
 *  - 차이 원인: 하드코딩 10개 Layer2로 40.8%만 커버 → 동적 조회로 해결
 *
 * Cache strategy:
 *  - Layer2 주소 목록: 1시간 캐시 (Layer2 등록은 드물게 변경)
 *  - 잔액(stakeOf 합산): 60초 캐시 (잔액은 자주 변할 수 있음)
 *
 * Multi-network: set NEXT_PUBLIC_CHAIN=sepolia to target Sepolia testnet.
 */
import { createPublicClient, http } from "viem";
import { mainnet, sepolia } from "viem/chains";

import seigManagerAbi from "@/abi/SeigManagerV1_3.json";
import layer2RegistryAbi from "@/abi/Layer2Registry.json";

// ---- Network selection ----
const CHAIN = process.env.NEXT_PUBLIC_CHAIN === "sepolia" ? "sepolia" : "mainnet";

// ---- Contract addresses from ABI JSON _meta ----
const SEIG_MANAGER_PROXY = (
  seigManagerAbi._meta.addresses[CHAIN as "mainnet" | "sepolia"].proxy
) as `0x${string}`;

export const LAYER2_REGISTRY_PROXY = (
  layer2RegistryAbi._meta.addresses[CHAIN as "mainnet" | "sepolia"].proxy
) as `0x${string}`;

// ---- Eligibility threshold (env override; default 10 TON) ----
export const MIN_TON = BigInt(process.env.MIN_TON ?? "10");

// ---- ABIs (minimal, confirmed selectors) ----
const SEIG_STAKE_ABI = [
  {
    inputs: [
      { internalType: "address", name: "layer2",  type: "address" },
      { internalType: "address", name: "account", type: "address" },
    ],
    name: "stakeOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const REGISTRY_ABI = [
  {
    inputs: [],
    name: "layer2sLength",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "index", type: "uint256" }],
    name: "layer2sByIndex",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ---- Decimal conversion ----
// WTON is 27-decimal ray; TON ERC-20 is 18-decimal.
// Divide by 10^(27-18) = 10^9 to normalize.
const WTON_TO_TON = 10n ** 9n;

// ---- Hardcoded fallback Layer2 list ----
// Layer2Registry.layer2sLength() reverts on mainnet (proxy deprecated after v1→v2 migration).
// Confirmed: cast call 0x7846... "layer2sLength()(uint256)" → execution reverted (2026-05-20).
// getLayer2Addresses() tries dynamic first, falls back to this list on any error.
// Update manually if Tokamak Network adds new v1 operators.
const LAYER2S_FALLBACK: Record<"mainnet" | "sepolia", `0x${string}`[]> = {
  mainnet: [
    "0xf3B17FDB808c7d0Df9ACd24dA34700ce069007DF", // tokamak1
    "0x44e3605d0ed58FD125E9C47D1bf25a4406c13b57", // DXM Corp
    "0x2B67D8D4E61b68744885E243EfAF988f1Fc66E2D", // DSRV
    "0x36101b31e74c5E8f9a9cec378407Bbb776287761", // Talken
    "0x2c25A6be0e6f9017b5bf77879c487eed466F2194", // staked
    "0x0F42D1C40b95DF7A1478639918fc358B4aF5298D", // level
    "0xbc602C1D9f3aE99dB4e9fD3662CE3D02e593ec5d", // decipher
    "0xC42cCb12515b52B59c02eEc303c887C8658f5854", // DeSpread
    "0xf3CF23D896Ba09d8EcdcD4655d918f71925E3FE5", // Danal Fintech
    "0x06D34f65869Ec94B3BA8c0E08BCEb532f65005E2", // Hammer DAO
  ],
  sepolia: [],
};

// ---- Cache ----
// Two separate caches so Layer2 list and per-address balances expire independently.
interface CacheEntry<T> { value: T; expiresAt: number }

const layer2Cache = new Map<string, CacheEntry<`0x${string}`[]>>();
const balanceCache = new Map<string, CacheEntry<bigint>>();

const LAYER2_CACHE_TTL_MS  = 60 * 60 * 1000; // 1 hour — Layer2 registrations change rarely
const BALANCE_CACHE_TTL_MS = 60 * 1000;       // 60 s   — balances change more often

// ---- RPC client factory ----
function getClient() {
  const chain  = CHAIN === "sepolia" ? sepolia : mainnet;
  const envKey = CHAIN === "sepolia" ? "RPC_URL_SEPOLIA" : "RPC_URL";
  const rpcUrl = process.env[envKey];
  if (!rpcUrl) throw new Error(`${envKey} env var not set`);
  return createPublicClient({ chain, transport: http(rpcUrl) });
}

// ---- Layer2 list (dynamic, cached) ----

/**
 * Fetches all registered Layer2 addresses.
 *
 * Strategy (try-then-fallback):
 *  1. Try Layer2Registry.layer2sLength() + layer2sByIndex() via multicall.
 *  2. If the registry call reverts (confirmed on mainnet 2026-05-20 — proxy appears
 *     deprecated post v1→v2 migration), fall back to LAYER2S_FALLBACK.
 *
 * The fallback list is the hardcoded set of 10 known operators, which is safe and
 * matches the on-chain state as of the snapshot date.
 */
export async function getLayer2Addresses(): Promise<`0x${string}`[]> {
  const cacheKey = `layer2s:${CHAIN}`;
  const cached = layer2Cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  let addresses: `0x${string}`[] = [];
  let registrySucceeded = false;

  try {
    const client = getClient();

    // 1. Get total count — may revert if registry is deprecated
    const length = await client.readContract({
      address: LAYER2_REGISTRY_PROXY,
      abi: REGISTRY_ABI,
      functionName: "layer2sLength",
    }) as bigint;

    // Mark success before multicall so a partial multicall failure still uses fallback
    registrySucceeded = true;

    if (length > 0n) {
      // 2. Multicall layer2sByIndex(0..length-1)
      const calls = Array.from({ length: Number(length) }, (_, i) => ({
        address: LAYER2_REGISTRY_PROXY,
        abi: REGISTRY_ABI,
        functionName: "layer2sByIndex" as const,
        args: [BigInt(i)] as const,
      }));

      const results = await client.multicall({ contracts: calls, allowFailure: true });

      for (const res of results) {
        if (res.status === "success" && res.result) {
          addresses.push(res.result as `0x${string}`);
        }
      }
    }
  } catch {
    // Registry call reverted (e.g. proxy deprecated). Use hardcoded fallback.
    // NOTE: log this in production so the team knows to investigate.
    console.warn(
      "[staking] Layer2Registry call failed — using hardcoded fallback list.",
      "If this is unexpected, check Layer2Registry proxy implementation slot.",
    );
  }

  // Only fall back to hardcoded list when the registry itself failed (reverted/unreachable).
  // If the registry succeeded but returned 0 operators, there is genuinely nothing to query.
  if (!registrySucceeded) {
    addresses = LAYER2S_FALLBACK[CHAIN as "mainnet" | "sepolia"];
  }

  layer2Cache.set(cacheKey, { value: addresses, expiresAt: Date.now() + LAYER2_CACHE_TTL_MS });
  return addresses;
}

// ---- Per-address staking balance ----

/**
 * Returns the total staked TON for `address` across ALL Layer2s in the registry.
 *
 * Algorithm:
 *  1. Fetch Layer2 address list from Layer2Registry (cached 1h)
 *  2. Multicall SeigManager.stakeOf(layer2, address) for each Layer2
 *  3. Sum successful results, convert 27-dec WTON → 18-dec TON
 *
 * Result is in 18-decimal bigint (same unit as ERC-20 TON).
 *
 * Dune note: this is mathematically equivalent to sWTON.balanceOf × factor / 1e27
 * but reads directly from SeigManager, which is the authoritative per-address source.
 */
export async function getTotalStakedTON(address: string): Promise<bigint> {
  const cacheKey = `${CHAIN}:${address.toLowerCase()}`;
  const cached = balanceCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  // Dynamic Layer2 list (may throw — let caller handle)
  const layer2s = await getLayer2Addresses();
  if (layer2s.length === 0) return 0n;

  const client = getClient();
  const addr = address as `0x${string}`;

  const calls = layer2s.map((layer2) => ({
    address: SEIG_MANAGER_PROXY,
    abi: SEIG_STAKE_ABI,
    functionName: "stakeOf" as const,
    args: [layer2, addr] as const,
  }));

  const results = await client.multicall({ contracts: calls, allowFailure: true });

  let total = 0n;
  for (const res of results) {
    if (res.status === "success") {
      // Convert 27-dec WTON ray → 18-dec TON: divide by 10^9
      total += (res.result as bigint) / WTON_TO_TON;
    }
  }

  balanceCache.set(cacheKey, { value: total, expiresAt: Date.now() + BALANCE_CACHE_TTL_MS });
  return total;
}

// ---- Cache invalidation ----

/**
 * Clears the balance cache for a specific address (or all addresses).
 * Layer2 list cache is NOT cleared — call invalidateLayer2Cache() separately if needed.
 */
export function invalidateStakingCache(address?: string): void {
  if (address) {
    balanceCache.delete(`${CHAIN}:${address.toLowerCase()}`);
  } else {
    balanceCache.clear();
  }
}

/**
 * Clears the Layer2 address list cache, forcing a fresh registry query on next call.
 * Use when a new Layer2 registration is expected (e.g., after governance tx).
 */
export function invalidateLayer2Cache(): void {
  layer2Cache.clear();
}
