"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { decisionStyle } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { POLICY_PRESETS, type AgentPolicy } from "@/lib/policy";

type Step = "idle" | "waiting_payment" | "paid" | "running" | "done" | "error";

interface TraceEntry {
  id: number;
  icon: string;
  text: string;
  sub?: string;
  badge?: string;
  badgeClass?: string;
  elapsed: number;
}

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
  sufficiencyStop: boolean;
}

interface QueryResult {
  queryId: string;
  answer: string;
  decisions: QueryDecision[];
  totalPaid: number;
  queryFee: number;
  policyProfile: string;
  stoppedEarly: boolean;
}

const DECISION_BADGE: Record<string, string> = {
  PAY:              "border-[#00ff88]/60 text-[#00ff88] bg-[#00ff88]/10",
  REFUSE:           "border-red-600/50 text-red-400 bg-red-900/10",
  SKIP:             "border-[#3e3e4e] text-[#8b8b9e]",
  BLOCKED_BY_POLICY:"border-orange-600/50 text-orange-400 bg-orange-900/10",
  STOP:             "border-amber-600/40 text-amber-400 bg-amber-900/10",
};

const POLICY_OPTIONS = [
  { key: "conservative", label: "Conservative", desc: "Bonded only · max $0.002 · relevance ≥ 70 · spend cap $0.01 · stops at 2 citations", color: "border-yellow-600/40 text-yellow-400", active: "border-yellow-500 bg-yellow-900/20" },
  { key: "balanced",     label: "Balanced",     desc: "Default · max $0.005 · relevance ≥ 40 · no cap · stops at 3 citations",             color: "border-[#6366f1]/40 text-[#6366f1]", active: "border-[#6366f1] bg-[#6366f1]/10" },
  { key: "aggressive",   label: "Aggressive",   desc: "Higher spend · max $0.01 · relevance ≥ 20 · no cap · stops at 5 citations",         color: "border-[#00ff88]/30 text-[#00ff88]", active: "border-[#00ff88] bg-[#00ff88]/10" },
] as const;

