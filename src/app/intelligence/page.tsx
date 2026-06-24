"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";

interface IntelligenceData {
  categoryRows: { category: string; cite_count: number; paid: number; refused: number }[];
  hourlyFlow: { hour: string; total_paid: number; count: number }[];
  compoundingScore: number;
  autoBounties: number;
  lessonCount: number;
  sessionCount: number;
  sessionPaid: number;
}

interface Lesson {
  id: string; orchestrationQuery: string; lesson: string;
  gapIdentified: string | null; topSources: string | null;
  weakSources: string | null; scoreAdjustments: string | null; createdAt: string;
}

const CATEGORY_COLOR: Record<string, string> = {
  "Protocol": "bg-blue-500",
  "Infrastructure": "bg-indigo-500",
  "Research": "bg-amber-500",
  "AI/Agents": "bg-violet-500",
  "General": "bg-white/20",
};

export default function IntelligencePage() {
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/intelligence").then((r) => r.json()),
      fetch("/api/agent-learning").then((r) => r.json()),
    ]).then(([intel, learning]) => {
      setData(intel as IntelligenceData);
      setLessons((learning as { lessons: Lesson[] }).lessons ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));

    const interval = setInterval(() => {
      fetch("/api/intelligence").then((r) => r.json()).then((d) => setData(d as IntelligenceData)).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return (
    <main className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
      <div className="text-white/30">Loading intelligence…</div>
    </main>
  );

  const maxCites = Math.max(...(data?.categoryRows.map((r) => r.cite_count) ?? [1]), 1);
  const maxFlow = Math.max(...(data?.hourlyFlow.map((r) => r.total_paid) ?? [1]), 1);

  // Gap radar: categories with high refuse rate
  const gapCategories = (data?.categoryRows ?? [])
    .map((r) => ({ ...r, refuseRate: r.paid + r.refused > 0 ? r.refused / (r.paid + r.refused) : 0 }))
    .filter((r) => r.refuseRate > 0.4)
    .sort((a, b) => b.refuseRate - a.refuseRate);

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <BackButton />
        <span className="text-white/20">|</span>
        <span className="text-sm text-white/50">Economic Intelligence</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-white/30">Live · updates every 15s</span>
        </span>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Economic Intelligence</h1>
          <p className="text-white/40">Real-time view of the AI knowledge economy — demand, flow, gaps, and learning</p>
        </div>

        {/* Top metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {[
            { label: "Compounding score", value: data?.compoundingScore ?? 0, sub: "AI knowledge re-cited", color: "text-violet-400" },
            { label: "Auto-bounties posted", value: data?.autoBounties ?? 0, sub: "by Gap Agent", color: "text-amber-400" },
            { label: "Agent lessons", value: data?.lessonCount ?? 0, sub: "self-assessments", color: "text-emerald-400" },
            { label: "Research sessions", value: data?.sessionCount ?? 0, sub: `$${((data?.sessionPaid ?? 0) / 1e6).toFixed(4)} USDC`, color: "text-blue-400" },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <div className={`text-3xl font-bold ${m.color}`}>{m.value}</div>
              <div className="text-sm text-white/60 mt-1 font-medium">{m.label}</div>
              <div className="text-xs text-white/30 mt-0.5">{m.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Knowledge demand heatmap */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h2 className="font-semibold text-white mb-1">Knowledge Demand by Category</h2>
            <p className="text-xs text-white/30 mb-5">Which topics agents are researching most</p>
            {(data?.categoryRows ?? []).length === 0 ? (
              <p className="text-white/20 text-sm text-center py-8">No citation data yet</p>
            ) : (
              <div className="space-y-3">
                {(data?.categoryRows ?? []).map((row) => {
                  const barW = Math.round((row.cite_count / maxCites) * 100);
                  const paidPct = row.cite_count > 0 ? Math.round((row.paid / row.cite_count) * 100) : 0;
                  const color = CATEGORY_COLOR[row.category] ?? "bg-white/20";
                  return (
                    <div key={row.category}>
                      <div className="flex justify-between items-center mb-1 text-xs">
                        <span className="text-white/70 font-medium">{row.category}</span>
                        <span className="text-white/40">{row.cite_count} queries · {paidPct}% paid</span>
                      </div>
                      <div className="h-6 bg-white/5 rounded-lg overflow-hidden flex">
                        <div className={`h-full ${color} opacity-70 transition-all duration-700 rounded-l-lg`} style={{ width: `${barW * paidPct / 100}%` }} />
                        <div className={`h-full ${color} opacity-20 transition-all duration-700`} style={{ width: `${barW * (100 - paidPct) / 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* USDC flow chart */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h2 className="font-semibold text-white mb-1">USDC Flow (Last 24h)</h2>
            <p className="text-xs text-white/30 mb-5">Creator earnings by hour</p>
            {(data?.hourlyFlow ?? []).length === 0 ? (
              <p className="text-white/20 text-sm text-center py-8">No payments in last 24h</p>
            ) : (
              <div className="flex items-end gap-1 h-32">
                {Array.from({ length: 24 }, (_, i) => {
                  const hour = String(i).padStart(2, "0");
                  const bar = data?.hourlyFlow.find((h) => h.hour === hour);
                  const height = bar ? Math.max(4, Math.round((bar.total_paid / maxFlow) * 100)) : 2;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group cursor-default relative">
                      <div className="absolute bottom-full mb-1 hidden group-hover:block bg-black/80 text-xs text-white px-2 py-1 rounded whitespace-nowrap z-10">
                        {hour}:00 — {bar ? `$${bar.total_paid.toFixed(4)}` : "0"}
                      </div>
                      <div
                        className={`w-full rounded-sm transition-all ${bar ? "bg-emerald-500/60" : "bg-white/5"}`}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-between text-xs text-white/20 mt-2">
              <span>00:00</span><span>12:00</span><span>23:00</span>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Gap Radar */}
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
            <h2 className="font-semibold text-amber-300 mb-1">Gap Radar</h2>
            <p className="text-xs text-amber-300/50 mb-5">Topics where agents are failing to find good sources</p>
            {gapCategories.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-2xl mb-2">✓</div>
                <p className="text-white/30 text-sm">No critical gaps detected</p>
                <p className="text-white/20 text-xs mt-1">All categories have good citation coverage</p>
              </div>
            ) : (
              <div className="space-y-3">
                {gapCategories.map((g) => (
                  <div key={g.category} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-white/70">{g.category}</span>
                        <span className="text-amber-400">{Math.round(g.refuseRate * 100)}% refused</span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500/60 rounded-full" style={{ width: `${g.refuseRate * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-amber-300/60 mt-4">
                  Knowledge Gap Agent will auto-post bounties for these categories next run
                </p>
              </div>
            )}
          </div>

          {/* Compounding Knowledge */}
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6">
            <h2 className="font-semibold text-violet-300 mb-1">Knowledge Compounding</h2>
            <p className="text-xs text-violet-300/50 mb-5">AI-synthesized answers that have been re-cited by future agents</p>
            <div className="text-center py-4">
              <div className="text-6xl font-bold text-violet-400 mb-2">{data?.compoundingScore ?? 0}</div>
              <p className="text-sm text-white/40">total re-citations of AI-generated knowledge</p>
              <p className="text-xs text-white/30 mt-3 leading-relaxed max-w-xs mx-auto">
                Each time an agent cites a knowledge source created by /orchestrate, the originating agent earns USDC passively.
                This score grows with every research session.
              </p>
            </div>
            <Link href="/orchestrate"
              className="block text-center mt-4 px-4 py-2 rounded-lg border border-violet-500/30 text-violet-300 text-sm hover:border-violet-500/60 transition-colors">
              Generate new knowledge →
            </Link>
          </div>
        </div>

        {/* Agent Lessons feed */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-semibold text-white">Agent Self-Assessment Log</h2>
              <p className="text-xs text-white/30 mt-1">What the orchestrator learned from each research session</p>
            </div>
            <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {lessons.length} lessons
            </span>
          </div>

          {lessons.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-white/20 text-sm">No lessons yet — run a query via /orchestrate to generate the first assessment</p>
              <Link href="/orchestrate" className="mt-4 inline-block text-sm text-violet-400 hover:text-violet-300">
                Run orchestration →
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {lessons.slice(0, 8).map((lesson) => (
                <div key={lesson.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-xs text-white/40 italic truncate flex-1">"{lesson.orchestrationQuery}"</p>
                    <span className="text-xs text-white/25 shrink-0">{new Date(lesson.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-sm text-white/70 leading-relaxed">{lesson.lesson}</p>
                  <div className="flex flex-wrap gap-3 mt-3">
                    {lesson.gapIdentified && (
                      <div className="text-xs">
                        <span className="text-amber-400/60">Gap:</span>
                        <span className="text-white/40 ml-1">{lesson.gapIdentified}</span>
                      </div>
                    )}
                    {lesson.scoreAdjustments && (
                      <div className="text-xs">
                        <span className="text-violet-400/60">Next time:</span>
                        <span className="text-white/40 ml-1">{lesson.scoreAdjustments}</span>
                      </div>
                    )}
                    {lesson.topSources && (
                      <div className="text-xs">
                        <span className="text-emerald-400/60">Best sources:</span>
                        <span className="text-white/40 ml-1">{lesson.topSources}</span>
                      </div>
                    )}
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
