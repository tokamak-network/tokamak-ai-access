"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { useTonBalance, useStake, LAYER2_OPTIONS, DEFAULT_LAYER2 } from "@/lib/hooks/useStake";
import { usePurchase } from "@/lib/hooks/usePurchase";
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
  activePurchase: boolean;
  purchaseExpiresAt: number | null;
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
  contractTimedOut: boolean;
  setContractTimedOut: (v: boolean) => void;
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
  contractTimedOut,
  setContractTimedOut,
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
          {stakedBalance.isLoading
            ? contractTimedOut ? "—" : "…"
            : `${stakedBalance.formatted} TON`}
        </span>
      </div>

      {contractTimedOut && (
        <p style={{ fontSize: "0.8125rem", color: "#dc2626", margin: "0" }}>
          Balance unavailable — RPC timeout.{" "}
          <button
            onClick={() => { setContractTimedOut(false); stakedBalance.refetch(); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", textDecoration: "underline", padding: 0, font: "inherit" }}
          >
            Retry
          </button>
        </p>
      )}

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
  const [balanceTimedOut, setBalanceTimedOut] = useState(false);
  const [contractTimedOut, setContractTimedOut] = useState(false);
  const stakedBalance = useStakedBalance(address as `0x${string}` | undefined, unstakeLayer2);
  const pendingUnstaked = usePendingUnstaked(address as `0x${string}` | undefined, unstakeLayer2);
  const withdrawal = useRequestWithdrawal();
  const claim = useProcessRequest();

  const isLoading = status === "pending" || status === "confirming";
  const balanceReady = !tonBalance.isLoading && !tonBalance.isError;
  const walletTON = parseFloat(tonBalance.formatted);
  const inputAmount = parseFloat(amount) || 0;
  const hasEnough =
    balanceTimedOut ||
    (balanceReady && inputAmount > 0 && walletTON >= inputAmount);

  // Auto-notify parent on success
  useEffect(() => {
    if (status === "success") {
      const t = setTimeout(() => { onSuccess(); reset(); }, 3000);
      return () => clearTimeout(t);
    }
  }, [status, onSuccess, reset]);

  // RPC timeout for balance loading
  useEffect(() => {
    if (!tonBalance.isLoading) {
      setBalanceTimedOut(false);
      return;
    }
    const t = setTimeout(() => setBalanceTimedOut(true), 10_000);
    return () => clearTimeout(t);
  }, [tonBalance.isLoading]);

  // RPC timeout for staked balance loading
  useEffect(() => {
    if (!stakedBalance.isLoading) {
      setContractTimedOut(false);
      return;
    }
    const t = setTimeout(() => setContractTimedOut(true), 8_000);
    return () => clearTimeout(t);
  }, [stakedBalance.isLoading]);

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
          {tonBalance.isLoading
            ? balanceTimedOut ? "—" : "…"
            : `${tonBalance.formatted} TON`}
        </span>
      </div>

      {balanceTimedOut && (
        <p style={{ fontSize: "0.8125rem", color: "#dc2626", margin: "0" }}>
          Balance unavailable — RPC timeout.{" "}
          <button
            onClick={() => { setBalanceTimedOut(false); tonBalance.refetch(); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", textDecoration: "underline", padding: 0, font: "inherit" }}
          >
            Retry
          </button>
        </p>
      )}

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
           balanceTimedOut         ? `Stake ${amount || "—"} TON → (unverified)` :
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
          contractTimedOut={contractTimedOut}
          setContractTimedOut={setContractTimedOut}
        />
      )}
    </div>
  );
}

/* ── CLI Setup Panel ──────────────────────────────────────────────── */
const CLI = "npx @tokamak-network/ai-access-cli";

function CliCard({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div style={{
      border: "1px solid var(--hairline)",
      borderRadius: "var(--radius)",
      overflow: "hidden",
      marginBottom: "10px",
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 14px",
        background: "var(--surface-raised)",
        borderBottom: "1px solid var(--hairline)",
      }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--muted)" }}>
          {label}
        </span>
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
      <pre style={{
        fontFamily: "var(--font-mono)",
        fontSize: "0.8125rem",
        color: "var(--ink)",
        background: "var(--surface)",
        padding: "14px 16px",
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        lineHeight: 1.6,
      }}>
        {command}
      </pre>
    </div>
  );
}

function CliSetupPanel() {
  return (
    <div>
      <CliCard label="Configure — prompts for tool, key & model" command={`${CLI} configure`} />
      <CliCard label="Revert — restores your original settings" command={`${CLI} revert`} />
    </div>
  );
}

