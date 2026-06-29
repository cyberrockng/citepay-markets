"use client";
import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { POLICY_PRESETS, simulatePolicyDecisions } from "@/lib/policy";

// ── Types ─────────────────────────────────────────────────────────────────────

type Status = "idle" | "running" | "done" | "error";

interface Step {
  status: Status;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: Record<string, any>;
  error?: string;
}

type Steps = Record<string, Step>;

const STEPS = ["sources", "query", "receipt", "verify", "tamper", "challenge"] as const;

const STEP_META: Record<string, { title: string; proof?: string }> = {
  sources:   { title: "Load sources" },
  query:     { title: "Agent pays & queries via Circle Gateway", proof: "Agent used creator content" },
  receipt:   { title: "Creator payout confirmed",          proof: "Creator paid in USDC" },
  verify:    { title: "Evidence hash verified",            proof: "Citation decision is verifiable" },
  tamper:    { title: "Creator edits content (simulated)" },
  challenge: { title: "Objective challenge succeeds",     proof: "Tampering can be challenged" },
};

const PROOFS = ["query", "receipt", "verify", "challenge"] as const;
const PROOF_LABELS: Record<string, string> = {
  query:     "Agent used creator content",
  receipt:   "Creator paid in USDC",
  verify:    "Citation is verifiable",
  challenge: "Tampering can be challenged",
};

// ── SHA-256 via Web Crypto ────────────────────────────────────────────────────

async function clientSHA256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function trunc(s: string, n = 20) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function microToUsdc(v: number) {
  return (v / 1_000_000).toFixed(6);
}

// ── Component ─────────────────────────────────────────────────────────────────

const INIT: Steps = Object.fromEntries(STEPS.map(k => [k, { status: "idle" }]));

