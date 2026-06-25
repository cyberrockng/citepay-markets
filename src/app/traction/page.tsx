"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { TractionStats } from "@/types";
import { PageShell, StatCard } from "@/components/ui";
import { BackButton } from "@/components/back-button";

interface OnChainStats {
  citationPaidEvents: number;
  totalUSDCMicro: number;
  uniqueCreators: number;
  agentWallet: string;
  explorerUrl: string;
  lastUpdated: string;
}

export default function TractionPage() {
  const [stats, setStats] = useState<TractionStats | null>(null);
  const [ts, setTs] = useState("");
  const [onChain, setOnChain] = useState<OnChainStats | null>(null);

  useEffect(() => {
    function load() {
      fetch("/api/traction")
        .then((r) => r.json())
        .then((d) => { setStats(d.stats); setTs(d.generatedAt); })
        .catch(() => {});
      fetch("/api/onchain-stats")
        .then((r) => r.json())
        .then((d) => { if (!d.error) setOnChain(d); })
        .catch(() => {});
    }
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <PageShell maxWidth="max-w-5xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <BackButton label="Home" />
          <h1 className="text-3xl font-bold mt-4 text-[#f0f0f5]">Traction Dashboard</h1>
          <p className="text-[#8b8b9e] mt-1">Real metrics from real agent decisions · settled on Arc via Circle Gateway</p>
        </div>
        {ts && (
          <div className="text-xs text-[#4a4a5e] font-mono mt-1">
            Updated {new Date(ts).toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* On-chain persistent record */}
      {onChain && (
        <div className="mb-8 rounded-xl border border-[#00ff88]/20 bg-[#00ff88]/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[#00ff88] uppercase tracking-widest">On-Chain Record · Arc Testnet</h2>
              <p className="text-[#8b8b9e] text-xs mt-0.5">Permanent · verified on arcscan · survives cold starts</p>
            </div>
            <a
              href={onChain.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#6366f1] hover:text-indigo-300 transition-colors font-mono"
            >
              View on arcscan →
            </a>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <StatCard
              label="Citations Paid (All Time)"
              value={onChain.citationPaidEvents}
              accent="text-[#00ff88]"
              sub="USDC transfers on Arc"
            />
            <StatCard
              label="USDC Routed (All Time)"
              value={`$${(onChain.totalUSDCMicro / 1_000_000).toFixed(4)}`}
              accent="text-[#00ff88]"
              sub="to creator wallets"
            />
            <StatCard
              label="Creators Paid (All Time)"
              value={onChain.uniqueCreators}
              accent="text-[#00ff88]"
              sub="unique recipients"
            />
          </div>
        </div>
      )}

      {!stats ? (
        <div className="text-[#8b8b9e] text-center py-20 animate-pulse">Loading stats…</div>
      ) : (
        <div className="space-y-10">
          {stats.totalQueries === 0 && (
            <div className="rounded-xl p-5 border border-[#6366f1]/30 bg-[#6366f1]/5 flex items-center justify-between gap-4">
              <div>
                <p className="text-[#f0f0f5] font-semibold text-sm">No activity yet on this instance</p>
                <p className="text-[#8b8b9e] text-xs mt-0.5">Run the live demo to generate decisions, receipts, and USDC payments.</p>
              </div>
              <Link
                href="/demo"
                className="shrink-0 text-sm font-semibold text-white bg-[#6366f1] hover:bg-indigo-500 px-4 py-2 rounded-lg transition-colors"
              >
                Run Demo →
              </Link>
            </div>
          )}
          {/* Creator Economy */}
          <section>
            <h2 className="text-xs font-semibold text-[#8b8b9e] uppercase tracking-widest mb-4">Creator Economy</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Creators Indexed" value={stats.creatorsIndexed} accent="text-[#6366f1]" />
              <StatCard label="Creators Paid" value={stats.creatorsPaid} accent="text-[#00ff88]" />
              <StatCard label="Sources Registered" value={stats.sourcesRegistered} accent="text-[#6366f1]" />
              <StatCard label="Bonded Sources" value={stats.bondedSources} accent="text-yellow-400" />
            </div>
          </section>

          {/* USDC Flow */}
          <section>
            <h2 className="text-xs font-semibold text-[#8b8b9e] uppercase tracking-widest mb-4">USDC Flow</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <StatCard
                label="Total USDC Routed"
                value={`$${stats.totalUSDCRouted.toFixed(4)}`}
                accent="text-[#00ff88]"
                sub="to creator wallets"
              />
              <StatCard
                label="Avg / Citation"
                value={`$${stats.avgPaymentPerCitation.toFixed(4)}`}
                accent="text-[#6366f1]"
              />
              <StatCard label="Paid Citations" value={stats.paidCitations} accent="text-[#00ff88]" />
            </div>
          </section>

          {/* Agent Decisions */}
          <section>
            <h2 className="text-xs font-semibold text-[#8b8b9e] uppercase tracking-widest mb-4">Agent Decisions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Total Queries" value={stats.totalQueries} accent="text-[#6366f1]" />
              <StatCard label="Total Decisions" value={stats.totalDecisions} accent="text-[#6366f1]" />
              <StatCard label="Refusals" value={stats.refusals} accent="text-red-400" sub="weak / overpriced" />
              <StatCard label="Skips" value={stats.skips} accent="text-[#8b8b9e]" />
            </div>
          </section>

          {/* Integrity */}
          <section>
            <h2 className="text-xs font-semibold text-[#8b8b9e] uppercase tracking-widest mb-4">Integrity & Social</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Challenges Filed" value={stats.challengeCount} accent="text-yellow-400" />
              <StatCard label="Share Cards" value={stats.shareCardsGenerated} accent="text-purple-400" />
              <StatCard label="Cards Opened" value={stats.shareCardsOpened} accent="text-purple-400" />
              <StatCard
                label="Agent Reputation"
                value={`${stats.agentReputation >= 0 ? "+" : ""}${stats.agentReputation}`}
                accent={stats.agentReputation >= 0 ? "text-[#00ff88]" : "text-red-400"}
              />
            </div>
          </section>

          {/* Active agents */}
          <section>
            <h2 className="text-xs font-semibold text-[#8b8b9e] uppercase tracking-widest mb-4">Network</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <StatCard label="Active Agents" value={stats.activeAgents} accent="text-[#6366f1]" />
            </div>
          </section>
        </div>
      )}

      {/* Quick links */}
      <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { href: "/ask", label: "Ask a Question", sub: "Generate new decisions + receipts" },
          { href: "/market", label: "Source Market", sub: "View all creator sources" },
          { href: "/demo", label: "Live Demo", sub: "Run the full proof flow" },
        ].map(({ href, label, sub }) => (
          <Link
            key={href}
            href={href}
            className="bg-[#111118] rounded-xl p-4 border border-[#1e1e2e] hover:border-[#6366f1]/50 transition-colors text-center group"
          >
            <div className="text-[#6366f1] group-hover:text-indigo-300 font-semibold transition-colors">{label}</div>
            <div className="text-[#8b8b9e] text-xs mt-1">{sub}</div>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
