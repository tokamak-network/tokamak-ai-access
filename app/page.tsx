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
          <a href="/" className="topbar-logo" style={{ textDecoration: "none", color: "inherit" }}>TON AI Access</a>
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

        {/* ── Model Cards (dark) ── */}
        <div className="models-section-wrap">
          <section className="models-section">
            <aside>
              <span className="eyebrow-dark">Models</span>
              <span className="n-lbl-dark">Available</span>
              <span className="n-val-dark">3 models</span>
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
                <div className="model-name">deepseek-v4-flash</div>
                <div className="model-maker">DeepSeek · V4 Series</div>
                <div className="model-desc">Fast and capable model optimized for speed and efficiency across coding, reasoning, and multilingual tasks.</div>
                <div className="model-tags">
                  <span className="tag tag--purple">Fast Inference</span>
                  <span className="tag tag--blue">Coding</span>
                  <span className="tag tag--teal">Reasoning</span>
                  <span className="tag tag--amber">Low latency</span>
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
                ["Model", "qwen-3.6, deepseek-v4-flash, gemma-4"],
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
              <div className="faq-q">How long is access free? <span className="faq-chevron">▾</span></div>
              <div className="faq-a">As long as you maintain your stake. Unstaking expires your API key immediately.</div>
            </div>
            <div className="faq-item">
              <div className="faq-q">Which AI tools can I use this with? <span className="faq-chevron">▾</span></div>
              <div className="faq-a">Any tool that accepts an OpenAI-compatible endpoint — Claude Code, Codex, Openclaw, Hermes, and more. Set the base URL and your key; nothing else changes.</div>
            </div>
            <div className="faq-item">
              <div className="faq-q">Are there rate limits? <span className="faq-chevron">▾</span></div>
              <div className="faq-a">Reasonable limits apply during beta.</div>
            </div>
            <div className="faq-item">
              <div className="faq-q">What if I lose my key? <span className="faq-chevron">▾</span></div>
              <div className="faq-a">Hit <strong>Rotate key</strong> in the dashboard — your old key is revoked instantly and a new one is issued. Keys are shown once and cannot be retrieved after that.</div>
            </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

const AGENT_TARGETS = [
  { id: "claude",   name: "Claude Code", revert: true },
  { id: "codex",    name: "Codex",       revert: true },
  { id: "openclaw", name: "OpenClaw",    revert: false },
  { id: "hermes",   name: "Hermes",      revert: false },
] as const;

const CLI = "npx @tokamak-network/ai-access-cli";

function AgentSetupSection() {
  const [target, setTarget] = useState<(typeof AGENT_TARGETS)[number]>(AGENT_TARGETS[0]);
  const [copied, setCopied] = useState<string | null>(null);

  function copy(id: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const interactiveCmd = `${CLI} configure`;
  const targetCmd = [
    `# Configure ${target.name} with your TON key`,
    `${CLI} configure --target ${target.id} --api-key sk-...`,
    ...(target.revert
      ? ["", "# Undo anytime — restores your original settings", `${CLI} revert --target ${target.id}`]
      : []),
  ].join("\n");

  return (
    <div className="models-section-wrap">
      <section className="models-section">
        <aside>
          <span className="eyebrow-dark">Agent setup</span>
          <span className="n-lbl-dark">Supported tools</span>
          <span className="n-val-dark">Claude Code, Codex, OpenClaw, Hermes</span>
          <span className="n-lbl-dark">Install</span>
          <span className="n-val-dark">None — npx</span>
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
              <span>Interactive — prompts for tool, key &amp; model</span>
              <button className="cli-copy" onClick={() => copy("interactive", interactiveCmd)}>
                {copied === "interactive" ? "COPIED" : "COPY"}
              </button>
            </div>
            <pre className="cli-pre">{interactiveCmd}</pre>
          </div>

          <div className="cli-tabs" role="tablist">
            {AGENT_TARGETS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={t.id === target.id}
                className={`cli-tab${t.id === target.id ? " cli-tab--on" : ""}`}
                onClick={() => setTarget(t)}
              >
                {t.id}
              </button>
            ))}
          </div>
          <div className="cli-card" style={{ borderRadius: "0 0 var(--radius) var(--radius)", marginBottom: "16px" }}>
            <div className="cli-card-hd">
              <span>{target.name}</span>
              <button className="cli-copy" onClick={() => copy("target", targetCmd)}>
                {copied === "target" ? "COPIED" : "COPY"}
              </button>
            </div>
            <pre className="cli-pre">{targetCmd}</pre>
          </div>

          <p style={{ fontSize: "0.8125rem", color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
            Settings are written inside a marker block and backed up automatically —{" "}
            <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>revert</code>{" "}
            (claude &amp; codex) removes only what was added.
          </p>
        </div>
      </section>
    </div>
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
