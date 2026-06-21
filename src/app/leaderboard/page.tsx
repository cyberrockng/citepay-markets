"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell, Skeleton } from "@/components/ui";
import { BackButton } from "@/components/back-button";

interface LeaderboardEntry {
  agentAddress: string;
  totalDecisions: number;
  paidCount: number;
  refusedCount: number;
  skipCount: number;
  policyBlockedCount: number;
  totalPaid: number;
  topPolicy: string | null;
  lastDecisionAt: string | null;
}

const DEMO_AGENT = "0x5389688243328c26a92b301faEEAb5fbf9AFf105";

const MEDAL_STYLES = [
  { row: "bg-gradient-to-r from-yellow-400/8 to-transparent border-l-[3px] border-l-yellow-400/60", label: "gold" },
  { row: "bg-gradient-to-r from-slate-400/6 to-transparent border-l-[3px] border-l-slate-400/40",  label: "silver" },
  { row: "bg-gradient-to-r from-amber-600/6 to-transparent border-l-[3px] border-l-amber-600/40", label: "bronze" },
];

const POLICY_COLORS: Record<string, string> = {
  Conservative: "text-blue-400 border-blue-400/30 bg-blue-400/5",
  Balanced:     "text-[#6366f1] border-[#6366f1]/30 bg-[#6366f1]/5",
  Aggressive:   "text-orange-400 border-orange-400/30 bg-orange-400/5",
};

function agentLabel(e: LeaderboardEntry): { text: string; color: string } | null {
  const payRatio = e.totalDecisions > 0 ? e.paidCount / e.totalDecisions : 0;
  const blockRatio = e.totalDecisions > 0 ? e.policyBlockedCount / e.totalDecisions : 0;
  if (e.totalPaid > 0 && payRatio >= 0.6 && e.paidCount >= 3)
    return { text: "Citation Leader", color: "text-[#00ff88] border-[#00ff88]/30 bg-[#00ff88]/5" };
  if (blockRatio > 0.3 && e.totalDecisions >= 4)
    return { text: "Policy Enforcer", color: "text-orange-400 border-orange-400/30 bg-orange-900/10" };
  if (e.totalDecisions >= 15)
    return { text: "High-Volume", color: "text-[#6366f1] border-[#6366f1]/30 bg-[#6366f1]/5" };
  if (payRatio < 0.15 && e.totalDecisions >= 5)
    return { text: "Conservative", color: "text-blue-400 border-blue-400/30 bg-blue-400/5" };
  return null;
}

