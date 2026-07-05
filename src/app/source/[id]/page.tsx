"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import type { Source, Receipt } from "@/types";
import { PageShell, StatCard, Badge, DataRow, decisionStyle } from "@/components/ui";
import { BackButton } from "@/components/back-button";

export default function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [source, setSource] = useState<Source | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [totalEarned, setTotalEarned] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hashUpdate, setHashUpdate] = useState("");
  const [hashMsg, setHashMsg] = useState("");

  useEffect(() => {
    fetch(`/api/sources/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setSource(d.source);
        setReceipts(d.receipts || []);
        setTotalEarned(d.totalEarned || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  async function handleHashUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!hashUpdate.trim()) return;
    const res = await fetch(`/api/sources/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-hash", content: hashUpdate }),
    });
    const data = await res.json();
    if (res.ok) {
      setHashMsg(`Hash updated to: ${data.newHash.slice(0, 16)}…`);
      setSource((s) => s ? { ...s, contentHash: data.newHash } : s);
    } else {
      setHashMsg(data.error || "Error");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-[#8b8b9e] flex items-center justify-center animate-pulse">
        Loading…
      </div>
    );
  }
  if (!source) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-red-400 flex items-center justify-center">
        Source not found
      </div>
    );
  }

  const paid = receipts.filter((r) => r.decision === "PAY");
  const refused = receipts.filter((r) => r.decision === "REFUSE");

  return (
    <PageShell maxWidth="max-w-4xl">
      <div className="mb-8">
        <BackButton />
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <h1 className="text-2xl font-bold text-[#f0f0f5]">{source.title}</h1>
          {source.bonded && <Badge type="BONDED" label="Bonded" />}
          {!source.active && <Badge type="INACTIVE" label="Inactive" />}
        </div>
        <a href={source.url} target="_blank" rel="noopener noreferrer"
           className="text-[#6366f1] hover:text-indigo-300 text-sm mt-2 inline-block transition-colors">
          {source.url}
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Earned"
          value={`$${(totalEarned / 1_000_000).toFixed(4)}`}
          accent="text-[#34D399]"
          sub="USDC"
        />
        <StatCard
          label="Price / Citation"
          value={`$${(source.price / 1_000_000).toFixed(4)}`}
          accent="text-[#6366f1]"
        />
        <StatCard label="Citations Paid" value={paid.length} accent="text-[#34D399]" />
        <StatCard label="Refusals" value={refused.length} accent="text-red-400" />
      </div>

      {/* VCS — Avg Contribution Quality */}
      {(source.totalContributionQueries ?? 0) > 0 && (
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] font-mono text-[#4a4a5e] tracking-widest mb-1">VERIFIABLE CONTRIBUTION SCORE</div>
              <div className="text-sm font-semibold text-[#f0f0f5]">
                {(() => {
                  const avg = (source.avgContributionWeight ?? 0) * 100;
                  if (avg >= 50) return "Primary Source";
                  if (avg >= 20) return "Supporting Source";
                  return "Peripheral Source";
                })()}
              </div>
              <div className="text-[10px] text-[#4a4a5e] mt-0.5">
                Avg across {source.totalContributionQueries} citation{source.totalContributionQueries !== 1 ? "s" : ""} · post-synthesis scored
              </div>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-bold font-mono ${
                (source.avgContributionWeight ?? 0) >= 0.5 ? "text-[#34D399]"
                : (source.avgContributionWeight ?? 0) >= 0.2 ? "text-[#6366f1]"
                : "text-[#4a4a5e]"
              }`}>
                {Math.round((source.avgContributionWeight ?? 0) * 100)}%
              </div>
            </div>
          </div>
          <div className="h-2 bg-[#0a0a0f] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                (source.avgContributionWeight ?? 0) >= 0.5 ? "bg-[#34D399]"
                : (source.avgContributionWeight ?? 0) >= 0.2 ? "bg-[#6366f1]"
                : "bg-[#2e2e3e]"
              }`}
              style={{ width: `${Math.round((source.avgContributionWeight ?? 0) * 100)}%` }}
            />
          </div>
          <div className="text-[10px] text-[#4a4a5e] mt-2">
            50%+ = primary source · 20–49% = supporting · below 20% = peripheral
          </div>
        </div>
      )}

      {/* Source Metadata */}
      <div className="bg-[#111118] rounded-xl p-6 border border-[#1e1e2e] mb-6">
        <h2 className="font-semibold mb-5 text-[#f0f0f5]">Source Metadata</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DataRow label="Creator" value={`${source.creatorName} (${source.creatorHandle})`} />
          <DataRow label="Payout Wallet" value={source.payoutWallet} mono />
          <DataRow label="Bond Amount" value={source.bond > 0 ? `$${(source.bond / 1_000_000).toFixed(4)} USDC` : "None"} />
          <DataRow
            label="Reputation"
            value={`${source.reputation >= 0 ? "+" : ""}${source.reputation}`}
            accent={source.reputation >= 0 ? "text-[#34D399]" : "text-red-400"}
          />
          <DataRow label="Registered" value={new Date(source.createdAt).toLocaleDateString()} />
          <DataRow label="Skip Count" value={String(source.skipCount)} />
        </div>
        <div className="mt-5 pt-5 border-t border-[#1e1e2e]">
          <div className="text-[#8b8b9e] text-xs mb-1">Content Hash</div>
          <div className="font-mono text-xs text-[#f0f0f5] break-all">{source.contentHash}</div>
        </div>
        {source.description && (
          <div className="mt-4 pt-4 border-t border-[#1e1e2e]">
            <div className="text-[#8b8b9e] text-xs mb-1">Description</div>
            <div className="text-[#f0f0f5] text-sm">{source.description}</div>
          </div>
        )}
      </div>

      {/* Hash Update */}
      <div className="bg-[#111118] rounded-xl p-6 border border-yellow-900/40 mb-6">
        <h2 className="font-semibold mb-2 text-yellow-400">Content Hash Update (Challenge Demo)</h2>
        <p className="text-[#8b8b9e] text-sm mb-4">
          Simulate a creator editing content after payment. If a buyer challenges and the hash changed, an objective slash triggers — the only valid slash condition.
        </p>
        <form onSubmit={handleHashUpdate} className="flex gap-3">
          <input
            type="text"
            className="flex-1 bg-[#0a0a0f] border border-[#1e1e2e] focus:border-yellow-600 rounded-lg px-3 py-2 text-[#f0f0f5] text-sm focus:outline-none transition-colors"
            placeholder="Paste new content to update hash…"
            value={hashUpdate}
            onChange={(e) => setHashUpdate(e.target.value)}
          />
          <button
            type="submit"
            className="bg-yellow-700 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Update Hash
          </button>
        </form>
        {hashMsg && <div className="mt-2 text-xs text-yellow-400 font-mono">{hashMsg}</div>}
      </div>

      {/* Decision History */}
      {receipts.length > 0 ? (
        <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#1e1e2e]">
            <h2 className="font-semibold text-[#f0f0f5]">Decision History ({receipts.length})</h2>
          </div>
          {receipts.slice(0, 20).map((r) => (
            <div key={r.id} className="px-6 py-4 border-b border-[#1e1e2e] last:border-0 flex justify-between items-start gap-4">
              <div className="min-w-0">
                <div className="text-sm text-[#f0f0f5] truncate">
                  {r.query.slice(0, 70)}{r.query.length > 70 ? "…" : ""}
                </div>
                <div className="text-xs text-[#8b8b9e] mt-0.5">
                  {new Date(r.createdAt).toLocaleString()} · Score: <span className="text-[#f0f0f5]">{r.scores.total}</span>
                </div>
                <div className="text-xs text-[#4a4a5e] mt-0.5 truncate">{r.reason}</div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0 ml-4">
                <span className={`px-2 py-0.5 rounded border font-mono text-xs ${decisionStyle(r.decision)}`}>
                  {r.decision}
                </span>
                {r.decision === "PAY" && (
                  <div className="text-[#34D399] font-mono text-xs">${(r.amountPaid / 1_000_000).toFixed(4)}</div>
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
          No agent decisions yet for this source.
        </div>
      )}
    </PageShell>
  );
}
