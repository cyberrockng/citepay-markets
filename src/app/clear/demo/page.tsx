"use client";

import { useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { Badge, DataRow, PageShell, ProofPanel, StatCard } from "@/components/ui";
import type { ClaimClearance, ClearanceCertificate, ClearMandateConfig } from "@/lib/clear/types";

type RunState = "idle" | "running" | "done" | "error";

interface DemoEvent {
  label: string;
  status: "done" | "blocked";
  detail: string;
  clearanceId?: string;
}

interface DemoResponse {
  mandate: ClearMandateConfig;
  answer: string;
  answerHash: string;
  certificate: ClearanceCertificate;
  clearances: ClaimClearance[];
  events: DemoEvent[];
  primaryClearanceUrl: string;
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

export default function ClearDemoPage() {
  const [state, setState] = useState<RunState>("idle");
  const [result, setResult] = useState<DemoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runDemo() {
    setState("running");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/clear/demo-run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Clear demo failed");
      setResult(data as DemoResponse);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected demo error");
      setState("error");
    }
  }

  return (
    <PageShell maxWidth="max-w-6xl">
      <BackButton />

      <div className="mt-5 mb-8">
        <div className="text-xs font-mono uppercase tracking-[0.24em] text-[#6366f1] mb-3">CitePay Clear</div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
              Pre-payment citation clearance
            </h1>
            <p className="text-[var(--text-secondary)] max-w-2xl mt-3">
              This demo pays only after a claim passes license, exact-quote, policy, and budget checks. Failed claims are refused before money moves.
            </p>
          </div>
          <button
            onClick={runDemo}
            disabled={state === "running"}
            className="rounded-lg bg-[#f0f0f5] text-[#0a0a0f] px-5 py-3 text-sm font-semibold disabled:opacity-60"
          >
            {state === "running" ? "Running clearance..." : "Run 90-second proof"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {!result && (
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Proof target" value="4 claims" accent="text-[#f0f0f5]" sub="clear, license block, unsupported, over cap" />
          <StatCard label="Payment rule" value="After checks" accent="text-[#34D399]" sub="no quote, no payment" />
          <StatCard label="Surface" value="2 pages" accent="text-[#6366f1]" sub="demo + receipt" />
          <StatCard label="Contract posture" value="No redeploy" accent="text-yellow-300" sub="existing proof preserved" />
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Cleared" value={result.certificate.clearedCount} accent="text-[#34D399]" />
            <StatCard label="Blocked" value={result.certificate.blockedCount} accent="text-orange-300" />
            <StatCard label="Unsupported" value={result.certificate.unsupportedCount} accent="text-red-300" />
            <StatCard label="Paid" value={micro(result.certificate.totalPaidMicro)} accent="text-[#34D399]" />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr_0.9fr]">
            <section className="rounded-xl border border-white/10 bg-[var(--surface)] p-5">
              <h2 className="font-semibold mb-4">Timeline</h2>
              <div className="space-y-3">
                {result.events.map((event, idx) => (
                  <div key={`${event.label}-${idx}`} className="flex gap-3">
                    <div className={`mt-1 h-3 w-3 rounded-full ${event.status === "done" ? "bg-[#34D399]" : "bg-orange-400"}`} />
                    <div>
                      <div className="text-sm font-medium text-[#f0f0f5]">{event.label}</div>
                      <div className="text-xs text-[#8b8b9e]">{event.detail}</div>
                      {event.clearanceId && (
                        <Link href={`/clearance/${event.clearanceId}`} className="text-xs font-mono text-[#6366f1] hover:text-indigo-300">
                          open receipt ↗
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-[var(--surface)] p-5">
              <h2 className="font-semibold mb-4">Claim Decisions</h2>
              <div className="space-y-3">
                {result.clearances.map((clearance) => (
                  <Link
                    key={clearance.clearanceId}
                    href={`/clearance/${clearance.clearanceId}`}
                    className="block rounded-lg border border-white/10 bg-[#0a0a0f] p-4 hover:border-[#6366f1]/50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className={`rounded border px-2 py-0.5 text-xs font-mono ${decisionClass(clearance.decision)}`}>
                        {clearance.decision}
                      </span>
                      <span className="text-xs font-mono text-[#8b8b9e]">{micro(clearance.amountPaidMicro)}</span>
                    </div>
                    <p className="text-sm text-[#f0f0f5]">{clearance.claimText}</p>
                    <p className="mt-2 text-xs text-[#8b8b9e] line-clamp-2">&ldquo;{clearance.quoteText}&rdquo;</p>
                  </Link>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-[var(--surface)] p-5">
              <h2 className="font-semibold mb-4">Mandate</h2>
              <div className="grid gap-3">
                <DataRow label="Policy" value={result.mandate.policyName} />
                <DataRow label="Claim cap" value={micro(result.mandate.maxPricePerClaimMicro)} mono />
                <DataRow label="Budget cap" value={micro(result.mandate.budgetCapMicro)} mono />
                <DataRow label="Required license" value={result.mandate.requiredLicenseClass ?? "none"} />
                <DataRow label="Quote span required" value={result.mandate.requireQuoteSpan ? "yes" : "no"} />
                <DataRow label="On-chain mandate" value={result.mandate.onChainMandateId ? `#${result.mandate.onChainMandateId}` : "not configured"} mono />
              </div>
            </section>
          </div>

          <section className="rounded-xl border border-[#34D399]/30 bg-[#34D399]/5 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="font-semibold text-[#f0f0f5]">Clearance Certificate</h2>
                  <Badge type="PROOF" label="Issued" />
                </div>
                <p className="text-sm text-[#8b8b9e] max-w-2xl">
                  One answer-level artifact summarizes cleared, blocked, unsupported, paid, and hash-committed claim decisions.
                </p>
              </div>
              <Link href={result.primaryClearanceUrl} className="rounded-lg border border-[#34D399]/40 px-4 py-2 text-sm text-[#34D399] hover:bg-[#34D399]/10">
                Open primary receipt
              </Link>
            </div>
            <div className="mt-4">
              <ProofPanel label="Certificate Hash" hash={result.certificate.certificateHash} />
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-[var(--surface)] p-5">
            <h2 className="font-semibold text-[#f0f0f5] mb-2">Try it on an answer CitePay didn&apos;t generate</h2>
            <p className="text-sm text-[#8b8b9e] max-w-2xl mb-3">
              Paste any AI answer and CitePay Clear will audit it for citations that should have been paid — same deterministic checks, compute-only.
            </p>
            <Link href="/recover" className="text-sm font-mono text-[#6366f1] hover:text-indigo-300">
              Audit an external answer →
            </Link>
          </section>
        </div>
      )}
    </PageShell>
  );
}
