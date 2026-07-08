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

const VERIFIED_PROOFS = {
  paid: "/clearance/c9cfcd45-d8e5-4ead-b37b-b5dae2e5f4fa",
  refused: "/clearance/71239ecb-0d6a-4cd2-9616-78d5b3e981c1",
  recovery: "/recover",
};

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

  const unsupported = result?.clearances.find((clearance) => clearance.decision === "UNSUPPORTED");
  const cleared = result?.clearances.find((clearance) => clearance.decision === "CLEARED");
  const paidClaims = result?.clearances.filter((clearance) => clearance.amountPaidMicro > 0) ?? [];
  const blockedClaims = result?.clearances.filter((clearance) => clearance.amountPaidMicro === 0) ?? [];

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
            <p className="mt-3 max-w-2xl text-sm font-medium text-[#d6d6e7]">
              Access and payment systems prove an agent paid. CitePay Clear proves a specific claim deserved payment before money moved.
            </p>
          </div>
          <div>
            <button
              onClick={() => runDemo()}
              disabled={state === "running"}
              className="rounded-lg bg-[#f0f0f5] text-[#0a0a0f] px-5 py-3 text-sm font-semibold disabled:opacity-60"
            >
              {state === "running" ? "Running clearance proof..." : "Run clearance proof"}
            </button>
          </div>
        </div>
      </div>

      <section className="mb-6 rounded-xl border border-[#6366f1]/35 bg-[#6366f1]/5 p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#a5b4fc]">Clear Trust Center</div>
            <h2 className="mt-2 text-lg font-semibold text-[#f0f0f5]">Claim clearance, not just source access</h2>
            <p className="mt-2 max-w-3xl text-sm text-[#bfc0d4]">
              The judge path checks three things competitors often separate: pre-payment refusal, creator payout, and post-answer recovery for citations generated outside CitePay.
            </p>
          </div>
          <Badge type="PROOF" label="judge path" size="sm" />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Link href={unsupported ? `/clearance/${unsupported.clearanceId}` : VERIFIED_PROOFS.refused} className="rounded-lg border border-red-700/45 bg-red-950/20 p-4 transition-colors hover:border-red-300/70">
            <div className="text-xs font-mono uppercase tracking-[0.16em] text-red-300">Proof 1</div>
            <div className="mt-2 text-sm font-semibold text-red-100">Fake quote refused</div>
            <p className="mt-1 text-xs leading-5 text-red-100/70">High AI confidence cannot override a missing source span.</p>
          </Link>
          <Link href={cleared ? `/clearance/${cleared.clearanceId}` : VERIFIED_PROOFS.paid} className="rounded-lg border border-[#34D399]/35 bg-[#34D399]/5 p-4 transition-colors hover:border-[#34D399]/80">
            <div className="text-xs font-mono uppercase tracking-[0.16em] text-[#34D399]">Proof 2</div>
            <div className="mt-2 text-sm font-semibold text-[#d1fae5]">Valid claim paid</div>
            <p className="mt-1 text-xs leading-5 text-[#b8d8c8]">Creator payment appears only after quote, license, policy, and budget pass.</p>
          </Link>
          <Link href={VERIFIED_PROOFS.recovery} className="rounded-lg border border-white/10 bg-[#0a0a0f] p-4 transition-colors hover:border-[#6366f1]/70">
            <div className="text-xs font-mono uppercase tracking-[0.16em] text-[#a5b4fc]">Proof 3</div>
            <div className="mt-2 text-sm font-semibold text-[#f0f0f5]">Missed citation recovery</div>
            <p className="mt-1 text-xs leading-5 text-[#8b8b9e]">External answers can be audited without settlement, then settled only under a real mandate.</p>
          </Link>
        </div>
      </section>

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

      <section className="mb-6 rounded-xl border border-white/10 bg-[var(--surface)] p-5">
        <div className="mb-4">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#f0f0f5]">Payment is not clearance</div>
          <h2 className="mt-2 text-lg font-semibold text-[#f0f0f5]">Same fake citation, two different outcomes</h2>
          <p className="mt-2 max-w-3xl text-sm text-[#8b8b9e]">
            A payment-only citation flow can prove money moved. CitePay Clear proves the claim cleared evidence rules before money moved.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-orange-700/40 bg-orange-950/15 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-orange-100">Basic citation payment</h3>
              <Badge type="BLOCKED_BY_POLICY" label="risk" size="xs" />
            </div>
            <div className="space-y-2 text-sm">
              {["AI cites source", "Support score looks high: 96/100", "Payment can execute", "Fake quote may still pass unnoticed"].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-lg border border-orange-800/30 bg-black/20 px-3 py-2 text-orange-100/85">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-300" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-[#34D399]/40 bg-[#34D399]/5 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[#d1fae5]">CitePay Clear</h3>
              <Badge type="PROOF" label="cleared or refused" size="xs" />
            </div>
            <div className="space-y-2 text-sm">
              {["AI cites source", "Support score is advisory only", "Exact quote is missing", "Payment blocked: $0 and a refusal receipt"].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-lg border border-[#34D399]/20 bg-black/20 px-3 py-2 text-[#d1fae5]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />
                  <span>{item}</span>
                </div>
              ))}
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

          <section className="rounded-xl border border-[#34D399]/25 bg-[#34D399]/5 p-5">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#34D399]">Creator economics</div>
                <h2 className="mt-2 font-semibold text-[#f0f0f5]">Only cleared claims create earnings</h2>
                <p className="mt-1 max-w-2xl text-sm text-[#b8d8c8]">
                  This run paid {paidClaims.length} claim and withheld payment from {blockedClaims.length} claim{blockedClaims.length === 1 ? "" : "s"}. The paid receipt shows the creator wallet, source, amount, payment status, and Arc transfer proof.
                </p>
              </div>
              <div className="rounded-lg border border-[#34D399]/25 bg-black/20 px-4 py-3 text-right">
                <div className="font-mono text-lg text-[#34D399]">{micro(result.certificate.totalPaidMicro)}</div>
                <div className="text-xs text-[#b8d8c8]">earned in this proof</div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-[#0a0a0f] p-3">
                <div className="text-xs text-[#8b8b9e]">Earning rule</div>
                <div className="mt-1 text-sm font-semibold text-[#f0f0f5]">clear first, pay second</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#0a0a0f] p-3">
                <div className="text-xs text-[#8b8b9e]">Creator proof</div>
                <div className="mt-1 text-sm font-semibold text-[#f0f0f5]">wallet + receipt + tx</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#0a0a0f] p-3">
                <div className="text-xs text-[#8b8b9e]">Blocked value</div>
                <div className="mt-1 text-sm font-semibold text-[#f0f0f5]">no quote, no funds</div>
              </div>
            </div>
          </section>

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
              Paste any AI answer and CitePay Clear will audit it for citations that should have been paid — same deterministic checks, compute-only. Settlement is a separate mandate-scoped action with replay protection and budget caps.
            </p>
            <Link href="/recover" className="text-sm font-mono text-[#6366f1] hover:text-indigo-300">
              Open post-answer recovery audit →
            </Link>
          </section>
        </div>
      )}
    </PageShell>
  );
}
