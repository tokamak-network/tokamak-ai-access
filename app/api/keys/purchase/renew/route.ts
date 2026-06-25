import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseEventLogs } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { getSessionAddress } from "@/lib/siwe";
import { assertMainnetOnly, type PurchaseRecord, type KeyRecord } from "@/lib/key-guards";
import { renewLiteLLMKey } from "@/lib/litellm";
import { kvGet, kvSet, kvSetNx, kvDel } from "@/lib/kv";
import { fetchTonUsdRate, usdToTonWei } from "@/lib/ton-price";
import tonAbi from "@/abi/TON.json";

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
const TON_ERC20_ADDRESS = tonAbi._meta.addresses[CHAIN_ID as "mainnet" | "sepolia"].proxy.toLowerCase();

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

async function verifyTransferTx(
  txHash: string,
  address: string,
): Promise<NextResponse | null> {
  const tonErc20 = TON_ERC20_ADDRESS;
  const treasury = "0x000000000000000000000000000000000000dead";

  const rate = await fetchTonUsdRate().catch(() => null);
  if (!rate) {
    return NextResponse.json({ error: "Price oracle unavailable" }, { status: 503 });
  }

  const usdPrice = Number(process.env.PURCHASE_USD_PRICE ?? "5");
  const minValue = usdToTonWei(usdPrice * 0.8, rate);

  const client = getPublicClient();
  const receipt = await client
    .getTransactionReceipt({ hash: txHash as `0x${string}` })
    .catch(() => null);
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

  return null; // valid
}

export async function PUT(req: NextRequest) {
  const address = await getSessionAddress(req);
  if (!address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const txHash: string | undefined = body?.txHash;
  if (!txHash) {
    return NextResponse.json({ error: "txHash required" }, { status: 400 });
  }

  // Mainnet-only: no renewing/extending a key with free Sepolia testnet payment.
  try {
    assertMainnetOnly();
  } catch (err) {
    return err as NextResponse;
  }

  const purchase = await kvGet<PurchaseRecord>(`purchase:${address}`);
  if (!purchase) {
    return NextResponse.json({ error: "No active purchase found" }, { status: 404 });
  }

  // Atomic txHash claim to prevent dedup race
  const claimed = await kvSetNx(`txhash:${txHash}`, { address, usedAt: Date.now() });
  if (!claimed) {
    return NextResponse.json({ error: "Transaction already used" }, { status: 409 });
  }

  const txError = await verifyTransferTx(txHash, address);
  if (txError) {
    await kvDel(`txhash:${txHash}`);
    return txError;
  }

  const now = Date.now();
  const newExpiresAt = Math.max(purchase.expiresAt, now) + 30 * 24 * 60 * 60 * 1000;

  await kvSet(`purchase:${address}`, {
    txHash,
    paidAt: now,
    expiresAt: newExpiresAt,
  } satisfies PurchaseRecord);

  const keyRecord = await kvGet<KeyRecord>(`key:${address}`);
  if (keyRecord?.liteLlmKeyId) {
    await renewLiteLLMKey(keyRecord.liteLlmKeyId).catch(() => {
      // best-effort; purchase record is already extended
    });
  }

  return NextResponse.json({ expiresAt: newExpiresAt });
}
