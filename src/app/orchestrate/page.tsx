"use client";
import { useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { decisionStyle } from "@/components/ui";

interface Decision {
  decision: string;
  source: string;
  url: string;
  amountPaid: number;
  scores: { relevance: number; total: number };
  receiptUrl: string;
  txHash: string | null;
}

interface SubQuery {
  subQuery: string;
  queryId: string;
  answer: string;
  decisions: Decision[];
  totalPaid: number;
  gatewayAmountMicro: string;
  paidViaGateway: boolean;
}

interface OrchestrateResult {
  query: string;
  finalAnswer: string;
  subQueries: SubQuery[];
  agentTrace: string[];
  stats: {
    subQueriesDispatched: number;
    totalGatewayFeeMicro: number;
    totalCreatorPaymentsMicro: number;
    citationsPurchased: number;
    orchestratorWallet: string;
  };
}

export default function OrchestratePage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OrchestrateResult | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<number>(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || loading) return;
    setResult(null);
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, policy: "balanced" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Orchestration failed");
      setResult(data as OrchestrateResult);
      setActiveTab(0);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5]">
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <BackButton label="Home" />
          <div className="mt-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">
              O
            </div>
            <h1 className="text-3xl font-bold text-[#f0f0f5]">Multi-Agent Orchestrator</h1>
          </div>
          <p className="text-[#8b8b9e] mt-2 ml-11">
            Orchestrator decomposes your query → dispatches researcher agents via Circle Gateway x402 payments → synthesizes a comprehensive answer
          </p>
        </div>

        {/* Agent Flow Diagram */}
        <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] p-5 mb-6">
          <div className="text-xs text-[#4a4a5e] font-mono mb-3">{"// agent payment flow"}</div>
          <div className="flex items-center gap-2 flex-wrap text-sm font-mono">
            <span className="px-3 py-1.5 rounded-lg bg-violet-900/30 border border-violet-700/40 text-violet-300">You</span>
            <span className="text-[#4a4a5e]">→</span>
            <span className="px-3 py-1.5 rounded-lg bg-indigo-900/30 border border-indigo-700/40 text-indigo-300">Orchestrator Agent</span>
            <span className="text-[#4a4a5e]">→ x402 ($0.001 each) →</span>
            <span className="px-3 py-1.5 rounded-lg bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88]">Researcher Agent</span>
            <span className="text-[#4a4a5e]">→ USDC →</span>
            <span className="px-3 py-1.5 rounded-lg bg-amber-900/20 border border-amber-700/30 text-amber-300">Creators</span>
          </div>
        </div>

        {/* Query Form */}
        <form onSubmit={handleSubmit} className="bg-[#111118] rounded-xl border border-[#1e1e2e] p-6 mb-6">
          <label className="block text-sm font-medium text-[#f0f0f5] mb-2">Research Question</label>
          <textarea
            className="w-full bg-[#0a0a0f] border border-[#1e1e2e] focus:border-indigo-500 rounded-lg px-4 py-3 text-[#f0f0f5] placeholder-[#4a4a5e] focus:outline-none resize-none transition-colors mb-4"
            rows={3}
            placeholder="e.g. How do AI agents use stablecoins for autonomous payments, and what infrastructure makes this possible?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!query.trim() || loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                Orchestrating agents…
              </>
            ) : (
              "Orchestrate →"
            )}
          </button>
          {loading && (
            <p className="text-[#4a4a5e] text-xs text-center mt-3 animate-pulse">
              Decomposing query → dispatching sub-agents via Circle Gateway → synthesizing…
            </p>
          )}
        </form>

        {/* Error */}
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 mb-6 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">

            {/* Stats bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Sub-agents hired", value: result.stats.subQueriesDispatched, color: "text-indigo-400" },
                { label: "Gateway fees paid", value: `$${(result.stats.totalGatewayFeeMicro / 1e6).toFixed(3)} USDC`, color: "text-violet-400" },
                { label: "Citations bought", value: result.stats.citationsPurchased, color: "text-[#00ff88]" },
                { label: "Creator payments", value: `$${(result.stats.totalCreatorPaymentsMicro / 1e6).toFixed(4)} USDC`, color: "text-amber-400" },
              ].map((s) => (
                <div key={s.label} className="bg-[#111118] rounded-xl border border-[#1e1e2e] p-4">
                  <div className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-[#8b8b9e] mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Agent Trace */}
            <div className="bg-[#0a0a0f] rounded-xl border border-[#1e1e2e] p-5">
              <div className="text-xs text-[#4a4a5e] font-mono mb-3">{"// agent execution trace"}</div>
              <div className="space-y-1.5 font-mono text-xs">
                {result.agentTrace.map((line, i) => (
                  <div key={i} className={
                    line.startsWith("[Orchestrator]")
                      ? "text-indigo-400"
                      : line.startsWith("[Researcher")
                      ? "text-[#00ff88]"
                      : "text-[#8b8b9e]"
                  }>
                    {line}
                  </div>
                ))}
              </div>
            </div>

            {/* Final Answer */}
            <div className="bg-[#111118] rounded-xl border border-indigo-900/30 p-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded bg-indigo-600/40 flex items-center justify-center text-indigo-300 text-xs font-bold">S</div>
                <h2 className="font-semibold text-[#f0f0f5]">Synthesized Answer</h2>
                <span className="text-xs text-indigo-400 bg-indigo-900/20 px-2 py-0.5 rounded-full">from {result.stats.subQueriesDispatched} agents</span>
              </div>
              <p className="text-[#f0f0f5] leading-relaxed whitespace-pre-wrap">{result.finalAnswer}</p>
            </div>

            {/* Sub-agent tabs */}
            <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] overflow-hidden">
              <div className="flex border-b border-[#1e1e2e] overflow-x-auto">
                {result.subQueries.map((sq, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveTab(i)}
                    className={`flex-shrink-0 px-5 py-3 text-sm font-medium transition-colors ${
                      activeTab === i
                        ? "bg-[#0a0a0f] text-[#f0f0f5] border-b-2 border-indigo-500"
                        : "text-[#8b8b9e] hover:text-[#f0f0f5]"
                    }`}
                  >
                    Sub-agent {i + 1}
                    {sq.paidViaGateway && (
                      <span className="ml-2 text-xs text-[#00ff88] opacity-80">x402</span>
                    )}
                  </button>
                ))}
              </div>

              {result.subQueries[activeTab] && (() => {
                const sq = result.subQueries[activeTab];
                const paidDecisions = sq.decisions.filter((d) => d.decision === "PAY");
                return (
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <div className="text-xs text-[#8b8b9e] font-mono mb-1">Sub-query</div>
                        <div className="text-[#f0f0f5] font-medium">{sq.subQuery}</div>
                      </div>
                      {sq.paidViaGateway && (
                        <div className="flex-shrink-0 text-right">
                          <div className="text-xs text-[#8b8b9e] font-mono">Gateway fee</div>
                          <div className="text-[#00ff88] font-mono text-sm">${(Number(sq.gatewayAmountMicro) / 1e6).toFixed(3)}</div>
                        </div>
                      )}
                    </div>

                    <div className="bg-[#0a0a0f] rounded-lg p-4 mb-4 text-sm text-[#f0f0f5] leading-relaxed">
                      {sq.answer}
                    </div>

                    {sq.decisions.length > 0 && (
                      <div>
                        <div className="text-xs text-[#8b8b9e] font-mono mb-2">Source decisions ({sq.decisions.length})</div>
                        <div className="space-y-1.5">
                          {sq.decisions.map((d, j) => (
                            <div key={j} className="flex items-center justify-between text-sm gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`flex-shrink-0 px-1.5 py-0.5 rounded border font-mono text-xs ${decisionStyle(d.decision)}`}>
                                  {d.decision === "BLOCKED_BY_POLICY" ? "BLK" : d.decision.slice(0, 4)}
                                </span>
                                <a href={d.url} target="_blank" rel="noopener noreferrer"
                                   className="text-[#8b8b9e] hover:text-indigo-300 truncate transition-colors">
                                  {d.source}
                                </a>
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0 font-mono text-xs text-[#4a4a5e]">
                                <span>rel:{d.scores.relevance}</span>
                                {d.decision === "PAY" && (
                                  <span className="text-[#00ff88]">+${(d.amountPaid / 1e6).toFixed(4)}</span>
                                )}
                                {d.receiptUrl && (
                                  <Link href={d.receiptUrl} className="text-indigo-400 hover:text-indigo-300">
                                    receipt →
                                  </Link>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {paidDecisions.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-[#1e1e2e] text-xs font-mono text-[#8b8b9e]">
                            Creator USDC paid: <span className="text-[#00ff88]">${(sq.totalPaid / 1e6).toFixed(4)}</span>
                            {paidDecisions[0]?.txHash && (
                              <> · tx: <span className="text-indigo-400">{paidDecisions[0].txHash.slice(0, 18)}…</span></>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Share CTA */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#111118] rounded-xl border border-[#1e1e2e] px-5 py-4">
              <div className="text-sm text-[#8b8b9e]">
                <span className="text-[#f0f0f5] font-semibold">{result.stats.subQueriesDispatched} agents</span> paid{" "}
                <span className="text-[#00ff88]">${(result.stats.totalGatewayFeeMicro / 1e6).toFixed(3)} USDC</span> in Gateway fees →{" "}
                <span className="text-[#00ff88]">{result.stats.citationsPurchased} citations</span> purchased on Arc
              </div>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                  `Just ran a multi-agent research query on CitePay Markets 🤖\n\n${result.stats.subQueriesDispatched} AI agents paid $${(result.stats.totalGatewayFeeMicro / 1e6).toFixed(3)} USDC via Circle Gateway on Arc → ${result.stats.citationsPurchased} citations bought from real creators\n\nQuery: "${result.query.slice(0, 80)}"\n\nTry it → https://citepay-markets.vercel.app/orchestrate\n\n#Lepton #CircleGateway #x402`
                )}`}
                target="_blank" rel="noopener noreferrer"
                className="flex-shrink-0 text-xs px-4 py-2 rounded-lg bg-[#1e1e2e] hover:bg-[#2e2e3e] text-[#8b8b9e] hover:text-[#f0f0f5] transition-colors font-mono"
              >
                Share on X →
              </a>
            </div>

            <div className="text-xs text-[#4a4a5e] font-mono">
              Orchestrator wallet: {result.stats.orchestratorWallet}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
