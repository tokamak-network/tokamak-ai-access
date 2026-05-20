"use client";

/**
 * useStake — in-app TON staking via approveAndCall
 *
 * Flow:
 *   1. TON.approveAndCall(DepositManager, amount18dec, abi.encode(layer2))
 *      → DepositManager.onApprove fires in the same tx, depositing TON
 *   2. Wait for tx confirmation (useWaitForTransactionReceipt)
 *   3. Caller calls invalidate/refetch on the balance query
 *
 * Non-custodial: server never touched. User's wallet signs the tx.
 *
 * Ref: docs/TON_AI_Access_Staking_System_Design.md §6.2
 */

import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { encodeAbiParameters, parseUnits, formatUnits } from "viem";

import tonAbi from "@/abi/TON.json";
import depositManagerAbi from "@/abi/DepositManagerV1_1.json";

// ---- Network selection (matches lib/staking.ts) ----
const CHAIN =
  process.env.NEXT_PUBLIC_CHAIN === "sepolia" ? "sepolia" : "mainnet";

const TON_ADDRESS = (
  tonAbi._meta.addresses[CHAIN as "mainnet" | "sepolia"].proxy
) as `0x${string}`;

const DEPOSIT_MANAGER_ADDRESS = (
  depositManagerAbi._meta.addresses[CHAIN as "mainnet" | "sepolia"].proxy
) as `0x${string}`;

/**
 * Default Layer2 operator for new stakers: tokamak1 (highest TVL operator).
 * Users can override via the layer2 parameter in stake().
 */
export const DEFAULT_LAYER2 =
  "0xf3B17FDB808c7d0Df9ACd24dA34700ce069007DF" as `0x${string}`;

/** All known mainnet Layer2 operators (mirrors LAYER2S_FALLBACK in staking.ts) */
export const LAYER2_OPTIONS: { label: string; address: `0x${string}` }[] = [
  { label: "tokamak1",        address: "0xf3B17FDB808c7d0Df9ACd24dA34700ce069007DF" },
  { label: "DXM Corp",        address: "0x44e3605d0ed58FD125E9C47D1bf25a4406c13b57" },
  { label: "DSRV",            address: "0x2B67D8D4E61b68744885E243EfAF988f1Fc66E2D" },
  { label: "Talken",          address: "0x36101b31e74c5E8f9a9cec378407Bbb776287761" },
  { label: "staked",          address: "0x2c25A6be0e6f9017b5bf77879c487eed466F2194" },
  { label: "level",           address: "0x0F42D1C40b95DF7A1478639918fc358B4aF5298D" },
  { label: "decipher",        address: "0xbc602C1D9f3aE99dB4e9fD3662CE3D02e593ec5d" },
  { label: "DeSpread",        address: "0xC42cCb12515b52B59c02eEc303c887C8658f5854" },
  { label: "Danal Fintech",   address: "0xf3CF23D896Ba09d8EcdcD4655d918f71925E3FE5" },
  { label: "Hammer DAO",      address: "0x06D34f65869Ec94B3BA8c0E08BCEb532f65005E2" },
];

// ─── TON wallet balance ───────────────────────────────────────────────────────

export interface TonBalanceResult {
  /** Raw balance in 18-decimal wei */
  rawBalance: bigint | undefined;
  /** Human-readable string with 4 decimal places; "0.0000" only when read succeeds and balance is zero */
  formatted: string;
  isLoading: boolean;
  /** True when the RPC read failed — caller should not treat this as a real zero balance */
  isError: boolean;
  refetch: () => void;
}

/**
 * Reads the user's TON ERC-20 wallet balance (not staked amount).
 * Staked amount comes from the server-side /api/staking/balance endpoint.
 */
export function useTonBalance(address?: `0x${string}`): TonBalanceResult {
  const { data, isLoading, isError, refetch } = useReadContract({
    address: TON_ADDRESS,
    abi: tonAbi.abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const raw = data as bigint | undefined;
  return {
    rawBalance: raw,
    formatted: raw !== undefined
      ? Number(formatUnits(raw, 18)).toFixed(4)
      : "0.0000",
    isLoading,
    isError,
    refetch,
  };
}

// ─── Staking write ────────────────────────────────────────────────────────────

export type StakeStatus =
  | "idle"
  | "pending"       // waiting for wallet signature
  | "confirming"    // tx submitted, waiting for block
  | "success"
  | "error";

export interface UseStakeResult {
  /** Execute the staking transaction */
  stake: (amountTON: string, layer2?: `0x${string}`) => Promise<`0x${string}`>;
  status: StakeStatus;
  txHash: `0x${string}` | undefined;
  error: string | null;
  /** Reset back to idle (e.g. after showing success) */
  reset: () => void;
}

export function useStake(): UseStakeResult {
  const {
    writeContractAsync,
    isPending,
    data: txHash,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  let status: StakeStatus = "idle";
  if (isPending)     status = "pending";
  else if (isConfirming) status = "confirming";
  else if (isSuccess) status = "success";
  else if (writeError) status = "error";

  async function stake(
    amountTON: string,
    layer2: `0x${string}` = DEFAULT_LAYER2
  ): Promise<`0x${string}`> {
    if (!amountTON || parseFloat(amountTON) <= 0) {
      throw new Error("Amount must be greater than 0");
    }

    const amount = parseUnits(amountTON, 18);

    // DepositManager.onApprove(owner, spender, amount, data)
    // data = abi.encode(address layer2) = 32-byte left-padded address
    const data = encodeAbiParameters(
      [{ type: "address" }],
      [layer2]
    );

    return writeContractAsync({
      address: TON_ADDRESS,
      abi: tonAbi.abi,
      functionName: "approveAndCall",
      args: [DEPOSIT_MANAGER_ADDRESS, amount, data],
    });
  }

  const errorMessage = writeError
    ? (writeError.message.includes("User rejected")
        ? "Wallet signature rejected."
        : writeError.message.slice(0, 120))
    : null;

  return {
    stake,
    status,
    txHash,
    error: errorMessage,
    reset: resetWrite,
  };
}
