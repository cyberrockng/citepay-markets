"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell, StatCard, Badge } from "@/components/ui";
import { BackButton } from "@/components/back-button";

interface Headline {
  totalUSDC: number;
  paidCitations: number;
  refusals: number;
  skips: number;
  totalDecisions: number;
  payRate: string;
  avgPerCitation: number;
  uniqueCreators: number;
  uniqueAgents: number;
}

interface SourceRow {
  sourceTitle: string;
  sourceUrl: string;
  creatorWallet: string;
  earnedMicro: number;
  citations: number;
}

interface AgentRow {
  agentAddress: string;
  paidMicro: number;
  citations: number;
}

interface PaymentRow {
  sourceTitle: string;
  agentAddress: string;
  creatorWallet: string;
  amountMicro: number;
  txHash: string | null;
  createdAt: string;
}

interface RevenueData {
  headline: Headline;
  perSource: SourceRow[];
  perAgent: AgentRow[];
  recentPayments: PaymentRow[];
  sources: { neon: boolean; arc: boolean; sqlite: boolean };
  generatedAt: string;
}

function shortAddr(a: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}

function usd(micro: number) {
  return `$${(micro / 1e6).toFixed(4)}`;
}

export default function RevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function load() {
      fetch("/api/revenue")
        .then((r) => r.json())
        .then((d) => { setData(d); setLoading(false); })
        .catch(() => setLoading(false));
    }
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  const h = data?.headline;

  return (
    <PageShell maxWidth="max-w-5xl">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <BackButton />
          <h1 className="text-3xl font-bold mt-4 text-[#f0f0f5]">Revenue Dashboard</h1>
          <p className="text-[#8b8b9e] mt-1">
            USDC flowing from agents to creators · settled on Arc Testnet via Circle Gateway
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 mt-1">
          {data && (
            <div className="text-xs text-[#4a4a5e] font-mono">
              Updated {new Date(data.generatedAt).toLocaleTimeString()}
            </div>
          )}
          {data?.sources && (
            <div className="flex gap-1.5">
              {data.sources.arc    && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#34D399]/30 text-[#34D399] bg-[#34D399]/5">arc</span>}
              {data.sources.neon   && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#6366f1]/30 text-[#6366f1] bg-[#6366f1]/5">neon</span>}
              {data.sources.sqlite && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#1e1e2e] text-[#8b8b9e]">sqlite</span>}
            </div>
          )}
        </div>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total USDC Earned"
          value={h ? `$${h.totalUSDC.toFixed(4)}` : "—"}
          accent="text-[#34D399]"
          sub="across all sources"
        />
        <StatCard
          label="Paid Citations"
          value={h?.paidCitations ?? "—"}
          accent="text-[#34D399]"
          sub={`${h?.payRate ?? "—"}% pay rate`}
        />
        <StatCard
          label="Creators Earning"
          value={h?.uniqueCreators ?? "—"}
          accent="text-[#6366f1]"
          sub="unique payout wallets"
        />
        <StatCard
          label="Avg per Citation"
          value={h ? `$${h.avgPerCitation.toFixed(5)}` : "—"}
          accent="text-[#6366f1]"
          sub="USDC per PAY decision"
        />
      </div>

      {/* Decision breakdown bar */}
      {h && h.totalDecisions > 0 && (
        <div className="mb-8 rounded-xl border border-[#1e1e2e] bg-[#111118] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#f0f0f5]">Decision Breakdown</h2>
            <span className="text-xs text-[#4a4a5e] font-mono">{h.totalDecisions.toLocaleString()} total</span>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-3">
            <div
              className="bg-[#34D399] transition-all"
              style={{ width: `${(h.paidCitations / h.totalDecisions) * 100}%` }}
            />
            <div
              className="bg-red-500/60 transition-all"
              style={{ width: `${(h.refusals / h.totalDecisions) * 100}%` }}
            />
            <div
              className="bg-[#2a2a3e] transition-all"
              style={{ width: `${(h.skips / h.totalDecisions) * 100}%` }}
            />
          </div>
          <div className="flex gap-6 text-xs text-[#8b8b9e]">
            <span><span className="inline-block w-2 h-2 rounded-full bg-[#34D399] mr-1.5" />{h.paidCitations.toLocaleString()} PAY</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-red-500/60 mr-1.5" />{h.refusals.toLocaleString()} REFUSE</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-[#2a2a3e] mr-1.5" />{h.skips.toLocaleString()} SKIP</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Per-source earnings */}
        <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-5">
          <h2 className="text-sm font-semibold text-[#f0f0f5] mb-4">Earnings by Source</h2>
          {loading && <div className="text-[#4a4a5e] text-sm">Loading…</div>}
          {!loading && data?.perSource.length === 0 && (
            <div className="text-[#4a4a5e] text-sm">No payments yet — run a demo query to populate.</div>
          )}
          <div className="space-y-3">
            {data?.perSource.map((s, i) => {
              const maxEarned = data.perSource[0]?.earnedMicro ?? 1;
              const pct = Math.round((s.earnedMicro / maxEarned) * 100);
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[#f0f0f5] truncate max-w-[60%]">{s.sourceTitle}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#8b8b9e] font-mono">{s.citations}×</span>
                      <span className="text-xs text-[#34D399] font-mono font-semibold">{usd(s.earnedMicro)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#1e1e2e]">
                    <div className="h-1.5 rounded-full bg-[#34D399]/50 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[10px] text-[#4a4a5e] font-mono mt-0.5">{shortAddr(s.creatorWallet)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Per-agent spending */}
        <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-5">
          <h2 className="text-sm font-semibold text-[#f0f0f5] mb-4">Spending by Agent</h2>
          {loading && <div className="text-[#4a4a5e] text-sm">Loading…</div>}
          {!loading && data?.perAgent.length === 0 && (
            <div className="text-[#4a4a5e] text-sm">No agent payments yet.</div>
          )}
          <div className="space-y-3">
            {data?.perAgent.map((a, i) => {
              const maxPaid = data.perAgent[0]?.paidMicro ?? 1;
              const pct = Math.round((a.paidMicro / maxPaid) * 100);
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <Link
                      href={`/agent/${a.agentAddress}`}
                      className="text-xs text-[#6366f1] hover:text-indigo-300 font-mono"
                    >
                      {shortAddr(a.agentAddress)}
                    </Link>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#8b8b9e] font-mono">{a.citations}×</span>
                      <span className="text-xs text-[#6366f1] font-mono font-semibold">{usd(a.paidMicro)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#1e1e2e]">
                    <div className="h-1.5 rounded-full bg-[#6366f1]/50 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent payments feed */}
      <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#f0f0f5]">Recent Payments</h2>
          <Link href="/proof" className="text-xs text-[#6366f1] hover:text-indigo-300">
            All receipts →
          </Link>
        </div>

        {loading && <div className="text-[#4a4a5e] text-sm py-4">Loading…</div>}
        {!loading && data?.recentPayments.length === 0 && (
          <div className="text-[#4a4a5e] text-sm py-4 text-center">
            No payments yet.{" "}
            <Link href="/demo" className="text-[#6366f1] hover:text-indigo-300">Run a demo query</Link>
            {" "}to generate the first receipt.
          </div>
        )}

        <div className="divide-y divide-[#1e1e2e]">
          {data?.recentPayments.map((p, i) => (
            <div key={i} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-[#f0f0f5] truncate">{p.sourceTitle}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-[#4a4a5e] font-mono">agent {shortAddr(p.agentAddress)}</span>
                  <span className="text-[10px] text-[#4a4a5e]">→</span>
                  <span className="text-[10px] text-[#8b8b9e] font-mono">{shortAddr(p.creatorWallet)}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge type="PAY" label="PAY" />
                <span className="text-sm font-mono font-semibold text-[#34D399]">{usd(p.amountMicro)}</span>
                {p.txHash ? (
                  <a
                    href={`https://testnet.arcscan.app/tx/${p.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-[#6366f1] hover:text-indigo-300 font-mono"
                  >
                    arcscan →
                  </a>
                ) : (
                  <span className="text-[10px] text-[#4a4a5e] font-mono">simulated</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Data sources footer */}
      <div className="mt-6 text-center text-xs text-[#4a4a5e]">
        Sources: Arc Testnet (on-chain · permanent) · Neon Postgres (durable · cross-instance) · SQLite (live session)
        {" · "}auto-refreshes every 15s
      </div>
    </PageShell>
  );
}
