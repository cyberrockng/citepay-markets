"use client";
import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";

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
  query:     { title: "Agent queries the market",         proof: "Agent used creator content" },
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

  useEffect(() => {
    fetch("/api/wallet/balance")
      .then(r => r.json())
      .then(d => { if (typeof d.balanceUsdc === "number") setWalletBalance(d.balanceUsdc); })
      .catch(() => {});
  }, []);

  function set(key: string, status: Status, data?: Record<string, unknown>, error?: string) {
    setSteps(prev => ({ ...prev, [key]: { status, data, error } }));
  }

  const runDemo = useCallback(async () => {
    setRunning(true);
    setDone(false);
    setSteps(INIT);

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

      // ── 2. Send query via x402 ────────────────────────────────────────────
      set("query", "running");
      const askRes = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-PAYMENT": "demo-judge-proof" },
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
        queryId:     ask.queryId,
        answer:      ask.answer,
        pay:         payDecisions.length,
        refuse:      decisions.filter(d => d.decision === "REFUSE").length,
        skip:        decisions.filter(d => d.decision === "SKIP").length,
        totalPaid:   ask.totalPaid,
        payDecision: first,
      });

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

        {/* Run Button */}
        <button
          onClick={runDemo}
          disabled={running}
          className={`w-full py-4 rounded-xl font-bold text-lg mb-8 transition-all ${
            running
              ? "bg-[#111118] text-[#4a4a5e] cursor-not-allowed border border-[#1e1e2e]"
              : "bg-[#6366f1] hover:bg-indigo-500 text-white"
          }`}
        >
          {running ? "Running demo…" : done ? "▶ Run Demo Again" : "▶ Start Demo"}
        </button>

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
              and the challenge mechanism confirmed content integrity — all on Base Sepolia.
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
    {data.payDecision && (
      <Row label="Top PAY source" value={data.payDecision.source} plain />
    )}
  </>);

  if (stepKey === 3) return (<>
    <Row label="Source" value={data.sourceTitle} plain />
    <Row label="Amount paid" value={`$${microToUsdc(data.amountPaid)} USDC`} />
    {data.txHash && (
      <Row label="USDC tx" value={data.txHash} link={`https://sepolia.basescan.org/tx/${data.txHash}`} trunc={trunc} />
    )}
    {data.onChainTxHash && (
      <Row label="Anchor tx" value={data.onChainTxHash} link={`https://sepolia.basescan.org/tx/${data.onChainTxHash}`} trunc={trunc} />
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
    <Row label="Outcome"         value="Creator reputation −3 · Agent reputation −1" />
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
