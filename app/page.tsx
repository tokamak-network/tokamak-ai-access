"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useSiwe } from "@/lib/hooks/useSiwe";

/**
 * Landing page — T3.1 + T3.2
 *
 * State machine:
 *  disconnected  → "Connect Wallet" (useConnect)
 *  connected     → "Sign in" (SIWE via useSiwe)
 *  siwe success  → router.push("/dashboard")
 */

const STATUS_LABELS: Record<string, string> = {
  "fetching-nonce": "Preparing sign-in…",
  signing: "Check your wallet…",
  verifying: "Verifying signature…",
  error: "Sign in",
  idle: "Sign in",
  success: "Redirecting…",
};

export default function LandingPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { status: siweStatus, error: siweError, signIn } = useSiwe();

  // Redirect as soon as SIWE succeeds
  useEffect(() => {
    if (siweStatus === "success") {
      router.push("/dashboard");
    }
  }, [siweStatus, router]);

  // Primary connector: MetaMask first, then the first available injected
  const primaryConnector =
    connectors.find((c) => c.name === "MetaMask") ?? connectors[0];

  const isSiweLoading =
    siweStatus === "fetching-nonce" ||
    siweStatus === "signing" ||
    siweStatus === "verifying" ||
    siweStatus === "success";

  async function handleSignIn() {
    if (!address) return;
    await signIn(address);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
      <div className="max-w-md w-full border border-gray-800 rounded-2xl p-10 space-y-8">
        {/* Header */}
        <div>
          <p className="text-xs font-mono text-brand uppercase tracking-widest mb-3">
            Tokamak Network
          </p>
          <h1 className="text-3xl font-bold tracking-tight">TON AI Access</h1>
          <p className="mt-2 text-gray-400">
            Stake ≥ 10 TON → Get your LiteLLM API key
          </p>
        </div>

        {/* Action area */}
        {!isConnected ? (
          <button
            onClick={() => primaryConnector && connect({ connector: primaryConnector })}
            disabled={isConnecting || !primaryConnector}
            className="w-full py-3 px-6 rounded-lg bg-brand font-semibold
                       hover:bg-brand/90 transition-colors focus:outline-none
                       focus:ring-2 focus:ring-brand/50 disabled:opacity-50"
          >
            {isConnecting ? "Connecting…" : "Connect Wallet"}
          </button>
        ) : (
          <div className="space-y-3">
            {/* Connected address pill */}
            <div className="flex items-center justify-between text-sm text-gray-400">
              <span className="font-mono">
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </span>
              <button
                onClick={() => disconnect()}
                className="text-xs hover:text-white transition-colors"
              >
                Disconnect
              </button>
            </div>
            {/* Sign-in CTA */}
            <button
              onClick={handleSignIn}
              disabled={isSiweLoading}
              className="w-full py-3 px-6 rounded-lg bg-brand font-semibold
                         hover:bg-brand/90 transition-colors focus:outline-none
                         focus:ring-2 focus:ring-brand/50 disabled:opacity-50"
            >
              {STATUS_LABELS[siweStatus] ?? "Sign in"}
            </button>
            {siweError && (
              <p className="text-xs text-red-400">{siweError}</p>
            )}
          </div>
        )}

        {/* Steps */}
        <ol className="space-y-2 text-sm text-gray-400 list-decimal list-inside">
          <li>Connect your EVM wallet</li>
          <li>Sign a message (no gas required)</li>
          <li>
            Receive your API key for{" "}
            <code className="text-gray-200">qwen-3.6</code>
          </li>
        </ol>
      </div>
    </main>
  );
}
