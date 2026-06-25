import { NextResponse } from "next/server";
import { getTotalStakedTON } from "@/lib/staking";
import { kvGet } from "@/lib/kv";

const ROTATE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface KeyRecord {
  liteLlmKeyId: string;
  hash: string;
  keySlice: string;
  createdAt: number;
  expiresAt?: string;    // undefined = staking key (no expiry)
  revokedAt?: number;
  lastRotatedAt?: number;
}

/**
 * Throws a 403 NextResponse on testnet (NEXT_PUBLIC_CHAIN=sepolia).
 * Key issuance is mainnet-only — we never mint a real LiteLLM key in exchange
 * for free Sepolia testnet TON (staking or purchase). Read at call time so tests
 * can flip the chain per case.
 */
export function assertMainnetOnly(): void {
  if (process.env.NEXT_PUBLIC_CHAIN === "sepolia") {
    throw NextResponse.json(
      { error: "Key issuance is disabled on Sepolia testnet" },
      { status: 403 },
    );
  }
}

/** Throws a 403 NextResponse if address does not meet the minimum TON stake. */
export async function assertStake(address: string): Promise<void> {
  const minTonWei = BigInt(process.env.MIN_TON ?? "100") * 10n ** 18n;
  const balance = await getTotalStakedTON(address);
  if (balance < minTonWei) {
    throw NextResponse.json({ error: "Insufficient stake" }, { status: 403 });
  }
}

export interface PurchaseRecord {
  txHash: string;
  paidAt: number;
  expiresAt: number; // unix ms
}

export async function assertEligibility(address: string): Promise<void> {
  const minTonWei = BigInt(process.env.MIN_TON ?? "100") * 10n ** 18n;
  const balance = await getTotalStakedTON(address);
  if (balance >= minTonWei) return;

  const purchase = await kvGet<PurchaseRecord>(`purchase:${address}`);
  if (purchase && purchase.expiresAt > Date.now()) return;

  throw NextResponse.json({ error: "Not eligible" }, { status: 403 });
}

/**
 * Throws a 403 NextResponse with hoursLeft if the address rotated a key
 * within the last 24 hours.
 */
export async function assertRotateCooldown(address: string): Promise<void> {
  const record = await kvGet<KeyRecord>(`key:${address}`);
  if (!record?.lastRotatedAt) return;

  const elapsed = Date.now() - record.lastRotatedAt;
  if (elapsed < ROTATE_COOLDOWN_MS) {
    const hoursLeft = Math.ceil((ROTATE_COOLDOWN_MS - elapsed) / (60 * 60 * 1000));
    throw NextResponse.json(
      { error: "Rotation cooldown active", hoursLeft },
      { status: 403 },
    );
  }
}

/** Throws a 503 NextResponse if the global active key count is at or above the cap. */
export async function assertKeyCapacity(): Promise<void> {
  const maxActiveKeys = Number(process.env.MAX_ACTIVE_KEYS ?? "1000");
  const count = (await kvGet<number>("stats:active-keys")) ?? 0;
  if (count >= maxActiveKeys) {
    throw NextResponse.json({ error: "Service at capacity" }, { status: 503 });
  }
}
