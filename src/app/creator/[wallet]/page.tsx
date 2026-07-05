"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import type { Receipt, Source } from "@/types";
import { Badge } from "@/components/ui";
import { BackButton } from "@/components/back-button";

const ARCSCAN = "https://testnet.arcscan.app";

function ReputationBar({ rep, max = 10 }: { rep: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, ((rep + max) / (max * 2)) * 100));
  const color = rep >= 3 ? "bg-[#34D399]" : rep >= 0 ? "bg-yellow-400" : "bg-red-500";
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] font-mono text-[#4a4a5e] mb-1">
        <span>Reputation</span>
        <span className={rep >= 0 ? "text-[#34D399]" : "text-red-400"}>{rep >= 0 ? "+" : ""}{rep}</span>
      </div>
      <div className="h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

interface ShareModalProps {
  wallet: string;
  totalEarned: number;
  paidCount: number;
  onClose: () => void;
}

function ShareModal({ wallet, totalEarned, paidCount, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const text = `I earned $${(totalEarned / 1e6).toFixed(4)} USDC from ${paidCount} AI citations on CitePay Markets\nMy content was cited ${paidCount} times by AI agents on Arc Testnet\nVerify: citepay-markets.vercel.app/creator/${wallet}`;

  async function copy() {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-semibold text-[#f0f0f5] mb-3">Share your earnings</div>
        <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg p-4 font-mono text-xs text-[#f0f0f5] whitespace-pre-wrap mb-4">
          {text}
        </div>
        <div className="flex gap-2">
          <button
            onClick={copy}
            className="flex-1 bg-[#6366f1] hover:bg-indigo-500 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
          <button
            onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank")}
            className="px-4 py-2 bg-[#1e1e2e] hover:bg-[#2e2e3e] text-[#f0f0f5] rounded-lg text-sm transition-colors"
          >
            Share on X
          </button>
          <button onClick={onClose} className="px-4 py-2 text-[#4a4a5e] hover:text-[#8b8b9e] text-sm transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CreatorPage({ params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = use(params);
  const [data, setData] = useState<{ sources: Source[]; receipts: Receipt[]; totalEarned: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showShare, setShowShare] = useState(false);
  const [onChainStats, setOnChainStats] = useState<{
    citations: number;
    totalUSDC: number;
    events: Array<{ receiptId: number; amountPaid: number; txHash: string; arcScanUrl: string }>;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/creator/${wallet}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [wallet]);

  useEffect(() => {
    fetch("/api/onchain-proof")
      .then((r) => r.json())
      .then((d: { events: Array<{ receiptId: number; amountPaid: number; txHash: string; arcScanUrl: string; creator: string }> }) => {
        const mine = (d.events ?? []).filter(e => e.creator?.toLowerCase() === wallet.toLowerCase());
        setOnChainStats({
          citations: mine.length,
          totalUSDC: mine.reduce((s, e) => s + e.amountPaid, 0),
          events: mine.slice(0, 5),
        });
      })
      .catch(() => {});
  }, [wallet]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-[#8b8b9e] flex items-center justify-center animate-pulse font-mono text-sm">
        Loading creator data…
      </div>
    );
  }

  const paidReceipts = data?.receipts.filter((r) => r.decision === "PAY") || [];
  const totalEarned = data?.totalEarned ?? 0;

  // Per-source earnings
  const sourceEarnings: Record<string, number> = {};
  paidReceipts.forEach((r) => {
    sourceEarnings[r.sourceId] = (sourceEarnings[r.sourceId] ?? 0) + r.amountPaid;
  });

  const avgRep = data?.sources.length
    ? data.sources.reduce((s, x) => s + x.reputation, 0) / data.sources.length
    : 0;

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5] pb-20">
      {showShare && data && (
        <ShareModal
          wallet={wallet}
          totalEarned={totalEarned}
          paidCount={paidReceipts.length}
          onClose={() => setShowShare(false)}
        />
      )}

      <div className="max-w-4xl mx-auto px-6 py-12">
        <BackButton label="Market" />

        {/* Hero */}
        <div className="mt-6 mb-8 bg-gradient-to-br from-[#111118] to-[#0d0d15] rounded-2xl border border-[#1e1e2e] p-8 relative overflow-hidden">
          <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "radial-gradient(circle, #34D399 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
          <div className="relative z-10">
            <div className="text-[10px] font-mono text-[#4a4a5e] tracking-widest mb-2">CREATOR EARNINGS DASHBOARD</div>
            <div className="text-5xl font-bold font-mono text-[#34D399] mb-1">
              ${(totalEarned / 1e6).toFixed(4)}
            </div>
            <div className="text-sm text-[#8b8b9e] mb-4">
              USDC earned from {paidReceipts.length} citation{paidReceipts.length !== 1 ? "s" : ""} · {data?.sources.length ?? 0} source{(data?.sources.length ?? 0) !== 1 ? "s" : ""} registered
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <span className="font-mono text-xs text-[#4a4a5e] break-all">{wallet}</span>
              <button
                onClick={() => setShowShare(true)}
                className="text-xs px-3 py-1.5 bg-[#6366f1] hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors"
              >
                Share earnings →
              </button>
              <a
                href={`${ARCSCAN}/address/${wallet}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs text-[#6366f1] hover:text-indigo-300 transition-colors"
              >
                ArcScan ↗
              </a>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Earned", value: `$${(totalEarned / 1e6).toFixed(4)}`, accent: "text-[#34D399]" },
            { label: "Citations Paid", value: paidReceipts.length, accent: "text-[#34D399]" },
            { label: "Sources", value: data?.sources.length ?? 0, accent: "text-[#6366f1]" },
            { label: "Avg Reputation", value: `${avgRep >= 0 ? "+" : ""}${avgRep.toFixed(1)}`, accent: avgRep >= 0 ? "text-[#34D399]" : "text-red-400" },
          ].map(({ label, value, accent }) => (
            <div key={label} className="bg-[#111118] rounded-xl p-5 border border-[#1e1e2e] text-center">
              <div className={`text-2xl font-bold font-mono ${accent}`}>{value}</div>
              <div className="text-[#8b8b9e] text-xs mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Sources */}
        {(data?.sources.length || 0) > 0 && (
          <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] mb-6 overflow-hidden">
            <div className="px-6 py-4 border-b border-[#1e1e2e]">
              <h2 className="font-semibold text-[#f0f0f5]">Registered Sources</h2>
            </div>
            {data!.sources.map((s) => (
              <div key={s.id} className="px-6 py-5 border-b border-[#1e1e2e] last:border-0">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Link href={`/source/${s.id}`} className="font-medium text-[#f0f0f5] hover:text-[#6366f1] transition-colors">
                        {s.title}
                      </Link>
                      {s.bonded && <Badge type="BONDED" label="Content Verified" />}
                      {s.paidCount >= 3 && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#6366f1]/30 text-[#6366f1] bg-[#6366f1]/10">
                          ↺ {s.paidCount} memory citations
                        </span>
                      )}
                    </div>
                    <a href={s.url} target="_blank" rel="noopener noreferrer"
                       className="text-[#6366f1] text-xs hover:text-indigo-300 break-all">
                      {s.url}
                    </a>
                    <div className="flex gap-4 mt-2 text-xs text-[#8b8b9e]">
                      <span>Price: <span className="text-[#f0f0f5] font-mono">${(s.price / 1_000_000).toFixed(4)}</span></span>
                      <span>Paid: <span className="text-[#34D399]">{s.paidCount}</span></span>
                      <span>Refused: <span className="text-red-400">{s.refusedCount}</span></span>
                    </div>
                    <ReputationBar rep={s.reputation} />
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[#34D399] font-mono text-lg font-bold">${((sourceEarnings[s.id] ?? 0) / 1e6).toFixed(4)}</div>
                    <div className="text-[10px] text-[#4a4a5e]">earned</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Payment receipts */}
        {paidReceipts.length > 0 && (
          <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-[#1e1e2e] flex items-center justify-between">
              <h2 className="font-semibold text-[#f0f0f5]">Payment Receipts</h2>
              <span className="text-xs text-[#4a4a5e]">Last {Math.min(paidReceipts.length, 20)}</span>
            </div>
            {paidReceipts.slice(0, 20).map((r) => (
              <div key={r.id} className="px-6 py-4 border-b border-[#1e1e2e] last:border-0 flex justify-between items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm font-medium text-[#f0f0f5]">{r.sourceTitle}</div>
                    {r.challenged && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-orange-700/40 text-orange-400 bg-orange-900/10">
                        CHALLENGED
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#8b8b9e] mt-0.5 font-mono truncate max-w-sm">
                    &ldquo;{r.query.slice(0, 70)}{r.query.length > 70 ? "…" : ""}&rdquo;
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-[#4a4a5e]">
                    <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                    {r.txHash && r.paymentStatus === "confirmed" && (
                      <a
                        href={`${ARCSCAN}/tx/${r.txHash}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-[#6366f1] hover:text-indigo-300 font-mono"
                      >
                        tx {r.txHash.slice(0, 10)}… ↗
                      </a>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[#34D399] font-mono text-sm">${(r.amountPaid / 1_000_000).toFixed(4)}</div>
                  <Link href={`/receipt/${r.id}`} className="text-[#6366f1] text-xs hover:text-indigo-300 transition-colors">
                    Receipt →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* On-Chain Earnings (Arc Testnet direct) */}
        <div className="bg-[#111118] rounded-xl border border-[#34D399]/20 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-[#1e1e2e] flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-[#f0f0f5]">On-Chain Earnings</h2>
              <p className="text-[10px] font-mono text-[#4a4a5e] mt-0.5">Read directly from CitePayMarket.sol — persistent across cold starts</p>
            </div>
            <a href={`https://testnet.arcscan.app/address/0x396cf1646EbAeF85ee8428C2d9239C46Ae956085`} target="_blank" rel="noopener noreferrer" className="text-xs text-[#6366f1] hover:text-indigo-300">ArcScan ↗</a>
          </div>
          {onChainStats === null ? (
            <div className="px-6 py-4 text-xs font-mono text-[#4a4a5e] animate-pulse">Reading Arc Testnet…</div>
          ) : onChainStats.citations === 0 ? (
            <div className="px-6 py-4 text-xs font-mono text-[#4a4a5e]">No on-chain CitationPaid events found for this wallet in the last 10,000 blocks.</div>
          ) : (
            <div>
              <div className="grid grid-cols-2 gap-4 px-6 py-4 border-b border-[#1e1e2e]">
                <div>
                  <div className="text-2xl font-bold font-mono text-[#34D399]">${onChainStats.totalUSDC.toFixed(4)}</div>
                  <div className="text-xs text-[#8b8b9e] mt-1">USDC earned on-chain</div>
                </div>
                <div>
                  <div className="text-2xl font-bold font-mono text-[#34D399]">{onChainStats.citations}</div>
                  <div className="text-xs text-[#8b8b9e] mt-1">CitationPaid events</div>
                </div>
              </div>
              <div className="px-6 py-3 space-y-1.5">
                {onChainStats.events.map((e) => (
                  <div key={e.receiptId} className="flex items-center justify-between text-xs font-mono py-1">
                    <span className="text-[#4a4a5e]">Receipt #{e.receiptId}</span>
                    <span className="text-[#34D399]">${e.amountPaid.toFixed(4)}</span>
                    {e.txHash && (
                      <a href={e.arcScanUrl} target="_blank" rel="noopener noreferrer" className="text-[#6366f1] hover:text-indigo-300">
                        {e.txHash.slice(0, 10)}… ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {!data?.receipts.length && !data?.sources.length && (
          <div className="text-[#8b8b9e] text-center py-16 bg-[#111118] rounded-xl border border-[#1e1e2e]">
            No data found for this wallet.
          </div>
        )}
      </div>
    </main>
  );
}
