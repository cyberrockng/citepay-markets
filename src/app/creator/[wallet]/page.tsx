"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import type { Receipt, Source } from "@/types";
import { PageShell, StatCard, BackLink, Badge, decisionStyle } from "@/components/ui";

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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-[#8b8b9e] flex items-center justify-center animate-pulse">
        Loading creator data…
      </div>
    );
  }

  const paidReceipts = data?.receipts.filter((r) => r.decision === "PAY") || [];
  const avgRep = data?.sources.length
    ? Math.round(data.sources.reduce((s, x) => s + x.reputation, 0) / data.sources.length)
    : null;

  return (
    <PageShell maxWidth="max-w-4xl">
      <div className="mb-8">
        <BackLink href="/market" label="Market" />
        <h1 className="text-xl font-bold mt-4 font-mono text-[#f0f0f5] break-all">{wallet}</h1>
        <p className="text-[#8b8b9e] mt-1 text-sm">Creator Dashboard</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Earned"
          value={`$${((data?.totalEarned || 0) / 1_000_000).toFixed(4)}`}
          accent="text-[#00ff88]"
          sub="USDC"
        />
        <StatCard label="Sources" value={data?.sources.length ?? 0} accent="text-[#6366f1]" />
        <StatCard label="Citations Paid" value={paidReceipts.length} accent="text-[#00ff88]" />
        <StatCard
          label="Avg Reputation"
          value={avgRep !== null ? `${avgRep >= 0 ? "+" : ""}${avgRep}` : "—"}
          accent={avgRep !== null && avgRep >= 0 ? "text-[#00ff88]" : "text-red-400"}
        />
      </div>

      {/* Sources */}
      {(data?.sources.length || 0) > 0 && (
        <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] mb-6 overflow-hidden">
          <div className="px-6 py-4 border-b border-[#1e1e2e]">
            <h2 className="font-semibold text-[#f0f0f5]">Registered Sources</h2>
          </div>
          {data!.sources.map((s) => (
            <div key={s.id} className="px-6 py-4 border-b border-[#1e1e2e] last:border-0 flex justify-between items-start gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/source/${s.id}`} className="font-medium text-[#f0f0f5] hover:text-[#6366f1] transition-colors">
                    {s.title}
                  </Link>
                  {s.bonded && <Badge type="BONDED" label="Bonded" />}
                </div>
                <a href={s.url} target="_blank" rel="noopener noreferrer"
                   className="text-[#6366f1] text-xs hover:text-indigo-300 break-all">
                  {s.url}
                </a>
                <div className="flex gap-4 mt-2 text-xs text-[#8b8b9e]">
                  <span>Price: <span className="text-[#f0f0f5] font-mono">${(s.price / 1_000_000).toFixed(4)}</span></span>
                  <span>Paid: <span className="text-[#00ff88]">{s.paidCount}</span></span>
                  <span>Refused: <span className="text-red-400">{s.refusedCount}</span></span>
                  <span>
                    Rep:{" "}
                    <span className={s.reputation >= 0 ? "text-[#00ff88]" : "text-red-400"}>
                      {s.reputation >= 0 ? "+" : ""}{s.reputation}
                    </span>
                  </span>
                </div>
              </div>
              <div className="font-mono text-xs text-[#4a4a5e] shrink-0">{s.contentHash.slice(0, 12)}…</div>
            </div>
          ))}
        </div>
      )}

      {/* Payment receipts */}
      {paidReceipts.length > 0 && (
        <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#1e1e2e]">
            <h2 className="font-semibold text-[#f0f0f5]">Payment Receipts</h2>
          </div>
          {paidReceipts.map((r) => (
            <div key={r.id} className="px-6 py-4 border-b border-[#1e1e2e] last:border-0 flex justify-between items-start gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-[#f0f0f5]">{r.sourceTitle}</div>
                <div className="text-xs text-[#8b8b9e] mt-1 font-mono truncate max-w-sm">{r.query.slice(0, 60)}…</div>
                <div className="text-xs text-[#4a4a5e] mt-1">{new Date(r.createdAt).toLocaleDateString()}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[#00ff88] font-mono text-sm">${(r.amountPaid / 1_000_000).toFixed(4)}</div>
                <Link href={`/receipt/${r.id}`} className="text-[#6366f1] text-xs hover:text-indigo-300 transition-colors">
                  Receipt →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* All decisions (non-paid) */}
      {data?.receipts && data.receipts.length > paidReceipts.length && (
        <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] overflow-hidden mt-6">
          <div className="px-6 py-4 border-b border-[#1e1e2e]">
            <h2 className="font-semibold text-[#f0f0f5]">All Decisions</h2>
          </div>
          {data.receipts.filter((r) => r.decision !== "PAY").slice(0, 10).map((r) => (
            <div key={r.id} className="px-6 py-4 border-b border-[#1e1e2e] last:border-0 flex justify-between items-start gap-4">
              <div className="min-w-0">
                <div className="text-sm text-[#f0f0f5] truncate">{r.sourceTitle}</div>
                <div className="text-xs text-[#8b8b9e] mt-0.5">{r.reason?.slice(0, 60)}</div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <span className={`px-2 py-0.5 rounded border font-mono text-xs ${decisionStyle(r.decision)}`}>
                  {r.decision}
                </span>
                <Link href={`/receipt/${r.id}`} className="text-[#6366f1] text-xs hover:text-indigo-300">
                  Receipt →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {!data?.receipts.length && !data?.sources.length && (
        <div className="text-[#8b8b9e] text-center py-16 bg-[#111118] rounded-xl border border-[#1e1e2e]">
          No data found for this wallet.
        </div>
      )}
    </PageShell>
  );
}
