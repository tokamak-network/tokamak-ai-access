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

  const agentInstruction = `내 TON AI Access 설정을 도와줘. 아래 명령을 실행해서 Claude Code와 Codex에서 이 API 키를 쓸 수 있도록 환경 변수를 설정해줘.

TON_API_KEY="${apiKey}" \\
TON_MODEL="qwen-3.6" \\
bash <(curl -fsSL https://tokamak-ai-access.vercel.app/configure-cli.sh) \\
  --non-interactive

설정이 끝나면 source ~/.zshrc (또는 ~/.bashrc)를 실행해서 현재 세션에도 적용해줘.`;

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
        <button style={tabStyle(tab === "agent")} onClick={() => setTab("agent")}>에이전트 실행</button>
        <button style={tabStyle(tab === "direct")} onClick={() => setTab("direct")}>직접 실행</button>
      </div>
      {/* Body */}
      <div style={{ padding: "20px 24px", background: "var(--surface-raised)" }}>
        {tab === "agent" ? (
          <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: "16px", lineHeight: 1.6 }}>
            아래 지시문을 복사해서 Claude, Codex 등 AI 에이전트에 붙여넣으세요.
          </p>
        ) : (
          <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: "16px", lineHeight: 1.6 }}>
            터미널에 직접 붙여넣어 실행합니다.
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
                <span className="n-lbl">Eligibility</span>
                <span className="n-val" style={{ color: balance.eligible ? "#16a34a" : "#dc2626" }}>
                  {balance.eligible ? "Eligible ✓" : "Not eligible ✗"}
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
                <h2 className="section-heading">스테이킹이 부족합니다.</h2>
                <p className="body-lead">
                  API 키를 받으려면 최소 <strong style={{ color: "var(--ink)" }}>{balance.minTon} TON</strong>이 스테이킹되어 있어야 합니다.
                  현재 스테이킹: <strong style={{ color: "var(--ink)" }}>{balance.totalStakedTON} TON</strong>
                </p>
                <a
                  href="https://tokamak.network/staking"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                >
                  Stake at tokamak.network →
                </a>
              </>
            )}

            {!loading && balance?.eligible && !oneTimeKey && (
              <>
                <h2 className="section-heading">
                  {keyData?.hasActiveKey ? "API 키가 있습니다." : "API 키를 발급받으세요."}
                </h2>
                <p className="body-lead">
                  {keyData?.hasActiveKey
                    ? `활성 키: …${keyData.lastFour}${keyData.createdAt ? ` · ${new Date(keyData.createdAt).toLocaleDateString()}` : ""}`
                    : "스테이킹이 확인됐습니다. 아래 버튼으로 LiteLLM API 키를 발급받으세요."}
                </p>
                {keyData?.hasActiveKey ? (
                  <button className="btn-secondary" onClick={rotateKey} disabled={actionLoading}>
                    {actionLoading ? "Rotating…" : "Rotate API Key"}
                  </button>
                ) : (
                  <button className="btn-primary" onClick={issueKey} disabled={actionLoading}>
                    {actionLoading ? "Issuing…" : "Issue API Key →"}
                  </button>
                )}
              </>
            )}

            {/* One-time key reveal */}
            {oneTimeKey && (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                <div>
                  <h2 className="section-heading">키가 발급됐습니다.</h2>
                  <p className="body-lead" style={{ marginBottom: "20px" }}>
                    이 키는 지금 한 번만 표시됩니다. 반드시 저장하세요.
                  </p>
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
                  <span className="eyebrow" style={{ marginBottom: "16px" }}>CLI Setup</span>
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
