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
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    verdict: "VERIFIED" | "CHANGED" | "FETCH_FAILED";
    verdictDetail: string;
    liveHash: string;
    contentLength: number;
    fetchedAt: string;
    challengeable: boolean;
    fetchError?: string;
  } | null>(null);
  const [challenging, setChallenging] = useState(false);

  useEffect(() => {
    fetch(`/api/receipt/${id}`)
      .then((r) => r.json())
      .then((d) => { setReceipt(d.receipt); setHashValid(d.hashValid); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  function getShareText() {
    if (!receipt) return "";
    const amount = `$${(receipt.amountPaid / 1_000_000).toFixed(4)} USDC`;
    const vcs = receipt.contributionWeight != null ? ` (${Math.round(receipt.contributionWeight * 100)}% of the answer)` : "";
    return `An AI agent just cited my work and paid me ${amount}${vcs}.\n\nSource: ${receipt.sourceTitle}\nVerified on-chain: ${window.location.href}\n\n→ Register your content at citepay-markets.vercel.app/join`;
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
        <BackButton />
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">Receipt #{receipt.id.slice(0, 8)}</h1>
          <span className={`px-3 py-1 rounded border font-mono text-sm ${decisionStyle(receipt.decision)}`}>
            {receipt.decision}
          </span>
          {receipt.challenged && <Badge type="CHALLENGED" label="CHALLENGED" />}
        </div>
      </div>

      {/* Receipt Progress Stepper */}
      <div className="bg-[var(--surface)] rounded-xl p-5 border border-white/10 mb-4">
        <div className="flex items-center gap-0">
          {STEPS.map((step, i) => (
            <div key={step.label} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1 flex-1">
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-colors ${
                  step.done    ? "border-[#34D399] bg-[#34D399]/10 text-[#34D399]"
                  : step.partial ? "border-yellow-400 bg-yellow-400/10 text-yellow-400"
                  : "border-[#1e1e2e] bg-[#0a0a0f] text-[#4a4a5e]"
                }`}>
                  {step.done ? "✓" : step.partial ? "~" : i + 1}
                </div>
                <span className={`text-[10px] text-center leading-tight hidden sm:block ${
                  step.done ? "text-[#34D399]" : step.partial ? "text-yellow-400" : "text-[#4a4a5e]"
                }`}>{step.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-px flex-1 -mt-4 sm:-mt-3 mx-1 ${step.done ? "bg-[#34D399]/30" : "bg-[#1e1e2e]"}`} />
              )}
            </div>
          ))}
        </div>
        {/* Mobile labels */}
        <div className="flex sm:hidden mt-2 text-[10px] text-[#4a4a5e]">
          {STEPS.map((step) => (
            <span key={step.label} className={`flex-1 text-center ${step.done ? "text-[#34D399]" : step.partial ? "text-yellow-400" : ""}`}>
              {step.label.split(" ")[0]}
            </span>
          ))}
        </div>
      </div>

      {/* VCS Badge — Verifiable Contribution Score */}
      {isPay && receipt.contributionWeight != null && (
        <div className="mb-4">
          {(() => {
            const w = receipt.contributionWeight;
            const pct = Math.round(w * 100);
            const isPrimary  = pct >= 50;
            const isSupport  = pct >= 20 && pct < 50;
            const role       = isPrimary ? "Primary Source" : isSupport ? "Supporting Source" : "Peripheral Source";
            const roleColor  = isPrimary ? "text-[#34D399] border-[#34D399]/40 bg-[#34D399]/5"
                             : isSupport ? "text-[#6366f1] border-[#6366f1]/40 bg-[#6366f1]/5"
                             : "text-[#4a4a5e] border-[#1e1e2e] bg-[#0a0a0f]";
            const barColor   = isPrimary ? "bg-[#34D399]" : isSupport ? "bg-[#6366f1]" : "bg-[#2e2e3e]";
            return (
              <div className={`rounded-xl p-5 border ${roleColor}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-[10px] font-mono tracking-widest opacity-70 mb-1">VERIFIABLE CONTRIBUTION SCORE</div>
                    <div className="text-lg font-bold">{role}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold font-mono">{pct}%</div>
                    <div className="text-[10px] opacity-70">of answer</div>
                  </div>
                </div>
                <div className="h-2 bg-black/20 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between mt-2 text-[10px] opacity-70">
                  <span>Based on inline citation count in answer · all sources sum to 100%</span>
                  <span className="font-mono">${(receipt.amountPaid / 1e6).toFixed(4)} USDC paid</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

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
            accent={isPay ? "text-[#34D399]" : "text-[#8b8b9e]"}
            mono={isPay}
          />
          {isPay && receipt.contributionWeight != null && (
            <DataRow
              label="Contribution Weight"
              value={`${(receipt.contributionWeight * 100).toFixed(1)}% — post-synthesis VCS`}
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
        <div className={`rounded-xl p-5 border mb-4 ${receipt.paymentStatus === "confirmed" ? "bg-[#34D399]/5 border-[#34D399]/30" : "bg-[#111118] border-[#1e1e2e]"}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-[#8b8b9e] uppercase tracking-widest">USDC Payout</span>
            {receipt.paymentStatus === "confirmed"
              ? <span className="text-[#34D399] text-xs font-mono">✓ confirmed on-chain</span>
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
        <div className={`bg-[#111118] rounded-xl p-6 border mb-4 ${receipt.onChainTxHash ? "border-[#34D399]/30" : "border-[#1e1e2e]"}`}>
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
                baseScanTxLabel="View on ArcScan ↗"
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
                    <span key={r} className="text-xs font-mono px-2 py-0.5 rounded border border-[#34D399]/30 text-[#34D399] bg-[#34D399]/5">
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
              <div className="mt-2 text-xs text-[#34D399] font-mono">
                All policy rules passed — decision authorized by {receipt.policyProfile} policy.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Agent Signature (offline-verifiable) */}
      {receipt.agentSignature && (
        <details className="bg-[#111118] rounded-xl border border-[#34D399]/20 mb-4 overflow-hidden group">
          <summary className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-[#0a0a0f]/40 transition-colors list-none">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-[#f0f0f5]">Agent Signature</h2>
              <span className="text-[#34D399] text-xs font-mono">✓ offline-verifiable</span>
            </div>
            <span className="text-[#8b8b9e] text-xs font-mono group-open:hidden">Verify independently →</span>
            <span className="text-[#8b8b9e] text-xs font-mono hidden group-open:inline">▲ collapse</span>
          </summary>
          <div className="px-6 pb-6 space-y-3">
            <p className="text-[#8b8b9e] text-xs leading-relaxed">
              EIP-191 personal_sign of the evidence hash, signed by agent wallet.
              Copy the snippet below and paste it into any ethers.js console to verify without trusting CitePay.
            </p>
            <div className="bg-[#0a0a0f] rounded-lg p-4 font-mono text-xs text-[#34D399] border border-[#1e1e2e] overflow-x-auto">
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
            <div className="bg-[#0a0a0f] rounded-lg p-4 font-mono text-xs text-[#34D399] overflow-x-auto border border-[#1e1e2e]">
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
        <div className="bg-gradient-to-br from-[#111118] to-[#0d0d14] rounded-2xl border border-[#34D399]/20 mb-4 overflow-hidden">
          {/* Card preview image */}
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/og/receipt/${receipt.id}`}
              alt="Share card preview"
              className="w-full rounded-t-2xl"
              style={{ aspectRatio: "1200/630", objectFit: "cover" }}
            />
            <div className="absolute inset-0 rounded-t-2xl ring-1 ring-inset ring-white/5" />
          </div>

          {/* Share actions */}
          <div className="p-6">
            <p className="text-[#f0f0f5] font-semibold mb-1">Share your citation receipt</p>
            <p className="text-[#8b8b9e] text-sm mb-5">
              Every share drives new creators to register — and more registered sources means more citations for you.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleShare("x")}
                className="flex items-center gap-2 bg-[#f0f0f5] hover:bg-white text-black font-bold px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                <span>𝕏</span> Post on X
              </button>
              <button
                onClick={() => handleShare("farcaster")}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-bold px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                ↗ Farcaster
              </button>
              <button
                onClick={() => handleShare("discord")}
                className="flex items-center gap-2 bg-[#5865f2] hover:bg-[#4752c4] text-white font-bold px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                Discord
              </button>
              <button
                onClick={() => handleShare("copy")}
                className="flex items-center gap-2 bg-[#1e1e2e] hover:bg-[#2a2a3e] border border-[#2e2e3e] text-[#f0f0f5] font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm ml-auto"
              >
                {shared ? "✓ Copied" : "Copy text"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purpose Code */}
      {receipt.purposeCode && (
        <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl p-5 mb-4 font-mono">
          <div className="text-[10px] text-[#4a4a5e] tracking-widest mb-3">PAYMENT PURPOSE</div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-[#6366f1]">{receipt.purposeCode}</span>
            <span className="text-xs text-[#8b8b9e]">·</span>
            <span className="text-xs text-[#8b8b9e]">
              {receipt.purposeCode === "CITE"         ? "Citation micropayment to creator"
               : receipt.purposeCode === "REFUSE"     ? "Relevance below threshold — no payment"
               : receipt.purposeCode === "BLOCKED"    ? "Policy enforcement — spend cap or bond requirement"
               : receipt.purposeCode === "AGENT_REWARD" ? "Agent coordination reward"
               : receipt.purposeCode === "BOND_SLASH" ? "Challenge resolved — content modified after payment"
               : receipt.purposeCode}
            </span>
          </div>
        </div>
      )}

      {/* Content Integrity Proof */}
      {receipt.contentHashAtDecision && (
        <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl p-5 mb-4">
          <div className="text-[10px] font-mono text-[#4a4a5e] tracking-widest mb-3">CONTENT INTEGRITY PROOF</div>
          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-start justify-between gap-4">
              <span className="text-[#8b8b9e] flex-shrink-0">Hash at citation</span>
              <span className="text-[#34D399] break-all text-right">{receipt.contentHashAtDecision}</span>
            </div>
            {verifyResult && verifyResult.verdict !== "FETCH_FAILED" && (
              <div className="flex items-start justify-between gap-4">
                <span className="text-[#8b8b9e] flex-shrink-0">Live hash</span>
                <span className={`break-all text-right ${verifyResult.verdict === "VERIFIED" ? "text-[#34D399]" : "text-orange-400"}`}>
                  {verifyResult.liveHash}
                </span>
              </div>
            )}
          </div>

          {/* Static state */}
          {receipt.challenged && !verifyResult && (
            <div className="mt-3 flex items-start gap-2 bg-orange-900/10 border border-orange-700/30 rounded-lg px-3 py-2 text-xs">
              <span className="text-orange-400 flex-shrink-0">⚠</span>
              <span className="text-orange-400">Challenge resolved — content was modified after payment. Creator reputation slashed.</span>
            </div>
          )}
          {!receipt.challenged && !verifyResult && (
            <div className="mt-3 flex items-start gap-2 bg-[#34D399]/5 border border-[#34D399]/20 rounded-lg px-3 py-2 text-xs">
              <span className="text-[#34D399] flex-shrink-0">✓</span>
              <span className="text-[#8b8b9e]">Content hash recorded at citation time. Click verify to check current content.</span>
            </div>
          )}

          {/* Live verification result */}
          {verifyResult && (
            <div className={`mt-3 rounded-lg px-3 py-2 text-xs border ${
              verifyResult.verdict === "VERIFIED"
                ? "bg-[#34D399]/5 border-[#34D399]/30"
                : verifyResult.verdict === "CHANGED"
                ? "bg-orange-900/10 border-orange-700/30"
                : "bg-yellow-900/10 border-yellow-700/30"
            }`}>
              <div className={`font-bold font-mono mb-1 ${
                verifyResult.verdict === "VERIFIED" ? "text-[#34D399]"
                : verifyResult.verdict === "CHANGED" ? "text-orange-400"
                : "text-yellow-400"
              }`}>
                {verifyResult.verdict === "VERIFIED" ? "✓ VERIFIED"
                 : verifyResult.verdict === "CHANGED" ? "⚠ CONTENT CHANGED"
                 : "⚡ FETCH FAILED"}
              </div>
              <div className="text-[#8b8b9e]">{verifyResult.verdictDetail}</div>
              {verifyResult.contentLength > 0 && (
                <div className="text-[#4a4a5e] mt-1">
                  {verifyResult.contentLength.toLocaleString()} chars · verified {new Date(verifyResult.fetchedAt).toLocaleTimeString()}
                </div>
              )}
              {verifyResult.fetchError && (
                <div className="text-yellow-400 mt-1">{verifyResult.fetchError}</div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-3 flex gap-3 flex-wrap">
            {isPay && !receipt.challenged && (
              <button
                onClick={async () => {
                  setVerifying(true);
                  setVerifyResult(null);
                  try {
                    const res = await fetch(`/api/verify/${receipt.id}`);
                    const d = await res.json();
                    setVerifyResult(d);
                  } catch {
                    setVerifyResult({ verdict: "FETCH_FAILED", verdictDetail: "Request failed", liveHash: "", contentLength: 0, fetchedAt: new Date().toISOString(), challengeable: false });
                  } finally {
                    setVerifying(false);
                  }
                }}
                disabled={verifying}
                className="text-[10px] font-mono text-[#6366f1] hover:text-indigo-400 underline transition-colors disabled:opacity-50"
              >
                {verifying ? "Verifying…" : "Verify now →"}
              </button>
            )}
            {verifyResult?.challengeable && (
              <button
                onClick={async () => {
                  setChallenging(true);
                  try {
                    const res = await fetch(`/api/challenge/${receipt.id}`, { method: "POST" });
                    const d = await res.json();
                    if (res.ok) {
                      setVerifyResult((v) => v ? { ...v, challengeable: false } : v);
                      window.location.reload();
                    } else {
                      alert(`Challenge failed: ${d.error}`);
                    }
                  } finally {
                    setChallenging(false);
                  }
                }}
                disabled={challenging}
                className="text-[10px] font-mono text-orange-400 hover:text-orange-300 underline transition-colors disabled:opacity-50"
              >
                {challenging ? "Filing challenge…" : "File challenge →"}
              </button>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
