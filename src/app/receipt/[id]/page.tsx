"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import type { Receipt } from "@/types";

const DECISION_STYLE: Record<string, string> = {
  PAY: "text-green-400 border-green-700 bg-green-900/20",
  REFUSE: "text-red-400 border-red-700 bg-red-900/20",
  SKIP: "text-gray-400 border-gray-700 bg-gray-800/20",
};

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [hashValid, setHashValid] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    fetch(`/api/receipt/${id}`)
      .then((r) => r.json())
      .then((d) => { setReceipt(d.receipt); setHashValid(d.hashValid); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  function getShareText() {
    if (!receipt) return "";
    return `An AI cited my work and paid me USDC!\n\nSource: ${receipt.sourceTitle}\nPaid: $${(receipt.amountPaid / 1_000_000).toFixed(4)} USDC\nReason: ${receipt.reason}\nReceipt: ${window.location.href}\n\nPowered by CitePay Markets`;
  }

  async function handleShare(target: "copy" | "x" | "farcaster" | "discord") {
    if (!receipt) return;
    await fetch(`/api/creator/${receipt.creatorWallet}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "share", receiptId: receipt.id }),
    });
    const text = getShareText();
    if (target === "copy") {
      await navigator.clipboard.writeText(text).catch(() => {});
    } else if (target === "x") {
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
    } else if (target === "farcaster") {
      window.open(`https://warpcast.com/~/compose?text=${encodeURIComponent(text)}`, "_blank");
    } else if (target === "discord") {
      await navigator.clipboard.writeText(text).catch(() => {});
      alert("Share text copied — paste it in Discord!");
    }
    setShared(true);
  }

  if (loading) return <div className="min-h-screen bg-gray-950 text-gray-400 flex items-center justify-center">Loading receipt...</div>;
  if (!receipt) return <div className="min-h-screen bg-gray-950 text-red-400 flex items-center justify-center">Receipt not found</div>;

  const p = receipt.evidencePreimage;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm">← Home</Link>
          <div className="flex items-center gap-4 mt-4">
            <h1 className="text-2xl font-bold">Receipt #{receipt.id.slice(0, 8)}</h1>
            <span className={`px-3 py-1 rounded-full text-sm font-mono border ${DECISION_STYLE[receipt.decision]}`}>
              {receipt.decision}
            </span>
            {receipt.challenged && <span className="px-3 py-1 rounded-full text-xs border border-yellow-700 bg-yellow-900/20 text-yellow-400">CHALLENGED</span>}
          </div>
        </div>

        {/* Decision Summary */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <Field label="Query" value={receipt.query} mono={false} />
            <Field label="Query Hash" value={receipt.queryHash} mono />
            <Field label="Source" value={receipt.sourceTitle} mono={false} />
            <Field label="Source URL" value={receipt.sourceUrl} mono link={receipt.sourceUrl} />
            <Field label="Creator Wallet" value={receipt.creatorWallet} mono />
            <Field label="Agent Address" value={receipt.agentAddress} mono />
            <Field label="Amount Paid" value={receipt.decision === "PAY" ? `$${(receipt.amountPaid / 1_000_000).toFixed(6)} USDC` : "—"} mono />
            <Field label="Tx Hash" value={receipt.txHash || "—"} mono />
            <Field label="Budget Before" value={`$${(receipt.budgetBefore / 1_000_000).toFixed(4)} USDC`} mono />
            <Field label="Budget After" value={`$${(receipt.budgetAfter / 1_000_000).toFixed(4)} USDC`} mono />
            <Field label="Timestamp" value={receipt.createdAt} mono />
            <Field label="Reason" value={receipt.reason} mono={false} />
          </div>
        </div>

        {/* Score Breakdown */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-4">
          <h2 className="font-semibold mb-4">Score Breakdown</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Relevance", value: receipt.scores.relevance, max: 100 },
              { label: "Price", value: receipt.scores.price, max: 100 },
              { label: "Bond", value: receipt.scores.bond, max: 20 },
              { label: "Reputation", value: receipt.scores.reputation, max: 30 },
            ].map(({ label, value, max }) => (
              <div key={label} className="text-center">
                <div className="text-2xl font-bold text-indigo-400">{value}<span className="text-gray-600 text-sm">/{max}</span></div>
                <div className="text-gray-500 text-xs mt-1">{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-800 text-center">
            <span className="text-gray-400 text-sm">Total Score: </span>
            <span className="text-2xl font-bold text-white">{receipt.scores.total}</span>
          </div>
        </div>

        {/* Evidence Preimage */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Evidence Preimage</h2>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Hash valid:</span>
              <span className={hashValid ? "text-green-400" : "text-red-400"}>{hashValid ? "✓ Yes" : "✗ No"}</span>
            </div>
          </div>
          <div className="bg-black rounded-lg p-4 font-mono text-xs text-green-300 overflow-x-auto">
            <pre>{JSON.stringify(p, null, 2)}</pre>
          </div>
          <div className="mt-3 text-xs text-gray-500">
            <span>Evidence Hash: </span>
            <span className="font-mono text-gray-300">{receipt.evidenceHash}</span>
          </div>
          <div className="mt-1 text-xs text-gray-500">
            <span>Content Hash at Decision: </span>
            <span className="font-mono text-gray-300">{receipt.contentHashAtDecision}</span>
          </div>
        </div>

        {/* Share Card (PAY only) */}
        {receipt.decision === "PAY" && (
          <div className="bg-gray-900 rounded-xl p-6 border border-indigo-900 mb-4">
            <h2 className="font-semibold mb-3">Creator Share Card</h2>
            <div className="bg-black rounded-lg p-4 font-mono text-sm text-white mb-4 whitespace-pre-wrap">
{`An AI cited my work and paid me USDC.

Source: ${receipt.sourceTitle}
Paid: $${(receipt.amountPaid / 1_000_000).toFixed(4)} USDC
Reason: ${receipt.reason}
Receipt: /receipt/${receipt.id}

Powered by CitePay Markets`}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => handleShare("copy")} className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2 rounded-lg transition text-sm">
                {shared ? "✓ Copied" : "Copy Link"}
              </button>
              <button onClick={() => handleShare("x")} className="bg-black hover:bg-gray-900 border border-gray-700 text-white font-semibold px-4 py-2 rounded-lg transition text-sm">
                Share on X
              </button>
              <button onClick={() => handleShare("farcaster")} className="bg-purple-700 hover:bg-purple-600 text-white font-semibold px-4 py-2 rounded-lg transition text-sm">
                Farcaster
              </button>
              <button onClick={() => handleShare("discord")} className="bg-indigo-800 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg transition text-sm">
                Discord
              </button>
            </div>
          </div>
        )}

        {/* Challenge (PAY only, not yet challenged) */}
        {receipt.decision === "PAY" && !receipt.challenged && (
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 text-xs text-gray-500">
            <strong className="text-gray-300">Content Integrity Challenge:</strong> If the creator updated this source after payment, the content hash will differ. <Link href={`/api/challenge/${receipt.id}`} className="text-indigo-400 hover:underline">Submit objective challenge →</Link>
          </div>
        )}
      </div>
    </main>
  );
}

function Field({ label, value, mono, link }: { label: string; value: string; mono: boolean; link?: string }) {
  return (
    <div>
      <div className="text-gray-500 text-xs mb-1">{label}</div>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className={`text-indigo-400 hover:underline break-all ${mono ? "font-mono text-xs" : "text-sm"}`}>{value}</a>
      ) : (
        <div className={`text-gray-200 break-all ${mono ? "font-mono text-xs" : "text-sm"}`}>{value}</div>
      )}
    </div>
  );
}
