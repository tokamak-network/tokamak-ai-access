"use client";

import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, parseUnits } from "viem";

import seigManagerAbi from "@/abi/SeigManagerV1_3.json";
import depositManagerAbi from "@/abi/DepositManagerV1_1.json";

const CHAIN =
  process.env.NEXT_PUBLIC_CHAIN === "sepolia" ? "sepolia" : "mainnet";

const SEIG_MANAGER_ADDRESS = (
  seigManagerAbi._meta.addresses[CHAIN as "mainnet" | "sepolia"].proxy
) as `0x${string}`;

const DEPOSIT_MANAGER_ADDRESS = (
  depositManagerAbi._meta.addresses[CHAIN as "mainnet" | "sepolia"].proxy
) as `0x${string}`;

/** Converts 27-decimal WTON ray to 18-decimal TON. */
export function wtonToTon(wtonRaw: bigint): bigint {
  return wtonRaw / 10n ** 9n;
}

// ─── Read hooks ───────────────────────────────────────────────────────────────

export interface StakedBalanceResult {
  rawBalance: bigint | undefined;
  formatted: string;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Reads staked TON for a specific Layer2 operator via SeigManager.stakeOf().
 * Returns 18-decimal TON (converted from 27-decimal WTON ray).
 */
export function useStakedBalance(
  address: `0x${string}` | undefined,
  layer2: `0x${string}`
): StakedBalanceResult {
  const { data, isLoading, isError, refetch } = useReadContract({
    address: SEIG_MANAGER_ADDRESS,
    abi: seigManagerAbi.abi,
    functionName: "stakeOf",
    args: address ? [layer2, address] : undefined,
    query: { enabled: !!address },
  });

  const raw = data as bigint | undefined;
  const tonRaw = raw !== undefined ? wtonToTon(raw) : undefined;

  return {
    rawBalance: tonRaw,
    formatted:
      tonRaw !== undefined
        ? Number(formatUnits(tonRaw, 18)).toFixed(4)
        : "0.0000",
    isLoading,
    isError,
    refetch,
  };
}

export interface PendingUnstakedResult {
  rawAmount: bigint | undefined;
  formatted: string;
  hasPending: boolean;
  isLoading: boolean;
  refetch: () => void;
}

/**
 * Reads pending withdrawal amount for a specific Layer2 operator.
 * Returns 18-decimal TON directly (no conversion needed).
 */
export function usePendingUnstaked(
  address: `0x${string}` | undefined,
  layer2: `0x${string}`
): PendingUnstakedResult {
  const { data, isLoading, refetch } = useReadContract({
    address: DEPOSIT_MANAGER_ADDRESS,
    abi: depositManagerAbi.abi,
    functionName: "pendingUnstaked",
    args: address ? [layer2, address] : undefined,
    query: { enabled: !!address },
  });

  const raw = data as bigint | undefined;

  return {
    rawAmount: raw,
    formatted:
      raw !== undefined ? Number(formatUnits(raw, 18)).toFixed(4) : "0.0000",
    hasPending: raw !== undefined && raw > 0n,
    isLoading,
    refetch,
  };
}

// ─── Write hooks ──────────────────────────────────────────────────────────────

export type UnstakeStatus =
  | "idle"
  | "pending"
  | "confirming"
  | "success"
  | "error";

export interface UseRequestWithdrawalResult {
  requestWithdrawal: (
    amountTON: string,
    layer2: `0x${string}`
  ) => Promise<`0x${string}`>;
  status: UnstakeStatus;
  txHash: `0x${string}` | undefined;
  error: string | null;
  reset: () => void;
}

/**
 * Writes DepositManager.requestWithdrawal(layer2, amount).
 * Initiates the unstaking cooldown. Call processRequest after cooldown ends.
 */
export function useRequestWithdrawal(): UseRequestWithdrawalResult {
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

  let status: UnstakeStatus = "idle";
  if (isPending) status = "pending";
  else if (isConfirming) status = "confirming";
  else if (isSuccess) status = "success";
  else if (writeError) status = "error";

  async function requestWithdrawal(
    amountTON: string,
    layer2: `0x${string}`
  ): Promise<`0x${string}`> {
    if (!amountTON || parseFloat(amountTON) <= 0) {
      throw new Error("Amount must be greater than 0");
    }
    const amount = parseUnits(amountTON, 18);
    return writeContractAsync({
      address: DEPOSIT_MANAGER_ADDRESS,
      abi: depositManagerAbi.abi,
      functionName: "requestWithdrawal",
      args: [layer2, amount],
    });
  }

  const errorMessage = writeError
    ? writeError.message.includes("User rejected")
      ? "Wallet signature rejected."
      : writeError.message.slice(0, 120)
    : null;

  return {
    requestWithdrawal,
    status,
    txHash,
    error: errorMessage,
    reset: resetWrite,
  };
}

export interface UseProcessRequestResult {
  processRequest: (layer2: `0x${string}`) => Promise<`0x${string}`>;
  status: UnstakeStatus;
  txHash: `0x${string}` | undefined;
  error: string | null;
  reset: () => void;
}

/**
 * Writes DepositManager.processRequest(layer2, true).
 * Claims pending withdrawal as native TON. Reverts if cooldown not yet over.
 */
export function useProcessRequest(): UseProcessRequestResult {
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

  let status: UnstakeStatus = "idle";
  if (isPending) status = "pending";
  else if (isConfirming) status = "confirming";
  else if (isSuccess) status = "success";
  else if (writeError) status = "error";

  async function processRequest(layer2: `0x${string}`): Promise<`0x${string}`> {
    return writeContractAsync({
      address: DEPOSIT_MANAGER_ADDRESS,
      abi: depositManagerAbi.abi,
      functionName: "processRequest",
      args: [layer2, true], // receiveTON = true
    });
  }

  const errorMessage = writeError
    ? writeError.message.includes("User rejected")
      ? "Wallet signature rejected."
      : writeError.message.includes("execution reverted")
        ? "Withdrawal not ready yet, please try again later."
        : writeError.message.slice(0, 120)
    : null;

  return {
    processRequest,
    status,
    txHash,
    error: errorMessage,
    reset: resetWrite,
  };
}
