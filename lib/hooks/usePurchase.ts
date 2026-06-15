"use client";

/**
 * usePurchase — in-app TON payment via ERC-20 transfer to treasury
 *
 * Flow:
 *   1. TON.transfer(TREASURY, PRICE_TON * 10^18)
 *      → Wait for tx confirmation
 *   2. POST/PUT to /api/keys/purchase or /api/keys/purchase/renew with txHash
 *   3. Server verifies tx on-chain, issues or renews API key
 *
 * Non-custodial: server never touched user's wallet. User's wallet signs the tx.
 */

import { useState } from "react";
import { useWriteContract } from "wagmi";
import tonAbi from "@/abi/TON.json";
import { usdToTonWei } from "@/lib/ton-price";

// ---- Network selection (matches lib/staking.ts) ----
const CHAIN =
  process.env.NEXT_PUBLIC_CHAIN === "sepolia" ? "sepolia" : "mainnet";

const TON_ADDRESS = (
  tonAbi._meta.addresses[CHAIN as "mainnet" | "sepolia"].proxy
) as `0x${string}`;

// ─── ERC-20 Transfer ABI ──────────────────────────────────────────────────────

const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export type PurchaseStatus =
  | "idle"
  | "signing"
  | "confirming"
  | "verifying"
  | "success"
  | "error";

export interface UsePurchaseResult {
  status: PurchaseStatus;
  txHash: `0x${string}` | undefined;
  error: string | null;
  purchase: () => Promise<void>;
  renew: () => Promise<void>;
  reset: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePurchase(onSuccess?: () => void): UsePurchaseResult {
  const { writeContractAsync, data: txHash, reset: resetWrite } = useWriteContract();

  const [status, setStatus] = useState<PurchaseStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const TREASURY = process.env.NEXT_PUBLIC_TREASURY_ADDRESS as `0x${string}`;

  async function executePurchase(
    endpoint: string,
    method: "POST" | "PUT",
    receivedTxHash: `0x${string}`
  ) {
    setStatus("verifying");
    try {
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: receivedTxHash }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setStatus("success");
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  async function purchase() {
    setStatus("signing");
    setError(null);
    try {
      const priceRes = await fetch("/api/price/ton");
      if (!priceRes.ok) {
        setError("Price unavailable — try again");
        setStatus("error");
        return;
      }
      const { usdPerTon, usdPrice } = await priceRes.json();
      const amountWei = usdToTonWei(usdPrice, usdPerTon);

      const hash = await writeContractAsync({
        address: TON_ADDRESS,
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [TREASURY, amountWei],
      });
      setStatus("confirming");
      await executePurchase("/api/keys/purchase", "POST", hash);
    } catch (e) {
      if ((e as Error)?.message?.includes("User rejected")) {
        setStatus("idle");
      } else {
        setError(e instanceof Error ? e.message : "Transaction failed");
        setStatus("error");
      }
    }
  }

  async function renew() {
    setStatus("signing");
    setError(null);
    try {
      const priceRes = await fetch("/api/price/ton");
      if (!priceRes.ok) {
        setError("Price unavailable — try again");
        setStatus("error");
        return;
      }
      const { usdPerTon, usdPrice } = await priceRes.json();
      const amountWei = usdToTonWei(usdPrice, usdPerTon);

      const hash = await writeContractAsync({
        address: TON_ADDRESS,
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [TREASURY, amountWei],
      });
      setStatus("confirming");
      await executePurchase("/api/keys/purchase/renew", "PUT", hash);
    } catch (e) {
      if ((e as Error)?.message?.includes("User rejected")) {
        setStatus("idle");
      } else {
        setError(e instanceof Error ? e.message : "Transaction failed");
        setStatus("error");
      }
    }
  }

  function reset() {
    setStatus("idle");
    setError(null);
    resetWrite();
  }

  return { status, txHash, error, purchase, renew, reset };
}
