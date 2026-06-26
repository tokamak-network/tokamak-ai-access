/**
 * Sepolia E2E — full purchase flow
 *
 * Requires:
 *   E2E_PRIVATE_KEY   — test wallet private key (0x...)
 *   RPC_URL_SEPOLIA   — Sepolia RPC endpoint
 *   E2E_BASE_URL      — target server (default: http://localhost:3000)
 *
 * Run: npm run test:e2e
 * Prereq: npm run dev (in a separate terminal)
 *
 * Skipped automatically when E2E_PRIVATE_KEY is not set.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { SiweMessage } from "siwe";
import { kv } from "@vercel/kv";
import { usdToTonWei } from "@/lib/ton-price";
import { revokeLiteLLMKey } from "@/lib/litellm";
import type { KeyRecord } from "@/lib/key-guards";

const E2E_PRIVATE_KEY = process.env.E2E_PRIVATE_KEY as `0x${string}` | undefined;
const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const RPC_URL_SEPOLIA = process.env.RPC_URL_SEPOLIA;

const SEPOLIA_TON = "0xa30fe40285B8f5c0457DbC3B7C8A280373c40044" as `0x${string}`;
const BURN_ADDRESS = "0x0000000000000000000000000000000000000001" as `0x${string}`;

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

async function siweLogin(baseUrl: string, account: ReturnType<typeof privateKeyToAccount>) {
  const domain = new URL(baseUrl).host;
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL_SEPOLIA),
  });

  const nonceRes = await fetch(`${baseUrl}/api/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: account.address }),
  });
  expect(nonceRes.status, "nonce endpoint").toBe(200);
  const { nonce, statement } = await nonceRes.json();

  const siweMsg = new SiweMessage({
    domain,
    uri: baseUrl,
    address: account.address,
    chainId: 11155111,
    nonce,
    statement,
    version: "1",
    issuedAt: new Date().toISOString(),
  });
  const message = siweMsg.prepareMessage();
  const signature = await walletClient.signMessage({ message });

  const verifyRes = await fetch(`${baseUrl}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  expect(verifyRes.status, "verify endpoint").toBe(200);
  const setCookie = verifyRes.headers.get("set-cookie") ?? "";
  const sessionCookie = setCookie.match(/session_id=([^;]+)/)?.[1];
  expect(sessionCookie, "session cookie").toBeTruthy();
  return sessionCookie!;
}

describe.skipIf(!E2E_PRIVATE_KEY)("Purchase e2e (Sepolia)", () => {
  // Shared across tests in this describe block (sequential execution)
  let purchaseRenewTxHash: `0x${string}`;

  beforeAll(async () => {
    // Clear KV state so each test run starts from a clean slate.
    // Note: getSessionAddress() returns address.toLowerCase() so KV keys use lowercase.
    const account = privateKeyToAccount(E2E_PRIVATE_KEY!);
    const addr = account.address.toLowerCase();

    // LiteLLM enforces unique key_alias per wallet address — revoke before clearing KV.
    // Primary path: revoke via stored keyId. Fallback: query LiteLLM by user_id to
    // handle orphaned keys from a failed previous run where KV was already cleared.
    const existing = await kv.get<KeyRecord>(`key:${addr}`);
    if (existing?.liteLlmKeyId) {
      await revokeLiteLLMKey(existing.liteLlmKeyId).catch(() => {});
    } else {
      const baseUrl = process.env.LITELLM_BASE_URL;
      const masterKey = process.env.LITELLM_MASTER_KEY;
      if (baseUrl && masterKey) {
        const listRes = await fetch(`${baseUrl}/key/list?user_id=${addr}`, {
          headers: { Authorization: `Bearer ${masterKey}` },
        }).catch(() => null);
        if (listRes?.ok) {
          const data = await listRes.json();
          const tokens: string[] = data?.keys ?? [];
          if (tokens.length > 0) {
            await fetch(`${baseUrl}/key/delete`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${masterKey}` },
              body: JSON.stringify({ keys: tokens }),
            }).catch(() => {});
          }
        }
      }
    }

    await kv.del(`key:${addr}`);
    await kv.del(`purchase:${addr}`);
  });

  it("issues an API key after TON ERC-20 transfer to burn address", async () => {
    const account = privateKeyToAccount(E2E_PRIVATE_KEY!);
    const walletClient = createWalletClient({
      account,
      chain: sepolia,
      transport: http(RPC_URL_SEPOLIA),
    });
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(RPC_URL_SEPOLIA),
    });

    const sessionCookie = await siweLogin(E2E_BASE_URL, account);

    // Fetch current price
    const priceRes = await fetch(`${E2E_BASE_URL}/api/price/ton`);
    expect(priceRes.status, "price endpoint").toBe(200);
    const { usdPerTon, usdPrice } = await priceRes.json();
    expect(usdPrice, "usdPrice").toBeTypeOf("number");
    expect(usdPerTon, "usdPerTon").toBeTypeOf("number");
    const amountWei = usdToTonWei(usdPrice, usdPerTon);

    // Send Sepolia TON ERC-20 transfer to burn address
    const txHash = await walletClient.writeContract({
      address: SEPOLIA_TON,
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [BURN_ADDRESS, amountWei],
    });

    // Wait for on-chain confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    expect(receipt.status, "ERC-20 transfer must succeed").toBe("success");

    // Call purchase API
    const purchaseRes = await fetch(`${E2E_BASE_URL}/api/keys/purchase`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session_id=${sessionCookie}`,
      },
      body: JSON.stringify({ txHash }),
    });
    expect(purchaseRes.status, "purchase endpoint").toBe(200);
    const body = await purchaseRes.json();
    expect(body.key, "API key format").toMatch(/^sk-/);
  }, 120_000);

  it("rotates purchased key (fresh key — no lastRotatedAt → cooldown skipped)", async () => {
    const account = privateKeyToAccount(E2E_PRIVATE_KEY!);
    const sessionCookie = await siweLogin(E2E_BASE_URL, account);

    const res = await fetch(`${E2E_BASE_URL}/api/keys/rotate`, {
      method: "POST",
      headers: { Cookie: `session_id=${sessionCookie}` },
    });
    expect(res.status, "first rotate should succeed").toBe(200);
    const body = await res.json();
    expect(body.key, "rotated key format").toMatch(/^sk-/);
    expect(body.expiresAt, "expiresAt present").toBeTruthy();
  }, 30_000);

  it("blocks second rotate while 24 h cooldown is active (403)", async () => {
    const account = privateKeyToAccount(E2E_PRIVATE_KEY!);
    const sessionCookie = await siweLogin(E2E_BASE_URL, account);

    const res = await fetch(`${E2E_BASE_URL}/api/keys/rotate`, {
      method: "POST",
      headers: { Cookie: `session_id=${sessionCookie}` },
    });
    expect(res.status, "second rotate must be blocked").toBe(403);
    const body = await res.json();
    expect(body.hoursLeft, "hoursLeft > 0").toBeGreaterThan(0);
  }, 30_000);

  it("renews purchase expiry by burning more TON (PUT /api/keys/purchase/renew)", async () => {
    const account = privateKeyToAccount(E2E_PRIVATE_KEY!);
    const walletClient = createWalletClient({
      account,
      chain: sepolia,
      transport: http(RPC_URL_SEPOLIA),
    });
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(RPC_URL_SEPOLIA),
    });

    const sessionCookie = await siweLogin(E2E_BASE_URL, account);

    const priceRes = await fetch(`${E2E_BASE_URL}/api/price/ton`);
    expect(priceRes.status, "price endpoint").toBe(200);
    const { usdPerTon, usdPrice } = await priceRes.json();
    const amountWei = usdToTonWei(usdPrice, usdPerTon);

    const txHash = await walletClient.writeContract({
      address: SEPOLIA_TON,
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [BURN_ADDRESS, amountWei],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    expect(receipt.status, "burn tx must succeed").toBe("success");
    purchaseRenewTxHash = txHash;

    const renewRes = await fetch(`${E2E_BASE_URL}/api/keys/purchase/renew`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session_id=${sessionCookie}`,
      },
      body: JSON.stringify({ txHash }),
    });
    expect(renewRes.status, "purchase renew endpoint").toBe(200);
    const body = await renewRes.json();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(body.expiresAt, "expiresAt extends ≥ 30 days from now").toBeGreaterThan(
      Date.now() + thirtyDaysMs - 60_000,
    );
  }, 120_000);

  it("blocks re-renewal with same txHash (409 dedup)", async () => {
    const account = privateKeyToAccount(E2E_PRIVATE_KEY!);
    const sessionCookie = await siweLogin(E2E_BASE_URL, account);

    const res = await fetch(`${E2E_BASE_URL}/api/keys/purchase/renew`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session_id=${sessionCookie}`,
      },
      body: JSON.stringify({ txHash: purchaseRenewTxHash }),
    });
    expect(res.status, "duplicate txHash must be rejected").toBe(409);
  }, 30_000);

  it("blocks re-purchase when active key already exists (409)", async () => {
    const account = privateKeyToAccount(E2E_PRIVATE_KEY!);
    const sessionCookie = await siweLogin(E2E_BASE_URL, account);

    // Use dummy txHash — active key check fires before any blockchain lookup
    const dummyTxHash = "0x" + "ab".repeat(32);
    const res = await fetch(`${E2E_BASE_URL}/api/keys/purchase`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session_id=${sessionCookie}`,
      },
      body: JSON.stringify({ txHash: dummyTxHash }),
    });
    expect(res.status, "duplicate purchase must be blocked").toBe(409);
    const body = await res.json();
    expect(body.error, "error message").toMatch(/active key/i);
  }, 30_000);
});