/* ── Dashboard ────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const router = useRouter();
  const { address, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const targetChainId = 11155111;
  const targetChainName = "Sepolia";
  const isWrongNetwork = !!address && chainId !== targetChainId;

  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [keyData, setKeyData] = useState<KeyData | null>(null);
  const [oneTimeKey, setOneTimeKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [stakingKeyPending, setStakingKeyPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [selectedCard, setSelectedCard] = useState<"stake" | "buy" | null>(null);
  const [priceData, setPriceData] = useState<{ tonRequired: number; usdPrice: number } | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const setupRef = useRef<HTMLDivElement>(null);
  const keyRevealRef = useRef<HTMLDivElement>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [balRes, keyRes] = await Promise.all([
        fetch("/api/staking/balance"),
        fetch("/api/keys/me"),
      ]);
      if (balRes.status === 401) { router.push("/"); return null; }
      if (!balRes.ok) throw new Error(`Balance error ${balRes.status}`);
      if (!keyRes.ok) throw new Error(`Key status error ${keyRes.status}`);
      const [balData, keyDataResult] = await Promise.all([balRes.json(), keyRes.json()]);
      setBalance(balData);
      setKeyData(keyDataResult);
      return { balance: balData as BalanceData, keyData: keyDataResult as KeyData };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      return null;
    } finally {
      setLoading(false);
    }
  }, [router]);

  const handleStakeSuccess = useCallback(async () => {
    const result = await fetchAll();
    if (result?.keyData?.hasActiveKey) return;
    setActionLoading(true);
    setStakingKeyPending(true);
    setError(null);
    let lastError = "";
    for (let i = 0; i < 4; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 1500));
      try {
        const res = await fetch("/api/keys/issue", { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          setOneTimeKey(data.key);
          setKeyData({ hasActiveKey: true, lastFour: data.key.slice(-4), expiresAt: data.expiresAt });
          setActionLoading(false);
          setStakingKeyPending(false);
          return;
        }
        lastError = await res.text();
      } catch (e) {
        lastError = e instanceof Error ? e.message : "Key issue failed";
      }
    }
    setError(lastError || "Key issue failed");
    setActionLoading(false);
    setStakingKeyPending(false);
  }, [fetchAll]);

  const purchase = usePurchase((key?: string) => {
    if (key) setOneTimeKey(key);
    fetchAll();
  });

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (oneTimeKey && keyRevealRef.current) {
      keyRevealRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [oneTimeKey]);

  useEffect(() => {
    if (selectedCard !== "buy") return;
    setPriceLoading(true);
    fetch("/api/price/ton")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPriceData(d))
      .catch(() => setPriceData(null))
      .finally(() => setPriceLoading(false));
  }, [selectedCard]);

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

  async function renewKey() {
    setActionLoading(true); setError(null);
    try {
      const res = await fetch("/api/keys/renew", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setKeyData(prev => prev ? { ...prev, expiresAt: data.expiresAt } : prev);
    } catch (e) { setError(e instanceof Error ? e.message : "Key renewal failed"); }
    finally { setActionLoading(false); }
  }

  function handleDisconnect() {
    setIsSigningOut(true);
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    disconnect();
    router.push("/");
  }

  return (
    <>
      {/* Top bar */}
      <header className="topbar">
        <div className="topbar-inner">
          <a href="/" className="topbar-logo" style={{ textDecoration: "none", color: "inherit" }}>TON AI Access</a>
          <div className="topbar-meta">
            {isWrongNetwork && (
              <>
                <span className="badge badge--no">Wrong Network</span>
                <button
                  onClick={() => switchChain({ chainId: targetChainId })}
                  disabled={isSwitchingChain}
                  style={{ background: "transparent", color: "var(--ink)", border: "1px solid var(--hairline)", cursor: isSwitchingChain ? "default" : "pointer", padding: "3px 10px", borderRadius: "4px", fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.08em", opacity: isSwitchingChain ? 0.5 : 1, transition: "border-color 140ms" }}
                >
                  {isSwitchingChain ? "Switching…" : `Switch to ${targetChainName}`}
                </button>
              </>
            )}
            {address && <span>{shortAddr(address)}</span>}
            <button
              onClick={handleDisconnect}
              disabled={isSigningOut}
              style={{ background: "none", border: "none", cursor: isSigningOut ? "default" : "pointer", color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.08em", opacity: isSigningOut ? 0.5 : 1 }}
            >
              {isSigningOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* ── Balance section ── */}
        <section className="section">
          <aside>
            <span className="eyebrow">
              {balance?.eligible
                ? "Staking status"
                : balance?.activePurchase
                  ? "Purchase status"
                  : "Staking status"}
            </span>
            {balance && (
              <>
                <span className="n-lbl">Total staked</span>
                <span className="n-val">{balance.totalStakedTON} TON</span>
                <span className="n-lbl">Minimum</span>
                <span className="n-val">{balance.minTon} TON</span>
                <span className="n-lbl">Status</span>
                <span className="n-val" style={{ marginBottom: "18px" }}>
                  <span className={`badge ${
                    balance.eligible
                      ? "badge--ok"
                      : balance.activePurchase
                        ? "badge--grey"
                        : "badge--no"
                  }`}>
                    {balance.eligible
                      ? "Eligible"
                      : balance.activePurchase
                        ? "Not staking"
                        : "Not eligible"}
                  </span>
                </span>

                <span className="n-lbl">Network</span>
                <span className="n-val" style={{ marginBottom: 0 }}>{targetChainName}</span>
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

            {!loading && balance && !balance.eligible && !balance.activePurchase && (
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
                <p className="body-lead" style={{ marginBottom: "24px" }}>
                  Get API access by staking ≥{balance.minTon} TON or buying a 30-day pass.
                </p>

                {/* Two selection cards */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                  {/* Stake card */}
                  <div
                    onClick={() => setSelectedCard("stake")}
                    style={{
                      border: `1px solid ${selectedCard === "stake" ? "var(--ink)" : "var(--hairline)"}`,
                      borderRadius: "var(--radius)",
                      padding: "16px",
                      background: "var(--surface)",
                      cursor: "pointer",
                    }}
                  >
                    <span className="eyebrow" style={{ display: "block", marginBottom: "8px" }}>Stake TON</span>
                    <p style={{ fontSize: "0.8125rem", color: "var(--body)", marginBottom: "12px", lineHeight: 1.5 }}>
                      30-day key, renews free while you stay staked.
                    </p>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.125rem" }}>Free</span>
                    <br />
                    <span style={{ fontSize: "0.6875rem", color: "var(--muted)" }}>while staked ≥{balance.minTon} TON</span>
                  </div>

                  {/* Buy card */}
                  <div
                    onClick={() => setSelectedCard("buy")}
                    style={{
                      border: `2px solid ${selectedCard === "buy" ? "#6366f1" : "#c7d2fe"}`,
                      borderRadius: "var(--radius)",
                      padding: "16px",
                      background: selectedCard === "buy" ? "#fafeff" : "var(--surface)",
                      cursor: "pointer",
                    }}
                  >
                    <span className="eyebrow" style={{ display: "block", marginBottom: "8px", color: "#6366f1" }}>Buy Access</span>
                    <p style={{ fontSize: "0.8125rem", color: "var(--body)", marginBottom: "12px", lineHeight: 1.5 }}>
                      No staking needed. Same models and rate limits.
                    </p>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.125rem" }}>≈$5 in TON</span>
                    <br />
                    <span style={{ fontSize: "0.6875rem", color: "var(--muted)" }}>30 days</span>
                  </div>
                </div>

                {/* Stake expanded panel */}
                {selectedCard === "stake" && (
                  <div className="card" style={{ marginBottom: "16px" }}>
                    <span className="card__label">Stake TON directly</span>
                    <StakePanel minTon={balance.minTon} onSuccess={handleStakeSuccess} />
                  </div>
                )}

                {/* Buy expanded panel */}
                {selectedCard === "buy" && (
                  <div className="card" style={{ marginBottom: "16px" }}>
                    <span className="card__label">Buy 30-day access</span>
                    <p style={{ fontSize: "0.8125rem", color: "var(--body)", marginBottom: "4px" }}>
                      {priceData
                        ? `Sends ${priceData.tonRequired} TON ERC-20 — burned on purchase. Access activates after on-chain confirmation (~15s).`
                        : "TON ERC-20 is burned on purchase. Access activates after on-chain confirmation (~15s)."}
                    </p>
                    {priceData && (
                      <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--muted)", marginBottom: "16px" }}>
                        ≈ ${priceData.usdPrice} · Rate updates every 60s
                      </p>
                    )}
                    {purchase.error && (
                      <p style={{ fontSize: "0.8125rem", color: "#dc2626", marginBottom: "12px" }}>{purchase.error}</p>
                    )}
                    {purchase.status === "success" ? (
                      <p style={{ fontSize: "0.9rem", color: "#16a34a" }}>✓ Payment verified — refreshing…</p>
                    ) : (
                      <button
                        className="btn-primary"
                        onClick={purchase.purchase}
                        disabled={priceLoading || !priceData || (purchase.status !== "idle" && purchase.status !== "error")}
                      >
                        {purchase.status === "signing" && "Confirm in wallet…"}
                        {purchase.status === "confirming" && "Confirming on-chain…"}
                        {purchase.status === "verifying" && "Verifying payment…"}
                        {(purchase.status === "idle" || purchase.status === "error") && (
                          priceLoading ? "Loading price…" : priceData ? `Pay ${priceData.tonRequired} TON →` : "Price unavailable"
                        )}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {!loading && balance && !balance.eligible && balance.activePurchase && (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)" }}>
                    Access via purchase
                  </span>
                  <span className="badge badge--ok">Eligible</span>
                </div>

                {/* Expiry banner — shown when < 7 days remaining */}
                {balance.purchaseExpiresAt && balance.purchaseExpiresAt - Date.now() < 7 * 24 * 60 * 60 * 1000 && (
                  <div style={{
                    background: "#fffbeb",
                    border: "1px solid #fcd34d",
                    borderRadius: "var(--radius)",
                    padding: "12px 16px",
                    marginBottom: "16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                  }}>
                    <span style={{ fontSize: "0.875rem", color: "#92400e" }}>
                      Access expires in {Math.ceil((balance.purchaseExpiresAt - Date.now()) / (24 * 60 * 60 * 1000))} day(s)
                    </span>
                    <button
                      className="btn-primary"
                      onClick={purchase.renew}
                      disabled={purchase.status !== "idle" && purchase.status !== "error"}
                      style={{ flexShrink: 0 }}
                    >
                      {purchase.status === "idle" || purchase.status === "error"
                        ? "Renew 30 days →"
                        : "Processing…"}
                    </button>
                  </div>
                )}
              </>
            )}

            {!loading && (balance?.eligible || balance?.activePurchase) && !oneTimeKey && (
              <>
                {/* Staking amount + badge — stakers only */}
                {balance?.eligible && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.25rem, 3.5vw, 3rem)", fontWeight: 700, letterSpacing: "-0.03em", color: "var(--ink)", lineHeight: 1 }}>
                      {balance?.totalStakedTON}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)" }}>
                      TON staked
                    </span>
                    <span className="badge badge--ok">Eligible</span>
                  </div>
                )}

                {/* Key card */}
                <div className="card" data-testid="active-key-card">
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
                            This key has no expiry date. Rotating issues a fresh 30-day key.
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
                            ⚠ Your key expires in {daysLeft} day{daysLeft === 1 ? "" : "s"}. Extend or get a new key below.
                          </div>
                        );
                        return null;
                      })()}
                      {(() => {
                        const isStakingKey = !keyData.expiresAt;
                        const renewableAfterMs = keyData.createdAt
                          ? new Date(keyData.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000
                          : Infinity;
                        const isRenewable = Date.now() >= renewableAfterMs;
                        const daysUntilRenewable = isRenewable
                          ? 0
                          : Math.ceil((renewableAfterMs - Date.now()) / (1000 * 60 * 60 * 24));
                        const isPurchaseUser = !!(balance?.activePurchase && !balance?.eligible);
                        return (
                          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            {isPurchaseUser && (
                              <div style={{
                                background: "#eff6ff",
                                border: "1px solid #bfdbfe",
                                borderRadius: "var(--radius)",
                                padding: "12px 16px",
                                fontSize: "0.8125rem",
                                color: "#1e40af",
                                lineHeight: 1.5,
                              }}>
                                Didn&apos;t copy your key? Click <strong>Get key →</strong> below to issue a new one — the current key will be revoked.
                              </div>
                            )}
                            <div>
                              <button
                                data-testid="renew-btn"
                                className="btn-secondary"
                                onClick={renewKey}
                                disabled={actionLoading || !isRenewable || isStakingKey}
                              >
                                {actionLoading ? "Working…" : "Extend key (+30d)"}
                              </button>
                              <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--muted)", marginTop: "6px" }}>
                                {isStakingKey
                                  ? "No expiry while staked · Rotate to get a fresh 30-day key"
                                  : isRenewable
                                  ? "Same key · no reconfiguration needed"
                                  : `Available in ${daysUntilRenewable} day${daysUntilRenewable === 1 ? "" : "s"}`}
                              </p>
                            </div>
                            <div>
                              <button
                                className={isPurchaseUser ? "btn-primary" : "btn-secondary"}
                                onClick={rotateKey}
                                disabled={actionLoading}
                              >
                                {actionLoading ? "Working…" : isPurchaseUser ? "Get key →" : "New key"}
                              </button>
                              <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--muted)", marginTop: "6px" }}>
                                {isPurchaseUser ? "Issues new key · revokes current · copy immediately" : "New key · revokes current · save immediately"}
                              </p>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <>
                      <p style={{ fontSize: "0.9375rem", color: "var(--muted)", lineHeight: 1.6, marginBottom: "24px" }}>
                        No key issued yet. Issue one to access qwen-3.6 and other models
                        via the OpenAI-compatible API.
                      </p>
                      {stakingKeyPending && (
                        <p style={{ fontSize: "0.8125rem", color: "var(--muted)", fontFamily: "var(--font-mono)", marginBottom: "12px" }}>
                          Confirming stake on-chain — this may take a few seconds…
                        </p>
                      )}
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
              <div ref={keyRevealRef} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
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