export default function DemoPage() {
  const [steps, setSteps]   = useState<Steps>(INIT);
  const [running, setRunning] = useState(false);
  const [done, setDone]     = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [policyComparison, setPolicyComparison] = useState<any[] | null>(null);
  const [missedCitations, setMissedCitations] = useState<{
    id: string; url: string; domain: string; title: string; query: string;
    score: number; estEarning: number; contactEmail: string | null; emailSent: boolean; createdAt: string;
  }[]>([]);

  useEffect(() => {
    fetch("/api/wallet/balance")
      .then(r => r.json())
      .then(d => { if (typeof d.balanceUsdc === "number") setWalletBalance(d.balanceUsdc); })
      .catch(() => {});
    fetch("/api/missed-citations")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.citations)) setMissedCitations(d.citations); })
      .catch(() => {});
  }, []);

  async function resetDemo() {
    setSeeding(true);
    setSeedMsg("");
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const d = await res.json();
      setSeedMsg(res.ok ? `✓ ${d.message}` : `✗ ${d.error}`);
    } catch {
      setSeedMsg("✗ Reset failed");
    } finally {
      setSeeding(false);
      setSteps(INIT);
      setDone(false);
    }
  }

  function set(key: string, status: Status, data?: Record<string, unknown>, error?: string) {
    setSteps(prev => ({ ...prev, [key]: { status, data, error } }));
  }

  const runDemo = useCallback(async () => {
    setRunning(true);
    setDone(false);
    setSteps(INIT);
    setPolicyComparison(null);

    try {
      // ── 1. Check sources ──────────────────────────────────────────────────
      set("sources", "running");
      const trRes  = await fetch("/api/traction");
      const trData = await trRes.json();
      const count  = trData.stats?.sourcesRegistered ?? 0;
      if (!count) {
        set("sources", "error", undefined, "No sources — run: npm run seed");
        return;
      }
      set("sources", "done", { count });

      // ── 2. Send query via Circle Gateway (real USDC payment) ─────────────
      set("query", "running");
      const askRes = await fetch("/api/demo-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "What is x402 and how does it enable micropayments for AI agents?",
          budget: 0.05,
        }),
      });
      const ask = await askRes.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const decisions: any[]  = ask.decisions ?? [];
      const payDecisions = decisions.filter(d => d.decision === "PAY");
      const first = payDecisions[0];

      set("query", "done", {
        queryId:        ask.queryId,
        answer:         ask.answer,
        pay:            payDecisions.length,
        refuse:         decisions.filter((d: { decision: string }) => d.decision === "REFUSE").length,
        skip:           decisions.filter((d: { decision: string }) => d.decision === "SKIP").length,
        totalPaid:      ask.totalPaid,
        payDecision:    first,
        gatewayTx:      ask._demo?.settleTx ?? null,
        gatewayAmount:  ask._demo?.formattedAmount ?? null,
        buyerAddress:   ask._demo?.buyerAddress ?? null,
      });

      // Build policy comparison from scored decisions (client-side, no extra API calls)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const decisionInputs = decisions.map((d: any) => ({
        source: d.source,
        sourcePrice: d.sourcePrice ?? d.amountPaid,
        sourceBonded: d.sourceBonded ?? false,
        sourceOnChainId: d.sourceOnChainId ?? null,
        scores: d.scores,
        originalDecision: d.decision,
      }));
      setPolicyComparison([
        { label: "Conservative", key: "conservative", results: simulatePolicyDecisions(decisionInputs, POLICY_PRESETS.conservative) },
        { label: "Balanced", key: "balanced", results: simulatePolicyDecisions(decisionInputs, POLICY_PRESETS.balanced) },
        { label: "Aggressive", key: "aggressive", results: simulatePolicyDecisions(decisionInputs, POLICY_PRESETS.aggressive) },
      ]);

      if (!first) {
        set("receipt", "error", undefined, "No PAY decision returned — increase budget or re-seed");
        return;
      }

      // ── 3. Fetch receipt ──────────────────────────────────────────────────
      set("receipt", "running");
      const rRes  = await fetch(`/api/receipt/${first.receiptId}`);
      const rData = await rRes.json();
      const r     = rData.receipt;
      set("receipt", "done", {
        receiptId:             r.id,
        sourceTitle:           r.sourceTitle,
        sourceId:              r.sourceId,
        amountPaid:            r.amountPaid,
        txHash:                r.txHash,
        onChainTxHash:         r.onChainTxHash,
        onChainReceiptId:      r.onChainReceiptId,
        evidenceHash:          r.evidenceHash,
        preimage:              r.evidencePreimage,
        scores:                r.scores,
        contentHashAtDecision: r.contentHashAtDecision,
      });

      // ── 4. Verify evidence hash client-side ───────────────────────────────
      set("verify", "running");
      const recomputed = await clientSHA256(JSON.stringify(r.evidencePreimage, null, 2));
      const valid = recomputed === r.evidenceHash;
      set("verify", valid ? "done" : "error", { valid, recomputed, stored: r.evidenceHash });

      // ── 5. Tamper: simulate creator editing content after payment ─────────
      set("tamper", "running");
      const tRes  = await fetch("/api/demo/tamper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: r.sourceId }),
      });
      const tData = await tRes.json();
      set("tamper", "done", { oldHash: tData.oldHash, newHash: tData.newHash, sourceTitle: tData.sourceTitle });

      // ── 6. Challenge ──────────────────────────────────────────────────────
      set("challenge", "running");
      const cRes  = await fetch(`/api/challenge/${r.id}`, { method: "POST" });
      const cData = await cRes.json();
      if (cRes.ok) {
        set("challenge", "done", {
          message:    cData.message,
          hashBefore: cData.hashAtPayment,
          hashAfter:  cData.currentHash,
          receiptId:  r.id,
        });
      } else {
        set("challenge", "error", undefined, cData.error);
      }

      setDone(true);
    } finally {
      setRunning(false);
    }
  }, []);

  const proofsDone = PROOFS.filter(k => steps[k]?.status === "done");

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5]">
      <div className="max-w-3xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-8">
          <BackButton label="Home" />
          <h1 className="text-3xl font-bold mt-4 text-[#f0f0f5]">Proof-of-Paid-Citation</h1>
          <p className="text-[#8b8b9e] mt-1">Live judge demo — four proofs in one automated flow</p>
        </div>

        {/* 4 Proof Badges — 2×2 grid */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {PROOFS.map(k => {
            const isDone = steps[k]?.status === "done";
            const isRunning = steps[k]?.status === "running";
            return (
              <div
                key={k}
                className={`rounded-xl p-4 border transition-all duration-500 ${
                  isDone
                    ? "border-[#00ff88]/40 bg-[#00ff88]/5 shadow-[0_0_20px_rgba(0,255,136,0.08)]"
                    : isRunning
                    ? "border-[#6366f1]/40 bg-[#6366f1]/5"
                    : "border-[#1e1e2e] bg-[#111118]"
                }`}
              >
                <div className={`text-lg font-mono mb-1 transition-colors ${isDone ? "text-[#00ff88]" : "text-[#4a4a5e]"}`}>
                  {isDone ? "✓" : isRunning ? "●" : "○"}
                </div>
                <div className={`text-xs font-semibold transition-colors ${isDone ? "text-[#00ff88]" : "text-[#8b8b9e]"}`}>
                  {PROOF_LABELS[k]}
                </div>
              </div>
            );
          })}
        </div>

        {/* Agent Wallet Balance */}
        {walletBalance !== null && (
          <div className={`mb-4 rounded-lg px-4 py-2.5 border text-xs flex items-center justify-between ${
            walletBalance >= 0.001
              ? "bg-[#00ff88]/5 border-[#00ff88]/20 text-[#00ff88]"
              : "bg-yellow-500/5 border-yellow-500/30 text-yellow-400"
          }`}>
            <span className="font-mono">Agent wallet: ${walletBalance.toFixed(4)} USDC</span>
            {walletBalance < 0.001 && (
              <span className="font-semibold">⚠ Low balance — payments will show as simulated</span>
            )}
          </div>
        )}

        {/* Run + Reset Buttons */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={runDemo}
            disabled={running || seeding}
            className={`flex-1 py-4 rounded-xl font-bold text-lg transition-all ${
              running || seeding
                ? "bg-[#111118] text-[#4a4a5e] cursor-not-allowed border border-[#1e1e2e]"
                : "bg-[#6366f1] hover:bg-indigo-500 text-white"
            }`}
          >
            {running ? "Running demo…" : done ? "▶ Run Demo Again" : "▶ Start Demo"}
          </button>
          <button
            onClick={resetDemo}
            disabled={running || seeding}
            title="Reset database to 10 seed sources"
            className="px-4 py-4 rounded-xl border border-[#1e1e2e] bg-[#111118] hover:border-[#2e2e3e] text-[#4a4a5e] hover:text-[#8b8b9e] text-sm transition-all disabled:cursor-not-allowed"
          >
            {seeding ? "Resetting…" : "↺ Reset DB"}
          </button>
        </div>
        {seedMsg && (
          <p className={`text-xs font-mono mb-4 ${seedMsg.startsWith("✓") ? "text-[#00ff88]" : "text-red-400"}`}>
            {seedMsg}
          </p>
        )}

        {/* Step Timeline */}
        <div className="space-y-3">
          {STEPS.map((key, i) => {
            const step = steps[key];
            if (step.status === "idle") return null;
            return (
              <StepCard
                key={key}
                number={i + 1}
                title={STEP_META[key].title}
                proof={STEP_META[key].proof}
                step={step}
                microToUsdc={microToUsdc}
                trunc={trunc}
              />
            );
          })}
        </div>

        {/* Final Success State */}
        {done && proofsDone.length === 4 && (
          <div className="mt-8 rounded-xl p-8 border border-[#00ff88]/30 bg-[#00ff88]/5 text-center">
            <div className="text-5xl mb-4 text-[#00ff88]">✓</div>
            <h2 className="text-xl font-bold text-[#00ff88] mb-3">All four proofs verified</h2>
            <p className="text-[#8b8b9e] text-sm max-w-md mx-auto mb-6">
              An AI agent queried creator content, paid USDC, produced a verifiable receipt,
              and the challenge mechanism confirmed content integrity — settled on Arc via Circle Gateway.
            </p>
            <div className="flex justify-center gap-4 flex-wrap">
              <Link
                href="/market"
                className="text-[#6366f1] hover:text-indigo-300 text-sm border border-[#6366f1]/30 px-4 py-2 rounded-lg transition-colors"
              >
                View Source Market →
              </Link>
              <Link
                href="/traction"
                className="text-[#8b8b9e] hover:text-[#f0f0f5] text-sm border border-[#1e1e2e] px-4 py-2 rounded-lg transition-colors"
              >
                Live Traction →
              </Link>
            </div>
          </div>
        )}

        {/* Multi-Policy Comparison */}
        {policyComparison && (
          <div className="mt-8">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-[#f0f0f5]">Policy Comparison</h2>
              <p className="text-[#8b8b9e] text-xs mt-0.5">
                One query · ten sources · three policies — same scores, different outcomes
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {policyComparison.map((col) => {
                const paid = col.results.filter((r: { decision: string }) => r.decision === "PAY").length;
                const blocked = col.results.filter((r: { decision: string }) => r.decision === "BLOCKED_BY_POLICY").length;
                const refused = col.results.filter((r: { decision: string }) => r.decision === "REFUSE").length;
                const colors: Record<string, string> = {
                  conservative: "border-yellow-600/40",
                  balanced: "border-[#6366f1]/40",
                  aggressive: "border-[#00ff88]/30",
                };
                const labelColors: Record<string, string> = {
                  conservative: "text-yellow-400",
                  balanced: "text-[#6366f1]",
                  aggressive: "text-[#00ff88]",
                };
                return (
                  <div key={col.key} className={`bg-[#111118] rounded-xl border ${colors[col.key]} p-4`}>
                    <div className={`font-semibold text-sm mb-1 ${labelColors[col.key]}`}>{col.label}</div>
                    <div className="flex gap-3 text-xs font-mono mb-3">
                      <span className="text-[#00ff88]">{paid} PAY</span>
                      {blocked > 0 && <span className="text-orange-400">{blocked} BLOCKED</span>}
                      <span className="text-red-400">{refused} REFUSE</span>
                    </div>
                    <div className="space-y-1.5">
                      {col.results.map((r: { source: string; decision: string; reason: string }, i: number) => {
                        const dc =
                          r.decision === "PAY" ? "text-[#00ff88]" :
                          r.decision === "BLOCKED_BY_POLICY" ? "text-orange-400" :
                          r.decision === "REFUSE" ? "text-red-400" : "text-[#4a4a5e]";
                        return (
                          <div key={i} className="flex items-center justify-between gap-2">
                            <span className="text-[#8b8b9e] text-xs truncate flex-1" title={r.source}>
                              {r.source.length > 28 ? r.source.slice(0, 28) + "…" : r.source}
                            </span>
                            <span className={`text-xs font-mono shrink-0 ${dc}`}>
                              {r.decision === "BLOCKED_BY_POLICY" ? "BLOCKED" : r.decision}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[#4a4a5e] text-xs mt-3">
              Policy simulation applied client-side to real scored decisions. Try different policies in the{" "}
              <Link href="/ask" className="text-[#6366f1] hover:text-indigo-300 transition-colors">Agent Workbench →</Link>
            </p>
          </div>
        )}

        {/* Unclaimed Citations Feed */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-[#f0f0f5]">Unclaimed Citations</h2>
              <p className="text-[#8b8b9e] text-xs mt-0.5">
                External content that scored ≥70 on real queries — creators notified to register
              </p>
            </div>
            {missedCitations.length > 0 && (
              <span className="text-xs font-mono bg-orange-500/10 text-orange-400 border border-orange-500/20 px-3 py-1 rounded-full">
                {missedCitations.length} unclaimed
              </span>
            )}
          </div>

          {missedCitations.length === 0 ? (
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-8 text-center">
              <p className="text-[#4a4a5e] text-sm">
                No unclaimed citations yet — run a query above and the agent will discover external sources automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {missedCitations.map((c) => (
                <div key={c.id} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                    <span className="text-orange-400 font-bold text-sm font-mono">{c.score}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-[#f0f0f5] text-sm truncate">{c.title}</span>
                      {c.emailSent && (
                        <span className="text-[10px] font-mono bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20 px-2 py-0.5 rounded-full flex-shrink-0">
                          ✓ Notified
                        </span>
                      )}
                      {!c.emailSent && c.contactEmail && (
                        <span className="text-[10px] font-mono bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded-full flex-shrink-0">
                          Email found
                        </span>
                      )}
                      {!c.contactEmail && (
                        <span className="text-[10px] font-mono bg-[#1e1e2e] text-[#4a4a5e] px-2 py-0.5 rounded-full flex-shrink-0">
                          No email
                        </span>
                      )}
                    </div>
                    <a href={c.url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-[#6366f1] hover:text-indigo-300 font-mono truncate block mb-1.5 transition-colors">
                      {c.domain}
                    </a>
                    <p className="text-xs text-[#8b8b9e] truncate">
                      Query: &ldquo;{c.query.slice(0, 80)}{c.query.length > 80 ? "…" : ""}&rdquo;
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="text-[#00ff88] font-bold font-mono text-sm">
                      ${(c.estEarning / 1_000_000).toFixed(4)}
                    </div>
                    <div className="text-[#4a4a5e] text-[10px]">missed</div>
                    <a
                      href={`/join?url=${encodeURIComponent(c.url)}`}
                      className="inline-block mt-2 text-[10px] bg-[#6366f1] hover:bg-indigo-500 text-white font-semibold px-3 py-1 rounded-lg transition-colors"
                    >
                      Register →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ── Step Card ─────────────────────────────────────────────────────────────────

function StepCard({
  number, title, proof, step, microToUsdc, trunc,
}: {
  number: number;
  title: string;
  proof?: string;
  step: Step;
  microToUsdc: (v: number) => string;
  trunc: (s: string, n?: number) => string;
}) {
  const { status, data, error } = step;

  const leftBorder =
    status === "done"    ? "border-l-[#00ff88]" :
    status === "running" ? "border-l-[#6366f1]" :
    status === "error"   ? "border-l-red-500"   : "border-l-[#1e1e2e]";

  const icon =
    status === "done"    ? <span className="text-[#00ff88]">✓</span> :
    status === "running" ? <span className="text-[#6366f1] animate-pulse">●</span> :
    status === "error"   ? <span className="text-red-400">✗</span>   : null;

  return (
    <div className={`rounded-xl p-5 bg-[#111118] border border-[#1e1e2e] border-l-2 ${leftBorder}`}>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[#4a4a5e] text-xs font-mono w-4">{number}</span>
        <span className="font-semibold text-sm text-[#f0f0f5]">{title}</span>
        {proof && status === "done" && (
          <span className="ml-auto text-xs text-[#00ff88] bg-[#00ff88]/10 border border-[#00ff88]/30 px-2 py-0.5 rounded-full">
            Proof ✓
          </span>
        )}
        <span className="ml-auto">{icon}</span>
      </div>

      {status === "running" && (
        <p className="text-[#8b8b9e] text-xs animate-pulse">Processing…</p>
      )}

      {status === "error" && (
        <p className="text-red-400 text-xs">{error}</p>
      )}

      {status === "done" && data && (
        <div className="text-xs space-y-1.5 font-mono">
          <StepData stepKey={number} data={data} microToUsdc={microToUsdc} trunc={trunc} />
        </div>
      )}
    </div>
  );
}

function StepData({ stepKey, data, microToUsdc, trunc }: {
  stepKey: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  microToUsdc: (v: number) => string;
  trunc: (s: string, n?: number) => string;
}) {
  if (stepKey === 1) return (
    <Row label="Sources loaded" value={`${data.count} sources`} />
  );

  if (stepKey === 2) return (<>
    <Row label="Query" value="What is x402 and how does it enable micropayments for AI agents?" plain />
    <Row label="Decisions" value={`${data.pay} PAY · ${data.refuse} REFUSE · ${data.skip} SKIP`} />
    <Row label="Total paid" value={`$${microToUsdc(data.totalPaid)} USDC`} />
    {data.gatewayAmount && (
      <Row label="Gateway fee" value={`${data.gatewayAmount} USDC via Circle Gateway`} />
    )}
    {data.gatewayTx && (
      <Row label="Gateway tx" value={data.gatewayTx} link={`https://testnet.arcscan.app/tx/${data.gatewayTx}`} trunc={trunc} />
    )}
    {data.payDecision && (
      <Row label="Top PAY source" value={data.payDecision.source} plain />
    )}
  </>);

  if (stepKey === 3) return (<>
    <Row label="Source" value={data.sourceTitle} plain />
    <Row label="Amount paid" value={`$${microToUsdc(data.amountPaid)} USDC`} />
    {data.txHash && (
      <Row label="USDC tx" value={data.txHash} link={`https://testnet.arcscan.app/tx/${data.txHash}`} trunc={trunc} />
    )}
    {data.onChainTxHash && (
      <Row label="Anchor tx" value={data.onChainTxHash} link={`https://testnet.arcscan.app/tx/${data.onChainTxHash}`} trunc={trunc} />
    )}
    {data.onChainReceiptId ? <Row label="Contract receipt #" value={String(data.onChainReceiptId)} /> : null}
    <Row label="Evidence hash" value={trunc(data.evidenceHash, 40)} />
    <Row label="Receipt" value={`/receipt/${data.receiptId}`} link={`/receipt/${data.receiptId}`} trunc={trunc} />
  </>);

  if (stepKey === 4) return (<>
    <Row label="Stored hash"     value={trunc(data.stored, 40)} />
    <Row label="Recomputed hash" value={trunc(data.recomputed, 40)} />
    <Row label="Match"           value={data.valid ? "✓ Identical — evidence is intact" : "✗ Mismatch"} />
  </>);

  if (stepKey === 5) return (<>
    <Row label="Source"   value={data.sourceTitle} plain />
    <Row label="Old hash" value={trunc(data.oldHash, 40)} />
    <Row label="New hash" value={trunc(data.newHash, 40)} />
    <p className="text-yellow-500 mt-1">Hash at decision is now different from current hash.</p>
  </>);

  if (stepKey === 6) return (<>
    <Row label="Result"          value="Challenge succeeded" />
    <Row label="Hash at payment" value={trunc(data.hashBefore, 40)} />
    <Row label="Hash now"        value={trunc(data.hashAfter, 40)} />
    <Row label="Outcome"         value="Creator reputation −1 · Agent reputation −1 · Bond forfeiture logged" />
    <Row label="Receipt"         value={`/receipt/${data.receiptId}`} link={`/receipt/${data.receiptId}`} trunc={trunc} />
  </>);

  return null;
}

function Row({ label, value, link, plain, trunc }: {
  label: string;
  value: string;
  link?: string;
  plain?: boolean;
  trunc?: (s: string, n?: number) => string;
}) {
  const display = trunc ? trunc(value, 48) : value;
  return (
    <div className="flex gap-2">
      <span className="text-[#4a4a5e] shrink-0 w-36">{label}:</span>
      {link ? (
        <a
          href={link}
          target={link.startsWith("http") ? "_blank" : "_self"}
          rel="noopener noreferrer"
          className="text-[#6366f1] hover:text-indigo-300 break-all transition-colors"
        >
          {display}
        </a>
      ) : (
        <span className={plain ? "text-[#f0f0f5] break-all" : "text-[#8b8b9e]"}>{display}</span>
      )}
    </div>
  );
}
