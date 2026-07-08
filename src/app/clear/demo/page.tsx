"use client";

import { useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { Badge, DataRow, PageShell, ProofPanel, StatCard } from "@/components/ui";
import type { ClaimClearance, ClearanceCertificate, ClearMandateConfig } from "@/lib/clear/types";

type RunState = "idle" | "running" | "done" | "error";
type RunMode = "full" | "adversarial";

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
  const [mode, setMode] = useState<RunMode>("full");
  const [result, setResult] = useState<DemoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runDemo(nextMode: RunMode = "full") {
    setMode(nextMode);
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

  const unsupported = result?.clearances.find((clearance) => clearance.decision === "UNSUPPORTED");
  const cleared = result?.clearances.find((clearance) => clearance.decision === "CLEARED");

  return (
    <PageShell maxWidth="max-w-6xl">
      <BackButton />

      <div className="mt-5 mb-8">
        <div className="text-xs font-mono uppercase tracking-[0.24em] text-[#6366f1] mb-3">CitePay Clear</div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
              CitePay blocks bad citations before paying good ones
            </h1>
            <p className="text-[var(--text-secondary)] max-w-2xl mt-3">
              An AI tries to cite a quote that does not exist. CitePay catches it with deterministic span verification, pays nothing, then clears only the supported licensed claim.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
            <button
              onClick={() => runDemo("adversarial")}
              disabled={state === "running"}
              className="rounded-lg bg-red-300 text-[#240a0a] px-5 py-3 text-sm font-semibold disabled:opacity-60"
            >
              {state === "running" && mode === "adversarial" ? "Testing fake quote..." : "Run fake quote test"}
            </button>
            <button
              onClick={() => runDemo("full")}
              disabled={state === "running"}
              className="rounded-lg bg-[#f0f0f5] text-[#0a0a0f] px-5 py-3 text-sm font-semibold disabled:opacity-60"
            >
              {state === "running" && mode === "full" ? "Running clearance..." : "Run full proof"}
            </button>
          </div>
        </div>
      </div>

      <section className="mb-6 rounded-xl border border-red-700/50 bg-red-950/25 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-mono uppercase tracking-[0.2em] text-red-300">Adversarial guarantee</div>
            <p className="mt-2 max-w-3xl text-sm text-red-100">
              A normal paid-citation system may have paid this because the AI score is high. CitePay Clear refuses because the exact quote is absent from the source.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg border border-red-700/40 bg-black/20 px-3 py-2">
              <div className="font-mono text-lg text-red-200">96</div>
              <div className="text-red-200/70">AI score</div>
            </div>
            <div className="rounded-lg border border-red-700/40 bg-black/20 px-3 py-2">
              <div className="font-mono text-lg text-red-200">no</div>
              <div className="text-red-200/70">quote found</div>
            </div>
            <div className="rounded-lg border border-red-700/40 bg-black/20 px-3 py-2">
              <div className="font-mono text-lg text-red-200">$0</div>
              <div className="text-red-200/70">paid</div>
            </div>
          </div>
        </div>
      </section>

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
          {unsupported && (
            <section className="rounded-xl border border-red-700/60 bg-red-950/30 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge type="BLOCKED_BY_POLICY" label="fake quote blocked" />
                    <span className="rounded border border-red-700/50 bg-black/20 px-2 py-0.5 text-xs font-mono text-red-200">
                      support score {unsupported.supportScore}/100
                    </span>
                    <span className="rounded border border-red-700/50 bg-black/20 px-2 py-0.5 text-xs font-mono text-red-200">
                      paid {micro(unsupported.amountPaidMicro)}
                    </span>
                  </div>
                  <h2 className="text-xl font-semibold text-red-100">
                    CitePay refused the confident but fabricated citation.
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm text-red-100/80">
                    The AI advisory score was high, but deterministic quote verification returned no span. That failure alone was enough to block settlement.
                  </p>
                </div>
                <Link
                  href={`/clearance/${unsupported.clearanceId}`}
                  className="rounded-lg border border-red-400/40 px-4 py-2 text-sm font-mono text-red-200 hover:bg-red-300/10"
                >
                  Open refusal receipt
                </Link>
              </div>
              <blockquote className="mt-4 rounded-lg border border-red-800/60 bg-[#0a0a0f] p-4 text-sm text-red-100">
                &ldquo;{unsupported.quoteText}&rdquo;
              </blockquote>
            </section>
          )}

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
              <p className="mb-4 text-xs text-[#8b8b9e]">
                The agent evaluates multiple candidate source outcomes: fake quote, wrong license, over price cap, and cleared payment.
              </p>
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
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-mono">
                      <span className={clearance.quoteVerified ? "text-[#34D399]" : "text-red-300"}>
                        quote: {clearance.quoteVerified ? "verified" : "missing"}
                      </span>
                      <span className="text-[#8b8b9e]">score: {clearance.supportScore}/100</span>
                      <span className={clearance.amountPaidMicro > 0 ? "text-[#34D399]" : "text-[#8b8b9e]"}>
                        paid: {micro(clearance.amountPaidMicro)}
                      </span>
                    </div>
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
                  <h2 className="font-semibold text-[#f0f0f5]">Answer-Level Clearance Certificate</h2>
                  <Badge type="PROOF" label="Issued" />
                </div>
                <p className="text-sm text-[#8b8b9e] max-w-2xl">
                  One artifact binds the answer to every claim decision: authorized, quote-supported, licensed, paid, blocked, unsupported, and hash-committed.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {cleared && (
                  <Link href={`/clearance/${cleared.clearanceId}`} className="rounded-lg border border-[#34D399]/40 px-4 py-2 text-sm text-[#34D399] hover:bg-[#34D399]/10">
                    Open paid receipt
                  </Link>
                )}
                {unsupported && (
                  <Link href={`/clearance/${unsupported.clearanceId}`} className="rounded-lg border border-red-400/40 px-4 py-2 text-sm text-red-200 hover:bg-red-300/10">
                    Open refusal receipt
                  </Link>
                )}
              </div>
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
