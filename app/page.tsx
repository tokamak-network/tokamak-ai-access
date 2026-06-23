"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAccount, useConfig, useConnect, useDisconnect, useSwitchChain, type Connector } from "wagmi";
import { useSiwe } from "@/lib/hooks/useSiwe";
import HeroMark from "./HeroMark";

// Inlined at build time: 100 in dev (.env.local), 100 in production (.env.production)
const MIN_TON = process.env.NEXT_PUBLIC_MIN_TON ?? "100";

const CEX_EXCHANGES = [
  { name: "Upbit",           url: "https://upbit.com/exchange?code=CRIX.UPBIT.KRW-TOKAMAK" },
  { name: "Bithumb",         url: "https://www.bithumb.com/trade/order/TOKAMAK_KRW" },
  { name: "WEEX",            url: "https://www.weex.com/spot/TOKAMAK-USDT" },
  { name: "XT.COM",          url: "https://www.xt.com/en/trade/tokamak_usdt" },
  { name: "DigiFinex",       url: "https://www.digifinex.com/en-ww/trade/USDT/TOKAMAK" },
];

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
  const { address, isConnected, chainId } = useAccount();
  const { chains } = useConfig();
  const expectedChainId = chains[0]?.id;
  const { connect, connectors, isPending: isConnecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { status: siweStatus, error: siweError, signIn } = useSiwe();

  const [modalOpen, setModalOpen] = useState(false);
  const [howItWorksTab, setHowItWorksTab] = useState<"staker" | "buyer">("staker");

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
          <Link href="/" className="topbar-logo" style={{ textDecoration: "none", color: "inherit" }}>TON AI Access</Link>
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
          <HeroMark />

          <aside>
            <span className="eyebrow">Tokamak Network</span>
            <span className="n-lbl">Status</span>
            <span className="n-val">Beta · 2026</span>
            <span className="n-lbl">Access</span>
            <span className="n-val">Stake or buy</span>
            <span className="n-lbl">Minimum stake</span>
            <span className="n-val">{MIN_TON} TON</span>
            <span className="n-lbl">Or buy</span>
            <span className="n-val">~$5 / 30 days</span>
            <span className="n-lbl">Network</span>
            <span className="n-val">Ethereum Mainnet</span>

          </aside>

          <div className="hero-content">
            <div className="h1-rule" />
            <h1 className="display">
              Your wallet.<br />Your AI access.
            </h1>
            <p className="body-lead">
              Stake ≥{MIN_TON} TON for a free 30-day API key, or buy one for ~$5.
              No sign-up, no credit card required.
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
                    connectError={connectError}
                    onConnect={(c) => connect({ connector: c })}
                    onClose={() => setModalOpen(false)}
                  />
                )}
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" }}>
                {isConnected && chainId !== expectedChainId && (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <p style={{ fontSize: "0.8125rem", color: "#f59e0b", margin: 0 }}>
                      Wrong network
                    </p>
                    <button
                      onClick={() => expectedChainId && switchChain({ chainId: expectedChainId })}
                      disabled={isSwitchingChain}
                      style={{ background: "transparent", color: "var(--ink)", border: "1px solid var(--hairline)", cursor: isSwitchingChain ? "default" : "pointer", padding: "3px 10px", borderRadius: "4px", fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.08em", opacity: isSwitchingChain ? 0.5 : 1, transition: "border-color 140ms" }}
                    >
                      {isSwitchingChain ? "Switching…" : `Switch to ${chains[0]?.name ?? "correct network"}`}
                    </button>
                  </div>
                )}
                <button
                  className="btn-primary"
                  onClick={() => address && signIn(address)}
                  disabled={isSiweLoading || (isConnected && chainId !== expectedChainId)}
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

        {/* ── Model Cards (dark) ── */}
        <div className="models-section-wrap">
          <section className="models-section">
            <aside>
              <span className="eyebrow-dark">Models</span>
              <span className="n-lbl-dark">Available</span>
              <span className="n-val-dark">2 models</span>
              <span className="n-lbl-dark">API compat</span>
              <span className="n-val-dark">OpenAI REST</span>
              <span className="n-lbl-dark">Context</span>
              <span className="n-val-dark">Up to 1M tokens</span>
              <span className="n-lbl-dark">Best for</span>
              <span className="n-val-dark" style={{ marginBottom: 0 }}>Coding · Agents</span>
            </aside>
            <div className="model-cards">
              <div className="model-card">
                <div className="model-name">qwen-3.6</div>
                <div className="model-maker">Alibaba · Qwen3 MoE</div>
                <div className="model-desc">35B params, 3B active. Fast reasoning with up to 1M token context. Strong at coding and agentic workflows.</div>
                <div className="model-tags">
                  <span className="tag tag--blue">Agentic coding</span>
                  <span className="tag tag--blue">Reasoning</span>
                  <span className="tag tag--purple">Think Preservation</span>
                  <span className="tag tag--amber">MoE · Low latency</span>
                </div>
              </div>
              <div className="model-card m2">
                <div className="model-name">gemma-4</div>
                <div className="model-maker">Google · Gemma 4</div>
                <div className="model-desc">31B dense transformer. Multimodal (text, image, video) with 256K token context. Advanced reasoning with configurable thinking mode.</div>
                <div className="model-tags">
                  <span className="tag tag--teal">Multimodal</span>
                  <span className="tag tag--blue">Coding</span>
                  <span className="tag tag--purple">Thinking mode</span>
                  <span className="tag tag--amber">256K context</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ── How it works ── */}
        <section className="section">
          <aside>
            <span className="eyebrow">How it works</span>
            <span className="n-lbl">Steps</span>
            <span className="n-val">3</span>
            <span className="n-lbl">Time</span>
            <span className="n-val">~60 seconds</span>
            <span className="n-lbl">Supported wallets</span>
            <span className="n-val" style={{ marginBottom: 0 }}>MetaMask, OKX Wallet, Rabby Wallet</span>
          </aside>

          <div>
            <p className="body-lead" style={{ marginBottom: "32px" }}>
              Connect any EVM wallet, prove ownership with a single off-chain
              signature, then stake or buy — your key arrives instantly.
            </p>

            {/* Tab toggle */}
            <div style={{
              display: "flex",
              gap: 0,
              border: "1px solid var(--divider)",
              borderRadius: "8px",
              overflow: "hidden",
              marginBottom: "32px",
              width: "fit-content",
            }}>
              {(["staker", "buyer"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setHowItWorksTab(tab)}
                  aria-pressed={howItWorksTab === tab}
                  style={{
                    padding: "8px 20px",
                    fontSize: "0.75rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    fontFamily: "var(--font-mono)",
                    cursor: "pointer",
                    border: "none",
                    background: howItWorksTab === tab ? "var(--ink)" : "transparent",
                    color: howItWorksTab === tab ? "#fff" : "var(--muted)",
                    transition: "background 120ms, color 120ms",
                  }}
                >
                  {tab === "staker" ? "Stakers" : "Buyers"}
                </button>
              ))}
            </div>

            {/* Step list */}
            <ol style={{
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: "28px",
              marginBottom: "40px",
            }}>
              {(["01", "02"] as const).map((num) => {
                const [title, desc] = num === "01"
                  ? ["Connect wallet", "MetaMask, WalletConnect, or any EVM-compatible wallet."]
                  : ["Sign a message", "One SIWE signature proves ownership. No gas, no transactions."];
                return (
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
                );
              })}
              <li style={{ display: "flex", gap: "20px" }}>
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.6875rem",
                  color: "var(--accent)",
                  letterSpacing: "0.12em",
                  paddingTop: "2px",
                  flexShrink: 0,
                }}>03</span>
                <div>
                  {howItWorksTab === "staker" ? (
                    <>
                      <p style={{ fontWeight: 600, color: "var(--ink)", marginBottom: "4px" }}>Stake ≥{MIN_TON} TON</p>
                      <p style={{ fontSize: "0.9375rem", color: "var(--muted)", lineHeight: 1.6 }}>Stake across any Layer2. Key issued instantly — no expiry, active as long as you stay staked.</p>
                    </>
                  ) : (
                    <>
                      <p style={{ fontWeight: 600, color: "var(--ink)", marginBottom: "4px" }}>Buy a 30-day pass (~$5 in TON)</p>
                      <p style={{ fontSize: "0.9375rem", color: "var(--muted)", lineHeight: 1.6 }}>TON ERC-20 is burned on purchase. Key activates after on-chain confirmation (~15s). No staking required.</p>
                      <p style={{ marginTop: "12px", fontSize: "0.8125rem", color: "var(--muted)" }}>Don&apos;t have TON? Get it on:</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: "6px" }}>
                        {CEX_EXCHANGES.map(({ name, url }) => (
                          <CexLink key={name} name={name} url={url} />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </li>
            </ol>
          </div>
        </section>

        {/* ── Tutorial video ── */}
        <TutorialSection />

        {/* ── Agent setup (CLI) ── */}
        <AgentSetupSection />

        {/* ── Endpoint info ── */}
        <section className="section section--compact">
          <aside>
            <span className="eyebrow">Endpoint</span>
          </aside>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className="card" style={{ marginTop: 0, padding: "20px 24px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {[
                ["Base URL", "https://api2.ai.tokamak.network"],
                ["Model", "qwen-3.6, gemma-4"],
                ["Protocol", "OpenAI-compatible REST"],
              ].map(([label, val]) => (
                <div key={label} style={{ display: "flex", gap: "8px 16px", alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--muted)", letterSpacing: "0.14em", textTransform: "uppercase", minWidth: "80px" }}>
                    {label}
                  </span>
                  <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--ink)" }}>
                    {val}
                  </code>
                </div>
              ))}
            </div>
            <div className="card" style={{ marginTop: 0, padding: "20px 24px", display: "flex", flexDirection: "column", gap: "6px" }}>
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

        {/* ── FAQ (dark) ── */}
        <div className="models-section-wrap">
          <section className="models-section" style={{ paddingTop: "64px", paddingBottom: "64px" }}>
            <aside>
              <span className="eyebrow-dark">FAQ</span>
            </aside>
            <div className="faq-list">
            <div className="faq-item">
              <div className="faq-q">How long is access valid? <span className="faq-chevron">▾</span></div>
              <div className="faq-a">Stakers: free as long as you stay staked — your key has no expiry and stays active until you unstake. Buyers: 30 days per purchase, renewable anytime from the dashboard.</div>
            </div>
            <div className="faq-item">
              <div className="faq-q">Which AI tools can I use this with? <span className="faq-chevron">▾</span></div>
              <div className="faq-a">Any tool that accepts an OpenAI-compatible endpoint — Claude Code, Codex, Openclaw, Hermes, and more. Set the base URL and your key; nothing else changes.</div>
            </div>
            <div className="faq-item">
              <div className="faq-q">Are there rate limits? <span className="faq-chevron">▾</span></div>
              <div className="faq-a">Fair-use limits apply to prevent abuse. Usage resets every 24 hours — most users will never hit the daily cap.</div>
            </div>
            <div className="faq-item">
              <div className="faq-q">What if I lose my key? <span className="faq-chevron">▾</span></div>
              <div className="faq-a">Hit <strong>Rotate key</strong> in the dashboard — your old key is revoked instantly and a new one is issued. Keys are shown once and cannot be retrieved after that.</div>
            </div>
            <div className="faq-item">
              <div className="faq-q">What if I buy access instead of staking? <span className="faq-chevron">▾</span></div>
              <div className="faq-a">No staking required. Pay ~$5 in TON ERC-20 — it&apos;s burned on purchase. You get the same models, same rate limits, and a 30-day key. Renew from the dashboard anytime.</div>
            </div>
            </div>
          </section>
        </div>
      </main>

      <footer style={{
        borderTop: "1px solid var(--divider)",
        padding: "24px var(--pad-x)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: "var(--font-mono)",
        fontSize: "0.6875rem",
        color: "var(--muted)",
        letterSpacing: "0.06em",
      }}>
        <span>© 2026 Tokamak Network | All Rights Reserved.</span>
        <span>Any support? <a href="mailto:theo@tokamak.network" style={{ color: "inherit", textDecoration: "none" }}>theo@tokamak.network</a></span>
      </footer>
    </>
  );
}

function TutorialSection() {
  return (
    <section className="section">
      <aside>
        <span className="eyebrow">Tutorial</span>
        <span className="n-lbl">Duration</span>
        <span className="n-val">~2 min</span>
        <span className="n-lbl">Covers</span>
        <span className="n-val">Staking &amp; buying</span>
        <span className="n-lbl">Format</span>
        <span className="n-val" style={{ marginBottom: 0 }}>Walkthrough</span>
      </aside>

      <div>
        <h2 className="section-heading">See it in action</h2>
        <p className="body-lead">
          Watch the full walkthrough — connect your wallet, stake or buy, and get your API key in under two minutes.
        </p>
        <div style={{
          background: "#000",
          borderRadius: "var(--radius)",
          border: "1px solid var(--hairline)",
          overflow: "hidden",
          boxShadow: "0 4px 24px rgba(12,26,44,0.08)",
        }}>
          <video
            controls
            preload="metadata"
            style={{ display: "block", width: "100%", height: "auto", maxHeight: "480px" }}
          >
            <source src="/TonAiAccessIntro.mp4" type="video/mp4" />
          </video>
        </div>
      </div>
    </section>
  );
}

const CLI = "npx @tokamak-network/ai-access-cli";

function AgentSetupSection() {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(id: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="models-section-wrap">
      <section className="models-section">
        <aside>
          <span className="eyebrow-dark">Agent setup</span>
          <span className="n-lbl-dark">Supported tools</span>
          <span className="n-val-dark">Claude Code, Codex, OpenClaw, Hermes</span>
          <span className="n-lbl-dark">Requires</span>
          <span className="n-val-dark">Node.js + npm</span>
          <span className="n-lbl-dark">Time</span>
          <span className="n-val-dark">~30 seconds</span>
          <span className="n-lbl-dark">Reversible</span>
          <span className="n-val-dark" style={{ marginBottom: 0 }}>Yes — one command</span>
        </aside>

        <div>
          <p className="body-lead" style={{ marginBottom: "36px", color: "rgba(255,255,255,0.65)" }}>
            Got your key? One command wires it into your coding agent —
            base URL, model, and environment all configured automatically.
          </p>

          <div className="cli-card" style={{ marginBottom: "14px" }}>
            <div className="cli-card-hd">
              <span>Configure — prompts for tool, key &amp; model</span>
              <button className="cli-copy" onClick={() => copy("configure", `${CLI} configure`)}>
                {copied === "configure" ? "COPIED" : "COPY"}
              </button>
            </div>
            <pre className="cli-pre">{`${CLI} configure`}</pre>
          </div>

          <div className="cli-card" style={{ marginBottom: "16px" }}>
            <div className="cli-card-hd">
              <span>Revert — restores your original settings</span>
              <button className="cli-copy" onClick={() => copy("revert", `${CLI} revert`)}>
                {copied === "revert" ? "COPIED" : "COPY"}
              </button>
            </div>
            <pre className="cli-pre">{`${CLI} revert`}</pre>
          </div>
        </div>
      </section>
    </div>
  );
}

const WALLET_ICON_PATHS: Record<string, string> = {
  MetaMask: "/metamask-icon.svg",
  Rabby: "/rabby-icon.png",
  "Rabby Wallet": "/rabby-icon.png",
  "OKX Wallet": "/okx-icon.svg",
};

function WalletModal({
  connectors,
  isPending,
  connectError,
  onConnect,
  onClose,
}: {
  connectors: readonly Connector[];
  isPending: boolean;
  connectError?: Error | null;
  onConnect: (c: Connector) => void;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (connectError) setConnecting(null);
  }, [connectError]);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) onClose();
  }

  function handleConnect(c: Connector) {
    setConnecting(c.id);
    onConnect(c);
  }

  const seen = new Set<string>();
  const unique = connectors.filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });

  if (!mounted) return null;

  return createPortal(
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
        zIndex: 2147483647,
      }}
    >
      <div
        style={{
          width: "min(360px, calc(100vw - 40px))",
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
        {connectError && (
          <div
            style={{
              margin: "8px 20px 0",
              padding: "8px 12px",
              background: "rgba(220,53,69,0.08)",
              border: "1px solid rgba(220,53,69,0.25)",
              borderRadius: "6px",
              fontSize: "0.8125rem",
              color: "#dc3545",
            }}
          >
            {connectError.message}
          </div>
        )}
        <div style={{ padding: "8px 0" }}>
          {unique.map((c) => {
            const isConnecting = isPending && connecting === c.id;
            const iconSrc = c.icon ?? WALLET_ICON_PATHS[c.name];
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
                {iconSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={iconSrc} alt={c.name} style={{ width: "1.5rem", height: "1.5rem", borderRadius: "4px", flexShrink: 0 }} />
                ) : (
                  <span style={{ width: "1.5rem", height: "1.5rem", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.25rem" }}>🔗</span>
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
    </div>,
    document.body
  );
}

function CexLink({ name, url }: { name: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--accent)", textDecoration: "none", letterSpacing: "0.04em" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = "underline"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = "none"; }}
    >
      {name}
    </a>
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
