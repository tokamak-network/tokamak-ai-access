"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useDisconnect } from "wagmi";
import { useTonBalance, useStake, LAYER2_OPTIONS, DEFAULT_LAYER2 } from "@/lib/hooks/useStake";
import {
  useStakedBalance,
  usePendingUnstaked,
  useRequestWithdrawal,
  useProcessRequest,
  type StakedBalanceResult,
  type PendingUnstakedResult,
  type UseRequestWithdrawalResult,
  type UseProcessRequestResult,
} from "@/lib/hooks/useUnstake";

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
  expiresAt?: string;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/* ── Unstake Tab Content ──────────────────────────────────────────── */
interface UnstakeTabContentProps {
  address: `0x${string}` | undefined;
  unstakeLayer2: `0x${string}`;
  setUnstakeLayer2: (v: `0x${string}`) => void;
  unstakeAmount: string;
  setUnstakeAmount: (v: string) => void;
  stakedBalance: StakedBalanceResult;
  pendingUnstaked: PendingUnstakedResult;
  withdrawal: UseRequestWithdrawalResult;
  claim: UseProcessRequestResult;
}

function UnstakeTabContent({
  unstakeLayer2,
  setUnstakeLayer2,
  unstakeAmount,
  setUnstakeAmount,
  stakedBalance,
  pendingUnstaked,
  withdrawal,
  claim,
}: UnstakeTabContentProps) {
  const inputStyle: React.CSSProperties = {
    width: "100%",
    fontFamily: "var(--font-mono)",
    fontSize: "1rem",
    color: "var(--ink)",
    background: "var(--surface)",
    border: "1px solid var(--hairline)",
    borderRadius: "calc(var(--radius) - 2px)",
    padding: "10px 14px",
    outline: "none",
    boxSizing: "border-box",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    fontSize: "0.8125rem",
    cursor: "pointer",
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "0.625rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "var(--muted)",
    display: "block",
    marginBottom: "8px",
  };

  const isWithdrawing = withdrawal.status === "pending" || withdrawal.status === "confirming";
  const isClaiming = claim.status === "pending" || claim.status === "confirming";
  const stakedTON = parseFloat(stakedBalance.formatted);
  const inputAmount = parseFloat(unstakeAmount) || 0;
  const canWithdraw = !isWithdrawing && inputAmount > 0 && stakedTON >= inputAmount && stakedTON > 0;

  async function handleRequestWithdrawal() {
    if (!unstakeAmount || !canWithdraw) return;
    try {
      await withdrawal.requestWithdrawal(unstakeAmount, unstakeLayer2);
      setUnstakeAmount("");
      stakedBalance.refetch();
      pendingUnstaked.refetch();
    } catch {
      // error surfaced via hook
    }
  }

  async function handleClaim() {
    try {
      await claim.processRequest(unstakeLayer2);
      pendingUnstaked.refetch();
      stakedBalance.refetch();
    } catch {
      // error surfaced via hook
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Staked balance */}
      <div>
        <span style={labelStyle}>Staked TON (this operator)</span>
        <span style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 700, color: "var(--ink)" }}>
          {stakedBalance.isLoading ? "…" : `${stakedBalance.formatted} TON`}
        </span>
      </div>

      {/* Operator selector */}
      <div>
        <label style={labelStyle}>Operator (Layer2)</label>
        <select
          value={unstakeLayer2}
          onChange={(e) => {
            setUnstakeLayer2(e.target.value as `0x${string}`);
            setUnstakeAmount("");
            withdrawal.reset();
            claim.reset();
          }}
          disabled={isWithdrawing || isClaiming}
          style={selectStyle}
        >
          {LAYER2_OPTIONS.map((op) => (
            <option key={op.address} value={op.address}>{op.label}</option>
          ))}
        </select>
      </div>

      {/* Amount input */}
      <div>
        <label style={labelStyle}>Amount to unstake (TON)</label>
        <input
          type="number"
          min="0"
          step="1"
          placeholder="0"
          value={unstakeAmount}
          onChange={(e) => setUnstakeAmount(e.target.value)}
          disabled={isWithdrawing || stakedTON === 0}
          style={inputStyle}
        />
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <button
            onClick={() => setUnstakeAmount(stakedBalance.formatted.replace(/\.0+$/, ""))}
            disabled={isWithdrawing || stakedTON === 0}
            style={{
              fontFamily: "var(--font-mono)", fontSize: "0.6875rem",
              color: "var(--muted)", background: "transparent",
              border: "1px solid var(--hairline)",
              borderRadius: "calc(var(--radius) - 4px)",
              padding: "4px 10px", cursor: "pointer",
            }}
          >
            MAX
          </button>
        </div>
      </div>

      {/* Validation messages */}
      {unstakeAmount && stakedTON === 0 && (
        <p style={{ fontSize: "0.8125rem", color: "#dc2626" }}>
          No staked TON on this operator.
        </p>
      )}
      {unstakeAmount && stakedTON > 0 && inputAmount > stakedTON && (
        <p style={{ fontSize: "0.8125rem", color: "#dc2626" }}>
          Amount exceeds staked balance ({stakedBalance.formatted} TON).
        </p>
      )}

      {/* Request Withdrawal button */}
      {withdrawal.status !== "success" ? (
        <button
          className="btn-primary"
          onClick={handleRequestWithdrawal}
          disabled={!canWithdraw}
          style={{ alignSelf: "flex-start" }}
        >
          {isWithdrawing
            ? (withdrawal.status === "pending" ? "Confirm in wallet…" : "Confirming tx…")
            : `Request Withdrawal${unstakeAmount ? ` ${unstakeAmount} TON` : ""} →`}
        </button>
      ) : (
        <div style={{
          display: "flex", alignItems: "center", gap: "10px",
          background: "#fffbeb", border: "1px solid #fcd34d",
          borderRadius: "var(--radius)", padding: "14px 18px",
        }}>
          <span style={{ color: "#92400e", fontSize: "0.9rem" }}>
            ✓ Withdrawal requested — cooldown in progress.
          </span>
        </div>
      )}

      {withdrawal.txHash && withdrawal.status !== "success" && (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--muted)" }}>
          Tx:{" "}
          <a href={`https://etherscan.io/tx/${withdrawal.txHash}`} target="_blank" rel="noopener noreferrer"
            style={{ color: "var(--accent)", textDecoration: "underline" }}>
            {withdrawal.txHash.slice(0, 10)}…{withdrawal.txHash.slice(-8)}
          </a>
        </p>
      )}

      {withdrawal.error && (
        <p style={{ fontSize: "0.8125rem", color: "#dc2626" }}>{withdrawal.error}</p>
      )}

      {/* Pending Withdrawal section */}
      {pendingUnstaked.hasPending && (
        <div style={{
          borderTop: "1px solid var(--hairline)",
          paddingTop: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}>
          <span style={labelStyle}>Pending Withdrawal</span>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", fontWeight: 700, color: "var(--ink)" }}>
              {pendingUnstaked.formatted} TON
            </span>
            {claim.status !== "success" ? (
              <button
                className="btn-primary"
                onClick={handleClaim}
                disabled={isClaiming}
                style={{ background: "#16a34a", borderColor: "#16a34a" }}
              >
                {isClaiming
                  ? (claim.status === "pending" ? "Confirm in wallet…" : "Confirming tx…")
                  : "Claim →"}
              </button>
            ) : (
              <span style={{ color: "#16a34a", fontSize: "0.875rem" }}>✓ Claimed</span>
            )}
          </div>

          {claim.error && (
            <p style={{ fontSize: "0.8125rem", color: "#dc2626" }}>{claim.error}</p>
          )}

          {claim.txHash && claim.status !== "success" && (
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--muted)" }}>
              Tx:{" "}
              <a href={`https://etherscan.io/tx/${claim.txHash}`} target="_blank" rel="noopener noreferrer"
                style={{ color: "var(--accent)", textDecoration: "underline" }}>
                {claim.txHash.slice(0, 10)}…{claim.txHash.slice(-8)}
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── In-App Stake Panel ───────────────────────────────────────────── */
function StakePanel({
  minTon,
  onSuccess,
}: {
  minTon: number;
  onSuccess: () => void;
}) {
  const { address } = useAccount();
  const tonBalance = useTonBalance(address as `0x${string}` | undefined);
  const { stake, status, txHash, error, reset } = useStake();

  const [amount, setAmount] = useState("");
  const [layer2, setLayer2] = useState<`0x${string}`>(DEFAULT_LAYER2);

  // Unstake tab state
  const [activeTab, setActiveTab] = useState<"stake" | "unstake">("stake");
  const [unstakeLayer2, setUnstakeLayer2] = useState<`0x${string}`>(DEFAULT_LAYER2);
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const stakedBalance = useStakedBalance(address as `0x${string}` | undefined, unstakeLayer2);
  const pendingUnstaked = usePendingUnstaked(address as `0x${string}` | undefined, unstakeLayer2);
  const withdrawal = useRequestWithdrawal();
  const claim = useProcessRequest();

  const isLoading = status === "pending" || status === "confirming";
  const balanceReady = !tonBalance.isLoading && !tonBalance.isError;
  const walletTON = parseFloat(tonBalance.formatted);
  const inputAmount = parseFloat(amount) || 0;
  const hasEnough = balanceReady && inputAmount > 0 && walletTON >= inputAmount;

  // Auto-notify parent on success
  useEffect(() => {
    if (status === "success") {
      const t = setTimeout(() => { onSuccess(); reset(); }, 3000);
      return () => clearTimeout(t);
    }
  }, [status, onSuccess, reset]);

  async function handleStake() {
    if (!amount || !hasEnough) return;
    try {
      await stake(amount, layer2);
    } catch {
      // error surfaced via hook
    }
  }

  const presets = [
    { label: `${minTon}`, value: String(minTon) },
    { label: `${minTon * 2}`, value: String(minTon * 2) },
    { label: `${minTon * 5}`, value: String(minTon * 5) },
  ];

  const inputStyle: React.CSSProperties = {
    width: "100%",
    fontFamily: "var(--font-mono)",
    fontSize: "1rem",
    color: "var(--ink)",
    background: "var(--surface)",
    border: "1px solid var(--hairline)",
    borderRadius: "calc(var(--radius) - 2px)",
    padding: "10px 14px",
    outline: "none",
    boxSizing: "border-box",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    fontSize: "0.8125rem",
    cursor: "pointer",
  };

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
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      {/* Tab header */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--hairline)", marginBottom: "20px" }}>
        <button style={tabStyle(activeTab === "stake")} onClick={() => setActiveTab("stake")}>Stake</button>
        <button style={tabStyle(activeTab === "unstake")} onClick={() => setActiveTab("unstake")}>Unstake</button>
      </div>

      {activeTab === "stake" && (
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Wallet TON balance */}
      <div>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: "0.625rem",
          letterSpacing: "0.12em", textTransform: "uppercase" as const,
          color: "var(--muted)", display: "block", marginBottom: "6px",
        }}>
          Wallet TON balance
        </span>
        <span style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 700, color: "var(--ink)" }}>
          {tonBalance.isLoading ? "…" : `${tonBalance.formatted} TON`}
        </span>
      </div>

      {/* Amount input */}
      <div>
        <label style={{
          fontFamily: "var(--font-mono)", fontSize: "0.625rem",
          letterSpacing: "0.12em", textTransform: "uppercase" as const,
          color: "var(--muted)", display: "block", marginBottom: "8px",
        }}>
          Amount to stake (TON)
        </label>
        <input
          type="number"
          min="0"
          step="1"
          placeholder={`min ${minTon}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={isLoading}
          style={inputStyle}
        />
        {/* Quick presets */}
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => setAmount(p.value)}
              disabled={isLoading}
              style={{
                fontFamily: "var(--font-mono)", fontSize: "0.6875rem",
                color: amount === p.value ? "var(--surface)" : "var(--accent)",
                background: amount === p.value ? "var(--accent)" : "transparent",
                border: "1px solid var(--accent)",
                borderRadius: "calc(var(--radius) - 4px)",
                padding: "4px 10px", cursor: "pointer", transition: "all 120ms",
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setAmount(tonBalance.formatted.replace(/\.0+$/, ""))}
            disabled={isLoading || walletTON === 0}
            style={{
              fontFamily: "var(--font-mono)", fontSize: "0.6875rem",
              color: "var(--muted)", background: "transparent",
              border: "1px solid var(--hairline)",
              borderRadius: "calc(var(--radius) - 4px)",
              padding: "4px 10px", cursor: "pointer",
            }}
          >
            MAX
          </button>
        </div>
      </div>

      {/* Layer2 selector */}
      <div>
        <label style={{
          fontFamily: "var(--font-mono)", fontSize: "0.625rem",
          letterSpacing: "0.12em", textTransform: "uppercase" as const,
          color: "var(--muted)", display: "block", marginBottom: "8px",
        }}>
          Operator (Layer2)
        </label>
        <select
          value={layer2}
          onChange={(e) => setLayer2(e.target.value as `0x${string}`)}
          disabled={isLoading}
          style={selectStyle}
        >
          {LAYER2_OPTIONS.map((op) => (
            <option key={op.address} value={op.address}>{op.label}</option>
          ))}
        </select>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--muted)", marginTop: "6px" }}>
          Any operator counts toward eligibility. tokamak1 is the default.
        </p>
      </div>

      {/* Validation hint */}
      {tonBalance.isError && (
        <p style={{ fontSize: "0.8125rem", color: "#dc2626" }}>
          Could not read wallet balance — check your network connection and refresh.
        </p>
      )}
      {amount && balanceReady && !hasEnough && (
        <p style={{ fontSize: "0.8125rem", color: "#dc2626" }}>
          {inputAmount <= 0
            ? "Enter an amount greater than 0."
            : `Insufficient balance — you have ${tonBalance.formatted} TON.`}
        </p>
      )}

      {/* Action button */}
      {status !== "success" ? (
        <button
          className="btn-primary"
          onClick={handleStake}
          disabled={isLoading || !hasEnough}
          style={{ alignSelf: "flex-start" }}
        >
          {status === "pending"    ? "Confirm in wallet…" :
           status === "confirming" ? "Confirming tx…" :
                                     `Stake ${amount || "—"} TON →`}
        </button>
      ) : (
        <div style={{
          display: "flex", alignItems: "center", gap: "10px",
          background: "#f0fdf4", border: "1px solid #86efac",
          borderRadius: "var(--radius)", padding: "14px 18px",
        }}>
          <span style={{ color: "#16a34a", fontSize: "0.9rem" }}>✓ Staked successfully — refreshing balance…</span>
        </div>
      )}

      {/* TX hash */}
      {txHash && (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--muted)" }}>
          Tx:{" "}
          <a
            href={`https://etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent)", textDecoration: "underline" }}
          >
            {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </a>
        </p>
      )}

      {/* Error */}
      {error && (
        <p style={{ fontSize: "0.8125rem", color: "#dc2626" }}>{error}</p>
      )}
      </div>
      )}

      {activeTab === "unstake" && (
        <UnstakeTabContent
          address={address as `0x${string}` | undefined}
          unstakeLayer2={unstakeLayer2}
          setUnstakeLayer2={setUnstakeLayer2}
          unstakeAmount={unstakeAmount}
          setUnstakeAmount={setUnstakeAmount}
          stakedBalance={stakedBalance}
          pendingUnstaked={pendingUnstaked}
          withdrawal={withdrawal}
          claim={claim}
        />
      )}
    </div>
  );
}

