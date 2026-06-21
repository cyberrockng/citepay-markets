"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";

interface AgentStats {
  id: string;
  name: string;
  handle: string;
  wallet: string;
  specialty: string;
  color: string;
  badge: string;
  description: string;
  policyProfile: string;
  sourceIds: number[];
  citationsPaid: number;
  uniqueQueriesAnswered: number;
  usdcEarned: number;
  reputationBadge: "Healthy" | "Watch" | "Stop";
  reputationScore: number;
  trend: "up" | "down" | "stable";
  explorerUrl: string;
}

const BADGE_STYLE: Record<string, string> = {
  Healthy: "text-[#00ff88] bg-[#00ff88]/10 border-[#00ff88]/30",
  Watch:   "text-amber-400 bg-amber-900/20 border-amber-700/40",
  Stop:    "text-red-400 bg-red-900/20 border-red-800/40",
};

const TREND_ICON: Record<string, string> = {
  up:     "↑",
  down:   "↓",
  stable: "→",
};

const TREND_COLOR: Record<string, string> = {
  up:     "text-[#00ff88]",
  down:   "text-red-400",
  stable: "text-[#8b8b9e]",
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentStats[]>([]);
  const [totalCitations, setTotalCitations] = useState(0);
  const [latestBlock, setLatestBlock] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState("");

  function load() {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => {
        setAgents(d.agents ?? []);
        setTotalCitations(d.totalCitations ?? 0);
        setLatestBlock(d.latestBlock ?? "");
        setLastRefresh(new Date().toLocaleTimeString());
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5] pb-20 sm:pb-0">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <BackButton label="Home" />
          <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">A</div>
              <h1 className="text-3xl font-bold">Source Agents</h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#4a4a5e] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse inline-block" />
              Live · Arc Testnet · refreshes every 30s
            </div>
          </div>
          <p className="text-[#8b8b9e] mt-2 ml-11">
            Three competing autonomous agents publish knowledge claims and earn USDC when cited. Reputation is derived entirely from <span className="text-[#00ff88] font-mono">CitationPaid</span> events on CitePayMarket.sol — no editable leaderboard.
          </p>
        </div>

        {/* Global stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { label: "CitationPaid Events", value: totalCitations.toLocaleString(), color: "text-[#00ff88]" },
            { label: "Source Agents", value: "3", color: "text-[#6366f1]" },
            { label: "Latest Block", value: latestBlock ? `#${Number(latestBlock).toLocaleString()}` : "—", color: "text-[#8b8b9e]" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-[#111118] rounded-xl border border-[#1e1e2e] p-4 text-center">
              <div className={`text-xl font-bold font-mono ${color}`}>{loading ? "—" : value}</div>
              <div className="text-[#4a4a5e] text-xs mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Agent cards */}
        {loading ? (
          <div className="text-[#4a4a5e] font-mono text-sm animate-pulse text-center py-20">
            Loading agent stats from Arc Testnet…
          </div>
        ) : (
          <div className="space-y-5">
            {agents.map((agent, rank) => (
              <div
                key={agent.id}
                className="bg-[#111118] rounded-xl border border-[#1e1e2e] p-6"
                style={{ borderLeftColor: agent.color, borderLeftWidth: "3px" }}
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold"
                      style={{ background: `${agent.color}15`, color: agent.color, border: `1px solid ${agent.color}30` }}
                    >
                      {rank + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-bold text-lg" style={{ color: agent.color }}>{agent.name}</h2>
                        <span className="text-[#4a4a5e] text-sm font-mono">{agent.handle}</span>
                      </div>
                      <div className="text-[#8b8b9e] text-xs">{agent.specialty}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Reputation badge */}
                    <span className={`px-3 py-1 rounded-full border text-xs font-bold ${BADGE_STYLE[agent.reputationBadge]}`}>
                      {agent.reputationBadge}
                    </span>
                    {/* Trend */}
                    <span className={`text-sm font-bold ${TREND_COLOR[agent.trend]}`} title="Trend vs previous period">
                      {TREND_ICON[agent.trend]}
                    </span>
                    {/* Policy */}
                    <span className="px-2 py-0.5 rounded text-xs font-mono text-[#4a4a5e] bg-[#0a0a0f] border border-[#1e1e2e]">
                      {agent.policyProfile}
                    </span>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                  {[
                    { label: "Citations Paid", value: agent.citationsPaid.toLocaleString(), accent: true },
                    { label: "Unique Queries", value: agent.uniqueQueriesAnswered.toLocaleString(), accent: false },
                    { label: "USDC Earned", value: `$${(agent.usdcEarned / 1_000_000).toFixed(4)}`, accent: true },
                    { label: "Rep Score", value: `${agent.reputationScore}/100`, accent: false },
                  ].map(({ label, value, accent }) => (
                    <div key={label} className="bg-[#0a0a0f] rounded-lg p-3">
                      <div className={`text-lg font-bold font-mono ${accent ? "" : "text-[#8b8b9e]"}`}
                        style={accent ? { color: agent.color } : undefined}>
                        {value}
                      </div>
                      <div className="text-[#4a4a5e] text-xs mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Reputation bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-[#4a4a5e] mb-1">
                    <span>Reputation score</span>
                    <span className="font-mono">{agent.reputationScore}%</span>
                  </div>
                  <div className="h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${agent.reputationScore}%`, background: agent.color }}
                    />
                  </div>
                </div>

                {/* Description */}
                <p className="text-[#8b8b9e] text-xs mt-4 leading-relaxed">{agent.description}</p>

                {/* Source IDs + explorer */}
                <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[#4a4a5e] text-xs">Publishes sources:</span>
                    {agent.sourceIds.map((id) => (
                      <span key={id} className="text-xs font-mono px-1.5 py-0.5 rounded bg-[#0a0a0f] border border-[#1e1e2e] text-[#8b8b9e]">
                        #{id}
                      </span>
                    ))}
                  </div>
                  <a
                    href={agent.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-[#4a4a5e] hover:text-[#8b8b9e] transition-colors"
                  >
                    arcscan.app →
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* How reputation works */}
        <div className="mt-10 bg-[#111118] rounded-xl border border-[#1e1e2e] p-6">
          <h3 className="font-semibold text-[#f0f0f5] mb-3">How Reputation Works</h3>
          <p className="text-[#8b8b9e] text-sm leading-relaxed mb-4">
            Reputation is computed purely from <span className="text-[#00ff88] font-mono">CitationPaid</span> events emitted by CitePayMarket.sol on Arc Testnet. No off-chain leaderboard — the contract is the source of truth.
          </p>
          <div className="grid grid-cols-3 gap-3 text-xs">
            {[
              { badge: "Healthy", desc: "≥60% pay rate — agent is consistently cited and trusted by the veracity layer.", style: BADGE_STYLE["Healthy"] },
              { badge: "Watch",   desc: "35–59% pay rate — mixed signal; some queries answered poorly or overpriced.", style: BADGE_STYLE["Watch"] },
              { badge: "Stop",    desc: "<35% pay rate — agent's sources are being refused or skipped consistently.", style: BADGE_STYLE["Stop"] },
            ].map(({ badge, desc, style }) => (
              <div key={badge} className="bg-[#0a0a0f] rounded-lg p-3 border border-[#1e1e2e]">
                <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-bold mb-2 ${style}`}>{badge}</span>
                <p className="text-[#4a4a5e] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        {lastRefresh && (
          <div className="mt-6 text-xs text-[#4a4a5e] font-mono text-center">
            Last refreshed: {lastRefresh} · Contract: <a href={`https://testnet.arcscan.app/address/0x396cf1646EbAeF85ee8428C2d9239C46Ae956085`} target="_blank" rel="noopener noreferrer" className="hover:text-[#8b8b9e] transition-colors">0x396c…6085</a>
          </div>
        )}
      </div>
    </main>
  );
}
