"use client";
import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";

interface SourceScore {
  sourceId: string;
  title: string;
  price: number;
  bonded: boolean;
  category: string;
  relevance: number;
  priceScore: number;
  reputationScore: number;
  total: number;
  reason: string;
  state: "pending" | "scored";
}

const CATEGORY_COLOR: Record<string, string> = {
  "Protocol": "text-blue-400 bg-blue-400/10 border-blue-400/20",
  "Infrastructure": "text-indigo-400 bg-indigo-400/10 border-indigo-400/20",
  "Research": "text-amber-400 bg-amber-400/10 border-amber-400/20",
  "AI/Agents": "text-violet-400 bg-violet-400/10 border-violet-400/20",
  "General": "text-white/40 bg-white/5 border-white/10",
};

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-white/40">{label}</span>
        <span className={color}>{value}</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${color.includes("emerald") ? "bg-emerald-500" : color.includes("blue") ? "bg-blue-500" : color.includes("violet") ? "bg-violet-500" : "bg-white/30"}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function SourceCard({ s, rank, isWinner }: { s: SourceScore; rank: number | null; isWinner: boolean }) {
  const catColor = CATEGORY_COLOR[s.category ?? "General"] ?? CATEGORY_COLOR["General"];
  const price = (s.price / 1_000_000).toFixed(4);

  return (
    <div className={`rounded-xl border p-4 transition-all duration-500 ${
      s.state === "pending"
        ? "border-white/10 bg-white/[0.02] opacity-50"
        : isWinner
        ? "border-emerald-500/50 bg-emerald-500/5 shadow-lg shadow-emerald-500/10"
        : s.total >= 60
        ? "border-white/20 bg-white/[0.04]"
        : "border-white/10 bg-white/[0.02] opacity-70"
    }`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {rank !== null && (
              <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${
                rank === 1 ? "bg-amber-400/20 text-amber-300" : rank === 2 ? "bg-white/10 text-white/60" : rank === 3 ? "bg-amber-700/20 text-amber-600" : "bg-white/5 text-white/30"
              }`}>{rank}</span>
            )}
            <span className={`px-1.5 py-0.5 rounded text-xs border ${catColor}`}>{s.category}</span>
            {isWinner && <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">WINNER</span>}
            {s.bonded && <span className="px-1.5 py-0.5 rounded text-xs bg-white/5 text-white/40 border border-white/10">⬡ Bonded</span>}
          </div>
          <p className="text-sm font-medium text-white/90 line-clamp-1">{s.title}</p>
        </div>
        <div className="text-right shrink-0">
          {s.state === "pending" ? (
            <div className="flex gap-1 items-center text-white/20 text-xs">
              <span className="w-1 h-1 rounded-full bg-white/20 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1 h-1 rounded-full bg-white/20 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1 h-1 rounded-full bg-white/20 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          ) : (
            <span className={`text-xl font-bold ${
              s.total >= 75 ? "text-emerald-400" : s.total >= 50 ? "text-white/70" : "text-white/30"
            }`}>{s.total}</span>
          )}
          <p className="text-xs text-white/40 font-mono">${price}</p>
        </div>
      </div>

      {s.state === "scored" && (
        <>
          <div className="space-y-2 mb-3">
            <ScoreBar label="Relevance" value={s.relevance} color="text-emerald-400" />
            <ScoreBar label="Price efficiency" value={s.priceScore} color="text-blue-400" />
            <ScoreBar label="Reputation" value={s.reputationScore} color="text-violet-400" />
          </div>
          <p className="text-xs text-white/40 leading-relaxed italic">{s.reason}</p>
        </>
      )}
    </div>
  );
}

export default function AuctionPage() {
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<SourceScore[]>([]);
  const [phase, setPhase] = useState<"idle" | "bidding" | "settled">("idle");
  const [auctionQuery, setAuctionQuery] = useState("");
  const [scored, setScored] = useState(0);
  const [total, setTotal] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  const startAuction = useCallback(() => {
    if (!query.trim() || phase === "bidding") return;
    const q = query.trim();
    setAuctionQuery(q);
    setSources([]);
    setScored(0);
    setTotal(0);
    setPhase("bidding");

    if (esRef.current) esRef.current.close();
    const es = new EventSource(`/api/auction?query=${encodeURIComponent(q)}`);
    esRef.current = es;

    es.onmessage = (e: MessageEvent<string>) => {
      const msg = JSON.parse(e.data) as {
        type: string; sourceCount?: number;
        sourceId?: string; title?: string; price?: number; bonded?: boolean; category?: string;
        relevance?: number; priceScore?: number; reputationScore?: number; total?: number; reason?: string;
      };

      if (msg.type === "start") {
        const count = msg.sourceCount ?? 0;
        setTotal(count);
        setSources(Array.from({ length: count }, (_, i) => ({
          sourceId: `pending-${i}`, title: "Evaluating…", price: 0,
          bonded: false, category: "General",
          relevance: 0, priceScore: 0, reputationScore: 0, total: 0,
          reason: "", state: "pending",
        })));
      } else if (msg.type === "score") {
        setSources((prev) => {
          const idx = prev.findIndex((s) => s.state === "pending");
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = {
            sourceId: msg.sourceId!,
            title: msg.title!,
            price: msg.price!,
            bonded: msg.bonded!,
            category: msg.category!,
            relevance: msg.relevance!,
            priceScore: msg.priceScore!,
            reputationScore: msg.reputationScore!,
            total: msg.total!,
            reason: msg.reason!,
            state: "scored",
          };
          return updated;
        });
        setScored((n) => n + 1);
      } else if (msg.type === "done") {
        setPhase("settled");
        es.close();
      }
    };

    es.onerror = () => {
      setPhase("settled");
      es.close();
    };
  }, [query, phase]);

  const ranked = [...sources]
    .filter((s) => s.state === "scored")
    .sort((a, b) => b.total - a.total);

  const winners = ranked.slice(0, 3);
  const winnerIds = new Set(winners.map((s) => s.sourceId));

  const totalAuctionValue = ranked.reduce((s, src) => s + src.price, 0) / 1_000_000;
  const topScore = ranked[0]?.total ?? 0;
  const avgScore = ranked.length > 0 ? Math.round(ranked.reduce((s, src) => s + src.total, 0) / ranked.length) : 0;

  const EXAMPLE_QUERIES = [
    "How do AI agents pay for content on Arc Testnet?",
    "What is Circle Gateway x402 and how does it work?",
    "How does USDC micropayment settlement work for creators?",
  ];

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <BackButton />
        <span className="text-white/20">|</span>
        <span className="text-sm text-white/50">Citation Auction</span>
        {phase === "bidding" && (
          <span className="ml-auto flex items-center gap-2 text-xs text-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Scoring {scored}/{total} sources…
          </span>
        )}
        {phase === "settled" && (
          <span className="ml-auto text-xs text-emerald-400">{scored} sources scored · {winners.length} winners</span>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Live price discovery
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-3">Citation Auction</h1>
          <p className="text-lg text-white/50 max-w-2xl mx-auto">
            Watch AI score every source in real time. Top-ranked sources win citation slots.
            Price meets relevance — the market clears in seconds.
          </p>
        </div>

        {/* Query input */}
        <div className="max-w-2xl mx-auto mb-10">
          <div className="flex gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startAuction()}
              disabled={phase === "bidding"}
              placeholder="Enter a research query to start the auction…"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 text-sm"
            />
            <button
              onClick={startAuction}
              disabled={!query.trim() || phase === "bidding"}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity text-sm whitespace-nowrap"
            >
              {phase === "bidding" ? "Scoring…" : "Start Auction →"}
            </button>
          </div>

          {phase === "idle" && (
            <div className="flex flex-wrap gap-2 mt-3 justify-center">
              {EXAMPLE_QUERIES.map((q) => (
                <button key={q} onClick={() => setQuery(q)}
                  className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/50 hover:text-white/80 hover:border-white/20 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Auction stats */}
        {phase !== "idle" && (
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[
              { label: "Sources bidding", value: `${total}` },
              { label: "Scored", value: `${scored}` },
              { label: "Top score", value: phase === "settled" ? `${topScore}` : "…" },
              { label: "Avg score", value: phase === "settled" ? `${avgScore}` : "…" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
                <div className="text-2xl font-bold text-white">{s.value}</div>
                <div className="text-xs text-white/40 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Auction query label */}
        {auctionQuery && (
          <div className="mb-6 flex items-center gap-3">
            <span className="text-xs text-white/30 uppercase tracking-wider">Query</span>
            <span className="text-sm text-white/60 italic">"{auctionQuery}"</span>
          </div>
        )}

        {/* Winners podium */}
        {phase === "settled" && winners.length > 0 && (
          <div className="mb-8 rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/5 to-transparent p-6">
            <h2 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-4">Auction Winners — Top Citation Slots</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {winners.map((s, i) => (
                <div key={s.sourceId} className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                      i === 0 ? "bg-amber-400/20 text-amber-300" : i === 1 ? "bg-white/10 text-white/60" : "bg-amber-800/20 text-amber-700"
                    }`}>{i + 1}</span>
                    <span className="text-emerald-400 font-bold">{s.total}</span>
                    <span className="text-xs text-white/40 font-mono ml-auto">${(s.price / 1_000_000).toFixed(4)}</span>
                  </div>
                  <p className="text-sm font-medium text-white/90 line-clamp-2">{s.title}</p>
                  <p className="text-xs text-white/40 mt-1">Relevance: {s.relevance}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              <Link href="/ask"
                className="flex-1 text-center px-5 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity">
                Execute & pay winners →
              </Link>
              <button onClick={() => { setPhase("idle"); setSources([]); setAuctionQuery(""); }}
                className="flex-1 text-center px-5 py-2.5 rounded-lg border border-white/20 text-white/60 hover:text-white hover:border-white/40 text-sm transition-colors">
                Run new auction
              </button>
            </div>
          </div>
        )}

        {/* Source grid */}
        {sources.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-4">
              {phase === "bidding" ? "Scoring sources…" : "All sources ranked"}
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(phase === "settled" ? ranked : sources).map((s, i) => {
                const rank = phase === "settled" ? i + 1 : null;
                return (
                  <SourceCard
                    key={s.sourceId || i}
                    s={s}
                    rank={rank}
                    isWinner={winnerIds.has(s.sourceId)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* How it works — shown when idle */}
        {phase === "idle" && (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-8">
            <h2 className="text-lg font-semibold text-white mb-6">How Citation Auctions work</h2>
            <div className="grid sm:grid-cols-4 gap-6 text-center">
              {[
                { icon: "⌨", title: "Enter query", desc: "Type what you want to research — the auction starts immediately" },
                { icon: "⚡", title: "Live scoring", desc: "Claude evaluates every source's relevance to your query in real time" },
                { icon: "🏆", title: "Top 3 win", desc: "Sources ranked by combined score: relevance + price efficiency + reputation" },
                { icon: "💸", title: "Pay & cite", desc: "Execute the auction to pay winning sources via Circle Gateway x402" },
              ].map((item) => (
                <div key={item.title}>
                  <div className="text-2xl mb-3">{item.icon}</div>
                  <h4 className="text-sm font-semibold text-white/80 mb-2">{item.title}</h4>
                  <p className="text-xs text-white/40">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
