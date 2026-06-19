"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import type { Source, Receipt } from "@/types";

const DECISION_COLOR: Record<string, string> = {
  PAY: "text-green-400 bg-green-900/30 border-green-800",
  REFUSE: "text-red-400 bg-red-900/30 border-red-800",
  SKIP: "text-gray-400 bg-gray-800/30 border-gray-700",
};

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
      setHashMsg(`Hash updated to: ${data.newHash.slice(0, 16)}...`);
      setSource((s) => s ? { ...s, contentHash: data.newHash } : s);
    } else {
      setHashMsg(data.error || "Error");
    }
  }

  if (loading) return <div className="min-h-screen bg-gray-950 text-gray-400 flex items-center justify-center">Loading...</div>;
  if (!source) return <div className="min-h-screen bg-gray-950 text-red-400 flex items-center justify-center">Source not found</div>;

  const paid = receipts.filter((r) => r.decision === "PAY");
  const refused = receipts.filter((r) => r.decision === "REFUSE");

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link href="/market" className="text-gray-500 hover:text-gray-300 text-sm">← Market</Link>
          <div className="flex items-center gap-3 mt-4">
            <h1 className="text-2xl font-bold">{source.title}</h1>
            {source.bonded && <span className="px-2 py-0.5 rounded text-xs bg-yellow-900/30 border border-yellow-700 text-yellow-400">Bonded</span>}
            {!source.active && <span className="px-2 py-0.5 rounded text-xs bg-red-900/30 border border-red-700 text-red-400">Inactive</span>}
          </div>
          <div className="flex gap-2 mt-2">
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline text-sm">{source.url}</a>
          </div>
        </div>

        {/* Source Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Earned", value: `$${(totalEarned / 1_000_000).toFixed(4)}`, color: "text-green-400" },
            { label: "Price / Citation", value: `$${(source.price / 1_000_000).toFixed(4)}`, color: "text-indigo-400" },
            { label: "Citations Paid", value: paid.length, color: "text-green-400" },
            { label: "Refusals", value: refused.length, color: "text-red-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-900 rounded-xl p-4 border border-gray-800 text-center">
              <div className={`text-xl font-bold ${color}`}>{value}</div>
              <div className="text-gray-500 text-xs mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Source Metadata */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
          <h2 className="font-semibold mb-4">Source Metadata</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <Field label="Creator" value={`${source.creatorName} (${source.creatorHandle})`} />
            <Field label="Payout Wallet" value={source.payoutWallet} mono />
            <Field label="Bond Amount" value={source.bond > 0 ? `$${(source.bond / 1_000_000).toFixed(4)} USDC` : "None"} />
            <Field label="Reputation" value={`${source.reputation >= 0 ? "+" : ""}${source.reputation}`} />
            <Field label="Registered" value={new Date(source.createdAt).toLocaleDateString()} />
            <Field label="Skip Count" value={String(source.skipCount)} />
          </div>
          <div className="mt-4 pt-4 border-t border-gray-800">
            <div className="text-gray-500 text-xs mb-1">Content Hash</div>
            <div className="font-mono text-xs text-gray-300 break-all">{source.contentHash}</div>
          </div>
          {source.description && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <div className="text-gray-500 text-xs mb-1">Description</div>
              <div className="text-gray-300 text-sm">{source.description}</div>
            </div>
          )}
        </div>

        {/* Hash Update (Challenge Demo) */}
        <div className="bg-gray-900 rounded-xl p-6 border border-yellow-900/50 mb-6">
          <h2 className="font-semibold mb-2 text-yellow-400">Content Hash Update</h2>
          <p className="text-gray-400 text-sm mb-4">
            Creators can update content after registration. If a buyer challenges a paid receipt and the hash changed, an objective slash triggers. This is the only valid slash condition.
          </p>
          <form onSubmit={handleHashUpdate} className="flex gap-3">
            <input
              type="text"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500"
              placeholder="Paste new content to update hash..."
              value={hashUpdate}
              onChange={(e) => setHashUpdate(e.target.value)}
            />
            <button type="submit" className="bg-yellow-700 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">
              Update Hash
            </button>
          </form>
          {hashMsg && <div className="mt-2 text-xs text-yellow-400 font-mono">{hashMsg}</div>}
        </div>

        {/* Receipt History */}
        {receipts.length > 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 font-semibold">Decision History ({receipts.length})</div>
            {receipts.slice(0, 20).map((r) => (
              <div key={r.id} className="px-6 py-4 border-b border-gray-800 last:border-0 flex justify-between items-start">
                <div>
                  <div className="text-sm text-gray-300">{r.query.slice(0, 60)}{r.query.length > 60 ? "..." : ""}</div>
                  <div className="text-xs text-gray-500 mt-1">{new Date(r.createdAt).toLocaleString()} · Score: {r.scores.total}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{r.reason}</div>
                </div>
                <div className="flex flex-col items-end gap-1 ml-4">
                  <span className={`px-2 py-0.5 rounded text-xs font-mono border ${DECISION_COLOR[r.decision]}`}>{r.decision}</span>
                  {r.decision === "PAY" && <div className="text-green-400 font-mono text-xs">${(r.amountPaid / 1_000_000).toFixed(4)}</div>}
                  <Link href={`/receipt/${r.id}`} className="text-indigo-400 text-xs hover:underline">Receipt →</Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {receipts.length === 0 && (
          <div className="text-gray-500 text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
            No agent decisions yet for this source.
          </div>
        )}
      </div>
    </main>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-gray-500 text-xs mb-1">{label}</div>
      <div className={`text-gray-200 break-all ${mono ? "font-mono text-xs" : "text-sm"}`}>{value}</div>
    </div>
  );
}
