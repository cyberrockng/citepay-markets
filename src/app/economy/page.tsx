"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { useTraction } from "@/hooks/use-traction";
import type { TractionStats } from "@/types";

const ARCSCAN = "https://testnet.arcscan.app";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Source {
  id: string;
  title: string;
  url: string;
  creatorName: string;
  creatorHandle: string;
  payoutWallet: string;
  price: number;
  paidCount: number;
  refusedCount: number;
  reputation: number;
  category: string;
  onChainId: number | null;
  avgContributionWeight?: number;
  totalContributionQueries?: number;
}

interface Agent {
  agentAddress: string;
  totalDecisions: number;
  paidCount: number;
  totalPaid: number;
  topPolicy: string | null;
  lastDecisionAt: string | null;
}

interface Payment {
  sourceTitle: string;
  creatorWallet: string;
  agentAddress: string;
  amountMicro: number;
  txHash: string | null;
  createdAt: string;
}

interface Bounty {
  id: string;
  title: string;
  query: string;
  budgetMicro: number;
  deadline: string;
  status: string;
  submissionCount?: number;
  createdAt: string;
}

interface Lesson {
  id: string;
  orchestrationQuery: string;
  lesson: string;
  gapIdentified: string | null;
  createdAt: string;
}

interface IndexData {
  traction: TractionStats | null;
  sources: Source[];
  agents: Agent[];
  recentPayments: Payment[];
  openBounties: Bounty[];
  lessons: Lesson[];
}

// ── Small components ──────────────────────────────────────────────────────────

