/**
 * Sepolia E2E — stake-based key flows (issue, renew)
 *
 * Requires:
 *   E2E_STAKED_PRIVATE_KEY   — test wallet with ≥100 TON staked on Sepolia (0x...)
 *   RPC_URL_SEPOLIA          — Sepolia RPC endpoint
 *   E2E_BASE_URL             — target server (default: http://localhost:3000)
 *   KV_REST_API_URL          — Vercel/Upstash KV endpoint (for createdAt time-travel)
 *   KV_REST_API_TOKEN        — Vercel/Upstash KV token
 *
 * Run: node --env-file=.env.local node_modules/.bin/vitest run tests/e2e-stake.test.ts
 * Prereq: npm run dev (in a separate terminal)
 *
 * Skipped automatically when E2E_STAKED_PRIVATE_KEY is not set.
 */
import { describe, it, expect } from "vitest";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { SiweMessage } from "siwe";
import { kv } from "@vercel/kv";
import type { KeyRecord } from "@/lib/key-guards";

const E2E_STAKED_PRIVATE_KEY = process.env.E2E_STAKED_PRIVATE_KEY as `0x${string}` | undefined;
const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const RPC_URL_SEPOLIA = process.env.RPC_URL_SEPOLIA;

const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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

describe.skipIf(!E2E_STAKED_PRIVATE_KEY)("Stake-based key flows e2e (Sepolia)", () => {
  it("issues key for staked wallet via POST /api/keys/issue (or confirms key exists)", async () => {
    const account = privateKeyToAccount(E2E_STAKED_PRIVATE_KEY!);
    const sessionCookie = await siweLogin(E2E_BASE_URL, account);

    const res = await fetch(`${E2E_BASE_URL}/api/keys/issue`, {
      method: "POST",
      headers: { Cookie: `session_id=${sessionCookie}` },
    });
    // 200 = newly issued, 409 = already exists from a previous test run
    expect([200, 409], "issue returns 200 or 409").toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      expect(body.key, "issued key format").toMatch(/^sk-/);
    }
  }, 30_000);

  it("blocks stake renew when key is less than 30 days old (403 + daysLeft)", async () => {
    const account = privateKeyToAccount(E2E_STAKED_PRIVATE_KEY!);
    const sessionCookie = await siweLogin(E2E_BASE_URL, account);

    // getSessionAddress() returns address.toLowerCase() — KV keys use lowercase
    const addr = account.address.toLowerCase();
    // Reset createdAt to now so the 30-day guard definitely fires
    const record = await kv.get<KeyRecord>(`key:${addr}`);
    expect(record, "key record must exist in KV").toBeTruthy();
    await kv.set(`key:${addr}`, {
      ...record,
      createdAt: Date.now(),
    });

    const res = await fetch(`${E2E_BASE_URL}/api/keys/renew`, {
      method: "POST",
      headers: { Cookie: `session_id=${sessionCookie}` },
    });
    expect(res.status, "renew must be blocked before 30 days").toBe(403);
    const body = await res.json();
    expect(body.daysLeft, "daysLeft present and > 0").toBeGreaterThan(0);
  }, 30_000);

  it("renews staked key after KV time-travel (createdAt set to 31 days ago)", async () => {
    const account = privateKeyToAccount(E2E_STAKED_PRIVATE_KEY!);
    const sessionCookie = await siweLogin(E2E_BASE_URL, account);

    // getSessionAddress() returns address.toLowerCase() — KV keys use lowercase
    const addr = account.address.toLowerCase();
    // Backdate createdAt to bypass the 30-day check server-side
    const record = await kv.get<KeyRecord>(`key:${addr}`);
    expect(record, "key record must exist in KV").toBeTruthy();
    await kv.set(`key:${addr}`, {
      ...record,
      createdAt: Date.now() - THIRTY_ONE_DAYS_MS,
    });

    const res = await fetch(`${E2E_BASE_URL}/api/keys/renew`, {
      method: "POST",
      headers: { Cookie: `session_id=${sessionCookie}` },
    });
    expect(res.status, "renew should succeed after 30-day age").toBe(200);
    const body = await res.json();
    expect(body.expiresAt, "new expiresAt present").toBeTruthy();
    expect(
      new Date(body.expiresAt).getTime(),
      "new expiresAt is ≥ 30 days from now",
    ).toBeGreaterThan(Date.now() + THIRTY_DAYS_MS - 60_000);
  }, 30_000);
});
