"use client";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import type { TractionStats } from "@/types";

const DEMO_AGENT = "0x5389688243328c26a92b301faEEAb5fbf9AFf105";

const DECISION_COLOR: Record<string, { card: string; badge: string }> = {
  PAY:               { card: "border-[#00ff88]/30 bg-[#00ff88]/5",    badge: "text-[#00ff88] border-[#00ff88]/30 bg-[#00ff88]/10" },
  REFUSE:            { card: "border-red-800/40 bg-red-900/10",       badge: "text-red-400 border-red-800 bg-red-900/20" },
  SKIP:              { card: "border-[#1e1e2e] bg-[#111118]",         badge: "text-[#8b8b9e] border-[#1e1e2e]" },
  BLOCKED_BY_POLICY: { card: "border-orange-700/30 bg-orange-900/10", badge: "text-orange-400 border-orange-700 bg-orange-900/20" },
};

const FLOW_STEPS = [
  { n: "01", title: "POST /api/ask",           desc: "Submit a research query with budget and agent spend policy." },
  { n: "02", title: "← 402 Payment Required",  desc: "Server returns x402 payment challenge. No payment = no query." },
  { n: "03", title: "Pay query fee in USDC",   desc: "Client attaches X-PAYMENT header and retries the request." },
  { n: "04", title: "Agent scores sources",    desc: "CitePay evaluates creators on relevance, price, bond, and reputation. Prior citations boost pre-trust." },
  { n: "05", title: "PAY best sources",        desc: "Winners receive USDC instantly. Weak sources get REFUSE or SKIP." },
  { n: "06", title: "Public receipt + anchor", desc: "Every decision becomes a signed Policy Receipt, anchored on Arc via Circle Gateway." },
  { n: "07", title: "Content stays honest",    desc: "Hash at payment locks what was cited. If creator modifies content after payment, challenge triggers reputation slash." },
];

