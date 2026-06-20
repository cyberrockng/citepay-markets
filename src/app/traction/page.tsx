"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { TractionStats } from "@/types";

export default function TractionPage() {
  const [stats, setStats] = useState<TractionStats | null>(null);
  const [ts, setTs] = useState("");

  useEffect(() => {
    function load() {
      fetch("/api/traction")
        .then((r) => r.json())
        .then((d) => { setStats(d.stats); setTs(d.generatedAt); })
        .catch(() => {});
    }
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const metrics = stats
    ? [
        { label: "Creators Indexed", value: stats.creatorsIndexed, color: "text-indigo-400" },
        { label: "Creators Paid", value: stats.creatorsPaid, color: "text-green-400" },
        { label: "Sources Registered", value: stats.sourcesRegistered, color: "text-indigo-400" },
        { label: "Bonded Sources", value: stats.bondedSources, color: "text-yellow-400" },
        { label: "Total Queries", value: stats.totalQueries, color: "text-indigo-400" },
        { label: "Total Decisions", value: stats.totalDecisions, color: "text-indigo-400" },
        { label: "Paid Citations", value: stats.paidCitations, color: "text-green-400" },
        { label: "Refusals", value: stats.refusals, color: "text-red-400" },
        { label: "Skips", value: stats.skips, color: "text-gray-400" },
        { label: "Total USDC Routed", value: `$${(stats.totalUSDCRouted / 1_000_000).toFixed(4)}`, color: "text-green-400" },
        { label: "Avg Payment / Citation", value: `$${(stats.avgPaymentPerCitation / 1_000_000).toFixed(4)}`, color: "text-indigo-400" },
        { label: "Share Cards Generated", value: stats.shareCardsGenerated, color: "text-purple-400" },
        { label: "Share Cards Opened", value: stats.shareCardsOpened, color: "text-purple-400" },
        { label: "Challenges", value: stats.challengeCount, color: "text-yellow-400" },
        { label: "Active Agents", value: stats.activeAgents, color: "text-indigo-400" },
        { label: "Agent Reputation", value: `${stats.agentReputation >= 0 ? "+" : ""}${stats.agentReputation}`, color: stats.agentReputation >= 0 ? "text-green-400" : "text-red-400" },
      ]
    : [];

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm">← Home</Link>
            <h1 className="text-3xl font-bold mt-4">Traction Dashboard</h1>
            <p className="text-gray-400 mt-1">Real metrics from real agent decisions. Updates every 10 seconds.</p>
          </div>
          <div className="text-xs text-gray-600 font-mono">{ts && new Date(ts).toLocaleTimeString()}</div>
        </div>

        <div className="mb-4 px-4 py-2 rounded-lg bg-yellow-900/20 border border-yellow-800 text-yellow-400 text-xs inline-block">
          Base Sepolia Testnet — Real USDC payments via agent wallet on-chain
        </div>

        {!stats ? (
          <div className="text-gray-500 text-center py-12">Loading stats...</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {metrics.map(({ label, value, color }) => (
              <div key={label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <div className="text-gray-500 text-xs mt-1">{label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link href="/ask" className="bg-gray-900 rounded-xl p-4 border border-gray-800 text-center hover:border-indigo-700 transition">
            <div className="text-indigo-400 text-lg font-semibold">Ask a Question</div>
            <div className="text-gray-500 text-xs mt-1">Generate new decisions + receipts</div>
          </Link>
          <Link href="/market" className="bg-gray-900 rounded-xl p-4 border border-gray-800 text-center hover:border-indigo-700 transition">
            <div className="text-indigo-400 text-lg font-semibold">Source Market</div>
            <div className="text-gray-500 text-xs mt-1">View all creator sources</div>
          </Link>
          <Link href="/market" className="bg-gray-900 rounded-xl p-4 border border-gray-800 text-center hover:border-indigo-700 transition">
            <div className="text-indigo-400 text-lg font-semibold">Register Source</div>
            <div className="text-gray-500 text-xs mt-1">Add your content to the market</div>
          </Link>
        </div>
      </div>
    </main>
  );
}