/* ── CLI Setup Panel ──────────────────────────────────────────────── */
function CliSetupPanel() {
  const [copied, setCopied] = useState(false);

  const command = `npm install -g @tokamak-network/ai-access-cli\ntokamak-ai-access configure\n\n# List available models first:\n#   tokamak-ai-access configure --list-models --api-key sk-...\n\n# After setup: restart your shell and relaunch your AI tool.`;

  async function handleCopy() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius)", overflow: "hidden" }}>
      {/* Body */}
      <div style={{ padding: "20px 24px", background: "var(--surface-raised)" }}>
        <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: "16px", lineHeight: 1.6 }}>
          Install the CLI globally, then run configure. Requires Node.js ≥ 18.
        </p>

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
          overflowX: "auto",
          lineHeight: 1.75,
          marginBottom: "16px",
          maxHeight: "320px",
          overflowY: "auto",
        }}>
          {command}
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
  const setupRef = useRef<HTMLDivElement>(null);

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
      setKeyData({ hasActiveKey: true, lastFour: data.key.slice(-4), expiresAt: data.expiresAt });
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
      setKeyData({ hasActiveKey: true, lastFour: data.key.slice(-4), expiresAt: data.expiresAt });
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
                {/* Current staked amount + gap */}
                <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.25rem, 3.5vw, 3rem)", fontWeight: 700, letterSpacing: "-0.03em", color: "var(--ink)", lineHeight: 1 }}>
                    {balance.totalStakedTON}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)" }}>
                    TON staked
                  </span>
                  <span className="badge badge--no">Not eligible</span>
                </div>
                <p className="body-lead" style={{ marginBottom: "32px" }}>
                  You need at least <strong style={{ color: "var(--ink)" }}>{balance.minTon} TON</strong> staked
                  across any Tokamak Layer2 to receive an API key.
                  You&apos;re <strong style={{ color: "var(--ink)" }}>
                    {Math.max(0, balance.minTon - parseFloat(balance.totalStakedTON)).toFixed(1)} TON
                  </strong> short.
                </p>

                {/* In-app staking panel */}
                <div className="card">
                  <span className="card__label">Stake TON directly</span>
                  <StakePanel
                    minTon={balance.minTon}
                    onSuccess={fetchAll}
                  />
                </div>


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

                {/* Key card */}
                <div className="card">
                  <span className="card__label">Your API key</span>
                  {keyData?.hasActiveKey ? (
                    <>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "12px" }}>
                        <div>
                          <p style={{ fontFamily: "var(--font-display)", fontSize: "1.0625rem", fontWeight: 600, color: "var(--ink)", marginBottom: "4px" }}>Active key</p>
                          <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--muted)" }}>
                            Ends in …{keyData.lastFour}{keyData.createdAt ? ` · Issued ${new Date(keyData.createdAt).toLocaleDateString()}` : ""}{keyData.expiresAt ? ` · Expires ${new Date(keyData.expiresAt).toLocaleDateString()}` : ""}
                          </p>
                        </div>
                        <span className="badge badge--ok">Active</span>
                      </div>
                      {(() => {
                        if (!keyData.expiresAt) return (
                          <div style={{
                            background: "#f8fafc",
                            border: "1px solid var(--hairline)",
                            borderRadius: "var(--radius)",
                            padding: "14px 18px",
                            marginBottom: "16px",
                            fontSize: "0.875rem",
                            color: "var(--muted)",
                          }}>
                            This key has no expiry. Rotate to enable 30-day TTL.
                          </div>
                        );
                        const msLeft = new Date(keyData.expiresAt).getTime() - Date.now();
                        const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
                        if (daysLeft <= 0) return (
                          <div style={{
                            background: "#fef2f2",
                            border: "1px solid #fca5a5",
                            borderRadius: "var(--radius)",
                            padding: "14px 18px",
                            marginBottom: "16px",
                            fontSize: "0.875rem",
                            color: "#dc2626",
                          }}>
                            ✕ Your key has expired. Rotate to restore access.
                          </div>
                        );
                        if (daysLeft <= 7) return (
                          <div style={{
                            background: "#fffbeb",
                            border: "1px solid #fde68a",
                            borderRadius: "var(--radius)",
                            padding: "14px 18px",
                            marginBottom: "16px",
                            fontSize: "0.875rem",
                            color: "#78350f",
                          }}>
                            ⚠ Your key expires in {daysLeft} day{daysLeft === 1 ? "" : "s"}. Rotate to renew.
                          </div>
                        );
                        return null;
                      })()}
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
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(oneTimeKey);
                      setKeyCopied(true);
                      setTimeout(() => setKeyCopied(false), 2000);
                      setTimeout(() => setupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
                    }}
                    className="btn-primary"
                    style={{ marginBottom: "8px" }}
                  >
                    {keyCopied ? "Copied ✓ — scroll to setup ↓" : "Copy API key →"}
                  </button>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--muted)", lineHeight: 1.8 }}>
                    Endpoint: api2.ai.tokamak.network
                  </p>
                </div>

              </div>
            )}

            {/* ── CLI Setup — always visible when key is active ── */}
            {!loading && keyData?.hasActiveKey && (
              <div ref={setupRef} style={{ marginTop: "40px" }}>
                <span className="eyebrow">Configure AI tools</span>
                <p style={{ fontSize: "0.9375rem", color: "var(--muted)", lineHeight: 1.6, marginBottom: "20px", maxWidth: "60ch" }}>
                  Paste the instruction below into Claude Code, Codex, Hermes, OpenClaw, or any AI agent. The script will guide you through the rest.
                </p>
                <CliSetupPanel />
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