function useCountUp(target: number, active: boolean, duration = 1200, decimals = 0): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active || !target) return;
    const start = Date.now();
    const timer = setInterval(() => {
      const p = Math.min((Date.now() - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const raw = target * eased;
      setCount(decimals > 0 ? parseFloat(raw.toFixed(decimals)) : Math.round(raw));
      if (p >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, active, duration, decimals]);
  return count;
}

export default function LandingPage() {
  const [stats, setStats] = useState<TractionStats | null>(null);
  const [onchainStats, setOnchainStats] = useState<{ citationPaidEvents: number; sourceRegisteredEvents: number } | null>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const [statsVisible, setStatsVisible] = useState(false);
  const [liveEvents, setLiveEvents] = useState<Array<{id?:string;decision:string;sourceTitle:string;amountPaid:number;timestamp:string;reason?:string;score?:number;creatorHandle?:string;creatorName?:string}>>([]);
  const [proofReceipts, setProofReceipts] = useState<Array<{receiptId: number; creatorWallet: string; amountPaid: number; txHash: string; arcScanUrl: string; sourceTitle?: string;}>>([]);

  useEffect(() => {
    fetch("/api/traction").then((r) => r.json()).then((d) => setStats(d.stats)).catch(() => {});
    fetch("/api/onchain-stats").then((r) => r.json()).then((d) => setOnchainStats(d)).catch(() => {});
    fetch("/api/proof?limit=5").then((r) => r.json()).then((d) => setProofReceipts(d.receipts ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStatsVisible(true); }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    function pollLive() {
      fetch("/api/live-events?limit=5").then((r) => r.json()).then((d) => setLiveEvents(d.events ?? [])).catch(() => {});
    }
    pollLive();
    const id = setInterval(pollLive, 6000);
    return () => clearInterval(id);
  }, []);

  const usdcRouted       = useCountUp(stats?.totalUSDCRouted ?? 0, statsVisible, 1200, 4);
  const totalDecisions   = useCountUp(stats?.totalDecisions  ?? 0, statsVisible);
  const onchainCitations = useCountUp(onchainStats?.citationPaidEvents ?? 0, statsVisible);
  const paidCitations    = useCountUp(stats?.paidCitations ?? 0, statsVisible);

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5] pb-20 sm:pb-0">

      {/* ── 1. Hero ── */}
      <section
        className="max-w-4xl mx-auto px-6 pt-24 pb-20 text-center relative"
        style={{
          backgroundImage: "radial-gradient(circle, #1e1e2e 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a0f]/60 to-[#0a0a0f] pointer-events-none" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111118]/80 backdrop-blur border border-[#1e1e2e] text-[#8b8b9e] text-xs font-mono mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] inline-block pulse-dot" />
            Arc Testnet · Circle Gateway · Nanopayments · x402 ·{" "}
            {onchainStats ? (
              <span className="text-[#00ff88] font-bold">{onchainStats.citationPaidEvents.toLocaleString()} CitationPaid events</span>
            ) : (
              <span className="text-[#4a4a5e]">loading chain…</span>
            )}
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold mb-4 leading-tight tracking-tight">
            AI agents are paying creators<br />
            <span className="gradient-text">in USDC — right now, on-chain.</span>
          </h1>
          <p className="text-sm text-[#4a4a5e] font-mono mb-5">
            Micro-payments too small for Ethereum → settled instantly on Arc · Verified by Circle Gateway
          </p>

          {/* Live proof pulse */}
          <div className="inline-flex items-center gap-3 mb-10 px-4 py-2.5 rounded-xl bg-[#111118]/80 border border-[#00ff88]/20 backdrop-blur">
            <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse flex-shrink-0" />
            <span className="font-mono text-sm">
              <span className="text-[#00ff88] font-bold">{stats?.paidCitations ?? "—"}</span>
              <span className="text-[#8b8b9e]"> citations paid · </span>
              <span className="text-[#00ff88] font-bold">
                {stats ? `$${stats.totalUSDCRouted.toFixed(4)}` : "—"}
              </span>
              <span className="text-[#8b8b9e]"> USDC to creators · Arc Testnet</span>
            </span>
          </div>

          {/* Primary CTAs — two audiences, equal weight */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
            <Link href="/ask" className="bg-[#00ff88] hover:bg-[#00e87a] text-black font-bold px-10 py-4 rounded-xl transition-all hover:scale-105 card-lift text-lg">
              Run a Query →
            </Link>
            <Link href="/register" className="bg-[#6366f1] hover:bg-indigo-500 text-white font-bold px-10 py-4 rounded-xl transition-all hover:scale-105 card-lift text-lg">
              Register as Creator →
            </Link>
          </div>

          {/* Secondary CTAs */}
          <div className="flex flex-col sm:flex-row gap-2 justify-center flex-wrap">
            <Link href="/orchestrate" className="border border-[#6366f1]/40 hover:border-[#6366f1] text-[#6366f1] hover:text-indigo-300 font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm">
              Multi-Agent Demo
            </Link>
            <Link href="/auction" className="border border-amber-500/30 hover:border-amber-500/60 text-amber-400/80 hover:text-amber-300 font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm">
              Live Auction
            </Link>
            <Link href="/bounties" className="border border-orange-500/50 hover:border-orange-500/80 text-orange-400 hover:text-orange-300 font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm flex items-center gap-2">
              Bounties
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/20 border border-orange-500/40 font-mono">NEW</span>
            </Link>
            <Link href="/session" className="border border-teal-500/30 hover:border-teal-500/60 text-teal-400/80 hover:text-teal-300 font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm">
              Research Sessions
            </Link>
            <Link href="/policy" className="border border-violet-500/30 hover:border-violet-500/60 text-violet-400/80 hover:text-violet-300 font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm">
              AI Policy Builder
            </Link>
            <Link href="/intelligence" className="border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-400/80 hover:text-emerald-300 font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Intelligence
            </Link>
            <Link href="/live" className="border border-[#00ff88]/20 hover:border-[#00ff88]/50 text-[#00ff88]/70 hover:text-[#00ff88] font-semibold px-6 py-2.5 rounded-xl transition-colors flex items-center gap-2 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] inline-block animate-pulse" />
              Live Feed
            </Link>
            <Link href="/proof" className="border border-[#00ff88]/20 hover:border-[#00ff88]/50 text-[#00ff88]/70 hover:text-[#00ff88] font-semibold px-6 py-2.5 rounded-xl transition-colors flex items-center gap-2 text-sm">
              On-Chain Proof
            </Link>
            <Link href="/mcp" className="border border-[#1e1e2e] hover:border-[#8b8b9e] text-[#8b8b9e] hover:text-[#f0f0f5] font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm">
              Add to Claude (MCP)
            </Link>
          </div>
        </div>
      </section>

      {/* ── 2. Live Market Activity ── */}
      <section className="max-w-4xl mx-auto px-6 py-8 border-t border-[#1e1e2e]">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse inline-block" />
          <span className="text-xs font-mono text-[#4a4a5e]">LIVE MARKET ACTIVITY</span>
          <Link href="/live" className="ml-auto text-xs text-[#6366f1] hover:text-indigo-300 transition-colors">Full feed →</Link>
        </div>
        {liveEvents.length > 0 ? (
          <div className="space-y-1.5">
            {liveEvents.map((e, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#111118] border border-[#1e1e2e] text-xs font-mono">
                <span className={e.decision === "PAY" ? "text-[#00ff88]" : e.decision === "REFUSE" ? "text-red-400" : "text-[#4a4a5e]"}>
                  {e.decision === "PAY" ? "▰" : e.decision === "REFUSE" ? "✗" : "—"}
                </span>
                <span className="text-[#8b8b9e] flex-1 truncate">{e.sourceTitle}</span>
                {e.decision === "PAY" && e.amountPaid > 0 && (
                  <span className="text-[#00ff88]">${e.amountPaid.toFixed(4)}</span>
                )}
                <span className="text-[#2e2e3e]">{new Date(e.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[#111118] border border-[#1e1e2e] text-xs font-mono text-[#4a4a5e]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4a4a5e] inline-block" />
            Waiting for next transaction ·{" "}
            <Link href="/ask" className="text-[#6366f1] hover:text-indigo-300">trigger one →</Link>
          </div>
        )}
      </section>

      {/* ── 2b. Verified Proof Strip ── */}
      <section className="max-w-4xl mx-auto px-6 py-6 border-t border-[#1e1e2e]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#00ff88] inline-block" />
            <span className="text-xs font-mono text-[#4a4a5e]">VERIFIED ON-CHAIN PAYMENTS</span>
          </div>
          <Link href="/proof" className="text-xs text-[#6366f1] hover:text-indigo-300 transition-colors">
            Full proof explorer →
          </Link>
        </div>
        {proofReceipts.length > 0 ? (
          <div className="space-y-1.5">
            {proofReceipts.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0a0a10] border border-[#00ff88]/10 text-xs font-mono">
                <span className="text-[#00ff88]">✓</span>
                <span className="text-[#4a4a5e]">#{r.receiptId}</span>
                <span className="text-[#8b8b9e] flex-1 truncate">{r.sourceTitle ?? `${r.creatorWallet.slice(0,6)}…${r.creatorWallet.slice(-4)}`}</span>
                <span className="text-[#00ff88] font-bold">${r.amountPaid.toFixed(4)}</span>
                <a href={r.arcScanUrl} target="_blank" rel="noopener noreferrer" className="text-[#6366f1] hover:text-indigo-300 transition-colors">ArcScan ↗</a>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs font-mono text-[#4a4a5e] py-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4a4a5e] inline-block animate-pulse" />
            Reading Arc Testnet…
          </div>
        )}
      </section>

      {/* ── 3. Live Market Stats ── */}
      <section ref={statsRef} className="max-w-4xl mx-auto px-6 py-16 border-t border-[#1e1e2e]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-[#f0f0f5]">Live Market Stats</h2>
          <div className="flex items-center gap-4">
            <Link href="/revenue" className="text-xs text-[#00ff88]/70 hover:text-[#00ff88] transition-colors">
              Revenue →
            </Link>
            <Link href="/traction" className="text-xs text-[#6366f1] hover:text-indigo-300 transition-colors">
              Full dashboard →
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "CitationPaid Events", value: onchainCitations, accent: "text-[#00ff88]", prefix: "", onchain: true },
            { label: "USDC Routed",         value: usdcRouted,       accent: "text-[#00ff88]", prefix: "$", divisor: 1, decimals: 4 },
            { label: "Agent Decisions",     value: totalDecisions,   accent: "text-[#6366f1]", prefix: "" },
            { label: "Citations Paid",      value: paidCitations,    accent: "text-[#6366f1]", prefix: "" },
          ].map(({ label, value, accent, prefix, divisor, decimals, onchain }) => {
            const display = onchain ? `${prefix}${value}`
              : stats == null ? "—"
              : divisor ? `${prefix}${(value / divisor).toFixed(decimals ?? 2)}`
              : `${prefix}${value}`;
            return (
              <div key={label} className={`bg-[#111118] rounded-xl p-5 border text-center card-lift ${onchain ? "border-[#00ff88]/20" : "border-[#1e1e2e]"}`}>
                {onchain && <div className="text-[10px] font-mono text-[#4a4a5e] mb-1">Arc Testnet</div>}
                <div className={`text-2xl font-bold font-mono ${accent}`}>{display}</div>
                <div className="text-[#8b8b9e] text-xs mt-1">{label}</div>
              </div>
            );
          })}
        </div>

        {/* Proof of Economics */}
        {(() => {
          const actualUSDC = stats?.totalUSDCRouted ?? 0;
          const citations  = stats?.paidCitations ?? 0;
          const ethL1Cost  = citations * 2.50;
          const multiplier = actualUSDC > 0.0001 ? Math.round(ethL1Cost / actualUSDC) : 0;
          return (
            <div className="mt-4 bg-[#0a0a0f] rounded-xl border border-[#00ff88]/20 p-5 font-mono text-xs">
              <div className="text-[#4a4a5e] text-[10px] tracking-widest mb-3">PROOF OF ECONOMICS</div>
              <div className="border-t border-[#1e1e2e] pt-3 space-y-1.5">
                {citations > 0 ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-[#8b8b9e]">Citations settled on Arc Testnet</span>
                      <span className="text-[#f0f0f5]">{citations.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8b8b9e]">USDC paid to creators (actual)</span>
                      <span className="text-[#00ff88]">${actualUSDC.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8b8b9e]">Equivalent cost on Ethereum L1 <span className="text-[#4a4a5e]">($2.50/tx avg gas)</span></span>
                      <span className="text-amber-400">${ethL1Cost.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-[#1e1e2e] pt-2 mt-1 flex justify-between items-center">
                      <span className="text-[#4a4a5e]">ARC MAKES THIS MARKET POSSIBLE</span>
                      {multiplier > 1 && (
                        <span className="text-[#00ff88] font-bold">~{multiplier.toLocaleString()}× cheaper per citation</span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-[#4a4a5e] py-2">Run a query to generate proof of economics →{" "}
                    <Link href="/ask" className="text-[#6366f1] hover:text-indigo-300">try /ask</Link>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </section>

      {/* ── 4. For Agents / For Creators ── */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-[#1e1e2e]">
        <h2 className="text-lg font-semibold text-[#f0f0f5] mb-6">Who is CitePay for?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="bg-[#111118] rounded-xl p-6 border border-[#00ff88]/20 card-lift">
            <div className="text-xs font-mono text-[#00ff88] mb-3">For AI Agents &amp; Developers</div>
            <h3 className="font-semibold text-lg text-[#f0f0f5] mb-2">Set a policy. Cite sources. Pay creators. Prove it.</h3>
            <p className="text-[#8b8b9e] text-sm mb-5 leading-relaxed">
              POST /api/ask with an Agent Spend Policy. Get structured answers with cited, paid sources — and a Policy Receipt for every decision. Integrates via Circle Gateway x402 or MCP from Claude Code.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/ask" className="text-xs bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88] px-3 py-1.5 rounded-lg hover:bg-[#00ff88]/20 transition-colors">
                Run a Query →
              </Link>
              <Link href="/orchestrate" className="text-xs border border-[#1e1e2e] text-[#8b8b9e] hover:text-[#f0f0f5] px-3 py-1.5 rounded-lg transition-colors">
                Multi-Agent Demo
              </Link>
              <Link href="/mcp" className="text-xs border border-[#6366f1]/30 text-[#6366f1] hover:border-[#6366f1] px-3 py-1.5 rounded-lg transition-colors">
                Add to Claude (MCP)
              </Link>
            </div>
          </div>

          <div className="bg-[#111118] rounded-xl p-6 border border-[#6366f1]/20 card-lift">
            <div className="text-xs font-mono text-[#6366f1] mb-3">For Creators &amp; Publishers</div>
            <h3 className="font-semibold text-lg text-[#f0f0f5] mb-2">Get paid every time AI cites your work.</h3>
            <p className="text-[#8b8b9e] text-sm mb-5 leading-relaxed">
              Register your articles, research, or content. Earn USDC each time an AI agent cites your work. Add a credibility bond to increase selection priority. One form, no approval needed.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/register" className="text-xs bg-[#6366f1]/10 border border-[#6366f1]/30 text-[#6366f1] px-3 py-1.5 rounded-lg hover:bg-[#6366f1]/20 transition-colors">
                Register your content →
              </Link>
              <Link href="/market" className="text-xs border border-[#1e1e2e] text-[#8b8b9e] hover:text-[#f0f0f5] px-3 py-1.5 rounded-lg transition-colors">
                Browse market
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. Every Decision is a Receipt ── */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-[#1e1e2e]">
        <h2 className="text-lg font-semibold text-[#f0f0f5] mb-2">Every decision is a public receipt</h2>
        <p className="text-[#8b8b9e] text-sm mb-8">
          Paid, Refused, Skipped, or Blocked by Policy — every agent decision generates a Policy Receipt with an evidence hash and on-chain anchor. Nothing is hidden.
        </p>
        {liveEvents.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {liveEvents.slice(0, 4).map((e, i) => {
              const { card, badge } = DECISION_COLOR[e.decision] ?? DECISION_COLOR["SKIP"];
              return (
                <div key={i} className={`rounded-xl p-5 border card-lift ${card}`} style={{ borderLeftWidth: "3px" }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${badge}`}>
                      {e.decision === "BLOCKED_BY_POLICY" ? "BLOCKED" : e.decision}
                    </span>
                    {(e.score ?? 0) > 0 && <span className="text-xs text-[#4a4a5e] font-mono">{e.score}/100</span>}
                  </div>
                  <div className="text-sm font-medium text-[#f0f0f5] mb-0.5 truncate">{e.sourceTitle}</div>
                  {e.creatorHandle && <div className="text-xs text-[#8b8b9e] mb-2">{e.creatorHandle}</div>}
                  {e.reason && <div className="text-xs text-[#8b8b9e] mb-3 leading-relaxed line-clamp-2">{e.reason}</div>}
                  <div className="text-xs font-mono text-[#4a4a5e]">
                    Paid:{" "}
                    <span className={e.decision === "PAY" ? "text-[#00ff88]" : "text-[#4a4a5e]"}>
                      ${e.amountPaid.toFixed(4)} USDC
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 border border-dashed border-[#1e1e2e] rounded-xl text-center">
            <div className="text-[#4a4a5e] text-sm mb-4">No receipts yet — run a query to generate the first one.</div>
            <Link href="/ask" className="bg-[#00ff88] hover:bg-[#00e87a] text-black font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors">
              Run a Query →
            </Link>
          </div>
        )}
        <div className="text-center mt-6">
          <Link href="/ask" className="text-[#6366f1] hover:text-indigo-300 text-sm transition-colors">
            Try it yourself — ask a question →
          </Link>
        </div>
      </section>

      {/* ── 6. How CitePay Works ── */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-[#1e1e2e]">
        <h2 className="text-lg font-semibold text-[#f0f0f5] mb-10">How CitePay Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-0">
          {FLOW_STEPS.map((step, i) => {
            const isLast = i === FLOW_STEPS.length - 1;
            const col = i % 2;
            const isPay = step.n === "05";
            return (
              <div key={step.n} className={`relative flex gap-4 ${col === 0 ? "sm:pr-6" : ""} ${!isLast ? "pb-8" : ""}`}>
                {!isLast && (
                  <div className="absolute left-3.5 top-7 bottom-0 w-px bg-[#1e1e2e]" style={{ left: "14px" }} />
                )}
                <div className={`relative z-10 w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                  isPay ? "border-[#00ff88] bg-[#00ff88]/10" : "border-[#1e1e2e] bg-[#0a0a0f]"
                }`}>
                  <span className={`text-[9px] font-mono font-bold ${isPay ? "text-[#00ff88]" : "text-[#4a4a5e]"}`}>{step.n}</span>
                </div>
                <div className="pb-1">
                  <h3 className={`font-semibold text-sm font-mono mb-0.5 ${isPay ? "text-[#00ff88]" : "text-[#f0f0f5]"}`}>{step.title}</h3>
                  <p className="text-[#8b8b9e] text-xs leading-relaxed">{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 7. Agent API Callout ── */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-[#1e1e2e]">
        <div style={{
          background: "#111118",
          borderRadius: "12px",
          padding: "2rem",
          position: "relative",
          isolation: "isolate",
        }}>
          <div style={{
            position: "absolute",
            inset: "-1px",
            borderRadius: "13px",
            background: "linear-gradient(135deg, #6366f1 0%, #00ff88 100%)",
            zIndex: -1,
          }} />
          <div style={{
            position: "absolute",
            inset: "0",
            borderRadius: "12px",
            background: "#111118",
            zIndex: -1,
          }} />
          <div className="text-xs font-mono text-[#6366f1] mb-3">Agent API</div>
          <h2 className="text-xl font-bold text-[#f0f0f5] mb-3">
            One endpoint. Verifiable citations. Real USDC payments.
          </h2>
          <p className="text-[#8b8b9e] text-sm mb-6 leading-relaxed">
            Any AI agent pays via <strong className="text-[#f0f0f5]">Circle Gateway</strong> using <code className="text-[#f0f0f5] bg-[#0a0a0f] px-1.5 py-0.5 rounded">GatewayClient.pay()</code>, or use the MCP server to call CitePay directly from Claude Code — no wallet setup needed.
          </p>
          <div className="bg-[#0a0a0f] rounded-lg p-4 font-mono text-xs text-[#00ff88] overflow-x-auto border border-[#1e1e2e] mb-4">
{`// Option 1: Direct REST (any language)
const res = await fetch("https://citepay-markets.vercel.app/api/ask", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-PAYMENT": "<circle-gateway-sig>" },
  body: JSON.stringify({ query: "What is neural scaling?", policy: "balanced" })
});
const { answer, decisions, totalPaid } = await res.json();
// → AI scored 10 sources, paid 3 creators on Arc Testnet

// Option 2: Circle Gateway (x402 auto-payment)
const client = new GatewayClient({ chain: "arcTestnet", privateKey });
const { data } = await client.pay("https://citepay-markets.vercel.app/api/ask", {
  method: "POST", body: JSON.stringify({ query: "...", policy: "balanced" })
});

// Option 3: Claude Code MCP (no wallet needed)
// Add to ~/.claude.json → tools: cite_query, get_receipt, check_policy`}
          </div>
          <div className="bg-[#0a0a0f] rounded-lg p-4 font-mono text-xs border border-[#1e1e2e] mb-6 space-y-1">
            <div className="text-[#4a4a5e] text-[10px] tracking-widest mb-2">RESPONSE INCLUDES</div>
            <div className="flex gap-3"><span className="text-[#6366f1] w-24 shrink-0">answer</span><span className="text-[#8b8b9e]">AI-synthesized answer from cited sources</span></div>
            <div className="flex gap-3"><span className="text-[#6366f1] w-24 shrink-0">decisions[]</span><span className="text-[#8b8b9e]">PAY / REFUSE / SKIP per source with scores</span></div>
            <div className="flex gap-3"><span className="text-[#6366f1] w-24 shrink-0">totalPaid</span><span className="text-[#8b8b9e]">USDC sent to creators this query</span></div>
            <div className="flex gap-3"><span className="text-[#6366f1] w-24 shrink-0">receipts[]</span><span className="text-[#8b8b9e]">Receipt IDs for on-chain verification</span></div>
          </div>
          <div className="flex gap-4 flex-wrap">
            <Link href="/orchestrate" className="bg-[#6366f1] hover:bg-indigo-500 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm">
              Multi-Agent Demo
            </Link>
            <Link href="/mcp" className="border border-[#6366f1]/30 hover:border-[#6366f1] text-[#6366f1] font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm">
              Add to Claude (MCP)
            </Link>
            <Link href="/ask" className="border border-[#1e1e2e] hover:border-[#8b8b9e] text-[#8b8b9e] hover:text-[#f0f0f5] font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm">
              Single Agent
            </Link>
          </div>
        </div>
      </section>

      {/* ── 7b. Citation Economy in Numbers ── */}
      <section className="max-w-4xl mx-auto px-6 py-10 border-t border-[#1e1e2e]">
        <div className="text-[10px] font-mono text-[#4a4a5e] tracking-widest mb-4">CITATION ECONOMY — HOW THE MARKET WORKS</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              step: "01", color: "border-[#6366f1]/30 bg-[#6366f1]/5",
              title: "AI Agent Pays to Query",
              body: "Any AI agent POSTs to /api/ask. The x402 gate requires real USDC — no payment, no answer. Circle Gateway settles in milliseconds on Arc Testnet.",
              stat: "$0.001 per query", statColor: "text-[#6366f1]",
            },
            {
              step: "02", color: "border-[#00ff88]/20 bg-[#00ff88]/5",
              title: "CitePay Scores & Pays",
              body: "CitePay evaluates 10 creator sources on relevance, price, bond, and reputation. PAY decisions send USDC to creators instantly — on-chain, no intermediary.",
              stat: "$0.002 avg per citation", statColor: "text-[#00ff88]",
            },
            {
              step: "03", color: "border-amber-500/20 bg-amber-500/5",
              title: "Public Proof, Always",
              body: "Every decision creates a SHA-256 evidence receipt anchored on CitePayMarket.sol. Creators can challenge stale content. Policy rules are on-chain — not a config file.",
              stat: "268+ on-chain receipts", statColor: "text-amber-400",
            },
          ].map(({ step, color, title, body, stat, statColor }) => (
            <div key={step} className={`rounded-xl border p-5 ${color}`}>
              <div className={`text-[10px] font-mono mb-2 ${statColor}`}>{step}</div>
              <h3 className="font-semibold text-[#f0f0f5] mb-2 text-sm">{title}</h3>
              <p className="text-xs text-[#8b8b9e] leading-relaxed mb-3">{body}</p>
              <div className={`text-xs font-mono font-bold ${statColor}`}>{stat}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 8. Institutional Framing ── */}
      <section className="max-w-4xl mx-auto px-6 py-10 border-t border-[#1e1e2e]">
        <div className="rounded-2xl border border-[#6366f1]/20 bg-[#111118] p-6 md:p-8">
          <div className="text-[10px] font-mono text-[#6366f1] tracking-widest mb-3">FOR INSTITUTIONS DEPLOYING AI AGENTS</div>
          <p className="text-sm text-[#8b8b9e] leading-relaxed max-w-2xl mb-5">
            CitePay provides a compliance-grade, on-chain attribution layer for every USDC spent by AI agents on knowledge retrieval.
            Every citation is receipted with a SHA-256 evidence hash, purpose code, content integrity proof, and ArcScan-verifiable transaction.
            Policy enforcement (spend caps, bond requirements, relevance thresholds) is anchored on-chain — not a config file a developer can change.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { code: "CITE",         desc: "Citation micropayment" },
              { code: "QUERY_FEE",    desc: "x402 gateway fee"      },
              { code: "AGENT_REWARD", desc: "Coordination reward"   },
              { code: "BOND_SLASH",   desc: "Accountability slash"  },
            ].map(({ code, desc }) => (
              <div key={code} className="bg-[#0a0a0f] rounded-lg p-3 border border-[#1e1e2e]">
                <div className="font-mono text-xs text-[#6366f1] mb-1">{code}</div>
                <div className="text-[10px] text-[#4a4a5e]">{desc}</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] font-mono text-[#4a4a5e] flex flex-wrap gap-4">
            <a href="/api/audit-summary" className="text-[#6366f1] hover:text-indigo-300 transition-colors">
              /api/audit-summary ↗
            </a>
            <a href="/audit" className="text-[#6366f1] hover:text-indigo-300 transition-colors">
              On-chain audit →
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#1e1e2e] py-10">
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-[#4a4a5e] text-sm font-mono">
            CitePay Markets · Built for{" "}
            <span className="text-[#f0f0f5]">Lepton Hackathon</span>
            {" "}· Jun 15 – Jul 6 2026<br />
            <span className="text-xs">Demo agent: </span>
            <span className="text-[#6366f1] text-xs">
              {DEMO_AGENT.slice(0, 6)}…{DEMO_AGENT.slice(-4)}
            </span>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-[#8b8b9e] justify-center">
            <Link href="/ask"         className="hover:text-[#f0f0f5] transition-colors">Ask</Link>
            <Link href="/register"    className="hover:text-[#6366f1] text-[#6366f1]/70 transition-colors">Register</Link>
            <Link href="/orchestrate" className="hover:text-[#f0f0f5] transition-colors">Orchestrate</Link>
            <Link href="/estimate"    className="hover:text-[#f0f0f5] transition-colors">Estimate</Link>
            <Link href="/mcp"         className="hover:text-[#f0f0f5] transition-colors">MCP</Link>
            <Link href="/economy"     className="hover:text-[#f0f0f5] transition-colors">Index</Link>
            <Link href="/market"      className="hover:text-[#f0f0f5] transition-colors">Market</Link>
            <Link href="/leaderboard" className="hover:text-[#f0f0f5] transition-colors">Leaderboard</Link>
            <Link href="/traction"    className="hover:text-[#f0f0f5] transition-colors">Traction</Link>
            <Link href="/creator"     className="hover:text-[#f0f0f5] transition-colors">Creator</Link>
            <Link href="/agents"      className="hover:text-[#f0f0f5] transition-colors">For Agents</Link>
            <Link href="/revenue"     className="hover:text-[#f0f0f5] transition-colors">Revenue</Link>
            <Link href="/subscribe"   className="hover:text-[#f0f0f5] transition-colors">Subscribe</Link>
            <Link href="/audit"       className="hover:text-[#f0f0f5] transition-colors">Audit</Link>
            <Link href="/proof"       className="hover:text-[#f0f0f5] transition-colors">Proof</Link>
            <a href="https://github.com/cyberrockng/citepay-markets" target="_blank" rel="noopener noreferrer"
               className="hover:text-[#f0f0f5] transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
