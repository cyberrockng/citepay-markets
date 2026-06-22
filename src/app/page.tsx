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
  { n: "04", title: "Agent scores sources",    desc: "CitePay evaluates creators on relevance, price, bond, and reputation." },
  { n: "05", title: "PAY best sources",        desc: "Winners receive USDC instantly. Weak sources get REFUSE or SKIP." },
  { n: "06", title: "Public receipt + anchor", desc: "Every decision becomes a signed Policy Receipt, anchored on Arc via Circle Gateway." },
];

function useCountUp(target: number, active: boolean, duration = 1200): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active || !target) return;
    const start = Date.now();
    const timer = setInterval(() => {
      const p = Math.min((Date.now() - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(target * eased));
      if (p >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, active, duration]);
  return count;
}

export default function LandingPage() {
  const [stats, setStats] = useState<TractionStats | null>(null);
  const [onchainStats, setOnchainStats] = useState<{ citationPaidEvents: number; sourceRegisteredEvents: number } | null>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const [statsVisible, setStatsVisible] = useState(false);
  const [liveEvents, setLiveEvents] = useState<Array<{decision:string;sourceTitle:string;amountPaid:number;timestamp:string}>>([]);

  useEffect(() => {
    fetch("/api/traction").then((r) => r.json()).then((d) => setStats(d.stats)).catch(() => {});
    fetch("/api/onchain-stats").then((r) => r.json()).then((d) => setOnchainStats(d)).catch(() => {});
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

  const usdcRouted       = useCountUp(stats?.totalUSDCRouted ?? 0, statsVisible);
  const totalDecisions   = useCountUp(stats?.totalDecisions  ?? 0, statsVisible);
  const onchainCitations = useCountUp(onchainStats?.citationPaidEvents ?? 0, statsVisible);
  const paidCitations    = useCountUp(stats?.paidCitations ?? 0, statsVisible);

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5] pb-20 sm:pb-0">

      {/* ── Hero ── */}
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
          <h1 className="text-5xl sm:text-6xl font-bold mb-5 leading-tight tracking-tight">
            The Policy &amp; Payment Layer<br />
            <span className="gradient-text">for Autonomous AI Citations</span>
          </h1>
          <p className="text-xl text-[#8b8b9e] max-w-2xl mx-auto mb-10 leading-relaxed">
            Agents enforce configurable spend policies, pay creators in USDC nanopayments via Circle Gateway on Arc, and publish tamper-evident Policy Receipts.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center flex-wrap">
            <Link href="/orchestrate" className="bg-[#00ff88] hover:bg-[#00e87a] text-black font-bold px-8 py-3.5 rounded-xl transition-all hover:scale-105 card-lift">
              Multi-Agent Demo →
            </Link>
            <Link href="/agents" className="bg-[#6366f1] hover:bg-indigo-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-all hover:scale-105 card-lift">
              Source Agents
            </Link>
            <Link href="/live" className="border border-[#00ff88]/20 hover:border-[#00ff88]/50 text-[#00ff88]/70 hover:text-[#00ff88] font-semibold px-8 py-3.5 rounded-xl transition-colors flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] inline-block animate-pulse" />
              Live Feed
            </Link>
            <Link href="/wallet" className="border border-[#1e1e2e] hover:border-[#8b8b9e] text-[#8b8b9e] hover:text-[#f0f0f5] font-semibold px-8 py-3.5 rounded-xl transition-colors">
              Agent Wallet
            </Link>
            <Link href="/register" className="border border-violet-600/40 hover:border-violet-500 text-violet-400 hover:text-violet-300 font-semibold px-8 py-3.5 rounded-xl transition-colors">
              Register Creator
            </Link>
            <Link href="/mcp" className="border border-[#6366f1]/40 hover:border-[#6366f1] text-[#6366f1] hover:text-indigo-300 font-semibold px-8 py-3.5 rounded-xl transition-colors">
              Add to Claude (MCP)
            </Link>
          </div>
        </div>
      </section>

      {/* ── Live Market Stats ── */}
      <section ref={statsRef} className="max-w-4xl mx-auto px-6 py-16 border-t border-[#1e1e2e]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-[#f0f0f5]">Live Market Stats</h2>
          <Link href="/traction" className="text-xs text-[#6366f1] hover:text-indigo-300 transition-colors">
            Full dashboard →
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "CitationPaid Events", value: onchainCitations, accent: "text-[#00ff88]", prefix: "", onchain: true },
            { label: "USDC Routed",         value: usdcRouted,       accent: "text-[#00ff88]", prefix: "$", divisor: 1_000_000, decimals: 4 },
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

        {/* Margin Proof Panel */}
        {(() => {
          const actualUSDC = (stats?.totalUSDCRouted ?? 0) / 1e6;
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
                    <a href="/ask" className="text-[#6366f1] hover:text-indigo-300">try /ask</a>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Share prompt */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#111118] rounded-xl border border-[#1e1e2e] px-5 py-4">
          <div className="text-sm text-[#8b8b9e]">
            Built for{" "}
            <span className="text-[#f0f0f5] font-semibold">Lepton Hackathon</span>
            {" "}· Jun 15–29 2026 · Arc Testnet · Circle Gateway
          </div>
          <div className="flex gap-2">
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent("AI agents that actually pay creators in USDC when they cite their work 🤖💰\n\nCitePay Markets: multi-agent orchestrator + Circle Gateway nanopayments + on-chain receipts on Arc\n\nTry it → https://citepay-markets.vercel.app\n\n#Lepton #CircleGateway #x402 #Web3AI")}`}
              target="_blank" rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 rounded-lg bg-[#1e1e2e] hover:bg-[#2e2e3e] text-[#8b8b9e] hover:text-[#f0f0f5] transition-colors font-mono"
            >
              Share on X
            </a>
            <Link href="/mcp" className="text-xs px-3 py-1.5 rounded-lg border border-[#6366f1]/30 hover:border-[#6366f1] text-[#6366f1] transition-colors font-mono">
              Add MCP →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Live Market Activity ── */}
      {liveEvents.length > 0 && (
        <section className="max-w-4xl mx-auto px-6 py-8 border-t border-[#1e1e2e]">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse inline-block" />
            <span className="text-xs font-mono text-[#4a4a5e]">LIVE MARKET ACTIVITY</span>
            <a href="/live" className="ml-auto text-xs text-[#6366f1] hover:text-indigo-300 transition-colors">Full feed →</a>
          </div>
          <div className="space-y-1.5">
            {liveEvents.map((e, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#111118] border border-[#1e1e2e] text-xs font-mono">
                <span className={e.decision === "PAY" ? "text-[#00ff88]" : e.decision === "REFUSE" ? "text-red-400" : "text-[#4a4a5e]"}>
                  {e.decision === "PAY" ? "▰" : e.decision === "REFUSE" ? "✗" : "—"}
                </span>
                <span className="text-[#8b8b9e] flex-1 truncate">{e.sourceTitle}</span>
                {e.decision === "PAY" && e.amountPaid > 0 && (
                  <span className="text-[#00ff88]">${(e.amountPaid / 1e6).toFixed(4)}</span>
                )}
                <span className="text-[#2e2e3e]">{new Date(e.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── How It Works — Vertical Stepper ── */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-[#1e1e2e]">
        <h2 className="text-lg font-semibold text-[#f0f0f5] mb-10">How CitePay Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-0">
          {FLOW_STEPS.map((step, i) => {
            const isLast = i === FLOW_STEPS.length - 1;
            const col = i % 2;
            const isPay = step.n === "05";
            return (
              <div key={step.n} className={`relative flex gap-4 ${col === 0 ? "sm:pr-6" : ""} ${!isLast ? "pb-8" : ""}`}>
                {/* Line */}
                {!isLast && (
                  <div className="absolute left-3.5 top-7 bottom-0 w-px bg-[#1e1e2e]" style={{ left: "14px" }} />
                )}
                {/* Dot */}
                <div className={`relative z-10 w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                  isPay ? "border-[#00ff88] bg-[#00ff88]/10" : "border-[#1e1e2e] bg-[#0a0a0f]"
                }`}>
                  <span className={`text-[9px] font-mono font-bold ${isPay ? "text-[#00ff88]" : "text-[#4a4a5e]"}`}>{step.n}</span>
                </div>
                {/* Content */}
                <div className="pb-1">
                  <h3 className={`font-semibold text-sm font-mono mb-0.5 ${isPay ? "text-[#00ff88]" : "text-[#f0f0f5]"}`}>{step.title}</h3>
                  <p className="text-[#8b8b9e] text-xs leading-relaxed">{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Sample Receipts ── */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-[#1e1e2e]">
        <h2 className="text-lg font-semibold text-[#f0f0f5] mb-2">How a Receipt Looks</h2>
        <p className="text-[#8b8b9e] text-sm mb-8">
          Every agent decision — Paid, Refused, Skipped, or Blocked by Policy — generates a public Policy Receipt with evidence hash and reasoning.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { decision: "PAY",               source: "x402: HTTP-Native Payments", creator: "@amara_protocol", paid: "$0.0020", reason: "High relevance, bonded creator, fair price.",      score: 72 },
            { decision: "REFUSE",            source: "Generic Blog Post",           creator: "@unknown",  paid: "$0.0000", reason: "Relevant but overpriced relative to budget.",      score: 41 },
            { decision: "SKIP",              source: "Unrelated Marketing Page",    creator: "@marketer", paid: "$0.0000", reason: "Weak relevance to query.",                          score: 18 },
            { decision: "BLOCKED_BY_POLICY", source: "Unbonded Research Post",      creator: "@anon",     paid: "$0.0000", reason: "Blocked by policy: require_bonded_source.",         score: 67 },
          ].map(({ decision, source, creator, paid, reason, score }) => {
            const { card, badge } = DECISION_COLOR[decision];
            return (
              <div key={decision} className={`rounded-xl p-5 border card-lift ${card}`} style={{ borderLeftWidth: "3px" }}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${badge}`}>
                    {decision === "BLOCKED_BY_POLICY" ? "BLOCKED" : decision}
                  </span>
                  <span className="text-xs text-[#4a4a5e] font-mono">{score}/100</span>
                </div>
                <div className="text-sm font-medium text-[#f0f0f5] mb-0.5">{source}</div>
                <div className="text-xs text-[#8b8b9e] mb-2">{creator}</div>
                <div className="text-xs text-[#8b8b9e] mb-3 leading-relaxed">{reason}</div>
                <div className="text-xs font-mono text-[#4a4a5e]">
                  Paid:{" "}
                  <span className={decision === "PAY" ? "text-[#00ff88]" : "text-[#4a4a5e]"}>{paid} USDC</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-center mt-6">
          <Link href="/ask" className="text-[#6366f1] hover:text-indigo-300 text-sm transition-colors">
            Try it yourself — ask a question →
          </Link>
        </div>
      </section>

      {/* ── Agent API Callout ── */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-[#1e1e2e]">
        <div className="gradient-border rounded-xl bg-[#111118] p-6 sm:p-8" style={{
          background: "#111118",
          borderRadius: "12px",
          padding: "2rem",
          position: "relative",
          isolation: "isolate",
        }}>
          <div
            style={{
              content: '""',
              position: "absolute",
              inset: "-1px",
              borderRadius: "13px",
              background: "linear-gradient(135deg, #6366f1 0%, #00ff88 100%)",
              zIndex: -1,
            }}
          />
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
          <div className="bg-[#0a0a0f] rounded-lg p-4 font-mono text-xs text-[#00ff88] overflow-x-auto border border-[#1e1e2e] mb-6">
{`// Option A: Circle Gateway (x402 real payment)
const client = new GatewayClient({ chain: "arcTestnet", privateKey });
const { data } = await client.pay("https://citepay-markets.vercel.app/api/ask", {
  method: "POST", body: JSON.stringify({ query: "...", policy: "balanced" })
});

// Option B: MCP from Claude Code (no wallet needed)
// Add to ~/.claude.json → use cite_query tool`}
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

      {/* ── For Creators / For Agents ── */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-[#1e1e2e]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="bg-[#111118] rounded-xl p-6 border border-[#1e1e2e] card-lift">
            <div className="text-xs font-mono text-[#8b8b9e] mb-3">For Creators</div>
            <h3 className="font-semibold text-lg text-[#f0f0f5] mb-2">Get paid when AI cites you</h3>
            <p className="text-[#8b8b9e] text-sm mb-4 leading-relaxed">
              Register your articles, research, or content. Earn USDC each time an AI agent cites your work. Add a credibility bond to increase selection priority.
            </p>
            <Link href="/market" className="text-[#6366f1] hover:text-indigo-300 text-sm transition-colors">
              Register a source →
            </Link>
          </div>
          <div className="bg-[#111118] rounded-xl p-6 border border-[#1e1e2e] card-lift">
            <div className="text-xs font-mono text-[#8b8b9e] mb-3">For AI Agents</div>
            <h3 className="font-semibold text-lg text-[#f0f0f5] mb-2">Set a policy. Cite sources. Pay creators. Prove it.</h3>
            <p className="text-[#8b8b9e] text-sm mb-4 leading-relaxed">
              POST /api/ask with an X-PAYMENT header and an Agent Spend Policy. Get structured answers with cited, paid sources — and a Policy Receipt for every decision.
            </p>
            <Link href="/ask" className="text-[#6366f1] hover:text-indigo-300 text-sm transition-colors">
              Try the API →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#1e1e2e] py-10">
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-[#4a4a5e] text-sm font-mono">
            CitePay Markets · Demo agent:{" "}
            <span className="text-[#6366f1]">
              {DEMO_AGENT.slice(0, 6)}…{DEMO_AGENT.slice(-4)}
            </span>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-[#8b8b9e] justify-center">
            <Link href="/orchestrate" className="hover:text-[#f0f0f5] transition-colors">Orchestrate</Link>
            <Link href="/mcp"         className="hover:text-[#6366f1] text-[#6366f1]/70 transition-colors">MCP</Link>
            <Link href="/market"      className="hover:text-[#f0f0f5] transition-colors">Market</Link>
            <Link href="/leaderboard" className="hover:text-[#f0f0f5] transition-colors">Leaderboard</Link>
            <Link href="/traction"    className="hover:text-[#f0f0f5] transition-colors">Traction</Link>
            <Link href="/audit"       className="hover:text-[#f0f0f5] transition-colors">Audit</Link>
            <Link href="/ask"         className="hover:text-[#f0f0f5] transition-colors">Ask</Link>
            <a href="https://github.com/cyberrockng/citepay-markets" target="_blank" rel="noopener noreferrer"
               className="hover:text-[#f0f0f5] transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
