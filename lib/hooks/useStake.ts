"use client";

/**
 * useStake — in-app TON staking via approveAndCall
 *
 * Flow:
 *   1. TON.approveAndCall(WTON, amount18dec, abi.encode(DepositManager, layer2))
 *      → WTON.onApprove wraps TON→WTON and calls DepositManager.deposit in the same tx
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
  usePublicClient,
  useAccount,
} from "wagmi";
import { encodeAbiParameters, parseUnits, formatUnits } from "viem";

import tonAbi from "@/abi/TON.json";
import depositManagerAbi from "@/abi/DepositManagerV1_1.json";

// ---- Network selection (matches lib/staking.ts) ----
const CHAIN = process.env.NEXT_PUBLIC_CHAIN === "sepolia" ? "sepolia" : "mainnet";

const TON_ADDRESS = (
  tonAbi._meta.addresses[CHAIN as "mainnet" | "sepolia"].proxy
) as `0x${string}`;

const DEPOSIT_MANAGER_ADDRESS = (
  depositManagerAbi._meta.addresses[CHAIN as "mainnet" | "sepolia"].proxy
) as `0x${string}`;

// WTON wraps TON (18 dec → 27 dec ray) and is the only accepted caller for
// DepositManager.onApprove. approveAndCall must target WTON, not DepositManager.
// Sepolia: verified 0x79e0... via cast call name()/decimals() and full tx simulation.
const WTON_ADDRESS: Record<"mainnet" | "sepolia", `0x${string}`> = {
  mainnet: "0xc4A11aaf6ea915Ed7Ac194161d2fC9384F15bff2",
  sepolia: "0x79e0d92670106c85e9067b56b8f674340dca0bbd",
} as const;

const WTON = WTON_ADDRESS[CHAIN as "mainnet" | "sepolia"];

/** Default Layer2 operator per chain (highest TVL / first registered) */
const DEFAULT_LAYER2_ADDRESS: Record<"mainnet" | "sepolia", `0x${string}`> = {
  mainnet: "0xf3B17FDB808c7d0Df9ACd24dA34700ce069007DF", // tokamak1
  sepolia: "0xCBeF7Cc221c04AD2E68e623613cc5d33b0fE1599", // TokamakOperator_v2
};

export const DEFAULT_LAYER2 = DEFAULT_LAYER2_ADDRESS[CHAIN as "mainnet" | "sepolia"];

/** Known Layer2 operators per chain (mirrors LAYER2S_FALLBACK in staking.ts) */
const LAYER2_OPTIONS_BY_CHAIN: Record<"mainnet" | "sepolia", { label: string; address: `0x${string}` }[]> = {
  mainnet: [
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
  ],
  sepolia: [
    { label: "TokamakOperator_v2",  address: "0xCBeF7Cc221c04AD2E68e623613cc5d33b0fE1599" },
    { label: "ContractTeam_DAO_v2", address: "0x277201BF0B20C672b023408Bf7778cFf3779b476" },
    { label: "ContractTeam_DAO2_v2",address: "0x81581558791d423F2BBea52923BfD245DBB9C4F5" },
    { label: "candidate",           address: "0xaeB0463a2Fd96C68369C1347ce72997406Ed6409" },
    { label: "member_DAO",          address: "0xAbD15C021942Ca54aBd944C91705Fe70FEA13f0d" },
  ],
};

export const LAYER2_OPTIONS = LAYER2_OPTIONS_BY_CHAIN[CHAIN as "mainnet" | "sepolia"];

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
  const publicClient = usePublicClient();
  const { address: userAddress } = useAccount();
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

    // Correct flow: TON.approveAndCall(WTON, amount, abi.encode(DepositManager, layer2))
    //   → WTON.onApprove wraps TON to WTON, then calls DepositManager.deposit(layer2, amount)
    // Passing DepositManager directly as spender reverts: "only accept WTON approve callback"
    const data = encodeAbiParameters(
      [{ type: "address" }, { type: "address" }],
      [DEPOSIT_MANAGER_ADDRESS, layer2]
    );

    // Pre-estimate gas via wagmi's transport (Alchemy) so MetaMask doesn't use
    // its own internal RPC for gas estimation, which can incorrectly report
    // "This transaction is likely to fail" on Sepolia.
    let gasLimit: bigint | undefined;
    if (publicClient && userAddress) {
      try {
        const estimated = await publicClient.estimateContractGas({
          address: TON_ADDRESS,
          abi: tonAbi.abi as Parameters<typeof publicClient.estimateContractGas>[0]["abi"],
          functionName: "approveAndCall",
          args: [WTON, amount, data],
          account: userAddress,
        });
        gasLimit = (estimated * 130n) / 100n; // 30% buffer
      } catch {
        gasLimit = 600_000n;
      }
    }

    return writeContractAsync({
      address: TON_ADDRESS,
      abi: tonAbi.abi,
      functionName: "approveAndCall",
      args: [WTON, amount, data],
      gas: gasLimit,
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
