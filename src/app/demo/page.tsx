"use client";
import { useState, useCallback } from "react";
import Link from "next/link";

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
  sources: { title: "Load sources" },
  query:   { title: "Agent queries the market",       proof: "Agent used creator content" },
  receipt: { title: "Creator payout confirmed",        proof: "Creator paid in USDC" },
  verify:  { title: "Evidence hash verified",          proof: "Citation decision is verifiable" },
  tamper:  { title: "Creator edits content (simulated)" },
  challenge: { title: "Objective challenge succeeds",  proof: "Tampering can be challenged" },
};

const PROOFS = ["query", "receipt", "verify", "challenge"] as const;

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
        queryId:    ask.queryId,
        answer:     ask.answer,
        pay:        payDecisions.length,
        refuse:     decisions.filter(d => d.decision === "REFUSE").length,
        skip:       decisions.filter(d => d.decision === "SKIP").length,
        totalPaid:  ask.totalPaid,
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
        receiptId:        r.id,
        sourceTitle:      r.sourceTitle,
        sourceId:         r.sourceId,
        amountPaid:       r.amountPaid,
        txHash:           r.txHash,
        onChainTxHash:    r.onChainTxHash,
        onChainReceiptId: r.onChainReceiptId,
        evidenceHash:     r.evidenceHash,
        preimage:         r.evidencePreimage,
        scores:           r.scores,
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
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-2">
          <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm">← Home</Link>
        </div>
        <h1 className="text-3xl font-bold mb-1">Proof-of-Paid-Citation</h1>
        <p className="text-gray-400 mb-8">Live judge demo — four proofs in one flow</p>

        {/* 4 Proof Badges */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {PROOFS.map(k => {
            const done = steps[k]?.status === "done";
            return (
              <div key={k} className={`rounded-xl p-4 border transition-all ${done ? "border-green-700 bg-green-900/20" : "border-gray-800 bg-gray-900"}`}>
                <div className={`text-lg mb-1 ${done ? "text-green-400" : "text-gray-600"}`}>
                  {done ? "✓" : "○"}
                </div>
                <div className={`text-sm font-semibold ${done ? "text-green-300" : "text-gray-500"}`}>
                  {STEP_META[k].proof}
                </div>
              </div>
            );
          })}
        </div>

        {/* Run button */}
        <button
          onClick={runDemo}
          disabled={running}
          className={`w-full py-4 rounded-xl font-bold text-lg mb-8 transition-all ${
            running
              ? "bg-gray-800 text-gray-500 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-500 text-white"
          }`}
        >
          {running ? "Running demo…" : done ? "▶ Run Demo Again" : "▶ Start Demo"}
        </button>

        {/* Step Log */}
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

        {done && proofsDone.length === 4 && (
          <div className="mt-8 rounded-xl p-6 border border-green-700 bg-green-900/20 text-center">
            <div className="text-4xl mb-3">✓</div>
            <h2 className="text-xl font-bold text-green-300 mb-2">All four proofs verified</h2>
            <p className="text-gray-400 text-sm">
              An AI agent queried creator content, paid USDC, produced a verifiable receipt,
              and the challenge mechanism worked — all on Base Sepolia testnet.
            </p>
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

  const border =
    status === "done"    ? "border-green-800" :
    status === "running" ? "border-yellow-800" :
    status === "error"   ? "border-red-800"   : "border-gray-800";

  const icon =
    status === "done"    ? <span className="text-green-400">✓</span> :
    status === "running" ? <span className="text-yellow-400 animate-pulse">●</span> :
    status === "error"   ? <span className="text-red-400">✗</span>   : null;

  return (
    <div className={`rounded-xl p-5 border bg-gray-900 ${border}`}>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-gray-600 text-xs font-mono w-4">{number}</span>
        <span className="font-semibold text-sm">{title}</span>
        {proof && status === "done" && (
          <span className="ml-auto text-xs text-green-400 bg-green-900/40 border border-green-800 px-2 py-0.5 rounded-full">
            Proof ✓
          </span>
        )}
        <span className="ml-auto">{icon}</span>
      </div>

      {status === "running" && (
        <p className="text-gray-500 text-xs">Processing…</p>
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
  // Step 1 — sources
  if (stepKey === 1) return (
    <Row label="Sources loaded" value={`${data.count} sources`} />
  );

  // Step 2 — query
  if (stepKey === 2) return (<>
    <Row label="Query" value="What is x402 and how does it enable micropayments for AI agents?" plain />
    <Row label="Decisions" value={`${data.pay} PAY · ${data.refuse} REFUSE · ${data.skip} SKIP`} />
    <Row label="Total paid" value={`$${microToUsdc(data.totalPaid)} USDC`} />
    {data.payDecision && (
      <Row label="Top PAY source" value={data.payDecision.source} plain />
    )}
  </>);

  // Step 3 — receipt
  if (stepKey === 3) return (<>
    <Row label="Source" value={data.sourceTitle} plain />
    <Row label="Amount paid" value={`$${microToUsdc(data.amountPaid)} USDC`} />
    {data.txHash && <Row label="USDC tx" value={data.txHash} link={`https://sepolia.basescan.org/tx/${data.txHash}`} trunc={trunc} />}
    {data.onChainTxHash && (
      <Row label="Anchor tx" value={data.onChainTxHash} link={`https://sepolia.basescan.org/tx/${data.onChainTxHash}`} trunc={trunc} />
    )}
    {data.onChainReceiptId ? <Row label="Contract receipt #" value={String(data.onChainReceiptId)} /> : null}
    <Row label="Evidence hash" value={trunc(data.evidenceHash, 40)} />
    <Row label="Receipt" value={`/receipt/${data.receiptId}`} link={`/receipt/${data.receiptId}`} trunc={trunc} />
  </>);

  // Step 4 — verify
  if (stepKey === 4) return (<>
    <Row label="Stored hash"     value={trunc(data.stored, 40)} />
    <Row label="Recomputed hash" value={trunc(data.recomputed, 40)} />
    <Row label="Match"           value={data.valid ? "✓ Identical — evidence is intact" : "✗ Mismatch"} />
  </>);

  // Step 5 — tamper
  if (stepKey === 5) return (<>
    <Row label="Source"   value={data.sourceTitle} plain />
    <Row label="Old hash" value={trunc(data.oldHash, 40)} />
    <Row label="New hash" value={trunc(data.newHash, 40)} />
    <p className="text-yellow-500 mt-1">Hash at decision is now different from current hash.</p>
  </>);

  // Step 6 — challenge
  if (stepKey === 6) return (<>
    <Row label="Result"         value="Challenge succeeded" />
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
      <span className="text-gray-500 shrink-0 w-36">{label}:</span>
      {link ? (
        <a href={link} target={link.startsWith("http") ? "_blank" : "_self"} rel="noopener noreferrer"
           className="text-indigo-400 hover:underline break-all">
          {display}
        </a>
      ) : (
        <span className={plain ? "text-gray-300 break-all" : "text-gray-200"}>{display}</span>
      )}
    </div>
  );
}
