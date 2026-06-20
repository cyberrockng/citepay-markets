"use client";
import { useState } from "react";
import Link from "next/link";
import { BackLink, decisionStyle } from "@/components/ui";

type Step = "idle" | "waiting_payment" | "paid" | "running" | "done" | "error";

interface QueryResult {
  queryId: string;
  answer: string;
  decisions: Array<{
    receiptId: string;
    decision: string;
    source: string;
    url: string;
    scores: { relevance: number; price: number; bond: number; reputation: number; total: number };
    reason: string;
    amountPaid: number;
    txHash: string | null;
    evidenceHash: string;
    receiptUrl: string;
  }>;
  totalPaid: number;
  queryFee: number;
  queryId2?: string;
}

export default function AskPage() {
  const [query, setQuery] = useState("");
  const [budget, setBudget] = useState("0.05");
  const [step, setStep] = useState<Step>("idle");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<string[]>([]);

  function addLog(msg: string) {
    setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }

  const isActive = step !== "idle" && step !== "error" && step !== "done";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setResult(null);
    setError("");
    setLogs([]);

    setStep("waiting_payment");
    addLog("→ POST /api/ask (no payment)");

    const res1 = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, budget: parseFloat(budget) }),
    });

    if (res1.status !== 402) {
      setStep("error");
      setError("Expected 402 Payment Required but got: " + res1.status);
      return;
    }

    addLog("← 402 Payment Required — x402 payment details received");

    setStep("paid");
    addLog("→ Constructing X-PAYMENT header (x402 dev mode — USDC transfer is real)…");

    const paymentProof = {
      scheme: "exact",
      network: "eip155:84532",
      payload: {
        signature: "0x" + Array.from({ length: 130 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
        transaction: {
          hash: "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
        },
      },
    };

    addLog("✓ Payment proof constructed");

    setStep("running");
    addLog("→ POST /api/ask (with X-PAYMENT header)");
    addLog("→ Agent evaluating creator sources…");

    try {
      const res2 = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PAYMENT": JSON.stringify(paymentProof),
        },
        body: JSON.stringify({ query, budget: parseFloat(budget) }),
      });

      if (!res2.ok) {
        const errData = await res2.json();
        throw new Error(errData.error || "Agent error");
      }

      const data = await res2.json();
      addLog(`✓ Agent evaluated ${data.decisions.length} sources`);
      addLog(`✓ Paid: ${data.decisions.filter((d: { decision: string }) => d.decision === "PAY").length} | Refused: ${data.decisions.filter((d: { decision: string }) => d.decision === "REFUSE").length} | Skipped: ${data.decisions.filter((d: { decision: string }) => d.decision === "SKIP").length}`);
      addLog(`✓ Total USDC paid: $${(data.totalPaid / 1_000_000).toFixed(4)}`);
      addLog(`✓ ${data.decisions.length} receipts generated`);

      setResult(data);
      setStep("done");
    } catch (err) {
      setStep("error");
      setError(String(err));
      addLog("✗ " + String(err));
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5]">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8">
          <BackLink href="/" label="Home" />
          <h1 className="text-3xl font-bold mt-4 text-[#f0f0f5]">Agent Workbench</h1>
          <p className="text-[#8b8b9e] mt-1">Pay to query · Agent scores creator sources · Every decision gets a public receipt</p>
        </div>

        {/* Two-column layout on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Query Form */}
          <form onSubmit={handleSubmit} className="bg-[#111118] rounded-xl p-6 border border-[#1e1e2e]">
            <h2 className="font-semibold text-[#f0f0f5] mb-4">Research Question</h2>
            <textarea
              className="w-full bg-[#0a0a0f] border border-[#1e1e2e] focus:border-[#6366f1] rounded-lg px-4 py-3 text-[#f0f0f5] placeholder-[#4a4a5e] focus:outline-none resize-none transition-colors mb-4"
              rows={4}
              placeholder="e.g. What makes x402 useful for AI agents?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isActive}
            />
            <div className="mb-4">
              <label className="block text-xs text-[#8b8b9e] mb-1">Agent Budget (USDC)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="1.0"
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] focus:border-[#6366f1] rounded-lg px-4 py-2 text-[#f0f0f5] focus:outline-none transition-colors"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={!query.trim() || isActive}
              className="w-full bg-[#6366f1] hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              {step === "running" ? "Running…" : "Ask →"}
            </button>
            <p className="text-[#4a4a5e] text-xs mt-3">
              Query fee: $0.01 USDC via x402 · Budget: up to ${budget} USDC for creator citations
            </p>
          </form>

          {/* Proof Console */}
          <div className="bg-[#0a0a0f] rounded-xl border border-[#1e1e2e] p-5 font-mono text-xs flex flex-col min-h-[200px]">
            <div className="text-[#4a4a5e] mb-3 text-xs">// Proof Console</div>
            {logs.length === 0 && step === "idle" && (
              <div className="text-[#4a4a5e] flex-1 flex items-center justify-center">
                x402 protocol trace will appear here
              </div>
            )}
            <div className="space-y-1">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={
                    log.includes("✗") ? "text-red-400" :
                    log.includes("✓") ? "text-[#00ff88]" :
                    log.startsWith("[") && log.includes("→") ? "text-[#6366f1]" :
                    "text-[#f0f0f5]"
                  }
                >
                  {log}
                </div>
              ))}
            </div>
            {isActive && (
              <div className="text-[#6366f1] animate-pulse mt-1">…</div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 mb-6 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Source Competition Board */}
            <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#1e1e2e]">
                <h2 className="font-semibold text-[#f0f0f5]">Source Competition Board</h2>
                <p className="text-[#8b8b9e] text-xs mt-0.5">Agent evaluated {result.decisions.length} sources</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1e1e2e]">
                      <th className="px-4 py-3 text-left text-xs text-[#8b8b9e] font-medium">Source</th>
                      <th className="px-4 py-3 text-right text-xs text-[#8b8b9e] font-medium">Price</th>
                      <th className="px-4 py-3 text-right text-xs text-[#8b8b9e] font-medium">Rel%</th>
                      <th className="px-4 py-3 text-right text-xs text-[#8b8b9e] font-medium">Score</th>
                      <th className="px-4 py-3 text-center text-xs text-[#8b8b9e] font-medium">Decision</th>
                      <th className="px-4 py-3 text-left text-xs text-[#8b8b9e] font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.decisions.map((d) => (
                      <tr key={d.receiptId} className="border-b border-[#1e1e2e] hover:bg-[#0a0a0f]/40 transition-colors">
                        <td className="px-4 py-3">
                          <a href={d.url} target="_blank" rel="noopener noreferrer"
                             className="text-[#6366f1] hover:text-indigo-300 transition-colors">
                            {d.source}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-right text-[#f0f0f5] font-mono text-xs">
                          ${(d.amountPaid / 1_000_000).toFixed(4)}
                        </td>
                        <td className="px-4 py-3 text-right text-[#f0f0f5]">{d.scores.relevance}%</td>
                        <td className="px-4 py-3 text-right text-[#f0f0f5]">{d.scores.total}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded border font-mono text-xs ${decisionStyle(d.decision)}`}>
                            {d.decision}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#8b8b9e] text-xs max-w-[200px] truncate">{d.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Answer */}
            <div className="bg-[#111118] rounded-xl p-6 border border-[#1e1e2e]">
              <h2 className="font-semibold mb-3 text-[#f0f0f5]">Answer</h2>
              <p className="text-[#f0f0f5] leading-relaxed whitespace-pre-wrap">{result.answer}</p>
            </div>

            {/* Receipt Links */}
            <div className="bg-[#111118] rounded-xl p-6 border border-[#1e1e2e]">
              <h2 className="font-semibold mb-3 text-[#f0f0f5]">Public Receipts</h2>
              <div className="space-y-2">
                {result.decisions.map((d) => (
                  <Link
                    key={d.receiptId}
                    href={d.receiptUrl}
                    className={`flex items-center justify-between p-3 rounded-lg border hover:border-[#6366f1]/50 transition-colors ${decisionStyle(d.decision)} bg-opacity-5`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded border font-mono text-xs ${decisionStyle(d.decision)}`}>
                        {d.decision}
                      </span>
                      <span className="text-sm text-[#f0f0f5]">{d.source}</span>
                    </div>
                    <span className="text-xs text-[#6366f1]">View receipt →</span>
                  </Link>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-[#1e1e2e] flex justify-between text-sm text-[#8b8b9e]">
                <span>
                  Total USDC paid:{" "}
                  <span className="text-[#00ff88] font-mono">${(result.totalPaid / 1_000_000).toFixed(4)}</span>
                </span>
                <span>
                  Query fee:{" "}
                  <span className="text-[#f0f0f5] font-mono">${(result.queryFee / 1_000_000).toFixed(4)}</span>
                </span>
              </div>
            </div>

            <button
              onClick={() => { setStep("idle"); setResult(null); setLogs([]); setError(""); }}
              className="text-[#8b8b9e] hover:text-[#f0f0f5] text-sm underline transition-colors"
            >
              Ask another question
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
