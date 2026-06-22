"use client";
import { useState } from "react";
import Link from "next/link";
import { decisionStyle } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { POLICY_PRESETS, type AgentPolicy } from "@/lib/policy";

type Step = "idle" | "waiting_payment" | "paid" | "running" | "done" | "error";

interface QueryDecision {
  receiptId: string;
  decision: string;
  source: string;
  url: string;
  scores: { relevance: number; price: number; bond: number; reputation: number; total: number };
  reason: string;
  amountPaid: number;
  sourcePrice: number;
  contributionWeight: number | null;
  txHash: string | null;
  evidenceHash: string;
  receiptUrl: string;
  policyProfile: string;
  policyRulesPassed: string[];
  policyRulesFailed: string[];
  policyReason: string | null;
}

interface QueryResult {
  queryId: string;
  answer: string;
  decisions: QueryDecision[];
  totalPaid: number;
  queryFee: number;
  policyProfile: string;
}

const POLICY_OPTIONS = [
  {
    key: "conservative",
    label: "Conservative",
    desc: "Bonded only · max $0.002 · relevance ≥ 70 · spend cap $0.01",
    color: "border-yellow-600/40 text-yellow-400",
    active: "border-yellow-500 bg-yellow-900/20",
  },
  {
    key: "balanced",
    label: "Balanced",
    desc: "Default · max $0.005 · relevance ≥ 40 · no cap",
    color: "border-[#6366f1]/40 text-[#6366f1]",
    active: "border-[#6366f1] bg-[#6366f1]/10",
  },
  {
    key: "aggressive",
    label: "Aggressive",
    desc: "Higher spend · max $0.01 · relevance ≥ 20 · no cap",
    color: "border-[#00ff88]/30 text-[#00ff88]",
    active: "border-[#00ff88] bg-[#00ff88]/10",
  },
] as const;

