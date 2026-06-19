"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import type { Receipt } from "@/types";

const DECISION_COLOR: Record<string, string> = {
  PAY: "text-green-400 bg-green-900/30 border-green-800",
  REFUSE: "text-red-400 bg-red-900/30 border-red-800",
  SKIP: "text-gray-400 bg-gray-800/30 border-gray-700",
};

interface AgentData {
  agentAddress: string;
  totalDecisions: number;
  paidCount: number;
  refusedCount: number;
  skipCount: number;
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

  if (loading) return <div className="min-h-screen bg-gray-950 text-gray-400 flex items-center justify-center">Loading agent data...</div>;

  const reputation = data ? data.paidCount - data.refusedCount : 0;
  const payRatio = data && data.totalDecisions > 0
    ? Math.round((data.paidCount / data.totalDecisions) * 100)
    : 0;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm">← Home</Link>
          <h1 className="text-2xl font-bold mt-4">Agent Dashboard</h1>
          <div className="font-mono text-indigo-400 text-sm mt-1 break-all">{address}</div>
        </div>

        {/* Agent Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Decisions", value: data?.totalDecisions ?? 0, color: "text-indigo-400" },
            { label: "Total USDC Paid", value: `$${((data?.totalPaid ?? 0) / 1_000_000).toFixed(4)}`, color: "text-green-400" },
            { label: "Pay Ratio", value: `${payRatio}%`, color: "text-indigo-400" },
            { label: "Agent Reputation", value: `${reputation >= 0 ? "+" : ""}${reputation}`, color: reputation >= 0 ? "text-green-400" : "text-red-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-900 rounded-xl p-4 border border-gray-800 text-center">
              <div className={`text-xl font-bold ${color}`}>{value}</div>
              <div className="text-gray-500 text-xs mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Decision Breakdown */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
          <h2 className="font-semibold mb-4">Decision Breakdown</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-400">{data?.paidCount ?? 0}</div>
              <div className="text-gray-500 text-xs mt-1">PAY</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-400">{data?.refusedCount ?? 0}</div>
              <div className="text-gray-500 text-xs mt-1">REFUSE</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-400">{data?.skipCount ?? 0}</div>
              <div className="text-gray-500 text-xs mt-1">SKIP</div>
            </div>
          </div>
          {data && data.totalDecisions > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <div className="flex rounded-full overflow-hidden h-2">
                <div className="bg-green-500" style={{ width: `${(data.paidCount / data.totalDecisions) * 100}%` }} />
                <div className="bg-red-500" style={{ width: `${(data.refusedCount / data.totalDecisions) * 100}%` }} />
                <div className="bg-gray-600" style={{ width: `${(data.skipCount / data.totalDecisions) * 100}%` }} />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Pay {payRatio}%</span>
                <span>Refuse {data.totalDecisions > 0 ? Math.round((data.refusedCount / data.totalDecisions) * 100) : 0}%</span>
                <span>Skip {data.totalDecisions > 0 ? Math.round((data.skipCount / data.totalDecisions) * 100) : 0}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Bond & Reputation */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
          <h2 className="font-semibold mb-4">Bond & Reputation</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-500 text-xs mb-1">Agent Bond</div>
              <div className="text-gray-300">Not yet deposited on-chain</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs mb-1">Reputation Score</div>
              <div className={`font-bold ${reputation >= 0 ? "text-green-400" : "text-red-400"}`}>
                {reputation >= 0 ? "+" : ""}{reputation} (paid − refused)
              </div>
            </div>
            <div>
              <div className="text-gray-500 text-xs mb-1">Network</div>
              <div className="text-gray-300">Base Sepolia (testnet)</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs mb-1">Agent Type</div>
              <div className="text-gray-300">CitePay Buyer Agent v1</div>
            </div>
          </div>
        </div>

        {/* Recent Decisions */}
        {(data?.receipts.length ?? 0) > 0 ? (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 font-semibold">
              Recent Decisions ({data!.receipts.length})
            </div>
            {data!.receipts.slice(0, 20).map((r) => (
              <div key={r.id} className="px-6 py-4 border-b border-gray-800 last:border-0 flex justify-between items-start">
                <div className="flex-1 min-w-0 mr-4">
                  <div className="text-sm text-gray-300 truncate">{r.query}</div>
                  <div className="text-xs text-gray-500 mt-1">{r.sourceTitle} · {new Date(r.createdAt).toLocaleString()}</div>
                  <div className="text-xs text-gray-600 mt-0.5">{r.reason}</div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded text-xs font-mono border ${DECISION_COLOR[r.decision]}`}>
                    {r.decision}
                  </span>
                  {r.decision === "PAY" && (
                    <span className="text-green-400 font-mono text-xs">${(r.amountPaid / 1_000_000).toFixed(4)}</span>
                  )}
                  <Link href={`/receipt/${r.id}`} className="text-indigo-400 text-xs hover:underline">
                    Receipt →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-500 text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
            No decisions recorded for this agent yet.
          </div>
        )}
      </div>
    </main>
  );
}