function isRecentlyActive(lastDecisionAt: string | null): boolean {
  if (!lastDecisionAt) return false;
  return Date.now() - new Date(lastDecisionAt).getTime() < 24 * 60 * 60 * 1000;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => { setEntries(d.entries || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <PageShell maxWidth="max-w-5xl">
      <div className="mb-8">
        <BackButton label="Home" />
        <h1 className="text-3xl font-bold mt-4 text-[#f0f0f5]">Agent Leaderboard</h1>
        <p className="text-[#8b8b9e] mt-1">
          Agents ranked by total USDC routed to creators. Each row is a unique agent wallet.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-[#111118] rounded-xl border border-[#1e1e2e] px-6 py-4 flex items-center gap-4">
              <Skeleton className="h-4 w-6" />
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-3 w-20 ml-auto" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20 bg-[#111118] rounded-xl border border-[#1e1e2e]">
          <div className="text-5xl mb-4">🏆</div>
          <div className="font-semibold text-[#f0f0f5] mb-1">No agents yet</div>
          <div className="text-sm text-[#8b8b9e]">Run a query to become the first agent on the leaderboard.</div>
          <Link href="/ask" className="inline-block mt-4 text-[#6366f1] hover:text-indigo-300 text-sm transition-colors">
            Ask a question →
          </Link>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block bg-[#111118] rounded-xl border border-[#1e1e2e] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1e1e2e]">
                    <th className="px-4 py-3 text-left text-xs text-[#8b8b9e] font-medium w-10">#</th>
                    <th className="px-4 py-3 text-left text-xs text-[#8b8b9e] font-medium">Agent</th>
                    <th className="px-4 py-3 text-right text-xs text-[#8b8b9e] font-medium">USDC Paid</th>
                    <th className="px-4 py-3 text-right text-xs text-[#8b8b9e] font-medium">Citations</th>
                    <th className="px-4 py-3 text-right text-xs text-[#8b8b9e] font-medium">Refused</th>
                    <th className="px-4 py-3 text-right text-xs text-[#8b8b9e] font-medium">Blocked</th>
                    <th className="px-4 py-3 text-center text-xs text-[#8b8b9e] font-medium">Policy</th>
                    <th className="px-4 py-3 text-right text-xs text-[#8b8b9e] font-medium">Pay%</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => {
                    const payPct = e.totalDecisions > 0 ? Math.round((e.paidCount / e.totalDecisions) * 100) : 0;
                    const medalStyle = MEDAL_STYLES[i];
                    const label = agentLabel(e);
                    const active = isRecentlyActive(e.lastDecisionAt);
                    const isDemo = e.agentAddress.toLowerCase() === DEMO_AGENT.toLowerCase();
                    const policyStyle = e.topPolicy ? (POLICY_COLORS[e.topPolicy] ?? "text-[#8b8b9e] border-[#8b8b9e]/30") : "";
                    return (
                      <tr
                        key={e.agentAddress}
                        className={`border-b border-[#1e1e2e] last:border-0 transition-colors ${
                          medalStyle ? medalStyle.row + " hover:opacity-90" : "hover:bg-[#0a0a0f]/40"
                        }`}
                      >
                        <td className="px-4 py-3 text-center font-mono">
                          <span className={i < 3 ? "text-base" : "text-[#4a4a5e] text-xs"}>{i < 3 ? ["🥇","🥈","🥉"][i] : i + 1}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            {active && <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] pulse-dot shrink-0" title="Active in last 24h" />}
                            <Link href={`/agent/${e.agentAddress}`} className="font-mono text-xs text-[#6366f1] hover:text-indigo-300 transition-colors">
                              {isDemo ? "CitePay Demo Agent" : shortAddr(e.agentAddress)}
                            </Link>
                            {label && (
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${label.color}`}>{label.text}</span>
                            )}
                          </div>
                          <div className="text-[#4a4a5e] text-[10px] mt-0.5 font-mono">{e.totalDecisions} decisions</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[#00ff88] font-semibold">
                          ${(e.totalPaid / 1_000_000).toFixed(4)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-[#00ff88]">{e.paidCount}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-red-400">{e.refusedCount}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-orange-400">{e.policyBlockedCount}</td>
                        <td className="px-4 py-3 text-center">
                          {e.topPolicy ? (
                            <span className={`text-xs font-mono px-2 py-0.5 rounded border ${policyStyle}`}>{e.topPolicy}</span>
                          ) : <span className="text-[#4a4a5e] text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-mono text-xs ${payPct >= 50 ? "text-[#00ff88]" : "text-[#8b8b9e]"}`}>{payPct}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {entries.map((e, i) => {
              const payPct = e.totalDecisions > 0 ? Math.round((e.paidCount / e.totalDecisions) * 100) : 0;
              const label = agentLabel(e);
              const active = isRecentlyActive(e.lastDecisionAt);
              const isDemo = e.agentAddress.toLowerCase() === DEMO_AGENT.toLowerCase();
              const medalStyle = MEDAL_STYLES[i];
              return (
                <div key={e.agentAddress} className={`rounded-xl border border-[#1e1e2e] p-4 bg-[#111118] ${medalStyle ? medalStyle.row : ""}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{i < 3 ? ["🥇","🥈","🥉"][i] : <span className="text-[#4a4a5e] font-mono text-sm">{i+1}</span>}</span>
                      {active && <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] pulse-dot" />}
                    </div>
                    <span className="text-[#00ff88] font-mono font-bold">${(e.totalPaid / 1_000_000).toFixed(4)}</span>
                  </div>
                  <Link href={`/agent/${e.agentAddress}`} className="font-mono text-xs text-[#6366f1] hover:text-indigo-300 block mb-1">
                    {isDemo ? "CitePay Demo Agent" : e.agentAddress.slice(0, 10) + "…" + e.agentAddress.slice(-6)}
                  </Link>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {label && <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${label.color}`}>{label.text}</span>}
                    {e.topPolicy && <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${POLICY_COLORS[e.topPolicy] ?? ""}`}>{e.topPolicy}</span>}
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { label: "Paid", value: e.paidCount, color: "text-[#00ff88]" },
                      { label: "Refused", value: e.refusedCount, color: "text-red-400" },
                      { label: "Blocked", value: e.policyBlockedCount, color: "text-orange-400" },
                      { label: "Pay%", value: `${payPct}%`, color: payPct >= 50 ? "text-[#00ff88]" : "text-[#8b8b9e]" },
                    ].map(({ label: l, value, color }) => (
                      <div key={l}>
                        <div className={`font-mono text-sm font-semibold ${color}`}>{value}</div>
                        <div className="text-[#4a4a5e] text-[10px]">{l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-8 text-center text-[#4a4a5e] text-xs">
        Rankings update in real time. Run{" "}
        <Link href="/ask"  className="text-[#6366f1] hover:text-indigo-300 transition-colors">/ask</Link>
        {" "}or{" "}
        <Link href="/demo" className="text-[#6366f1] hover:text-indigo-300 transition-colors">/demo</Link>
        {" "}to place your agent on the board.
      </div>
    </PageShell>
  );
}