export default function AskPage() {
  const [query, setQuery]       = useState("");
  const [budget, setBudget]     = useState("0.05");
  const [policyKey, setPolicyKey] = useState<"conservative" | "balanced" | "aggressive">("balanced");
  const [step, setStep]         = useState<Step>("idle");
  const [result, setResult]     = useState<QueryResult | null>(null);
  const [error, setError]       = useState("");
  const [traces, setTraces]     = useState<TraceEntry[]>([]);
  const consoleRef              = useRef<HTMLDivElement>(null);
  const traceIdRef              = useRef(0);
  const startMsRef              = useRef(0);

  const isActive = step !== "idle" && step !== "error" && step !== "done";
  const policy: AgentPolicy = POLICY_PRESETS[policyKey];

  // Auto-scroll console as entries arrive
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [traces]);

  function addTrace(entry: Omit<TraceEntry, "id" | "elapsed">) {
    setTraces((t) => [...t, { ...entry, id: traceIdRef.current++, elapsed: Date.now() - startMsRef.current }]);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyStreamEvent(event: Record<string, any>) {
    const { type } = event;

    if (type === "payment_accepted") {
      addTrace({ icon: "✓", text: `Demo payment accepted · ${event.formatted} USDC via Circle Gateway`, badgeClass: "text-[#00ff88]" });
    } else if (type === "scoring_start") {
      addTrace({ icon: "🔍", text: `Scoring ${event.total} sources with Claude Haiku…`, sub: `${event.policy} policy active` });
    } else if (type === "scoring_complete") {
      addTrace({ icon: "🔍", text: `Scoring complete · ${event.count} sources evaluated` });
    } else if (type === "decision") {
      const isSuffStop = event.sufficiencyStop;
      const badge      = isSuffStop ? "STOP" : event.decision === "BLOCKED_BY_POLICY" ? "BLOCKED" : event.decision;
      const badgeClass = DECISION_BADGE[isSuffStop ? "STOP" : event.decision] ?? DECISION_BADGE.SKIP;
      const icon       = event.decision === "PAY" ? "→" : isSuffStop ? "⚡" : "·";
      addTrace({
        icon,
        text: event.sourceTitle,
        sub: `rel ${event.relevance}  score ${event.score}  ${event.reason}`,
        badge, badgeClass,
      });
    } else if (type === "weights") {
      const list = (event.weights as { sourceTitle: string; weight: number; weightedAmount: number }[])
        .map((w) => `${w.sourceTitle.split(":")[0].trim()} ${(w.weight * 100).toFixed(0)}%`)
        .join("  ·  ");
      addTrace({ icon: "⚖", text: "Contribution weights computed", sub: list, badgeClass: "text-[#a78bfa]" });
    } else if (type === "paying") {
      addTrace({ icon: "💸", text: `Paying ${event.sourceTitle}`, sub: `${event.formatted} USDC → creator wallet` });
    } else if (type === "paid") {
      const status = event.status === "confirmed" ? "✓ on-chain" : "⚠ simulated";
      addTrace({ icon: "✓", text: `Paid ${event.sourceTitle} · ${event.formatted} USDC`, sub: `${status}  tx ${(event.txHash as string).slice(0, 22)}…`, badgeClass: "text-[#00ff88]" });
    } else if (type === "anchoring") {
      addTrace({ icon: "⛓", text: `Anchoring ${event.sourceTitle} on-chain…` });
    } else if (type === "anchored") {
      addTrace({ icon: "⛓", text: `Anchored · on-chain receipt #${event.onChainReceiptId}`, sub: `tx ${(event.anchorTxHash as string).slice(0, 22)}…`, badgeClass: "text-[#6366f1]" });
    } else if (type === "answer_generating") {
      addTrace({ icon: "✍", text: "Generating answer from cited sources…" });
    } else if (type === "done") {
      const d = event.decisions as QueryDecision[];
      const paid = d.filter((x) => x.decision === "PAY").length;
      const refused = d.filter((x) => x.decision === "REFUSE").length;
      const skipped = d.filter((x) => x.decision === "SKIP").length;
      addTrace({
        icon: "✅",
        text: `Done · ${paid} cited · $${(event.totalPaid / 1_000_000).toFixed(4)} USDC routed`,
        sub:  `PAY ${paid}  REFUSE ${refused}  SKIP ${skipped}${event.stoppedEarly ? "  ⚡ early stop" : ""}`,
        badgeClass: "text-[#00ff88]",
      });
      setResult(event as QueryResult);
      setStep("done");
    } else if (type === "error") {
      addTrace({ icon: "✗", text: event.message, badgeClass: "text-red-400" });
      setError(event.message);
      setStep("error");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setResult(null);
    setError("");
    setTraces([]);
    traceIdRef.current = 0;
    startMsRef.current = Date.now();

    setStep("waiting_payment");

    // Step 1: Hit /api/ask to demonstrate the real 402 gate
    addTrace({ icon: "→", text: "POST /api/ask", sub: "no payment header — proving x402 gate" });
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
    addTrace({ icon: "←", text: "402 Payment Required", sub: "x402 payment details in WWW-Authenticate header", badge: "402", badgeClass: "text-amber-400 border-amber-600/40 bg-amber-900/10" });
    addTrace({ icon: "◈", text: `${policy.name} policy`, sub: `max $${(policy.maxPricePerCitation / 1_000_000).toFixed(3)}  min relevance ${policy.minRelevanceScore}${policy.requireBonded ? "  bonded only" : ""}  stop at ${policy.sufficiencyMaxCitations} citations` });

    setStep("running");

    // Step 2: Stream from demo-query-stream
    let res2: Response;
    try {
      res2 = await fetch("/api/demo-query-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, budget: parseFloat(budget), policy: policyKey }),
      });
    } catch (err) {
      setStep("error");
      setError(String(err));
      return;
    }

    if (!res2.ok || !res2.body) {
      setStep("error");
      setError("Stream failed: " + res2.status);
      return;
    }

    const reader  = res2.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try { applyStreamEvent(JSON.parse(line.slice(6))); } catch { /* skip malformed */ }
      }
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
                className={`rounded-lg p-4 border text-left transition-all ${policyKey === opt.key ? opt.active + " border-2" : "border-[#1e1e2e] hover:border-[#3e3e4e]"}`}
              >
                <div className={`font-semibold text-sm mb-1 ${policyKey === opt.key ? opt.color.split(" ")[1] : "text-[#f0f0f5]"}`}>{opt.label}</div>
                <div className="text-[#8b8b9e] text-xs leading-relaxed">{opt.desc}</div>
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-[#4a4a5e] font-mono">
            <span>max price: <span className="text-[#8b8b9e]">${(policy.maxPricePerCitation / 1_000_000).toFixed(3)}</span></span>
            <span>min relevance: <span className="text-[#8b8b9e]">{policy.minRelevanceScore}</span></span>
            <span>bonded only: <span className="text-[#8b8b9e]">{policy.requireBonded ? "yes" : "no"}</span></span>
            <span>early stop: <span className="text-[#8b8b9e]">{policy.sufficiencyMaxCitations} citations</span></span>
          </div>
        </div>

        {/* Two-column layout */}
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
                type="number" step="0.01" min="0.01" max="1.0"
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
              {isActive ? "Running…" : "Ask →"}
            </button>
            <p className="text-[#4a4a5e] text-xs mt-3">
              Real $0.001 USDC via Circle Gateway on Arc · Policy: {policy.name} · Budget: up to ${budget} USDC
            </p>
          </form>

          {/* Agent Console */}
          <div className="bg-[#0a0a0f] rounded-xl border border-[#1e1e2e] flex flex-col min-h-[300px]">
            <div className="px-4 py-2.5 border-b border-[#1e1e2e] flex items-center justify-between">
              <span className="text-[#4a4a5e] text-xs font-mono">// Agent Console</span>
              {isActive && <span className="flex h-2 w-2"><span className="animate-ping absolute h-2 w-2 rounded-full bg-[#6366f1] opacity-75" /><span className="relative rounded-full h-2 w-2 bg-[#6366f1]" /></span>}
            </div>

            {traces.length === 0 && step === "idle" && (
              <div className="flex-1 flex items-center justify-center text-[#4a4a5e] text-xs font-mono px-4">
                Agent reasoning trace will stream here live
              </div>
            )}

            <div ref={consoleRef} className="flex-1 overflow-y-auto p-4 space-y-1.5 font-mono text-xs max-h-[400px]">
              {traces.map((t) => (
                <div key={t.id} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-[#4a4a5e] shrink-0 w-12 text-right tabular-nums">
                    {t.elapsed < 1000 ? `${t.elapsed}ms` : `${(t.elapsed / 1000).toFixed(1)}s`}
                  </span>
                  <span className="shrink-0 w-4 text-center">{t.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={t.badgeClass ?? "text-[#f0f0f5]"}>{t.text}</span>
                      {t.badge && (
                        <span className={`px-1.5 py-0 rounded border text-[10px] ${t.badgeClass ?? "border-[#3e3e4e] text-[#8b8b9e]"}`}>
                          {t.badge}
                        </span>
                      )}
                    </div>
                    {t.sub && <div className="text-[#4a4a5e] mt-0.5 truncate" title={t.sub}>{t.sub}</div>}
                  </div>
                </div>
              ))}
              {isActive && <div className="text-[#6366f1] animate-pulse pl-16">…</div>}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 mb-6 text-red-400 text-sm">{error}</div>
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
                {result.stoppedEarly && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-900/30 border border-amber-600/40 text-amber-400 text-xs font-mono">
                    ⚡ early stop
                  </span>
                )}
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
                          <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-[#6366f1] hover:text-indigo-300 transition-colors">{d.source}</a>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          <span className={d.decision === "PAY" ? "text-[#00ff88]" : "text-[#8b8b9e]"}>
                            ${(d.amountPaid / 1_000_000).toFixed(4)}
                          </span>
                          {d.decision === "PAY" && d.contributionWeight !== null && (
                            <span className="ml-1.5 text-[#a78bfa] text-[10px]">({(d.contributionWeight * 100).toFixed(0)}%)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-[#f0f0f5]">{d.scores.relevance}%</td>
                        <td className="px-4 py-3 text-right text-[#f0f0f5]">{d.scores.total}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded border font-mono text-xs ${d.sufficiencyStop ? DECISION_BADGE.STOP : decisionStyle(d.decision)}`}>
                            {d.sufficiencyStop ? "STOP" : d.decision === "BLOCKED_BY_POLICY" ? "BLOCKED" : d.decision}
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
                        isPay ? "border-[#00ff88]/30 hover:border-[#00ff88]/60 bg-[#00ff88]/5"
                        : isBlocked ? "border-orange-700/30 hover:border-orange-600/50 bg-orange-900/10"
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
                <span>Total USDC paid: <span className="text-[#00ff88] font-mono">${(result.totalPaid / 1_000_000).toFixed(4)}</span></span>
                <span>Query fee: <span className="text-[#f0f0f5] font-mono">${(result.queryFee / 1_000_000).toFixed(4)}</span></span>
              </div>
            </div>

            <button
              onClick={() => { setStep("idle"); setResult(null); setTraces([]); setError(""); }}
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
