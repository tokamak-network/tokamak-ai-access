import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseEventLogs } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { getSessionAddress } from "@/lib/siwe";
import { assertKeyCapacity, type PurchaseRecord } from "@/lib/key-guards";
import { issueKeyForAddress } from "@/lib/issue-key";
import { kvGet, kvSet } from "@/lib/kv";

const TRANSFER_EVENT_ABI = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN === "sepolia" ? "sepolia" : "mainnet";

function getPublicClient() {
  const rpcUrl =
    CHAIN_ID === "sepolia"
      ? process.env.RPC_URL_SEPOLIA
      : process.env.RPC_URL;
  return createPublicClient({
    chain: CHAIN_ID === "sepolia" ? sepolia : mainnet,
    transport: http(rpcUrl),
  });
}

const PRICE_TON = BigInt(process.env.PURCHASE_PRICE_TON ?? "5");

export async function POST(req: NextRequest) {
  const address = await getSessionAddress(req);
  if (!address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const txHash: string | undefined = body?.txHash;
  if (!txHash) {
    return NextResponse.json({ error: "txHash required" }, { status: 400 });
  }

  try {
    await assertKeyCapacity();
  } catch (err) {
    if (err instanceof Response) return err as NextResponse;
    throw err;
  }

  const tonErc20 = (process.env.TON_ERC20_ADDRESS ?? "").toLowerCase();
  const treasury = (process.env.TREASURY_ADDRESS ?? "").toLowerCase();
  const minValue = PRICE_TON * 10n ** 18n;

  const client = getPublicClient();
  const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` }).catch(() => null);
  if (!receipt) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 422 });
  }

  if (receipt.to?.toLowerCase() !== tonErc20) {
    return NextResponse.json({ error: "Invalid transaction target" }, { status: 422 });
  }

  const logs = parseEventLogs({
    abi: TRANSFER_EVENT_ABI,
    logs: receipt.logs as Parameters<typeof parseEventLogs>[0]["logs"],
  });

  const transferLog = logs.find(
    (log) =>
      log.args.from?.toLowerCase() === address.toLowerCase() &&
      log.args.to?.toLowerCase() === treasury &&
      (log.args.value ?? 0n) >= minValue,
  );

  if (!transferLog) {
    return NextResponse.json({ error: "Valid Transfer event not found" }, { status: 403 });
  }

  const alreadyUsed = await kvGet<{ address: string; usedAt: number }>(`txhash:${txHash}`);
  if (alreadyUsed) {
    return NextResponse.json({ error: "Transaction already used" }, { status: 409 });
  }

  const now = Date.now();
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000;

  await kvSet(`txhash:${txHash}`, { address, usedAt: now });
  await kvSet(`purchase:${address}`, { txHash, paidAt: now, expiresAt } satisfies PurchaseRecord);

  return issueKeyForAddress(address);
}
