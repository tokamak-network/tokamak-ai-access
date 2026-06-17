import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseEventLogs } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { getSessionAddress } from "@/lib/siwe";
import { assertKeyCapacity, type PurchaseRecord, type KeyRecord } from "@/lib/key-guards";
import { issueKeyForAddress } from "@/lib/issue-key";
import { kvGet, kvSet, kvSetNx, kvDel } from "@/lib/kv";
import { fetchTonUsdRate, usdToTonWei } from "@/lib/ton-price";

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

const CHAIN_ID = "sepolia";

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

  const existingKey = await kvGet<KeyRecord>(`key:${address}`);
  const isExpired = !!existingKey?.expiresAt && existingKey.expiresAt < new Date().toISOString();
  if (existingKey && !existingKey.revokedAt && !isExpired) {
    return NextResponse.json({ error: "Active key already exists" }, { status: 409 });
  }

  const tonErc20 = (process.env.TON_ERC20_ADDRESS ?? "").toLowerCase();
  const treasury = "0x000000000000000000000000000000000000dead";

  const rate = await fetchTonUsdRate().catch(() => null);
  if (!rate) {
    return NextResponse.json({ error: "Price oracle unavailable" }, { status: 503 });
  }
  const usdPrice = Number(process.env.PURCHASE_USD_PRICE ?? "5");
  const minValue = usdToTonWei(usdPrice * 0.8, rate);

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
      log.address?.toLowerCase() === tonErc20 &&
      log.args.from?.toLowerCase() === address.toLowerCase() &&
      log.args.to?.toLowerCase() === treasury &&
      (log.args.value ?? 0n) >= minValue,
  );

  if (!transferLog) {
    return NextResponse.json({ error: "Valid Transfer event not found" }, { status: 403 });
  }

  // Atomic claim: only succeed if we can set the dedup record
  const claimed = await kvSetNx(`txhash:${txHash}`, { address, usedAt: Date.now() });
  if (!claimed) {
    return NextResponse.json({ error: "Transaction already used" }, { status: 409 });
  }

  const now = Date.now();
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000;

  try {
    await kvSet(`purchase:${address}`, {
      txHash,
      paidAt: now,
      expiresAt,
    } satisfies PurchaseRecord);

    return await issueKeyForAddress(address);
  } catch (err) {
    // Release the dedup claim if issuance fails
    await kvDel(`txhash:${txHash}`);
    throw err;
  }
}
