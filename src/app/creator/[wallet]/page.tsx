"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import type { Receipt, Source } from "@/types";

export default function CreatorPage({ params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = use(params);
  const [data, setData] = useState<{ sources: Source[]; receipts: Receipt[]; totalEarned: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/creator/${wallet}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [wallet]);

  if (loading) return <div className="min-h-screen bg-gray-950 text-gray-400 flex items-center justify-center">Loading...</div>;

  const paidReceipts = data?.receipts.filter((r) => r.decision === "PAY") || [];

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm">← Home</Link>
          <h1 className="text-2xl font-bold mt-4 font-mono break-all">{wallet}</h1>
          <p className="text-gray-400 mt-1">Creator Dashboard</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Earned", value: `$${((data?.totalEarned || 0) / 1_000_000).toFixed(4)} USDC` },
            { label: "Sources", value: data?.sources.length ?? 0 },
            { label: "Citations Paid", value: paidReceipts.length },
            { label: "Avg Reputation", value: data?.sources.length ? Math.round(data.sources.reduce((s, x) => s + x.reputation, 0) / data.sources.length) : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-900 rounded-xl p-4 border border-gray-800 text-center">
              <div className="text-xl font-bold text-indigo-400">{value}</div>
              <div className="text-gray-500 text-xs mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Sources */}
        {(data?.sources.length || 0) > 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 mb-6 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 font-semibold">Registered Sources</div>
            {data!.sources.map((s) => (
              <div key={s.id} className="px-6 py-4 border-b border-gray-800 last:border-0 flex justify-between items-start">
                <div>
                  <div className="font-medium">{s.title}</div>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 text-xs hover:underline">{s.url}</a>
                  <div className="flex gap-4 mt-1 text-xs text-gray-500">
                    <span>Price: ${(s.price / 1_000_000).toFixed(4)}</span>
                    <span>Paid: <span className="text-green-400">{s.paidCount}</span></span>
                    <span>Refused: <span className="text-red-400">{s.refusedCount}</span></span>
                    <span>Rep: <span className={s.reputation >= 0 ? "text-green-400" : "text-red-400"}>{s.reputation >= 0 ? "+" : ""}{s.reputation}</span></span>
                    {s.bonded && <span className="text-green-400">Bonded</span>}
                  </div>
                </div>
                <div className="font-mono text-xs text-gray-500">{s.contentHash.slice(0, 12)}...</div>
              </div>
            ))}
          </div>
        )}

        {/* Payment receipts */}
        {paidReceipts.length > 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 font-semibold">Payment Receipts</div>
            {paidReceipts.map((r) => (
              <div key={r.id} className="px-6 py-4 border-b border-gray-800 last:border-0 flex justify-between items-start">
                <div>
                  <div className="text-sm font-medium">{r.sourceTitle}</div>
                  <div className="text-xs text-gray-500 mt-1 font-mono">{r.query.slice(0, 60)}...</div>
                  <div className="text-xs text-gray-500 mt-1">{new Date(r.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-green-400 font-mono text-sm">${(r.amountPaid / 1_000_000).toFixed(4)}</div>
                  <Link href={`/receipt/${r.id}`} className="text-indigo-400 text-xs hover:underline">View receipt →</Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {!data?.receipts.length && !data?.sources.length && (
          <div className="text-gray-500 text-center py-12">No data found for this wallet.</div>
        )}
      </div>
    </main>
  );
}
