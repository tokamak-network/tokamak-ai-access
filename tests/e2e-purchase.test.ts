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
import { describe, it, expect } from "vitest";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { SiweMessage } from "siwe";
import { usdToTonWei } from "@/lib/ton-price";

const E2E_PRIVATE_KEY = process.env.E2E_PRIVATE_KEY as `0x${string}` | undefined;
const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const RPC_URL_SEPOLIA = process.env.RPC_URL_SEPOLIA;

const SEPOLIA_TON = "0xa30fe40285B8f5c0457DbC3B7C8A280373c40044" as `0x${string}`;
const BURN_ADDRESS = "0x000000000000000000000000000000000000dead" as `0x${string}`;

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

describe.skipIf(!E2E_PRIVATE_KEY)("Purchase e2e (Sepolia)", () => {
  it("issues an API key after TON ERC-20 transfer to burn address", async () => {
    const account = privateKeyToAccount(E2E_PRIVATE_KEY!);
    const domain = new URL(E2E_BASE_URL).host;

    const walletClient = createWalletClient({
      account,
      chain: sepolia,
      transport: http(RPC_URL_SEPOLIA),
    });

    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(RPC_URL_SEPOLIA),
    });

    // 1. Get SIWE nonce
    const nonceRes = await fetch(`${E2E_BASE_URL}/api/auth/nonce`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: account.address }),
    });
    expect(nonceRes.status, "nonce endpoint").toBe(200);
    const { nonce, statement } = await nonceRes.json();

    // 2. Build and sign SIWE message
    const siweMsg = new SiweMessage({
      domain,
      uri: E2E_BASE_URL,
      address: account.address,
      chainId: 11155111,
      nonce,
      statement,
      version: "1",
      issuedAt: new Date().toISOString(),
    });
    const message = siweMsg.prepareMessage();
    const signature = await walletClient.signMessage({ message });

    // 3. Verify SIWE → session cookie
    const verifyRes = await fetch(`${E2E_BASE_URL}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    expect(verifyRes.status, "verify endpoint").toBe(200);
    const setCookie = verifyRes.headers.get("set-cookie") ?? "";
    const sessionCookie = setCookie.match(/session_id=([^;]+)/)?.[1];
    expect(sessionCookie, "session cookie").toBeTruthy();

    // 4. Fetch current price
    const priceRes = await fetch(`${E2E_BASE_URL}/api/price/ton`);
    expect(priceRes.status, "price endpoint").toBe(200);
    const { usdPerTon, usdPrice } = await priceRes.json();
    const amountWei = usdToTonWei(usdPrice, usdPerTon);

    // 5. Send Sepolia TON ERC-20 transfer to burn address
    const txHash = await walletClient.writeContract({
      address: SEPOLIA_TON,
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [BURN_ADDRESS, amountWei],
    });

    // 6. Wait for on-chain confirmation
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    // 7. Call purchase API with session cookie
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
  }, 120_000); // 120s — Sepolia block time
});
