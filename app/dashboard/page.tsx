"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useDisconnect } from "wagmi";

interface BalanceData {
  address: string;
  totalStakedTON: string;
  eligible: boolean;
  minTon: number;
}
interface KeyData {
  hasActiveKey: boolean;
  createdAt?: string;
  lastFour?: string;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/* ── CLI Setup Panel ──────────────────────────────────────────────── */
function CliSetupPanel({ apiKey }: { apiKey: string }) {
  const [tab, setTab] = useState<"agent" | "direct">("agent");
  const [copied, setCopied] = useState(false);

  const agentInstruction = `Help me set up TON AI Access. Run the command below to configure my environment variables so I can use this API key with Claude Code and Codex.

TON_API_KEY="${apiKey}" \\
TON_MODEL="qwen-3.6" \\
bash <(curl -fsSL https://tokamak-ai-access.vercel.app/configure-cli.sh) \\
  --non-interactive

Once it's done, run source ~/.zshrc (or ~/.bashrc) to apply the changes to the current session.`;

  const directCommand = `TON_API_KEY="${apiKey}" \\
TON_MODEL="qwen-3.6" \\
bash <(curl -fsSL https://tokamak-ai-access.vercel.app/configure-cli.sh) \\
  --non-interactive`;

  const content = tab === "agent" ? agentInstruction : directCommand;

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "10px 0",
    fontFamily: "var(--font-mono)",
    fontSize: "0.625rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    background: active ? "var(--ink)" : "transparent",
    color: active ? "var(--surface-raised)" : "var(--muted)",
    border: "none",
    borderBottom: `1px solid ${active ? "var(--ink)" : "var(--hairline)"}`,
    cursor: "pointer",
    transition: "all 120ms",
  });

  return (
    <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius)", overflow: "hidden" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--hairline)" }}>
        <button style={tabStyle(tab === "agent")} onClick={() => setTab("agent")}>Agent Setup</button>
        <button style={tabStyle(tab === "direct")} onClick={() => setTab("direct")}>Direct</button>
      </div>
      {/* Body */}
      <div style={{ padding: "20px 24px", background: "var(--surface-raised)" }}>
        {tab === "agent" ? (
          <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: "16px", lineHeight: 1.6 }}>
            Copy and paste this into Claude Code, Codex, or any AI agent. The agent will find and run the script automatically.
          </p>
        ) : (
          <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: "16px", lineHeight: 1.6 }}>
            Paste this directly into your terminal to configure your environment without an agent.
          </p>
        )}
        <pre style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.8125rem",
          color: "var(--ink)",
          background: "var(--surface)",
          border: "1px solid var(--hairline)",
          borderRadius: "calc(var(--radius) - 2px)",
          padding: "16px 18px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          lineHeight: 1.75,
          marginBottom: "16px",
        }}>
          {content}
        </pre>
        <button
          onClick={handleCopy}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.625rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--accent)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/* ── Dashboard ────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { disconnect } = useDisconnect();

  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [keyData, setKeyData] = useState<KeyData | null>(null);
  const [oneTimeKey, setOneTimeKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [balRes, keyRes] = await Promise.all([
        fetch("/api/staking/balance"),
        fetch("/api/keys/me"),
      ]);
      if (balRes.status === 401) { router.push("/"); return; }
      if (!balRes.ok) throw new Error(`Balance error ${balRes.status}`);
      if (!keyRes.ok) throw new Error(`Key status error ${keyRes.status}`);
      setBalance(await balRes.json());
      setKeyData(await keyRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function issueKey() {
    setActionLoading(true); setError(null);
    try {
      const res = await fetch("/api/keys/issue", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setOneTimeKey(data.key);
      setKeyData({ hasActiveKey: true, lastFour: data.key.slice(-4) });
    } catch (e) { setError(e instanceof Error ? e.message : "Key issue failed"); }
    finally { setActionLoading(false); }
  }

  async function rotateKey() {
    setActionLoading(true); setError(null);
    try {
      const res = await fetch("/api/keys/rotate", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setOneTimeKey(data.key);
      setKeyData({ hasActiveKey: true, lastFour: data.key.slice(-4) });
    } catch (e) { setError(e instanceof Error ? e.message : "Key rotation failed"); }
    finally { setActionLoading(false); }
  }

  function handleDisconnect() { disconnect(); router.push("/"); }

  return (
    <>
      {/* Top bar */}
      <header className="topbar">
        <div className="topbar-inner">
          <span className="topbar-logo">TON AI Access</span>
          <div className="topbar-meta">
            {address && <span>{shortAddr(address)}</span>}
            <button
              onClick={handleDisconnect}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.08em" }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* ── Balance section ── */}
        <section className="section">
          <aside>
            <span className="eyebrow">Staking status</span>
            {balance && (
              <>
                <span className="n-lbl">Total staked</span>
                <span className="n-val">{balance.totalStakedTON} TON</span>
                <span className="n-lbl">Minimum</span>
                <span className="n-val">{balance.minTon} TON</span>
                <span className="n-lbl">Status</span>
                <span className="n-val" style={{ marginBottom: "18px" }}>
                  <span className={`badge ${balance.eligible ? "badge--ok" : "badge--no"}`}>
                    {balance.eligible ? "Eligible" : "Not eligible"}
                  </span>
                </span>
                <span className="n-lbl">Network</span>
                <span className="n-val" style={{ marginBottom: 0 }}>Ethereum Mainnet</span>
              </>
            )}
            {loading && <span className="n-val" style={{ color: "var(--muted)" }}>Loading…</span>}
          </aside>

          <div>
            {error && (
              <div style={{
                border: "1px solid #fca5a5",
                background: "#fef2f2",
                borderRadius: "var(--radius)",
                padding: "16px 20px",
                marginBottom: "24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "16px",
              }}>
                <span style={{ fontSize: "0.9rem", color: "#dc2626" }}>{error}</span>
                <button onClick={fetchAll} style={{ fontSize: "0.8rem", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", flexShrink: 0 }}>Retry</button>
              </div>
            )}

            {!loading && balance && !balance.eligible && (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.25rem, 3.5vw, 3rem)", fontWeight: 700, letterSpacing: "-0.03em", color: "var(--ink)", lineHeight: 1 }}>
                    {balance.totalStakedTON}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)" }}>
                    TON staked
                  </span>
                  <span className="badge badge--no">Not eligible</span>
                </div>
                <p className="body-lead">
                  You need at least <strong style={{ color: "var(--ink)" }}>{balance.minTon} TON</strong> staked
                  across any Layer2 on Tokamak Network to receive an API key.
                  You&apos;re <strong style={{ color: "var(--ink)" }}>{(balance.minTon - parseFloat(balance.totalStakedTON)).toFixed(1)} TON</strong> short.
                </p>
                <a
                  href="https://tokamak.network/staking"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Stake on Tokamak (opens in new tab)"
                  className="btn-primary"
                >
                  Stake on Tokamak →
                </a>
              </>
            )}

            {!loading && balance?.eligible && !oneTimeKey && (
              <>
                {/* Staking amount + badge */}
                <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.25rem, 3.5vw, 3rem)", fontWeight: 700, letterSpacing: "-0.03em", color: "var(--ink)", lineHeight: 1 }}>
                    {balance?.totalStakedTON}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)" }}>
                    TON staked
                  </span>
                  <span className="badge badge--ok">Eligible</span>
                </div>
                <p style={{ fontSize: "0.9375rem", color: "var(--muted)", marginBottom: "32px", lineHeight: 1.6 }}>
                  Staked across Tokamak Layer2s via SeigManager.
                </p>

                {/* Key card */}
                <div className="card">
                  <span className="card__label">Your API key</span>
                  {keyData?.hasActiveKey ? (
                    <>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "12px" }}>
                        <div>
                          <p style={{ fontFamily: "var(--font-display)", fontSize: "1.0625rem", fontWeight: 600, color: "var(--ink)", marginBottom: "4px" }}>Active key</p>
                          <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--muted)" }}>
                            Ends in …{keyData.lastFour}{keyData.createdAt ? ` · Issued ${new Date(keyData.createdAt).toLocaleDateString()}` : ""}
                          </p>
                        </div>
                        <span className="badge badge--ok">Active</span>
                      </div>
                      <p style={{ fontSize: "0.9375rem", color: "var(--muted)", lineHeight: 1.6, marginBottom: "24px" }}>
                        Lost your key? Rotate to revoke the current one and get a new one.
                        The new key is shown once — save it immediately.
                      </p>
                      <button className="btn-secondary" onClick={rotateKey} disabled={actionLoading}>
                        {actionLoading ? "Rotating…" : "Rotate key"}
                      </button>
                    </>
                  ) : (
                    <>
                      <p style={{ fontSize: "0.9375rem", color: "var(--muted)", lineHeight: 1.6, marginBottom: "24px" }}>
                        No key issued yet. Issue one to access qwen-3.6 and other models
                        via the OpenAI-compatible API.
                      </p>
                      <button className="btn-primary" onClick={issueKey} disabled={actionLoading}>
                        {actionLoading ? "Issuing…" : "Issue API key →"}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}

            {/* One-time key reveal */}
            {oneTimeKey && (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                <div>
                  <h2 className="section-heading">Save this key — it won&apos;t be shown again.</h2>
                  <p className="body-lead" style={{ marginBottom: "20px" }}>
                    Once you navigate away, your key can&apos;t be recovered.
                    Use <strong style={{ color: "var(--ink)" }}>Rotate key</strong> later to get a new one —
                    the old key will be revoked immediately.
                  </p>
                  {/* Warning banner */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "var(--radius)", padding: "14px 18px", marginBottom: "20px" }}>
                    <span aria-hidden="true" style={{ fontSize: "0.9rem", flexShrink: 0, marginTop: "1px" }}>⚠</span>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: "0.875rem", color: "#78350f", lineHeight: 1.5 }}>
                      Copy and store this key now. It cannot be retrieved after you leave this page.
                      To replace it later, use <strong>Rotate key</strong> from your dashboard.
                    </span>
                  </div>
                  <div style={{
                    background: "var(--surface-raised)",
                    border: "1px solid #fde68a",
                    borderRadius: "var(--radius)",
                    padding: "20px 24px",
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    marginBottom: "8px",
                  }}>
                    <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--ink)", flex: 1, wordBreak: "break-all" }}>
                      {oneTimeKey}
                    </code>
                    <button
                      onClick={async () => { await navigator.clipboard.writeText(oneTimeKey); setKeyCopied(true); setTimeout(() => setKeyCopied(false), 2000); }}
                      style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}
                    >
                      {keyCopied ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--muted)", lineHeight: 1.8 }}>
                    Endpoint: api2.ai.tokamak.network · Model: qwen-3.6
                  </p>
                </div>

                {/* CLI setup */}
                <div>
                  <span className="eyebrow">Configure AI tools</span>
                  <p style={{ fontSize: "0.9375rem", color: "var(--muted)", lineHeight: 1.6, marginBottom: "20px", maxWidth: "60ch" }}>
                    Paste the instruction below into Claude Code, Codex, or any AI agent
                    to configure your environment automatically.
                  </p>
                  <CliSetupPanel apiKey={oneTimeKey} />
                </div>
              </div>
            )}

            {loading && (
              <p style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>Loading…</p>
            )}

            {!loading && (
              <button
                onClick={fetchAll}
                style={{ marginTop: "32px", fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)", background: "none", border: "none", cursor: "pointer", display: "block" }}
              >
                Refresh ↻
              </button>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
