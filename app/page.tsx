"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useConnect, useDisconnect, type Connector } from "wagmi";
import { useSiwe } from "@/lib/hooks/useSiwe";

// Inlined at build time: 10 in dev (.env.local), 200 in production (.env.production)
const MIN_TON = process.env.NEXT_PUBLIC_MIN_TON ?? "10";

const STATUS_LABELS: Record<string, string> = {
  "fetching-nonce": "Preparing…",
  signing:          "Check your wallet…",
  verifying:        "Verifying…",
  error:            "Sign in",
  idle:             "Sign in",
  success:          "Redirecting…",
};

export default function LandingPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { status: siweStatus, error: siweError, signIn } = useSiwe();

  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (isConnected) setModalOpen(false);
  }, [isConnected]);

  const isSiweLoading =
    siweStatus === "fetching-nonce" ||
    siweStatus === "signing"        ||
    siweStatus === "verifying"      ||
    siweStatus === "success";

  useEffect(() => {
    if (siweStatus === "success") router.push("/dashboard");
  }, [siweStatus, router]);

  return (
    <>
      {/* Single hairline — positioned by JS via SplitLine component */}
      <SplitLine />

      {/* Top bar */}
      <header className="topbar">
        <div className="topbar-inner">
          <span className="topbar-logo">TON AI Access</span>
          {isConnected && (
            <div className="topbar-meta">
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--muted)" }}>
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </span>
              <button
                onClick={() => disconnect()}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.6875rem",
                  color: "var(--muted)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  letterSpacing: "0.08em",
                }}
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </header>

      <main>
        {/* ── Hero section ── */}
        <section className="section">
          <aside>
            <span className="eyebrow">Tokamak Network</span>
            <span className="n-lbl">Status</span>
            <span className="n-val">Beta · 2026</span>
            <span className="n-lbl">Access</span>
            <span className="n-val">Free for TON stakers</span>
            <span className="n-lbl">Minimum stake</span>
            <span className="n-val">{MIN_TON} TON</span>
            <span className="n-lbl">Network</span>
            <span className="n-val">Ethereum Mainnet</span>
          </aside>

          <div>
            <div className="h1-rule" />
            <h1 className="display">
              Your stake<br />earns you AI.
            </h1>
            <p className="body-lead">
              TON stakers with {MIN_TON} TON or more get a free LiteLLM API key —
              no sign-up, no credit card. Just your wallet.
            </p>

            {!isConnected ? (
              <>
                <button
                  className="btn-primary"
                  onClick={() => setModalOpen(true)}
                >
                  Connect Wallet →
                </button>
                {modalOpen && (
                  <WalletModal
                    connectors={connectors}
                    isPending={isConnecting}
                    onConnect={(c) => connect({ connector: c })}
                    onClose={() => setModalOpen(false)}
                  />
                )}
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" }}>
                <button
                  className="btn-primary"
                  onClick={() => address && signIn(address)}
                  disabled={isSiweLoading}
                >
                  {STATUS_LABELS[siweStatus] ?? "Sign in"}
                </button>
                {siweError && (
                  <p style={{ fontSize: "0.8125rem", color: "#dc2626", maxWidth: "52ch" }}>
                    {siweError}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="section">
          <aside>
            <span className="eyebrow">How it works</span>
            <span className="n-lbl">Steps</span>
            <span className="n-val">3</span>
            <span className="n-lbl">Time</span>
            <span className="n-val">~60 seconds</span>
            <span className="n-lbl">Gas required</span>
            <span className="n-val">None</span>
            <span className="n-lbl">Supported wallets</span>
            <span className="n-val" style={{ marginBottom: 0 }}>
              MetaMask, OKX Wallet, Browser Wallet
            </span>
          </aside>

          <div>
            <p className="body-lead" style={{ marginBottom: "48px" }}>
              Connect any EVM wallet, prove ownership with a single off-chain
              signature, and receive your API key immediately — no transactions,
              no waiting.
            </p>
            <ol style={{
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: "28px",
              marginBottom: "40px",
            }}>
              {[
                ["01", "Connect wallet", "MetaMask, WalletConnect, or any EVM-compatible wallet."],
                ["02", "Sign a message", "One SIWE signature proves ownership. No gas, no transactions."],
                ["03", "Get your API key", `${MIN_TON} TON staked across any Layer2 qualifies. Key issued instantly.`],
              ].map(([num, title, desc]) => (
                <li key={num} style={{ display: "flex", gap: "20px" }}>
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.6875rem",
                    color: "var(--accent)",
                    letterSpacing: "0.12em",
                    paddingTop: "2px",
                    flexShrink: 0,
                  }}>{num}</span>
                  <div>
                    <p style={{ fontWeight: 600, color: "var(--ink)", marginBottom: "4px" }}>{title}</p>
                    <p style={{ fontSize: "0.9375rem", color: "var(--muted)", lineHeight: 1.6 }}>{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Endpoint info ── */}
        <section className="section section--compact">
          <aside>
            <span className="eyebrow">Endpoint</span>
          </aside>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[
                ["Base URL", "https://api2.ai.tokamak.network"],
                ["Model", "qwen-3.6"],
                ["Protocol", "OpenAI-compatible REST"],
              ].map(([label, val]) => (
                <div key={label} style={{ display: "flex", gap: "16px", alignItems: "baseline" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--muted)", letterSpacing: "0.14em", textTransform: "uppercase", minWidth: "80px" }}>
                    {label}
                  </span>
                  <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--ink)" }}>
                    {val}
                  </code>
                </div>
              ))}
            </div>
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                Quick test
              </span>
              <pre style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                color: "var(--ink)",
                lineHeight: 1.6,
                margin: 0,
                overflowX: "auto",
                whiteSpace: "pre",
              }}>{`curl https://api2.ai.tokamak.network/v1/chat/completions \\
  -H "Authorization: Bearer $YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"qwen-3.6","messages":[{"role":"user","content":"hello"}],"max_tokens":10}'`}</pre>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

const WALLET_ICONS: Record<string, string> = {
  MetaMask: "🦊",
};

function WalletModal({
  connectors,
  isPending,
  onConnect,
  onClose,
}: {
  connectors: readonly Connector[];
  isPending: boolean;
  onConnect: (c: Connector) => void;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) onClose();
  }

  async function handleConnect(c: Connector) {
    setConnecting(c.id);
    onConnect(c);
  }

  const seen = new Set<string>();
  const unique = connectors.filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(12,26,44,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: 360,
          background: "var(--surface-raised)",
          border: "1px solid var(--hairline)",
          borderRadius: "var(--radius)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--hairline)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 600, color: "var(--ink)", fontSize: "0.9375rem" }}>
            Connect Wallet
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--muted)",
              fontSize: "1.125rem",
              lineHeight: 1,
              padding: "0 2px",
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: "8px 0" }}>
          {unique.map((c) => {
            const isConnecting = isPending && connecting === c.id;
            const icon = WALLET_ICONS[c.name] ?? "🔗";
            return (
              <button
                key={c.id}
                onClick={() => handleConnect(c)}
                disabled={isPending}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  padding: "14px 20px",
                  background: "none",
                  border: "none",
                  cursor: isPending ? "not-allowed" : "pointer",
                  textAlign: "left",
                  color: "var(--ink)",
                  opacity: isPending && !isConnecting ? 0.45 : 1,
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!isPending) (e.currentTarget as HTMLButtonElement).style.background = "var(--hairline)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "none";
                }}
              >
                {c.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.icon} alt={c.name} style={{ width: "1.5rem", height: "1.5rem", borderRadius: "4px", flexShrink: 0 }} />
                ) : (
                  <span style={{ fontSize: "1.25rem", flexShrink: 0 }}>{icon}</span>
                )}
                <span style={{ fontSize: "0.9375rem", fontWeight: 500 }}>{c.name}</span>
                {isConnecting && (
                  <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--muted)" }}>
                    Connecting…
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* Positions the hairline to align with the 1fr/2fr column break */
function SplitLine() {
  useEffect(() => {
    function position() {
      const el = document.querySelector<HTMLElement>(".split-line");
      if (!el) return;
      const vw = window.innerWidth;
      const contentW = Math.min(vw, 1280);
      const contentLeft = (vw - contentW) / 2 + 32;
      const innerW = contentW - 64;
      const col1W = (innerW - 48) / 3;
      el.style.left = contentLeft + col1W + 24 + "px";
    }
    position();
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  }, []);

  return <div className="split-line" aria-hidden="true" />;
}