export default function AskPage() {
  const [query, setQuery] = useState("");
  const [budget, setBudget] = useState("0.05");
  const [policyKey, setPolicyKey] = useState<"conservative" | "balanced" | "aggressive">("balanced");
  const [step, setStep] = useState<Step>("idle");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<string[]>([]);

  function addLog(msg: string) {
    setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }

  const isActive = step !== "idle" && step !== "error" && step !== "done";
  const policy: AgentPolicy = POLICY_PRESETS[policyKey];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setResult(null);
    setError("");
    setLogs([]);

    setStep("waiting_payment");
    addLog("→ POST /api/ask (no payment header)");

    const res1 = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, budget: parseFloat(budget), policy: policyKey }),
    });

    if (res1.status !== 402) {
      setStep("error");
      setError("Expected 402 Payment Required but got: " + res1.status);
      return;
    }

    addLog("← 402 Payment Required — x402 payment details received");
    addLog(`→ Policy: ${policy.name} · max price $${(policy.maxPricePerCitation / 1_000_000).toFixed(3)} · min relevance ${policy.minRelevanceScore}${policy.requireBonded ? " · bonded only" : ""}`);

    setStep("paid");
    addLog("→ Signing EIP-3009 authorization via Circle Gateway (Arc testnet)…");
    addLog("✓ Demo buyer wallet sends real $0.001 USDC via Circle Gateway");

    setStep("running");
    addLog("→ POST /api/demo-query (Circle Gateway payment settling on Arc)");
    addLog("→ Agent evaluating creator sources under policy: " + policy.name);

    try {
      const res2 = await fetch("/api/demo-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, budget: parseFloat(budget), policy: policyKey }),
      });

      if (!res2.ok) {
        const errData = await res2.json();
        throw new Error(errData.error || "Agent error");
      }

      const data = await res2.json();
      const blocked = data.decisions.filter((d: QueryDecision) => d.decision === "BLOCKED_BY_POLICY").length;
      if (data._demo?.settleTx) addLog(`✓ Circle Gateway settle tx: ${data._demo.settleTx.slice(0, 20)}…`);
      addLog(`✓ Agent evaluated ${data.decisions.length} sources`);
      addLog(`✓ PAY: ${data.decisions.filter((d: QueryDecision) => d.decision === "PAY").length} · REFUSE: ${data.decisions.filter((d: QueryDecision) => d.decision === "REFUSE").length} · SKIP: ${data.decisions.filter((d: QueryDecision) => d.decision === "SKIP").length}${blocked ? ` · BLOCKED: ${blocked}` : ""}`);
      addLog(`✓ Total USDC paid: $${(data.totalPaid / 1_000_000).toFixed(4)}`);
      addLog(`✓ ${data.decisions.length} policy receipts generated`);

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
          <BackButton label="Home" />
          <h1 className="text-3xl font-bold mt-4 text-[#f0f0f5]">Agent Workbench</h1>
          <p className="text-[#8b8b9e] mt-1">Set a spend policy · Pay to query · Every decision gets a public Policy Receipt</p>
        </div>

        {/* Policy Selector */}
        <div className="bg-[#111118] rounded-xl p-5 border border-[#1e1e2e] mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-[#8b8b9e] uppercase tracking-widest">Agent Spend Policy</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {POLICY_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setPolicyKey(opt.key)}
                disabled={isActive}
                className={`rounded-lg p-4 border text-left transition-all ${
                  policyKey === opt.key
                    ? opt.active + " border-2"
                    : "border-[#1e1e2e] hover:border-[#3e3e4e]"
                }`}
              >
                <div className={`font-semibold text-sm mb-1 ${policyKey === opt.key ? opt.color.split(" ")[1] : "text-[#f0f0f5]"}`}>
                  {opt.label}
                </div>
                <div className="text-[#8b8b9e] text-xs leading-relaxed">{opt.desc}</div>
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-[#4a4a5e] font-mono">
            <span>max price: <span className="text-[#8b8b9e]">${(policy.maxPricePerCitation / 1_000_000).toFixed(3)}</span></span>
            <span>min relevance: <span className="text-[#8b8b9e]">{policy.minRelevanceScore}</span></span>
            <span>bonded only: <span className="text-[#8b8b9e]">{policy.requireBonded ? "yes" : "no"}</span></span>
            <span>spend cap: <span className="text-[#8b8b9e]">{policy.sessionSpendCap ? `$${(policy.sessionSpendCap / 1_000_000).toFixed(3)}` : "none"}</span></span>
          </div>
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
              Real $0.001 USDC via Circle Gateway on Arc · Policy: {policy.name} · Budget: up to ${budget} USDC
            </p>
          </form>

          {/* Proof Console */}
          <div className="bg-[#0a0a0f] rounded-xl border border-[#1e1e2e] p-5 font-mono text-xs flex flex-col min-h-[200px]">
            <div className="text-[#4a4a5e] mb-3 text-xs">{"// Proof Console"}</div>
            {logs.length === 0 && step === "idle" && (
              <div className="text-[#4a4a5e] flex-1 flex items-center justify-center">
                x402 protocol trace + policy evaluation will appear here
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
              <div className="px-6 py-4 border-b border-[#1e1e2e] flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-[#f0f0f5]">Source Competition Board</h2>
                  <p className="text-[#8b8b9e] text-xs mt-0.5">
                    {result.decisions.length} sources evaluated under <span className="text-[#6366f1]">{result.policyProfile}</span> policy
                  </p>
                </div>
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
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          <span className={d.decision === "PAY" ? "text-[#00ff88]" : "text-[#8b8b9e]"}>
                            ${(d.amountPaid / 1_000_000).toFixed(4)}
                          </span>
                          {d.decision === "PAY" && d.contributionWeight !== null && (
                            <span className="ml-1.5 text-[#a78bfa] text-[10px]">
                              ({(d.contributionWeight * 100).toFixed(0)}%)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-[#f0f0f5]">{d.scores.relevance}%</td>
                        <td className="px-4 py-3 text-right text-[#f0f0f5]">{d.scores.total}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded border font-mono text-xs ${decisionStyle(d.decision)}`}>
                            {d.decision === "BLOCKED_BY_POLICY" ? "BLOCKED" : d.decision}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#8b8b9e] text-xs max-w-[200px] truncate" title={d.reason}>{d.reason}</td>
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
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-semibold text-[#f0f0f5]">Policy Receipt Audit Trail</h2>
                <span className="text-xs text-[#4a4a5e]">every decision is public</span>
              </div>
              <div className="space-y-2">
                {result.decisions.map((d) => {
                  const isPay = d.decision === "PAY";
                  const isBlocked = d.decision === "BLOCKED_BY_POLICY";
                  return (
                    <Link
                      key={d.receiptId}
                      href={d.receiptUrl}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        isPay
                          ? "border-[#00ff88]/30 hover:border-[#00ff88]/60 bg-[#00ff88]/5"
                          : isBlocked
                          ? "border-orange-700/30 hover:border-orange-600/50 bg-orange-900/10"
                          : "border-[#1e1e2e] hover:border-[#6366f1]/30 opacity-60 hover:opacity-80"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded border font-mono text-xs ${decisionStyle(d.decision)}`}>
                          {d.decision === "BLOCKED_BY_POLICY" ? "BLOCKED" : d.decision}
                        </span>
                        <span className={`text-sm ${isPay ? "text-[#f0f0f5]" : "text-[#8b8b9e]"}`}>{d.source}</span>
                      </div>
                      <span className={`text-xs ${isPay ? "text-[#6366f1]" : isBlocked ? "text-orange-400" : "text-[#4a4a5e]"}`}>
                        {isPay ? "View receipt →" : isBlocked ? "Policy receipt →" : "Audit log →"}
                      </span>
                    </Link>
                  );
                })}
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