function Ticker({ label, value, sub, accent = false }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl p-4 flex flex-col justify-between">
      <div className="text-[10px] font-mono text-[#4a4a5e] tracking-widest mb-2">{label}</div>
      <div className={`text-2xl font-bold font-mono ${accent ? "text-[#34D399]" : "text-[#f0f0f5]"}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-[#4a4a5e] mt-1">{sub}</div>}
    </div>
  );
}

function SectionHead({ title, href, count }: { title: string; href?: string; count?: number }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="w-1 h-4 rounded-full bg-[#6366f1] inline-block" />
        <span className="text-xs font-semibold text-[#f0f0f5] tracking-wide">{title}</span>
        {count !== undefined && (
          <span className="text-[10px] font-mono text-[#4a4a5e]">({count})</span>
        )}
      </div>
      {href && (
        <Link href={href} className="text-[10px] font-mono text-[#6366f1] hover:text-indigo-300 transition-colors">
          view all →
        </Link>
      )}
    </div>
  );
}

function Bar({ pct, color = "bg-[#6366f1]" }: { pct: number; color?: string }) {
  return (
    <div className="h-1 bg-[#1e1e2e] rounded-full overflow-hidden mt-1.5">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

const CATEGORY_COLOR: Record<string, string> = {
  Protocol:       "text-[#6366f1]",
  Research:       "text-[#34D399]",
  Infrastructure: "text-yellow-400",
  "AI/Agents":    "text-purple-400",
};

// ── Section: Top Sources ──────────────────────────────────────────────────────

function TopSources({ sources }: { sources: Source[] }) {
  const sorted = [...sources].sort((a, b) => b.paidCount - a.paidCount).slice(0, 8);
  const maxCite = sorted[0]?.paidCount ?? 1;
  const maxEarn = Math.max(...sorted.map((s) => s.paidCount * s.price), 1);

  return (
    <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5">
      <SectionHead title="Top Sources" href="/market" count={sources.length} />
      <div className="space-y-3">
        {sorted.map((s, i) => {
          const earned = s.paidCount * s.price;
          return (
            <div key={s.id} className="flex items-start gap-3">
              <div className="text-[10px] font-mono text-[#4a4a5e] w-4 mt-0.5 flex-shrink-0">{i + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/source/${s.id}`} className="text-xs font-semibold text-[#f0f0f5] hover:text-[#6366f1] transition-colors truncate">
                    {s.title}
                  </Link>
                  <span className={`text-[10px] font-mono ${CATEGORY_COLOR[s.category] ?? "text-[#4a4a5e]"}`}>
                    {s.category}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  <span className="text-[10px] font-mono text-[#4a4a5e]">{s.creatorName}</span>
                  {s.onChainId && (
                    <span className="text-[10px] font-mono text-[#34D399]">on-chain ✓</span>
                  )}
                  {(s.totalContributionQueries ?? 0) > 0 && (
                    <span className={`text-[10px] font-mono font-bold ${
                      (s.avgContributionWeight ?? 0) >= 0.5 ? "text-[#34D399]"
                      : (s.avgContributionWeight ?? 0) >= 0.2 ? "text-[#a78bfa]"
                      : "text-[#4a4a5e]"
                    }`}>
                      VCS {Math.round((s.avgContributionWeight ?? 0) * 100)}%
                    </span>
                  )}
                </div>
                <Bar pct={(s.paidCount / maxCite) * 100} color="bg-[#6366f1]" />
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-xs font-bold font-mono text-[#34D399]">
                  ${(earned / 1e6).toFixed(4)}
                </div>
                <div className="text-[10px] font-mono text-[#4a4a5e]">{s.paidCount} cites</div>
                <Bar pct={(earned / maxEarn) * 100} color="bg-[#34D399]" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Section: Top Creators ─────────────────────────────────────────────────────

function TopCreators({ sources }: { sources: Source[] }) {
  const byWallet = new Map<string, { name: string; handle: string; wallet: string; totalEarned: number; citations: number; sources: number }>();
  for (const s of sources) {
    const prev = byWallet.get(s.payoutWallet) ?? { name: s.creatorName, handle: s.creatorHandle, wallet: s.payoutWallet, totalEarned: 0, citations: 0, sources: 0 };
    prev.totalEarned += s.paidCount * s.price;
    prev.citations += s.paidCount;
    prev.sources += 1;
    byWallet.set(s.payoutWallet, prev);
  }
  const creators = [...byWallet.values()].sort((a, b) => b.totalEarned - a.totalEarned).slice(0, 6);
  const maxEarn = creators[0]?.totalEarned ?? 1;

  return (
    <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5">
      <SectionHead title="Top Creators" href="/leaderboard" count={creators.length} />
      <div className="space-y-3">
        {creators.map((c, i) => (
          <div key={c.wallet} className="flex items-center gap-3">
            <div className="text-[10px] font-mono text-[#4a4a5e] w-4 flex-shrink-0">{i + 1}</div>
            <div className="flex-1 min-w-0">
              <Link href={`/creator/${c.wallet}`} className="text-xs font-semibold text-[#f0f0f5] hover:text-[#6366f1] transition-colors">
                {c.name}
              </Link>
              <div className="text-[10px] font-mono text-[#4a4a5e]">{c.handle} · {c.sources} source{c.sources !== 1 ? "s" : ""}</div>
              <Bar pct={(c.totalEarned / maxEarn) * 100} color="bg-[#34D399]" />
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xs font-bold font-mono text-[#34D399]">${(c.totalEarned / 1e6).toFixed(4)}</div>
              <div className="text-[10px] font-mono text-[#4a4a5e]">{c.citations} cites</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section: Agents ───────────────────────────────────────────────────────────

function TopAgents({ agents }: { agents: Agent[] }) {
  const maxPaid = agents[0]?.totalPaid ?? 1;

  return (
    <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5">
      <SectionHead title="Active Agents" href="/leaderboard" count={agents.length} />
      {agents.length === 0 ? (
        <div className="text-xs text-[#4a4a5e] text-center py-4">No agent activity yet</div>
      ) : (
        <div className="space-y-3">
          {agents.slice(0, 5).map((a, i) => {
            const payRate = a.totalDecisions > 0 ? Math.round((a.paidCount / a.totalDecisions) * 100) : 0;
            return (
              <div key={a.agentAddress} className="flex items-center gap-3">
                <div className="text-[10px] font-mono text-[#4a4a5e] w-4 flex-shrink-0">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-mono text-[#f0f0f5]">{a.agentAddress.slice(0, 10)}…{a.agentAddress.slice(-6)}</div>
                  <div className="flex gap-2 text-[10px] font-mono text-[#4a4a5e]">
                    <span>{a.paidCount} PAY</span>
                    <span className="text-[#6366f1]">{payRate}% pay-rate</span>
                    {a.topPolicy && <span>· {a.topPolicy}</span>}
                  </div>
                  <Bar pct={(a.totalPaid / maxPaid) * 100} color="bg-[#6366f1]" />
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-bold font-mono text-[#6366f1]">${(a.totalPaid / 1e6).toFixed(4)}</div>
                  <div className="text-[10px] font-mono text-[#4a4a5e]">{a.totalDecisions} decisions</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Section: Recent Citations ─────────────────────────────────────────────────

function RecentCitations({ payments }: { payments: Payment[] }) {
  return (
    <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-1 h-4 rounded-full bg-[#34D399] inline-block" />
          <span className="text-xs font-semibold text-[#f0f0f5] tracking-wide">Recent Citations</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#4a4a5e]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] inline-block animate-pulse" />
          live
        </div>
      </div>
      {payments.length === 0 ? (
        <div className="text-xs text-[#4a4a5e] text-center py-6">
          No citations yet — <Link href="/demo" className="text-[#6366f1] hover:underline">run a demo query</Link>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {payments.map((p, i) => (
            <div key={`${p.createdAt}-${i}`} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#0a0a0f] transition-colors group">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] flex-shrink-0" />
              <span className="text-xs text-[#f0f0f5] truncate flex-1">{p.sourceTitle}</span>
              <span className="text-xs font-bold font-mono text-[#34D399] flex-shrink-0">+${(p.amountMicro / 1e6).toFixed(4)}</span>
              {p.txHash ? (
                <a href={`${ARCSCAN}/tx/${p.txHash}`} target="_blank" rel="noopener noreferrer"
                   className="text-[10px] font-mono text-[#6366f1] hover:text-indigo-300 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  ↗
                </a>
              ) : (
                <span className="w-4 flex-shrink-0" />
              )}
              <span className="text-[10px] font-mono text-[#4a4a5e] flex-shrink-0 hidden sm:block">
                {new Date(p.createdAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Section: Open Bounties ────────────────────────────────────────────────────

function OpenBounties({ bounties }: { bounties: Bounty[] }) {
  if (bounties.length === 0) return null;

  return (
    <div className="bg-[#111118] border border-amber-500/20 rounded-2xl p-5">
      <SectionHead title="Open Bounties" href="/bounties" count={bounties.length} />
      <p className="text-[10px] text-[#4a4a5e] mb-3">
        The agent identified these knowledge gaps and posted bounties. Submit a source to earn USDC.
      </p>
      <div className="space-y-2">
        {bounties.slice(0, 4).map((b) => {
          const hoursLeft = Math.max(0, Math.round((new Date(b.deadline).getTime() - Date.now()) / 3_600_000));
          return (
            <div key={b.id} className="flex items-start gap-3 p-3 rounded-xl bg-amber-900/5 border border-amber-500/10">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[#f0f0f5] truncate">{b.query}</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[10px] font-mono text-amber-400">${(b.budgetMicro / 1e6).toFixed(3)} prize</span>
                  <span className="text-[10px] font-mono text-[#4a4a5e]">{hoursLeft}h left</span>
                  {b.submissionCount !== undefined && (
                    <span className="text-[10px] font-mono text-[#4a4a5e]">{b.submissionCount} submissions</span>
                  )}
                </div>
              </div>
              <Link
                href={`/bounties`}
                className="text-[10px] font-mono text-amber-400 hover:text-amber-300 underline flex-shrink-0"
              >
                submit →
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Section: Agent Memory ─────────────────────────────────────────────────────

function AgentMemory({ lessons }: { lessons: Lesson[] }) {
  if (lessons.length === 0) return null;

  return (
    <div className="bg-[#111118] border border-emerald-500/20 rounded-2xl p-5">
      <SectionHead title="Agent Memory" href="/intelligence" count={lessons.length} />
      <p className="text-[10px] text-[#4a4a5e] mb-3">
        The agent reflects after every orchestration and stores lessons for future queries.
      </p>
      <div className="space-y-2">
        {lessons.slice(0, 3).map((l) => (
          <div key={l.id} className="p-3 rounded-xl bg-emerald-900/5 border border-emerald-500/10">
            <div className="text-[10px] font-mono text-[#4a4a5e] mb-1 truncate">Query: {l.orchestrationQuery}</div>
            <div className="text-xs text-[#8b8b9e] leading-relaxed">{l.lesson}</div>
            {l.gapIdentified && (
              <div className="text-[10px] text-amber-400/70 mt-1">Gap → {l.gapIdentified}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Decision breakdown ────────────────────────────────────────────────────────

function DecisionBar({ t }: { t: TractionStats }) {
  const total = t.paidCitations + t.refusals + t.skips;
  if (total === 0) return null;
  const payPct  = (t.paidCitations / total) * 100;
  const refPct  = (t.refusals     / total) * 100;
  const skipPct = (t.skips        / total) * 100;

  return (
    <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5">
      <SectionHead title="Decision Breakdown" />
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-3">
        <div className="bg-[#34D399] transition-all" style={{ width: `${payPct}%` }} title={`PAY ${payPct.toFixed(1)}%`} />
        <div className="bg-red-500 transition-all"   style={{ width: `${refPct}%` }} title={`REFUSE ${refPct.toFixed(1)}%`} />
        <div className="bg-[#2e2e3e] transition-all" style={{ width: `${skipPct}%` }} title={`SKIP ${skipPct.toFixed(1)}%`} />
      </div>
      <div className="flex gap-4 flex-wrap text-[10px] font-mono">
        <span><span className="text-[#34D399]">■</span> PAY {payPct.toFixed(1)}% ({t.paidCitations})</span>
        <span><span className="text-red-500">■</span> REFUSE {refPct.toFixed(1)}% ({t.refusals})</span>
        <span><span className="text-[#4a4a5e]">■</span> SKIP {skipPct.toFixed(1)}% ({t.skips})</span>
        {t.onChainCitationEvents > 0 && (
          <span className="ml-auto text-[#34D399]">{t.onChainCitationEvents} on-chain events ✓</span>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EconomyPage() {
  const { stats: tractionStats } = useTraction({ refreshMs: 15000 });
  const [data, setData] = useState<IndexData>({
    traction: null, sources: [], agents: [], recentPayments: [], openBounties: [], lessons: [],
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const [sourcesRes, agentsRes, revenueRes, bountiesRes, lessonsRes] = await Promise.all([
        fetch("/api/sources").then((r) => r.json()),
        fetch("/api/leaderboard").then((r) => r.json()),
        fetch("/api/revenue").then((r) => r.json()),
        fetch("/api/bounties?status=open").then((r) => r.json()),
        fetch("/api/agent-learning").then((r) => r.json()),
      ]);

      setData({
        traction:      null,
        sources:       sourcesRes.sources ?? [],
        agents:        agentsRes.entries ?? [],
        recentPayments: revenueRes.recentPayments ?? [],
        openBounties:  bountiesRes.bounties ?? [],
        lessons:       lessonsRes.lessons ?? [],
      });
      setLastUpdated(new Date());
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 15_000);
    return () => clearInterval(iv);
  }, [load]);

  const t = tractionStats ?? data.traction;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5]">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <BackButton />

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-[#f0f0f5] mb-1">CitePay Index</h1>
              <p className="text-sm text-[#8b8b9e]">
                Live view of the AI citation economy — sources, creators, agents, and payments settling on Arc Testnet
              </p>
            </div>
            <div className="flex items-center gap-3">
              {lastUpdated && (
                <span className="text-[10px] font-mono text-[#4a4a5e]">
                  updated {lastUpdated.toLocaleTimeString()}
                </span>
              )}
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#4a4a5e]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse inline-block" />
                15s refresh
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 animate-pulse">
            {[0,1,2,3].map((i) => <div key={i} className="h-24 bg-[#111118] border border-[#1e1e2e] rounded-xl" />)}
          </div>
        ) : (
          <>
            {/* Economy ticker */}
            {t && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <Ticker label="TOTAL USDC ROUTED" value={`$${t.totalUSDCRouted.toFixed(4)}`} sub="Arc Testnet" accent />
                <Ticker label="PAID CITATIONS"    value={String(t.paidCitations)}             sub={`${t.onChainCitationEvents} on-chain`} />
                <Ticker label="CREATORS PAID"     value={String(t.creatorsPaid)}              sub={`${t.sourcesRegistered} sources`} />
                <Ticker label="TOTAL QUERIES"     value={String(t.totalQueries)}              sub={`${t.challengeCount} challenges`} />
              </div>
            )}

            {/* Decision bar */}
            {t && <div className="mb-4"><DecisionBar t={t} /></div>}

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <TopSources sources={data.sources} />
              <TopCreators sources={data.sources} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <RecentCitations payments={data.recentPayments} />
              <TopAgents agents={data.agents} />
            </div>

            {(data.openBounties.length > 0 || data.lessons.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                {data.openBounties.length > 0 && <OpenBounties bounties={data.openBounties} />}
                {data.lessons.length > 0 && <AgentMemory lessons={data.lessons} />}
              </div>
            )}

            {/* Footer links */}
            <div className="flex flex-wrap gap-4 justify-center text-[10px] font-mono text-[#4a4a5e] mt-6 pt-6 border-t border-[#1e1e2e]">
              {[
                ["/demo",        "Demo"],
                ["/orchestrate", "Orchestrate"],
                ["/creator",     "Creator"],
                ["/market",      "Market"],
                ["/bounties",    "Bounties"],
                ["/revenue",     "Revenue"],
                ["/leaderboard", "Leaderboard"],
                ["/intelligence","Intelligence"],
                ["/live",        "Live feed"],
                ["/audit",       "Audit"],
              ].map(([href, label]) => (
                <Link key={href} href={href} className="hover:text-[#f0f0f5] transition-colors">
                  {label}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
