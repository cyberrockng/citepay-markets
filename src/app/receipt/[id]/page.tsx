"use client";
import { useEffect, useState } from "react";
import { use } from "react";
import type { Receipt } from "@/types";
import {
  PageShell, Badge, ProofPanel, ScoreBar, DataRow, decisionStyle, decisionAccent,
} from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { HashChip } from "@/components/hash-chip";

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [hashValid, setHashValid] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [shared, setShared] = useState(false);
  const [preimageOpen, setPreimageOpen] = useState(false);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-[#8b8b9e] flex items-center justify-center animate-pulse">
        Loading receipt…
      </div>
    );
  }
  if (!receipt) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-red-400 flex items-center justify-center">
        Receipt not found
      </div>
    );
  }

  const p = receipt.evidencePreimage;
  const isPay = receipt.decision === "PAY";
  const accent = decisionAccent(receipt.decision);

  const STEPS = [
    { label: "Evidence Built",   done: true },
    { label: "Agent Signed",     done: !!receipt.agentSignature },
    { label: "Creator Paid",     done: isPay && receipt.paymentStatus === "confirmed", partial: isPay && receipt.paymentStatus === "simulated" },
    { label: "Anchored On-Chain",done: !!receipt.onChainTxHash },
  ];

  return (
    <PageShell maxWidth="max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <BackButton label="Home" />
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <h1 className="text-2xl font-bold text-[#f0f0f5]">Receipt #{receipt.id.slice(0, 8)}</h1>
          <span className={`px-3 py-1 rounded border font-mono text-sm ${decisionStyle(receipt.decision)}`}>
            {receipt.decision}
          </span>
          {receipt.challenged && <Badge type="CHALLENGED" label="CHALLENGED" />}
        </div>
      </div>

      {/* Receipt Progress Stepper */}
      <div className="bg-[#111118] rounded-xl p-5 border border-[#1e1e2e] mb-4">
        <div className="flex items-center gap-0">
          {STEPS.map((step, i) => (
            <div key={step.label} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1 flex-1">
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-colors ${
                  step.done    ? "border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]"
                  : step.partial ? "border-yellow-400 bg-yellow-400/10 text-yellow-400"
                  : "border-[#1e1e2e] bg-[#0a0a0f] text-[#4a4a5e]"
                }`}>
                  {step.done ? "✓" : step.partial ? "~" : i + 1}
                </div>
                <span className={`text-[10px] text-center leading-tight hidden sm:block ${
                  step.done ? "text-[#00ff88]" : step.partial ? "text-yellow-400" : "text-[#4a4a5e]"
                }`}>{step.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-px flex-1 -mt-4 sm:-mt-3 mx-1 ${step.done ? "bg-[#00ff88]/30" : "bg-[#1e1e2e]"}`} />
              )}
            </div>
          ))}
        </div>
        {/* Mobile labels */}
        <div className="flex sm:hidden mt-2 text-[10px] text-[#4a4a5e]">
          {STEPS.map((step) => (
            <span key={step.label} className={`flex-1 text-center ${step.done ? "text-[#00ff88]" : step.partial ? "text-yellow-400" : ""}`}>
              {step.label.split(" ")[0]}
            </span>
          ))}
        </div>
      </div>

      {/* Summary Card */}
      <div className="bg-[#111118] rounded-xl p-6 border border-[#1e1e2e] mb-4" style={{ borderLeftWidth: "3px", borderLeftColor: accent }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
          <DataRow label="Query" value={receipt.query} />
          <DataRow label="Query Hash" value={receipt.queryHash} mono />
          <DataRow label="Source" value={receipt.sourceTitle} />
          <DataRow label="Source URL" value={receipt.sourceUrl} link={receipt.sourceUrl} mono />
          <DataRow label="Creator Wallet" value={receipt.creatorWallet} mono />
          <DataRow label="Agent Address" value={receipt.agentAddress} mono />
          <DataRow
            label="Amount Paid"
            value={isPay ? `$${(receipt.amountPaid / 1_000_000).toFixed(6)} USDC` : "—"}
            accent={isPay ? "text-[#00ff88]" : "text-[#8b8b9e]"}
            mono={isPay}
          />
          {isPay && receipt.evidencePreimage?.scoreInputs?.contributionWeight !== undefined && (
            <DataRow
              label="Contribution Weight"
              value={`${(receipt.evidencePreimage.scoreInputs.contributionWeight * 100).toFixed(1)}% of creator budget (relevance-weighted)`}
              accent="text-[#a78bfa]"
              mono
            />
          )}
          <DataRow label="Timestamp" value={new Date(receipt.createdAt).toLocaleString()} />
          <DataRow label="Budget Before" value={`$${(receipt.budgetBefore / 1_000_000).toFixed(4)} USDC`} mono />
          <DataRow label="Budget After" value={`$${(receipt.budgetAfter / 1_000_000).toFixed(4)} USDC`} mono />
          <div className="sm:col-span-2">
            <DataRow label="Reason" value={receipt.reason} />
          </div>
        </div>
      </div>

      {/* USDC Tx */}
      {isPay && (
        <div className={`rounded-xl p-5 border mb-4 ${receipt.paymentStatus === "confirmed" ? "bg-[#00ff88]/5 border-[#00ff88]/30" : "bg-[#111118] border-[#1e1e2e]"}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-[#8b8b9e] uppercase tracking-widest">USDC Payout</span>
            {receipt.paymentStatus === "confirmed"
              ? <span className="text-[#00ff88] text-xs font-mono">✓ confirmed on-chain</span>
              : <span className="text-yellow-400 text-xs font-mono">⚠ simulated fallback (no on-chain tx)</span>}
          </div>
          {receipt.paymentStatus === "confirmed" && receipt.txHash
            ? <ProofPanel
                label="Arc Testnet Transaction"
                baseScanTx={receipt.txHash}
                baseScanTxLabel={receipt.txHash.slice(0, 20) + "…"}
              />
            : <p className="text-[#8b8b9e] text-xs">
                USDC transfer was not executed on-chain for this receipt.
                This happens when the agent wallet lacks funds or the RPC call failed.
              </p>
          }
        </div>
      )}

      {/* On-Chain Anchor */}
      {isPay && (
        <div className={`bg-[#111118] rounded-xl p-6 border mb-4 ${receipt.onChainTxHash ? "border-[#00ff88]/30" : "border-[#1e1e2e]"}`}>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-semibold text-[#f0f0f5]">On-Chain Anchor</h2>
            {receipt.onChainTxHash && <Badge type="ANCHORED" label="Anchored ✓" />}
          </div>
          {receipt.onChainTxHash ? (
            <div className="space-y-3">
              <div className="text-[#8b8b9e] text-xs mb-1">Contract Receipt ID</div>
              <div className="font-mono text-sm text-[#f0f0f5]">#{receipt.onChainReceiptId}</div>
              <ProofPanel
                label="Anchor Transaction"
                baseScanTx={receipt.onChainTxHash}
                baseScanTxLabel="View on BaseScan ↗"
              />
            </div>
          ) : (
            <div className="text-[#8b8b9e] text-xs">
              Anchor pending — will be written on the next PAY decision for this source.
            </div>
          )}
        </div>
      )}

      {/* Evidence Hashes */}
      <div className="bg-[#111118] rounded-xl p-6 border border-[#1e1e2e] mb-4">
        <h2 className="font-semibold text-[#f0f0f5] mb-4">Evidence Integrity</h2>
        <div className="space-y-3">
          <HashChip hash={receipt.evidenceHash} valid={hashValid} label="Evidence Hash (SHA-256 of preimage)" />
          <HashChip hash={receipt.contentHashAtDecision} label="Content Hash at Decision" />
        </div>
      </div>

      {/* Policy Receipt */}
      {receipt.policyProfile && (
        <div className="bg-[#111118] rounded-xl p-6 border border-[#1e1e2e] mb-4">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-semibold text-[#f0f0f5]">Policy Receipt</h2>
            <span className="text-xs font-mono px-2 py-0.5 rounded border border-[#6366f1]/40 text-[#6366f1] bg-[#6366f1]/10">
              {receipt.policyProfile}
            </span>
          </div>
          <div className="space-y-2">
            {receipt.policyRulesPassed && receipt.policyRulesPassed.length > 0 && (
              <div>
                <div className="text-[#8b8b9e] text-xs mb-1.5">Rules Passed</div>
                <div className="flex flex-wrap gap-1.5">
                  {receipt.policyRulesPassed.map((r) => (
                    <span key={r} className="text-xs font-mono px-2 py-0.5 rounded border border-[#00ff88]/30 text-[#00ff88] bg-[#00ff88]/5">
                      ✓ {r}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {receipt.policyRulesFailed && receipt.policyRulesFailed.length > 0 && (
              <div>
                <div className="text-[#8b8b9e] text-xs mb-1.5 mt-2">Rules Failed</div>
                <div className="flex flex-wrap gap-1.5">
                  {receipt.policyRulesFailed.map((r) => (
                    <span key={r} className="text-xs font-mono px-2 py-0.5 rounded border border-orange-700/40 text-orange-400 bg-orange-900/10">
                      ✗ {r}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {receipt.policyReason && (
              <div className="mt-3 text-xs text-orange-400 font-mono bg-orange-900/10 border border-orange-700/30 rounded-lg px-3 py-2">
                {receipt.policyReason}
              </div>
            )}
            {!receipt.policyReason && (
              <div className="mt-2 text-xs text-[#00ff88] font-mono">
                All policy rules passed — decision authorized by {receipt.policyProfile} policy.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Agent Signature (offline-verifiable) */}
      {receipt.agentSignature && (
        <details className="bg-[#111118] rounded-xl border border-[#00ff88]/20 mb-4 overflow-hidden group">
          <summary className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-[#0a0a0f]/40 transition-colors list-none">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-[#f0f0f5]">Agent Signature</h2>
              <span className="text-[#00ff88] text-xs font-mono">✓ offline-verifiable</span>
            </div>
            <span className="text-[#8b8b9e] text-xs font-mono group-open:hidden">Verify independently →</span>
            <span className="text-[#8b8b9e] text-xs font-mono hidden group-open:inline">▲ collapse</span>
          </summary>
          <div className="px-6 pb-6 space-y-3">
            <p className="text-[#8b8b9e] text-xs leading-relaxed">
              EIP-191 personal_sign of the evidence hash, signed by agent wallet.
              Copy the snippet below and paste it into any ethers.js console to verify without trusting CitePay.
            </p>
            <div className="bg-[#0a0a0f] rounded-lg p-4 font-mono text-xs text-[#00ff88] border border-[#1e1e2e] overflow-x-auto">
              <div className="text-[#4a4a5e] mb-1">{"// Paste in any Node.js / browser console"}</div>
              <div className="break-all whitespace-pre-wrap">{`const { ethers } = require("ethers");
ethers.verifyMessage(
  "${receipt.evidenceHash}",
  "${receipt.agentSignature}"
);
// Expected: "${receipt.agentAddress}"`}</div>
            </div>
          </div>
        </details>
      )}

      {/* Score Breakdown */}
      <div className="bg-[#111118] rounded-xl p-6 border border-[#1e1e2e] mb-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-[#f0f0f5]">Score Breakdown</h2>
          <div>
            <span className="text-[#8b8b9e] text-sm">Total: </span>
            <span className="text-2xl font-bold text-[#f0f0f5] font-mono">{receipt.scores.total}</span>
          </div>
        </div>
        <div className="space-y-3">
          <ScoreBar label="Relevance" value={receipt.scores.relevance} max={100} />
          <ScoreBar label="Price Score" value={receipt.scores.price} max={100} />
          <ScoreBar label="Bond Score" value={receipt.scores.bond} max={20} />
          <ScoreBar label="Reputation Score" value={receipt.scores.reputation} max={30} />
        </div>
      </div>

      {/* Evidence Preimage (collapsible) */}
      <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] mb-4 overflow-hidden">
        <button
          onClick={() => setPreimageOpen((o) => !o)}
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-[#0a0a0f]/60 transition-colors"
        >
          <h2 className="font-semibold text-[#f0f0f5]">Evidence Preimage</h2>
          <span className="text-[#8b8b9e] text-sm">{preimageOpen ? "▲ hide" : "▼ show"}</span>
        </button>
        {preimageOpen && (
          <div className="px-6 pb-6">
            <div className="bg-[#0a0a0f] rounded-lg p-4 font-mono text-xs text-[#00ff88] overflow-x-auto border border-[#1e1e2e]">
              <pre>{JSON.stringify(p, null, 2)}</pre>
            </div>
            <p className="mt-3 text-xs text-[#8b8b9e]">
              SHA-256 of this JSON (deterministic serialization) = evidence hash above.
            </p>
          </div>
        )}
      </div>

      {/* Share Card (PAY only) */}
      {isPay && (
        <div className="bg-[#111118] rounded-xl p-6 border border-[#6366f1]/30 mb-4">
          <h2 className="font-semibold mb-4 text-[#f0f0f5]">Creator Share Card</h2>
          <div className="bg-[#0a0a0f] rounded-lg p-4 font-mono text-sm text-[#f0f0f5] mb-4 whitespace-pre-wrap border border-[#1e1e2e]">
{`An AI cited my work and paid me USDC.

Source: ${receipt.sourceTitle}
Paid: $${(receipt.amountPaid / 1_000_000).toFixed(4)} USDC
Reason: ${receipt.reason}
Receipt: /receipt/${receipt.id}

Powered by CitePay Markets`}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleShare("copy")}
              className="bg-[#6366f1] hover:bg-indigo-500 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
            >
              {shared ? "✓ Copied" : "Copy Link"}
            </button>
            <button
              onClick={() => handleShare("x")}
              className="bg-[#0a0a0f] hover:bg-[#111118] border border-[#1e1e2e] text-[#f0f0f5] font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
            >
              Share on X
            </button>
            <button
              onClick={() => handleShare("farcaster")}
              className="bg-purple-700 hover:bg-purple-600 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
            >
              Farcaster
            </button>
            <button
              onClick={() => handleShare("discord")}
              className="bg-indigo-800 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
            >
              Discord
            </button>
          </div>
        </div>
      )}

      {/* Challenge */}
      {isPay && !receipt.challenged && (
        <div className="bg-[#111118] rounded-xl p-5 border border-[#1e1e2e] text-xs text-[#8b8b9e]">
          <strong className="text-[#f0f0f5]">Content Integrity Challenge:</strong>{" "}
          If the creator updated this source after payment, the content hash will differ.{" "}
          <button
            onClick={async () => {
              const res = await fetch(`/api/challenge/${receipt.id}`, { method: "POST" });
              const d = await res.json();
              if (res.ok) alert(`Challenge succeeded: ${d.message}`);
              else alert(`Challenge failed: ${d.error}`);
            }}
            className="text-[#6366f1] hover:text-indigo-300 underline cursor-pointer transition-colors"
          >
            Submit objective challenge →
          </button>
        </div>
      )}
    </PageShell>
  );
}
