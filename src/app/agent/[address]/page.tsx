"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import type { Receipt } from "@/types";
import { PageShell, StatCard, decisionStyle } from "@/components/ui";
import { BackButton } from "@/components/back-button";

interface AgentData {
  agentAddress: string;
  totalDecisions: number;
  paidCount: number;
  refusedCount: number;
  skipCount: number;
  policyBlockedCount: number;
  totalPaid: number;
  receipts: Receipt[];
}

export default function AgentPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const [data, setData] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/agent/${address}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [address]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-[#8b8b9e] flex items-center justify-center animate-pulse">
        Loading agent data…
      </div>
    );
  }

  const reputation = data ? data.paidCount - data.refusedCount : 0;
  const payRatio = data && data.totalDecisions > 0
    ? Math.round((data.paidCount / data.totalDecisions) * 100)
    : 0;
  const refuseRatio = data && data.totalDecisions > 0
    ? Math.round((data.refusedCount / data.totalDecisions) * 100)
    : 0;
  const skipRatio = data && data.totalDecisions > 0
    ? Math.round((data.skipCount / data.totalDecisions) * 100)
    : 0;
  const policyBlockedCount = data?.policyBlockedCount ?? 0;

  return (
    <PageShell maxWidth="max-w-4xl">
      <div className="mb-8">
        <BackButton label="Home" />
        <h1 className="text-2xl font-bold mt-4 text-[#f0f0f5]">Agent Dashboard</h1>
        <div className="font-mono text-[#6366f1] text-sm mt-1 break-all">{address}</div>
      </div>

      {/* Agent Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Decisions" value={data?.totalDecisions ?? 0} accent="text-[#6366f1]" />
        <StatCard
          label="Total USDC Paid"
          value={`$${((data?.totalPaid ?? 0) / 1_000_000).toFixed(4)}`}
          accent="text-[#00ff88]"
        />
        <StatCard label="Policy Blocks" value={policyBlockedCount} accent="text-orange-400" sub="blocked by policy" />
        <StatCard
          label="Reputation"
          value={`${reputation >= 0 ? "+" : ""}${reputation}`}
          accent={reputation >= 0 ? "text-[#00ff88]" : "text-red-400"}
        />
      </div>

      {/* Decision Breakdown */}
      <div className="bg-[#111118] rounded-xl p-6 border border-[#1e1e2e] mb-6">
        <h2 className="font-semibold mb-5 text-[#f0f0f5]">Decision Breakdown</h2>
        <div className="grid grid-cols-4 gap-4 text-center mb-5">
          <div>
            <div className="text-2xl font-bold text-[#00ff88]">{data?.paidCount ?? 0}</div>
            <div className="text-[#8b8b9e] text-xs mt-1">Paid</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-400">{data?.refusedCount ?? 0}</div>
            <div className="text-[#8b8b9e] text-xs mt-1">Refused</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-[#8b8b9e]">{data?.skipCount ?? 0}</div>
            <div className="text-[#8b8b9e] text-xs mt-1">Skipped</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-orange-400">{policyBlockedCount}</div>
            <div className="text-[#8b8b9e] text-xs mt-1">Blocked by Policy</div>
          </div>
        </div>
        {data && data.totalDecisions > 0 && (
          <>
            <div className="flex rounded-full overflow-hidden h-2 mb-2">
              <div className="bg-[#00ff88]" style={{ width: `${payRatio}%` }} />
              <div className="bg-red-500" style={{ width: `${refuseRatio}%` }} />
              <div className="bg-[#4a4a5e]" style={{ width: `${skipRatio}%` }} />
            </div>
            <div className="flex justify-between text-xs text-[#8b8b9e]">
              <span>Pay {payRatio}%</span>
              <span>Refuse {refuseRatio}%</span>
              <span>Skip {skipRatio}%</span>
            </div>
          </>
        )}
      </div>

      {/* Agent Identity */}
      <div className="bg-[#111118] rounded-xl p-6 border border-[#1e1e2e] mb-6">
        <h2 className="font-semibold mb-4 text-[#f0f0f5]">Agent Identity</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          {[
            { label: "Network", value: "Arc Testnet (5042002) · Circle Gateway" },
            { label: "Agent Type", value: "CitePay Buyer Agent v1" },
            { label: "Reputation Score", value: `${reputation >= 0 ? "+" : ""}${reputation} (paid − refused)` },
            { label: "Agent Bond", value: "0.001 ETH deposited" },
            { label: "Citations Paid", value: String(data?.paidCount ?? 0) },
            { label: "Citations Refused", value: String(data?.refusedCount ?? 0) },
            { label: "Policy Blocks", value: `${policyBlockedCount} (policy-enforced, no reputation impact)` },
            { label: "Total USDC Routed", value: `$${((data?.totalPaid ?? 0) / 1_000_000).toFixed(4)}` },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-[#8b8b9e] text-xs mb-0.5">{label}</div>
              <div className="text-[#f0f0f5]">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Decisions */}
      {(data?.receipts.length ?? 0) > 0 ? (
        <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#1e1e2e]">
            <h2 className="font-semibold text-[#f0f0f5]">Recent Decisions ({data!.receipts.length})</h2>
          </div>
          {data!.receipts.slice(0, 20).map((r) => (
            <div key={r.id} className="px-6 py-4 border-b border-[#1e1e2e] last:border-0 flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[#f0f0f5] truncate">{r.query}</div>
                <div className="text-xs text-[#8b8b9e] mt-0.5">
                  {r.sourceTitle} · {new Date(r.createdAt).toLocaleString()}
                </div>
                <div className="text-xs text-[#4a4a5e] mt-0.5 truncate">{r.reason}</div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`px-2 py-0.5 rounded border font-mono text-xs ${decisionStyle(r.decision)}`}>
                  {r.decision}
                </span>
                {r.decision === "PAY" && (
                  <span className="text-[#00ff88] font-mono text-xs">${(r.amountPaid / 1_000_000).toFixed(4)}</span>
                )}
                <Link href={`/receipt/${r.id}`} className="text-[#6366f1] text-xs hover:text-indigo-300 transition-colors">
                  Receipt →
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[#8b8b9e] text-center py-16 bg-[#111118] rounded-xl border border-[#1e1e2e]">
          No decisions recorded for this agent yet.
        </div>
      )}
    </PageShell>
  );
}
