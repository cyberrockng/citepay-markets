"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/ui";
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
}

const MEDAL = ["🥇", "🥈", "🥉"];

const POLICY_COLORS: Record<string, string> = {
  Conservative: "text-blue-400 border-blue-400/30 bg-blue-400/5",
  Balanced:     "text-[#6366f1] border-[#6366f1]/30 bg-[#6366f1]/5",
  Aggressive:   "text-orange-400 border-orange-400/30 bg-orange-400/5",
};

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
        <div className="text-[#8b8b9e] text-center py-20 animate-pulse">Loading leaderboard…</div>
      ) : entries.length === 0 ? (
        <div className="text-[#8b8b9e] text-center py-20 bg-[#111118] rounded-xl border border-[#1e1e2e]">
          <div className="text-4xl mb-3">🏆</div>
          <div className="font-semibold text-[#f0f0f5] mb-1">No agents yet</div>
          <div className="text-sm">Run a query to become the first agent on the leaderboard.</div>
          <Link href="/ask" className="inline-block mt-4 text-[#6366f1] hover:text-indigo-300 text-sm transition-colors">
            Ask a question →
          </Link>
        </div>
      ) : (
        <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e2e]">
                  <th className="px-4 py-3 text-left text-xs text-[#8b8b9e] font-medium w-8">#</th>
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
                  const payPct = e.totalDecisions > 0
                    ? Math.round((e.paidCount / e.totalDecisions) * 100)
                    : 0;
                  const policyStyle = e.topPolicy ? (POLICY_COLORS[e.topPolicy] ?? "text-[#8b8b9e] border-[#8b8b9e]/30") : "";
                  return (
                    <tr key={e.agentAddress} className="border-b border-[#1e1e2e] last:border-0 hover:bg-[#0a0a0f]/40 transition-colors">
                      <td className="px-4 py-3 text-center">
                        <span className={i < 3 ? "text-base" : "text-[#8b8b9e] font-mono text-xs"}>
                          {i < 3 ? MEDAL[i] : i + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/agent/${e.agentAddress}`}
                          className="font-mono text-xs text-[#6366f1] hover:text-indigo-300 transition-colors"
                        >
                          {e.agentAddress.slice(0, 8)}…{e.agentAddress.slice(-6)}
                        </Link>
                        <div className="text-[#4a4a5e] text-xs mt-0.5 font-mono">{e.totalDecisions} decisions</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#00ff88] font-semibold">
                        ${(e.totalPaid / 1_000_000).toFixed(4)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-[#00ff88]">{e.paidCount}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-red-400">{e.refusedCount}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-orange-400">{e.policyBlockedCount}</td>
                      <td className="px-4 py-3 text-center">
                        {e.topPolicy ? (
                          <span className={`text-xs font-mono px-2 py-0.5 rounded border ${policyStyle}`}>
                            {e.topPolicy}
                          </span>
                        ) : (
                          <span className="text-[#4a4a5e] text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-mono text-xs ${payPct >= 50 ? "text-[#00ff88]" : "text-[#8b8b9e]"}`}>
                          {payPct}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-8 text-center text-[#4a4a5e] text-xs">
        Rankings update in real time. Run{" "}
        <Link href="/ask" className="text-[#6366f1] hover:text-indigo-300 transition-colors">
          /ask
        </Link>{" "}
        or{" "}
        <Link href="/demo" className="text-[#6366f1] hover:text-indigo-300 transition-colors">
          /demo
        </Link>{" "}
        to place your agent on the board.
      </div>
    </PageShell>
  );
}
