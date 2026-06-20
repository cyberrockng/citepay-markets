"use client";
import { useState } from "react";
import Link from "next/link";

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

const DECISION_COLOR: Record<string, string> = {
  PAY: "text-green-400 bg-green-900/30 border-green-800",
  REFUSE: "text-red-400 bg-red-900/30 border-red-800",
  SKIP: "text-gray-400 bg-gray-800/30 border-gray-700",
};


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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setResult(null);
    setError("");
    setLogs([]);

    // Step 1: Hit without payment to show 402
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

    // Step 2: Simulate payment (dev mode)
    setStep("paid");
    addLog("→ Constructing X-PAYMENT header (dev mode simulation)...");

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

    // Step 3: Retry with payment
    setStep("running");
    addLog("→ POST /api/ask (with X-PAYMENT header)");
    addLog("→ Agent evaluating creator sources...");

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
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm">← Home</Link>
          <h1 className="text-3xl font-bold mt-4">Ask CitePay</h1>
          <p className="text-gray-400 mt-1">Pay to query. Agent searches creator sources. Every decision gets a receipt.</p>
        </div>

        {/* Query Form */}
        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-2">Research Question</label>
            <textarea
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
              rows={3}
              placeholder="e.g. What makes x402 useful for AI agents?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={step !== "idle" && step !== "error" && step !== "done"}
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-2">Agent Budget (USDC)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="1.0"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
            <div className="pt-6">
              <button
                type="submit"
                disabled={!query.trim() || (step !== "idle" && step !== "error" && step !== "done")}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-8 py-2 rounded-lg transition"
              >
                {step === "running" ? "Running..." : "Ask →"}
              </button>
            </div>
          </div>
          <p className="text-gray-500 text-xs mt-3">Query fee: $0.01 USDC via x402 · Agent budget: up to ${budget} USDC for creator citations</p>
        </form>

        {/* Proof Console */}
        {logs.length > 0 && (
          <div className="bg-black rounded-xl p-4 border border-gray-800 mb-6 font-mono text-xs">
            <div className="text-gray-500 mb-2">{"// Proof Console"}</div>
            {logs.map((log, i) => (
              <div key={i} className={log.includes("✗") ? "text-red-400" : log.includes("✓") ? "text-green-400" : "text-gray-300"}>
                {log}
              </div>
            ))}
            {(step === "waiting_payment" || step === "paid" || step === "running") && (
              <div className="text-indigo-400 animate-pulse">...</div>
            )}
          </div>
        )}

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
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800">
                <h2 className="font-semibold">Source Competition Board</h2>
                <p className="text-gray-500 text-xs mt-1">Agent evaluated {result.decisions.length} sources</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-500 text-xs">
                      <th className="px-4 py-3 text-left">Source</th>
                      <th className="px-4 py-3 text-right">Price</th>
                      <th className="px-4 py-3 text-right">Relevance</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-center">Decision</th>
                      <th className="px-4 py-3 text-left">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.decisions.map((d) => (
                      <tr key={d.receiptId} className="border-b border-gray-800 hover:bg-gray-800/30">
                        <td className="px-4 py-3">
                          <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                            {d.source}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400 font-mono text-xs">
                          ${(d.amountPaid / 1_000_000).toFixed(4)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">{d.scores.relevance}%</td>
                        <td className="px-4 py-3 text-right text-gray-300">{d.scores.total}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-mono border ${DECISION_COLOR[d.decision]}`}>
                            {d.decision}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{d.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Answer */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h2 className="font-semibold mb-3">Answer</h2>
              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{result.answer}</p>
            </div>

            {/* Receipts */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h2 className="font-semibold mb-3">Public Receipts</h2>
              <div className="space-y-2">
                {result.decisions.map((d) => (
                  <Link
                    key={d.receiptId}
                    href={d.receiptUrl}
                    className="flex items-center justify-between p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-mono px-2 py-0.5 rounded border ${DECISION_COLOR[d.decision]}`}>
                        {d.decision}
                      </span>
                      <span className="text-sm text-gray-300">{d.source}</span>
                    </div>
                    <span className="text-xs text-indigo-400">View receipt →</span>
                  </Link>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between text-sm text-gray-500">
                <span>Total USDC paid to creators: <span className="text-green-400">${(result.totalPaid / 1_000_000).toFixed(4)}</span></span>
                <span>Query fee: <span className="text-gray-300">${(result.queryFee / 1_000_000).toFixed(4)}</span></span>
              </div>
            </div>

            <button
              onClick={() => { setStep("idle"); setResult(null); setLogs([]); setError(""); }}
              className="text-gray-500 hover:text-gray-300 text-sm underline"
            >
              Ask another question
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
