"use client";

/**
 * Dashboard page — T3.3
 *
 * Auth guard: if no session cookie, /api/staking/balance returns 401
 * and we redirect back to the landing page.
 *
 * States:
 *   loading         → skeleton
 *   ineligible      → staked amount + stake link
 *   eligible/no-key → "Issue API Key" button
 *   eligible/issued → 1-time key reveal + copy + CLI setup panel
 *   eligible/active → last-four + rotate button
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useDisconnect } from "wagmi";

/* ── Types ─────────────────────────────────────────────────────────── */

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

/* ── Helpers ────────────────────────────────────────────────────────── */

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/* ── CLI Setup Panel ─────────────────────────────────────────────────
 * Two tabs: "에이전트 실행" / "직접 실행"
 */
function CliSetupPanel({ apiKey }: { apiKey: string }) {
  const [tab, setTab] = useState<"agent" | "direct">("agent");
  const [copied, setCopied] = useState(false);

  const agentInstruction = `내 TON AI Access 설정을 도와줘. 아래 명령을 실행해서 Claude Code와 Codex에서 이 API 키를 쓸 수 있도록 환경 변수를 설정해줘.

TON_API_KEY="${apiKey}" \\
TON_MODEL="qwen-3.6" \\
bash <(curl -fsSL https://tokamak-ai-access-theo-3096s-projects.vercel.app/configure-cli.sh) \\
  --non-interactive

설정이 끝나면 source ~/.zshrc (또는 ~/.bashrc)를 실행해서 현재 세션에도 적용해줘.`;

  const directCommand = `TON_API_KEY="${apiKey}" \\
TON_MODEL="qwen-3.6" \\
bash <(curl -fsSL https://tokamak-ai-access-theo-3096s-projects.vercel.app/configure-cli.sh) \\
  --non-interactive`;

  const content = tab === "agent" ? agentInstruction : directCommand;

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="border border-gray-700 rounded-xl overflow-hidden">
      <div className="flex border-b border-gray-700">
        {(["agent", "direct"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors
              ${tab === t
                ? "bg-gray-800 text-white"
                : "bg-gray-900 text-gray-500 hover:text-gray-300"
              }`}
          >
            {t === "agent" ? "에이전트 실행" : "직접 실행 (터미널)"}
          </button>
        ))}
      </div>
      <div className="bg-gray-900 p-5 space-y-3">
        {tab === "agent" ? (
          <>
            <p className="text-xs text-gray-400">
              아래 지시문을 복사해서 Claude, Codex 등 AI 에이전트에 붙여넣으세요.
              에이전트가 <code className="text-gray-200">configure-cli.sh</code>를 직접 실행합니다.
            </p>
            <pre className="bg-gray-950 rounded-lg p-4 text-xs text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
              {agentInstruction}
            </pre>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-400">
              터미널에서 직접 실행합니다. Claude Code와 Codex 환경 변수가 자동으로 설정됩니다.
            </p>
            <pre className="bg-gray-950 rounded-lg p-4 text-xs text-gray-200 whitespace-pre leading-relaxed overflow-x-auto">
              {directCommand}
            </pre>
          </>
        )}
        <button
          onClick={handleCopy}
          className="text-xs font-semibold text-brand hover:underline"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────────────── */

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
      if (balRes.status === 401) {
        router.push("/");
        return;
      }
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
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/keys/issue", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setOneTimeKey(data.key);
      setKeyData({ hasActiveKey: true, lastFour: data.key.slice(-4) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Key issue failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function rotateKey() {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/keys/rotate", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setOneTimeKey(data.key);
      setKeyData({ hasActiveKey: true, lastFour: data.key.slice(-4) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Key rotation failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function copyKey() {
    if (!oneTimeKey) return;
    await navigator.clipboard.writeText(oneTimeKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  }

  function handleDisconnect() {
    disconnect();
    router.push("/");
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 sm:p-10">
      <div className="max-w-xl mx-auto space-y-6">

        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-mono text-brand uppercase tracking-widest">Tokamak Network</p>
            <h1 className="text-lg font-bold">TON AI Access</h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            {address && <span className="font-mono text-xs">{shortAddr(address)}</span>}
            <button onClick={handleDisconnect} className="hover:text-white transition-colors">Sign out</button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="border border-gray-800 rounded-xl p-8 text-center text-gray-500 text-sm">Loading…</div>
        )}

        {/* Error */}
        {error && (
          <div className="border border-red-800 bg-red-950 rounded-xl p-4 text-red-300 text-sm flex justify-between items-start gap-4">
            <span>{error}</span>
            <button onClick={fetchAll} className="text-xs underline shrink-0">Retry</button>
          </div>
        )}

        {/* Balance card */}
        {!loading && balance && (
          <div className="border border-gray-800 rounded-xl p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-mono text-gray-500 uppercase tracking-widest mb-1">Total Staked</p>
                <p className="text-2xl font-bold">{balance.totalStakedTON} TON</p>
              </div>
              {balance.eligible
                ? <span className="px-2.5 py-1 rounded-full bg-green-900 text-green-300 text-xs font-semibold">✓ Eligible</span>
                : <span className="px-2.5 py-1 rounded-full bg-red-900 text-red-300 text-xs font-semibold">✗ Not eligible</span>
              }
            </div>
            <button onClick={fetchAll} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Refresh ↻</button>
          </div>
        )}

        {/* Ineligible */}
        {!loading && balance && !balance.eligible && (
          <div className="border border-gray-800 rounded-xl p-6 space-y-3">
            <p className="text-sm text-gray-400">
              You need at least <strong className="text-white">{balance.minTon} TON</strong> staked.
              Currently: <strong className="text-white">{balance.totalStakedTON} TON</strong>
            </p>
            <a href="https://tokamak.network/staking" target="_blank" rel="noopener noreferrer"
               className="inline-block text-sm text-brand hover:underline">
              → Stake at tokamak.network/staking
            </a>
          </div>
        )}

        {/* Key section (eligible, no one-time key showing) */}
        {!loading && balance?.eligible && !oneTimeKey && (
          <div className="border border-gray-800 rounded-xl p-6 space-y-4">
            {keyData?.hasActiveKey
              ? <p className="text-sm text-gray-400">Active key: …{keyData.lastFour}{keyData.createdAt && ` · issued ${new Date(keyData.createdAt).toLocaleDateString()}`}</p>
              : <p className="text-sm text-gray-400">No active key yet.</p>
            }
            {keyData?.hasActiveKey
              ? <button onClick={rotateKey} disabled={actionLoading}
                  className="w-full py-2.5 px-4 rounded-lg border border-gray-700 hover:border-gray-500 text-sm font-semibold transition-colors disabled:opacity-50">
                  {actionLoading ? "Rotating…" : "Rotate API Key"}
                </button>
              : <button onClick={issueKey} disabled={actionLoading}
                  className="w-full py-2.5 px-4 rounded-lg bg-brand hover:bg-brand/90 text-sm font-semibold transition-colors disabled:opacity-50">
                  {actionLoading ? "Issuing…" : "Issue API Key"}
                </button>
            }
          </div>
        )}

        {/* One-time key reveal + CLI setup */}
        {oneTimeKey && (
          <div className="space-y-4">
            <div className="border border-yellow-700 bg-yellow-950 rounded-xl p-6 space-y-4">
              <p className="text-yellow-300 font-semibold text-sm">⚠ Save this key now — it won&apos;t be shown again.</p>
              <div className="flex items-center gap-3 bg-gray-900 rounded-lg px-4 py-3">
                <code className="flex-1 text-xs break-all text-gray-200">{oneTimeKey}</code>
                <button onClick={copyKey} className="text-xs font-semibold text-brand hover:underline shrink-0">
                  {keyCopied ? "Copied!" : "Copy"}
                </button>
              </div>
              <div className="text-xs text-gray-400 space-y-1">
                <p>Endpoint: <code className="text-gray-200">https://api2.ai.tokamak.network</code></p>
                <p>Model: <code className="text-gray-200">qwen-3.6</code></p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-mono text-gray-500 uppercase tracking-widest">CLI Setup</p>
              <CliSetupPanel apiKey={oneTimeKey} />
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
