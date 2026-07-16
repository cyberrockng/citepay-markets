"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { PageShell } from "@/components/ui";

interface CreatorClearanceRow {
  clearanceId: string;
  decision: string;
  visibility: string;
  amountPaidMicro: number;
  contentHash: string;
  receiptUrl: string;
  settlement: { txHash: string; explorerUrl: string; amountMicro: number } | null;
  createdAt: string;
}

function decisionClass(decision: string) {
  if (decision === "CLEARED") return "border-[#34D399]/40 bg-[#34D399]/10 text-[#34D399]";
  if (decision === "UNSUPPORTED") return "border-red-700 bg-red-900/20 text-red-300";
  if (decision === "OVER_CAP") return "border-yellow-700 bg-yellow-900/20 text-yellow-300";
  return "border-orange-700 bg-orange-900/20 text-orange-300";
}

function micro(v: number) {
  return `$${(v / 1_000_000).toFixed(6)} USDC`;
}

export default function CreatorClearancesPage({ params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = use(params);
  const [rows, setRows] = useState<CreatorClearanceRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/creator/${wallet}/clearances`)
      .then((r) => r.json())
      .then((d: { clearances: CreatorClearanceRow[] }) => { setRows(d.clearances ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [wallet]);

  return (
    <PageShell>
      <BackButton />

      <div className="mt-6 mb-8">
        <div className="text-[10px] font-mono text-[#4a4a5e] tracking-widest mb-2">CLEAR CLEARANCES</div>
        <h1 className="text-2xl font-bold text-[#f0f0f5] mb-2">Every clearance tied to your sources</h1>
        <p className="text-sm text-[#8b8b9e] mb-3">
          Every check and payment against content you registered — cleared, refused, or blocked — with a public receipt for each.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs text-[#4a4a5e] break-all">{wallet}</span>
          <Link href={`/creator/${wallet}`} className="text-xs text-[#6366f1] hover:underline">
            ← Back to earnings dashboard
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-[#8b8b9e] font-mono text-sm animate-pulse py-12 text-center">Loading clearances…</div>
      ) : !rows || rows.length === 0 ? (
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-8 text-center">
          <p className="text-sm text-[#8b8b9e]">
            No Clear clearances yet. Once an agent checks a citation against one of your registered sources, it&apos;ll show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <Link
              key={row.clearanceId}
              href={`/clearance/${row.clearanceId}`}
              className="block bg-[#111118] border border-[#1e1e2e] hover:border-[#6366f1]/40 rounded-xl px-5 py-4 transition-colors"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded border font-mono font-semibold text-xs whitespace-nowrap ${decisionClass(row.decision)}`}>
                    {row.decision.toLowerCase().replace(/_/g, " ")}
                  </span>
                  <span className="font-mono text-xs text-[#4a4a5e] truncate">{row.clearanceId}</span>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <span className={`font-mono text-xs ${row.settlement ? "text-[#34D399]" : "text-[#4a4a5e]"}`}>
                    {row.settlement ? micro(row.settlement.amountMicro) : "not paid"}
                  </span>
                  {row.settlement && (
                    <a
                      href={row.settlement.explorerUrl}
                      target="_blank" rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-[#6366f1] hover:text-indigo-300"
                    >
                      ArcScan ↗
                    </a>
                  )}
                  <span className="text-xs text-[#4a4a5e] font-mono whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
