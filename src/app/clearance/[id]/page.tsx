"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { Badge, DataRow, PageShell, ProofPanel, ScoreBar } from "@/components/ui";
import type { ClaimClearance, ClearanceCertificate } from "@/lib/clear/types";
import type { Receipt } from "@/types";

interface ClearanceResponse {
  clearance: ClaimClearance;
  certificate: ClearanceCertificate | null;
  certificateClearances: ClaimClearance[];
  underlyingReceipt: Receipt | null;
}

function micro(v: number) {
  return `$${(v / 1_000_000).toFixed(6)} USDC`;
}

function decisionClass(decision: string) {
  if (decision === "CLEARED") return "border-[#34D399]/40 bg-[#34D399]/10 text-[#34D399]";
  if (decision === "UNSUPPORTED") return "border-red-700 bg-red-900/20 text-red-300";
  if (decision === "OVER_CAP") return "border-yellow-700 bg-yellow-900/20 text-yellow-300";
  return "border-orange-700 bg-orange-900/20 text-orange-300";
}

export default function ClearanceReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<ClearanceResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/clear/${id}`)
      .then((res) => res.json())
      .then((json) => setData(json as ClearanceResponse))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <PageShell maxWidth="max-w-4xl">
        <div className="text-[#8b8b9e] animate-pulse">Loading clearance receipt...</div>
      </PageShell>
    );
  }

  if (!data?.clearance) {
    return (
      <PageShell maxWidth="max-w-4xl">
        <BackButton />
        <div className="mt-8 rounded-xl border border-red-800 bg-red-950/30 p-5 text-red-200">Clearance not found.</div>
      </PageShell>
    );
  }

  const { clearance, certificate, certificateClearances, underlyingReceipt } = data;
  const trace = (() => {
    try {
      return JSON.parse(clearance.policyTrace) as Array<{ rule: string; passed: boolean; detail: string }>;
    } catch {
      return [];
    }
  })();

  return (
    <PageShell maxWidth="max-w-4xl">
      <BackButton />
      <div className="mt-5 mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-mono uppercase tracking-[0.24em] text-[#6366f1] mb-2">Clearance Receipt</div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#f0f0f5]">
            Claim #{clearance.clearanceId.slice(0, 8)}
          </h1>
        </div>
        <span className={`w-fit rounded border px-3 py-1 text-sm font-mono ${decisionClass(clearance.decision)}`}>
          {clearance.decision}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-5">
        <div className="rounded-xl border border-white/10 bg-[var(--surface)] p-5">
          <div className="text-2xl font-bold font-mono text-[#34D399]">{micro(clearance.amountPaidMicro)}</div>
          <div className="text-xs text-[#8b8b9e] mt-1">Amount paid</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[var(--surface)] p-5">
          <div className="text-2xl font-bold font-mono text-[#f0f0f5]">{clearance.quoteVerified ? "yes" : "no"}</div>
          <div className="text-xs text-[#8b8b9e] mt-1">Exact quote verified</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[var(--surface)] p-5">
          <div className="text-2xl font-bold font-mono text-[#6366f1]">{clearance.supportScore}/100</div>
          <div className="text-xs text-[#8b8b9e] mt-1">Advisory support score</div>
        </div>
      </div>

      <section className="rounded-xl border border-white/10 bg-[var(--surface)] p-6 mb-5">
        <h2 className="font-semibold mb-4">Claim And Evidence</h2>
        <div className="space-y-4">
          <DataRow label="Claim" value={clearance.claimText} />
          <div>
            <div className="text-[#8b8b9e] text-xs mb-1">Exact Quote</div>
            <blockquote className="rounded-lg border border-white/10 bg-[#0a0a0f] p-4 text-sm text-[#f0f0f5]">
              &ldquo;{clearance.quoteText}&rdquo;
            </blockquote>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <DataRow label="Quote Span" value={`${clearance.quoteStart} → ${clearance.quoteEnd}`} mono />
            <DataRow label="License" value={clearance.licenseClass ?? "none"} />
            <DataRow label="Local Source ID" value={clearance.sourceId} mono />
            <DataRow label="On-chain Source ID" value={clearance.onChainSourceId ? `#${clearance.onChainSourceId}` : "not anchored"} mono />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-[var(--surface)] p-6 mb-5">
        <h2 className="font-semibold mb-4">Policy Trace</h2>
        <div className="space-y-3">
          {trace.map((item) => (
            <div key={item.rule} className="rounded-lg border border-white/10 bg-[#0a0a0f] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs text-[#f0f0f5]">{item.rule}</span>
                <Badge type={item.passed ? "PROOF" : "BLOCKED_BY_POLICY"} label={item.passed ? "pass" : "fail"} size="xs" />
              </div>
              <p className="text-xs text-[#8b8b9e] mt-2">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-[#34D399]/25 bg-[#34D399]/5 p-6 mb-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold">Creator Payout</h2>
            <p className="mt-1 text-sm text-[#8b8b9e]">
              This panel shows what the creator earned from this claim-level clearance.
            </p>
          </div>
          <Badge
            type={clearance.amountPaidMicro > 0 ? "PROOF" : "BLOCKED_BY_POLICY"}
            label={clearance.amountPaidMicro > 0 ? "creator paid" : "no payment"}
            size="sm"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <DataRow label="Creator Wallet" value={underlyingReceipt?.creatorWallet ?? "not paid"} mono />
          <DataRow label="Source" value={underlyingReceipt?.sourceTitle ?? clearance.sourceId} />
          <DataRow label="Amount Due" value={micro(clearance.amountDueMicro)} mono accent="text-[#f0f0f5]" />
          <DataRow label="Amount Paid" value={micro(clearance.amountPaidMicro)} mono accent={clearance.amountPaidMicro > 0 ? "text-[#34D399]" : "text-[#8b8b9e]"} />
          <DataRow label="Payment Status" value={underlyingReceipt?.paymentStatus ?? (clearance.amountPaidMicro > 0 ? "receipt unavailable" : "not executed")} mono />
          <DataRow label="Underlying Receipt" value={clearance.underlyingCitationReceiptId ?? "none"} mono />
        </div>
        <div className="mt-4 rounded-lg border border-white/10 bg-[#0a0a0f] p-4">
          <div className="text-xs font-mono uppercase tracking-[0.18em] text-[#34D399] mb-2">Why this creator earned</div>
          <p className="text-sm text-[#d6d6e7]">
            {clearance.decision === "CLEARED"
              ? "The quote span was found in the source, the license matched the mandate, policy checks passed, and the claim stayed within budget. Payment executed only after those gates passed."
              : "This claim did not clear every required gate, so CitePay did not move creator funds for it."}
          </p>
        </div>
        {underlyingReceipt?.txHash && (
          <div className="mt-4">
            <ProofPanel
              label="Creator USDC Transfer"
              baseScanTx={underlyingReceipt.txHash}
              baseScanTxLabel={underlyingReceipt.txHash.slice(0, 20) + "…"}
            />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-white/10 bg-[var(--surface)] p-6 mb-5">
        <h2 className="font-semibold mb-4">Integrity</h2>
        <div className="space-y-3">
          <ProofPanel label="Claim Hash" hash={clearance.claimHash} />
          <ProofPanel label="Receipt Hash" hash={clearance.receiptHash} />
          {certificate && <ProofPanel label="Certificate Hash" hash={certificate.certificateHash} />}
        </div>
      </section>

      {clearance.underlyingCitationReceiptId && (
        <section className="rounded-xl border border-[#34D399]/30 bg-[#34D399]/5 p-6 mb-5">
          <h2 className="font-semibold mb-3">Payment Receipt</h2>
          <p className="text-sm text-[#8b8b9e] mb-3">
            Payment was executed only after clearance checks passed.
          </p>
          <Link href={`/receipt/${clearance.underlyingCitationReceiptId}`} className="text-sm font-mono text-[#34D399] hover:text-green-200">
            Open underlying CitePay receipt ↗
          </Link>
        </section>
      )}

      {certificate && (
        <section className="rounded-xl border border-white/10 bg-[var(--surface)] p-6">
          <h2 className="font-semibold mb-4">Answer-Level Certificate</h2>
          <div className="grid gap-4 sm:grid-cols-2 mb-5">
            <DataRow label="Certificate ID" value={certificate.certificateId} mono />
            <DataRow label="Answer Hash" value={certificate.answerHash} mono />
            <DataRow label="Total Paid" value={micro(certificate.totalPaidMicro)} mono />
            <DataRow label="On-chain Mandate" value={certificate.onChainMandateId ? `#${certificate.onChainMandateId}` : "not configured"} mono />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <ScoreBar label="Cleared" value={certificate.clearedCount} max={Math.max(1, certificateClearances.length)} />
            <ScoreBar label="Blocked" value={certificate.blockedCount} max={Math.max(1, certificateClearances.length)} />
            <ScoreBar label="Unsupported" value={certificate.unsupportedCount} max={Math.max(1, certificateClearances.length)} />
          </div>
        </section>
      )}
    </PageShell>
  );
}
