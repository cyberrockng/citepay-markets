"use client";

import { useState } from "react";
import { BackButton } from "@/components/back-button";
import { Badge, DataRow, PageShell, StatCard } from "@/components/ui";
import type { RecoveryReport } from "@/lib/clear/types";

type RunState = "idle" | "running" | "done" | "error";

const PLACEHOLDER = `Paste an AI-generated answer here. CitePay Clear will find claims that\nappear to draw on registered sources, check whether the exact quote is\nreally there, and report what should have been paid — no settlement,\naudit only.`;

function micro(v: number) {
  return `$${(v / 1_000_000).toFixed(6)} USDC`;
}

function decisionClass(decision: string) {
  if (decision === "CLEARED") return "border-[#34D399]/40 bg-[#34D399]/10 text-[#34D399]";
  if (decision === "UNSUPPORTED") return "border-red-700 bg-red-900/20 text-red-300";
  if (decision === "UNMATCHED") return "border-[#4a4a5e] bg-white/5 text-[#8b8b9e]";
  return "border-orange-700 bg-orange-900/20 text-orange-300";
}

export default function RecoverPage() {
  const [answer, setAnswer] = useState("");
  const [state, setState] = useState<RunState>("idle");
  const [report, setReport] = useState<RecoveryReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAudit() {
    setState("running");
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/clear/recover/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Recovery audit failed");
      setReport(data.report as RecoveryReport);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected audit error");
      setState("error");
    }
  }

  return (
    <PageShell maxWidth="max-w-4xl">
      <BackButton />
      <div className="mt-5 mb-8">
        <div className="text-xs font-mono uppercase tracking-[0.24em] text-[#6366f1] mb-3">CitePay Clear — Recovery</div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
          Audit an answer CitePay didn&apos;t generate
        </h1>
        <p className="text-[var(--text-secondary)] max-w-2xl mt-3">
          Every candidate runs through the same deterministic clearance check as the live demo — no relaxed standard for content from outside CitePay. Compute-only: nothing is settled.
        </p>
      </div>

      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={8}
        maxLength={6000}
        className="w-full rounded-xl border border-white/10 bg-[#0a0a0f] p-4 text-sm text-[#f0f0f5] placeholder:text-[#4a4a5e] focus:outline-none focus:border-[#6366f1]/50"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-[#4a4a5e]">{answer.length}/6000</span>
        <button
          onClick={runAudit}
          disabled={state === "running" || answer.trim().length === 0}
          className="rounded-lg bg-[#f0f0f5] text-[#0a0a0f] px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {state === "running" ? "Auditing..." : "Audit for missed citations"}
        </button>
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-200">{error}</div>
      )}

      {report && (
        <div className="mt-8 space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Recoverable" value={report.recoverableCount} accent="text-[#34D399]" sub="would have cleared and paid" />
            <StatCard label="Unsupported" value={report.unsupportedCount} accent="text-red-300" sub="quote not verifiably present" />
            <StatCard label="Would recover" value={micro(report.totalRecoverableMicro)} accent="text-[#6366f1]" />
          </div>

          <div className="space-y-4">
            {report.findings.map((finding, idx) => (
              <div key={idx} className="rounded-xl border border-white/10 bg-[var(--surface)] p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className={`rounded border px-2 py-0.5 text-xs font-mono ${decisionClass(finding.decision)}`}>
                    {finding.decision}
                  </span>
                  {finding.decision === "CLEARED" && (
                    <span className="text-xs font-mono text-[#34D399]">{micro(finding.wouldBeAmountDueMicro)}</span>
                  )}
                </div>
                <p className="text-sm text-[#f0f0f5] mb-2">{finding.claimText}</p>
                <blockquote className="rounded-lg border border-white/10 bg-[#0a0a0f] p-3 text-xs text-[#8b8b9e] mb-3">
                  &ldquo;{finding.quoteText}&rdquo;
                </blockquote>
                <div className="grid gap-2 sm:grid-cols-2 mb-2">
                  <DataRow label="Matched source" value={finding.matchedSourceTitle ?? "none"} />
                  <DataRow label="Quote verified" value={finding.quoteVerified ? "yes" : "no"} />
                </div>
                <p className="text-xs text-[#8b8b9e]">{finding.note}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex items-center gap-2">
            <Badge type="PROOF" label="Audit only" size="xs" />
            <span className="text-xs text-[#8b8b9e]">No payment executed. This report identifies what would clear — settlement is a separate, mandate-scoped step.</span>
          </div>
        </div>
      )}
    </PageShell>
  );
}
