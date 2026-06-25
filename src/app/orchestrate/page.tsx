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

interface Stats {
  subQueriesDispatched: number;
  totalGatewayFeeMicro: number;
  totalCreatorPaymentsMicro: number;
  citationsPurchased: number;
  orchestratorWallet: string;
  agentToAgentCount?: number;
  agentCoordinationRewardsMicro?: number;
}

interface AgentReward {
  agentIndex: number;
  subQuery: string;
  agentAddress: string;
  rewardMicro: number;
  txHash: string | null;
  contributionScore: number;
}

interface PilotAllocation { agentName: string; sharePercent: number; reasoning: string; }
interface PilotPlan {
  planHash: string;
  allocations: PilotAllocation[];
  attestationTxHash: string | null;
  attestationExplorerUrl: string | null;
  attestationBlock: number | null;
}

function AgentNodeGrid({ subQueries, pendingCount, loading }: {
  subQueries: SubQuery[];
  pendingCount: number | null;
  loading: boolean;
}) {
  const doneCount = subQueries.length;
  const pendingN = pendingCount ?? 0;
  const totalAgents = Math.max(doneCount + pendingN, 3);
  const agents = Array.from({ length: totalAgents }, (_, i) => ({
    index: i,
    done: i < doneCount,
    running: i === doneCount && loading && pendingN > 0,
    result: subQueries[i] as SubQuery | undefined,
  }));
  const totalPaidMicro = subQueries.reduce((s, sq) => s + sq.totalPaid, 0);

  return (
    <div className="bg-[#111118] rounded-xl border border-indigo-900/30 p-4 mb-6">
      <div className="text-[10px] font-mono text-[#4a4a5e] mb-3 flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full inline-block ${loading ? "bg-indigo-400 animate-pulse" : "bg-[#00ff88]"}`} />
        LIVE AGENT NETWORK {loading ? "— RUNNING" : doneCount > 0 ? "— COMPLETE" : ""}
      </div>
      <div className="flex items-start gap-3 flex-wrap">
        {/* Orchestrator node */}
        <div className="flex flex-col items-center gap-1">
          <div className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center text-xs font-bold transition-all ${loading ? "border-violet-400 bg-violet-900/30 text-violet-300 animate-pulse" : doneCount > 0 ? "border-violet-400 bg-violet-900/30 text-violet-300" : "border-[#2e2e4e] bg-[#111118] text-[#4a4a5e]"}`}>O</div>
          <div className="text-[9px] font-mono text-violet-400">Orch.</div>
        </div>
        <div className="text-[#4a4a5e] text-sm mt-3">→</div>
        {/* Researcher agent nodes */}
        <div className="flex items-start gap-2 flex-wrap">
          {agents.map((a) => (
            <div key={a.index} className="flex flex-col items-center gap-1">
              <div className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center text-xs font-bold transition-all ${
                a.done
                  ? "border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]"
                  : a.running
                  ? "border-indigo-400 bg-indigo-900/20 text-indigo-300"
                  : "border-[#1e1e2e] bg-[#0a0a0f] text-[#4a4a5e]"
              }`}>
                {a.done ? "✓" : a.running ? (
                  <span className="inline-block w-3 h-3 border border-indigo-400 border-t-transparent rounded-full animate-spin" />
                ) : a.index + 1}
              </div>
              <div className={`text-[9px] font-mono ${a.done ? "text-[#00ff88]" : a.running ? "text-indigo-400 animate-pulse" : "text-[#4a4a5e]"}`}>
                R{a.index + 1}
              </div>
              {a.done && a.result && (
                <div className="text-[9px] font-mono text-[#00ff88]">
                  ${(a.result.totalPaid / 1e6).toFixed(3)}
                </div>
              )}
            </div>
          ))}
        </div>
        {doneCount > 0 && (
          <>
            <div className="text-[#4a4a5e] text-sm mt-3">→</div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-9 h-9 rounded-lg border-2 border-amber-500/50 bg-amber-900/10 flex items-center justify-center text-amber-300 text-xs font-bold">C</div>
              <div className="text-[9px] font-mono text-amber-400">Creators</div>
              <div className="text-[9px] font-mono text-[#00ff88]">${(totalPaidMicro / 1e6).toFixed(4)}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function OrchestratePage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [agentTrace, setAgentTrace] = useState<string[]>([]);
  const [subQueries, setSubQueries] = useState<SubQuery[]>([]);
  const [finalAnswer, setFinalAnswer] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pilotPlan, setPilotPlan] = useState<PilotPlan | null>(null);
  const [agentRewards, setAgentRewards] = useState<AgentReward[]>([]);
  const [knowledgeSourceId, setKnowledgeSourceId] = useState<string | null>(null);
  const [lesson, setLesson] = useState<{ lesson?: string; gap?: string; adjustment?: string } | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<number>(0);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || loading) return;

    setAgentTrace([]);
    setSubQueries([]);
    setFinalAnswer(null);
    setStats(null);
    setPilotPlan(null);
    setAgentRewards([]);
    setKnowledgeSourceId(null);
    setLesson(null);
    setError("");
    setPendingCount(null);
    setActiveTab(0);
    setLoading(true);

    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, policy: "balanced" }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const chunk = JSON.parse(trimmed) as {
              type: string;
              line?: string;
              index?: number;
              subQuery?: SubQuery;
              finalAnswer?: string;
              knowledgeSourceId?: string;
              subQueries?: SubQuery[];
              stats?: Stats;
              plan?: PilotPlan;
              pilotPlan?: PilotPlan;
              agentToAgentPayments?: AgentReward[];
              error?: string;
            };

            if (chunk.type === "trace" && chunk.line) {
              setAgentTrace((prev) => [...prev, chunk.line!]);
              const m = chunk.line.match(/Dispatching (\d+) researcher/);
              if (m) setPendingCount(Number(m[1]));
            } else if (chunk.type === "pilot_plan" && chunk.plan) {
              setPilotPlan(chunk.plan);
            } else if (chunk.type === "subquery_result" && chunk.subQuery) {
              setSubQueries((prev) => {
                const next = [...prev, chunk.subQuery!];
                setActiveTab(next.length - 1);
                setPendingCount((c) => (c !== null ? Math.max(0, c - 1) : null));
                return next;
              });
            } else if (chunk.type === "lesson") {
              const lc = chunk as Record<string, unknown>;
              setLesson({ lesson: lc.lesson as string, gap: lc.gap as string, adjustment: lc.adjustment as string });
            } else if (chunk.type === "knowledge_registered" && chunk.knowledgeSourceId) {
              setKnowledgeSourceId(chunk.knowledgeSourceId);
            } else if (chunk.type === "final") {
              if (chunk.finalAnswer) setFinalAnswer(chunk.finalAnswer);
              if (chunk.knowledgeSourceId) setKnowledgeSourceId(chunk.knowledgeSourceId);
              if (chunk.stats) setStats(chunk.stats);
              if (chunk.subQueries) setSubQueries(chunk.subQueries);
              if (chunk.pilotPlan) setPilotPlan(chunk.pilotPlan);
              if (chunk.agentToAgentPayments) setAgentRewards(chunk.agentToAgentPayments);
              setLoading(false);
            } else if (chunk.type === "error" && chunk.error) {
              setError(chunk.error);
              setLoading(false);
            }
          } catch { /* skip malformed line */ }
        }
      }
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  }

  const hasResults = finalAnswer !== null || subQueries.length > 0;

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
            <span className="px-3 py-1.5 rounded-lg bg-indigo-900/30 border border-indigo-700/40 text-indigo-300">Orchestrator</span>
            <span className="text-[#4a4a5e]">→ x402 ($0.001) →</span>
            <span className="px-3 py-1.5 rounded-lg bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88]">Researcher Agents</span>
            <span className="text-[#4a4a5e]">→ USDC →</span>
            <span className="px-3 py-1.5 rounded-lg bg-amber-900/20 border border-amber-700/30 text-amber-300">Creators</span>
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap text-xs font-mono text-[#4a4a5e]">
            <span className="text-[#6366f1]">⟳</span>
            <span>Orchestrator also releases USDC coordination rewards to sub-agents based on contribution score</span>
          </div>
        </div>

        {/* Live Agent Grid — visible during and after run */}
        {(loading || subQueries.length > 0) && (
          <AgentNodeGrid subQueries={subQueries} pendingCount={pendingCount} loading={loading} />
        )}

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
              {pendingCount !== null && pendingCount > 0
                ? `Waiting for ${pendingCount} researcher agent${pendingCount > 1 ? "s" : ""} to respond…`
                : "Decomposing query → dispatching sub-agents via Circle Gateway → synthesizing…"}
            </p>
          )}
        </form>

        {/* Error */}
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 mb-6 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Streaming agent trace — visible while loading and after */}
        {agentTrace.length > 0 && (
          <div className="bg-[#0a0a0f] rounded-xl border border-[#1e1e2e] p-5 mb-6">
            <div className="text-xs text-[#4a4a5e] font-mono mb-3">{"// agent execution trace"}</div>
            <div className="space-y-1.5 font-mono text-xs">
              {agentTrace.map((line, i) => (
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
              {loading && <div className="text-[#4a4a5e] animate-pulse">▋</div>}
            </div>
          </div>
        )}

        {/* Partial results while loading — sub-agents as they complete */}
        {subQueries.length > 0 && (
          <div className="space-y-6">
            {/* Stats bar */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Sub-agents hired", value: stats.subQueriesDispatched, color: "text-indigo-400" },
                  { label: "Gateway fees paid", value: `$${(stats.totalGatewayFeeMicro / 1e6).toFixed(3)} USDC`, color: "text-violet-400" },
                  { label: "Citations bought", value: stats.citationsPurchased, color: "text-[#00ff88]" },
                  { label: "Creator payments", value: `$${(stats.totalCreatorPaymentsMicro / 1e6).toFixed(4)} USDC`, color: "text-amber-400" },
                ].map((s) => (
                  <div key={s.label} className="bg-[#111118] rounded-xl border border-[#1e1e2e] p-4">
                    <div className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-[#8b8b9e] mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Live partial stats while loading */}
            {loading && !stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Agents completed", value: subQueries.length, color: "text-indigo-400" },
                  { label: "Citations so far", value: subQueries.flatMap((sq) => sq.decisions).filter((d) => d.decision === "PAY").length, color: "text-[#00ff88]" },
                  { label: "Creator payments", value: `$${(subQueries.reduce((s, sq) => s + sq.totalPaid, 0) / 1e6).toFixed(4)} USDC`, color: "text-amber-400" },
                  { label: "Awaiting", value: pendingCount !== null ? pendingCount : "…", color: "text-[#4a4a5e]" },
                ].map((s) => (
                  <div key={s.label} className="bg-[#111118] rounded-xl border border-[#1e1e2e] p-4">
                    <div className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-[#8b8b9e] mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Pilot Plan attestation panel */}
            {pilotPlan && (
              <div className="bg-[#111118] rounded-xl border border-violet-900/40 p-5">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded bg-violet-600/40 flex items-center justify-center text-violet-300 text-xs font-bold">P</div>
                    <h2 className="font-semibold text-[#f0f0f5]">Pilot Agent</h2>
                    <span className="text-xs text-violet-400 bg-violet-900/20 px-2 py-0.5 rounded-full">Attested onchain before paying</span>
                  </div>
                  {pilotPlan.attestationExplorerUrl && (
                    <a href={pilotPlan.attestationExplorerUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-mono text-violet-400 hover:text-violet-300 transition-colors">
                      arcscan.app →
                    </a>
                  )}
                </div>
                <div className="mb-3 font-mono text-xs text-[#4a4a5e]">
                  plan hash: <span className="text-violet-400">0x{pilotPlan.planHash.slice(0, 32)}…</span>
                  {pilotPlan.attestationBlock && (
                    <span className="ml-2 text-[#4a4a5e]">block #{pilotPlan.attestationBlock.toLocaleString()}</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {pilotPlan.allocations.map((a) => (
                    <div key={a.agentName} className="bg-[#0a0a0f] rounded-lg p-3 border border-[#1e1e2e]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-[#f0f0f5]">{a.agentName}</span>
                        <span className="text-xs font-mono text-violet-400 font-bold">{a.sharePercent}%</span>
                      </div>
                      <div className="h-1 bg-[#1e1e2e] rounded-full mb-2">
                        <div className="h-full bg-violet-500 rounded-full" style={{ width: `${a.sharePercent}%` }} />
                      </div>
                      <p className="text-[10px] text-[#4a4a5e] leading-relaxed">{a.reasoning}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Final Answer */}
            {finalAnswer && (
              <div className="bg-[#111118] rounded-xl border border-indigo-900/30 p-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded bg-indigo-600/40 flex items-center justify-center text-indigo-300 text-xs font-bold">S</div>
                  <h2 className="font-semibold text-[#f0f0f5]">Synthesized Answer</h2>
                  <span className="text-xs text-indigo-400 bg-indigo-900/20 px-2 py-0.5 rounded-full">from {subQueries.length} agents</span>
                </div>
                <p className="text-[#f0f0f5] leading-relaxed whitespace-pre-wrap">{finalAnswer}</p>
              </div>
            )}

            {/* Knowledge auto-registration banner */}
            {knowledgeSourceId && (
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center text-violet-300 text-sm">⬡</div>
                  <div>
                    <p className="text-sm font-semibold text-violet-300">Synthesized answer registered as citable source</p>
                    <p className="text-xs text-white/40">Future AI agents can cite this knowledge and pay the originating agent in USDC</p>
                  </div>
                </div>
                <a href={`/knowledge/${knowledgeSourceId}`}
                  className="shrink-0 px-4 py-2 rounded-lg border border-violet-500/30 text-violet-300 text-sm hover:border-violet-500/60 hover:text-violet-200 transition-colors whitespace-nowrap">
                  View source →
                </a>
              </div>
            )}

            {/* Agent self-assessment */}
            {lesson?.lesson && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded bg-emerald-600/30 flex items-center justify-center text-emerald-300 text-xs font-bold">✦</div>
                  <span className="text-sm font-semibold text-emerald-300">Agent Self-Assessment</span>
                  <a href="/intelligence" className="ml-auto text-xs text-emerald-400/60 hover:text-emerald-400">View all lessons →</a>
                </div>
                <p className="text-sm text-white/70 leading-relaxed">{lesson.lesson}</p>
                {lesson.gap && <p className="text-xs text-amber-400/70 mt-2">Gap identified: {lesson.gap}</p>}
                {lesson.adjustment && <p className="text-xs text-violet-400/70 mt-1">Next time: {lesson.adjustment}</p>}
              </div>
            )}

            {/* Agent-to-agent economic graph */}
            {agentRewards.length > 0 && (
              <div className="bg-[#0a0a0f] border border-[#6366f1]/20 rounded-xl p-4">
                <div className="text-[10px] font-mono text-[#4a4a5e] mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#6366f1] inline-block animate-pulse" />
                  AGENT-TO-AGENT ECONOMIC GRAPH
                </div>
                <div className="text-xs text-[#8b8b9e] font-mono mb-3">
                  Orchestrator evaluated sub-agent contributions and released USDC coordination rewards on-chain
                </div>
                <div className="space-y-2">
                  {agentRewards.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 rounded bg-[#111118] border border-[#1e1e2e] text-xs font-mono">
                      <span className="text-[#6366f1]">⟳</span>
                      <span className="text-[#8b8b9e] flex-1 truncate">
                        Sub-Agent {p.agentIndex + 1}: &quot;{p.subQuery.slice(0, 50)}{p.subQuery.length > 50 ? "…" : ""}&quot;
                      </span>
                      <span className="text-[#4a4a5e]">score: {p.contributionScore}/100</span>
                      <span className="text-[#00ff88]">${(p.rewardMicro / 1e6).toFixed(4)}</span>
                      {p.txHash && (
                        <a
                          href={`https://testnet.arcscan.app/tx/${p.txHash}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-[#6366f1] hover:text-indigo-300"
                        >
                          ↗
                        </a>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-[#1e1e2e] text-[10px] text-[#4a4a5e] font-mono flex items-center justify-between">
                  <span>
                    Total coordination rewards: <span className="text-[#00ff88]">${(agentRewards.reduce((s, p) => s + p.rewardMicro, 0) / 1e6).toFixed(4)} USDC</span>
                  </span>
                  <span>Settled on Arc Testnet · 3-layer economic graph</span>
                </div>
              </div>
            )}

            {/* Sub-agent tabs */}
            <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] overflow-hidden">
              <div className="flex border-b border-[#1e1e2e] overflow-x-auto">
                {subQueries.map((sq, i) => (
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
                {loading && pendingCount !== null && pendingCount > 0 && (
                  <div className="flex-shrink-0 px-5 py-3 text-sm text-[#4a4a5e] animate-pulse flex items-center gap-2">
                    <span className="animate-spin h-3 w-3 border border-[#4a4a5e] border-t-indigo-400 rounded-full" />
                    {pendingCount} pending…
                  </div>
                )}
              </div>

              {subQueries[activeTab] && (() => {
                const sq = subQueries[activeTab];
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

            {/* Share CTA — only after complete */}
            {!loading && stats && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#111118] rounded-xl border border-[#1e1e2e] px-5 py-4">
                <div className="text-sm text-[#8b8b9e]">
                  <span className="text-[#f0f0f5] font-semibold">{stats.subQueriesDispatched} agents</span> paid{" "}
                  <span className="text-[#00ff88]">${(stats.totalGatewayFeeMicro / 1e6).toFixed(3)} USDC</span> in Gateway fees →{" "}
                  <span className="text-[#00ff88]">{stats.citationsPurchased} citations</span> purchased on Arc
                </div>
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                    `Just ran a multi-agent research query on CitePay Markets 🤖\n\n${stats.subQueriesDispatched} AI agents paid $${(stats.totalGatewayFeeMicro / 1e6).toFixed(3)} USDC via Circle Gateway on Arc → ${stats.citationsPurchased} citations bought from real creators\n\nQuery: "${query.slice(0, 80)}"\n\nTry it → https://citepay-markets.vercel.app/orchestrate\n\n#Lepton #CircleGateway #x402`
                  )}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex-shrink-0 text-xs px-4 py-2 rounded-lg bg-[#1e1e2e] hover:bg-[#2e2e3e] text-[#8b8b9e] hover:text-[#f0f0f5] transition-colors font-mono"
                >
                  Share on X →
                </a>
              </div>
            )}

            {!loading && stats && (
              <div className="text-xs text-[#4a4a5e] font-mono">
                Orchestrator wallet: {stats.orchestratorWallet}
              </div>
            )}
          </div>
        )}

        {/* Empty state with Live feed link */}
        {!hasResults && !loading && (
          <div className="text-center py-8">
            <Link href="/live" className="text-xs text-[#4a4a5e] hover:text-[#8b8b9e] font-mono transition-colors">
              Watch the live agent feed →
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
