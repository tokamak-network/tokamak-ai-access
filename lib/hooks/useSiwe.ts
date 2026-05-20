"use client";

/**
 * useSiwe — full Sign-In with Ethereum flow
 *
 * Step 1: GET  /api/auth/nonce         → nonce string
 * Step 2: Build SIWE message string    (client-side, no lib needed)
 * Step 3: wallet_sign via wagmi        → signature
 * Step 4: POST /api/auth/verify        → session cookie set
 *
 * The hook intentionally does NOT redirect; callers decide what to do on success.
 */

import { useState, useCallback } from "react";
import { useSignMessage } from "wagmi";

type SiweStatus = "idle" | "fetching-nonce" | "signing" | "verifying" | "success" | "error";

interface UseSiweReturn {
  status: SiweStatus;
  error: string | null;
  signIn: (address: string) => Promise<boolean>;
}

function buildSiweMessage(address: string, nonce: string): string {
  const domain = typeof window !== "undefined" ? window.location.host : "localhost:3000";
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const issuedAt = new Date().toISOString();
  // SIWE message format (EIP-4361)
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
    "Sign in to TON AI Access. No gas required.",
    "",
    `URI: ${origin}`,
    "Version: 1",
    "Chain ID: 1",
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export function useSiwe(): UseSiweReturn {
  const [status, setStatus] = useState<SiweStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const { signMessageAsync } = useSignMessage();

  const signIn = useCallback(async (address: string): Promise<boolean> => {
    setError(null);
    try {
      // Step 1: fetch nonce
      setStatus("fetching-nonce");
      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if (!nonceRes.ok) throw new Error(`Nonce error: ${await nonceRes.text()}`);
      const { nonce } = await nonceRes.json();

      // Step 2 + 3: build message and sign
      setStatus("signing");
      const message = buildSiweMessage(address, nonce);
      const signature = await signMessageAsync({ message });

      // Step 4: verify
      setStatus("verifying");
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      if (!verifyRes.ok) throw new Error(`Verify error: ${await verifyRes.text()}`);

      setStatus("success");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // User rejected the signature — surface a cleaner message
      const userMsg = msg.toLowerCase().includes("user rejected")
        ? "Signature rejected. Please approve the sign-in request in your wallet."
        : msg;
      setError(userMsg);
      setStatus("error");
      return false;
    }
  }, [signMessageAsync]);

  return { status, error, signIn };
}
