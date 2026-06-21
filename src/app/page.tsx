"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { TractionStats } from "@/types";

const DECISION_COLOR: Record<string, { card: string; badge: string }> = {
  PAY:               { card: "border-[#00ff88]/30 bg-[#00ff88]/5",    badge: "text-[#00ff88] border-[#00ff88]/30 bg-[#00ff88]/10" },
  REFUSE:            { card: "border-red-800/40 bg-red-900/10",       badge: "text-red-400 border-red-800 bg-red-900/20" },
  SKIP:              { card: "border-[#1e1e2e] bg-[#111118]",         badge: "text-[#8b8b9e] border-[#1e1e2e]" },
  BLOCKED_BY_POLICY: { card: "border-orange-700/30 bg-orange-900/10", badge: "text-orange-400 border-orange-700 bg-orange-900/20" },
};

const HOW_IT_WORKS = [
  { n: "01", title: "POST /api/ask", desc: "Submit a research query via HTTP with a budget." },
  { n: "02", title: "← 402 Payment Required", desc: "Server returns x402 payment challenge." },
  { n: "03", title: "Pay query fee in USDC", desc: "Client attaches X-PAYMENT header and retries." },
  { n: "04", title: "Agent scores sources", desc: "CitePay evaluates creators on relevance, price, bond, and reputation." },
  { n: "05", title: "PAY best sources", desc: "Winners receive USDC. Weak or overpriced sources get REFUSE or SKIP." },
  { n: "06", title: "Public receipt + anchor", desc: "Every decision gets a public receipt with evidence hash anchored on-chain." },
];

const PROOF_PILLARS = [
  { icon: "①", title: "Agent used creator content", color: "text-[#00ff88]", border: "border-[#00ff88]/30" },
  { icon: "②", title: "Creator paid in USDC", color: "text-[#00ff88]", border: "border-[#00ff88]/30" },
  { icon: "③", title: "Citation decision is verifiable", color: "text-[#00ff88]", border: "border-[#00ff88]/30" },
  { icon: "④", title: "Tampering can be challenged", color: "text-[#00ff88]", border: "border-[#00ff88]/30" },
];

export default function LandingPage() {
  const [stats, setStats] = useState<TractionStats | null>(null);

  useEffect(() => {
    fetch("/api/traction").then((r) => r.json()).then((d) => setStats(d.stats)).catch(() => {});
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5]">

      {/* ── Hero ── */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111118] border border-[#1e1e2e] text-[#8b8b9e] text-xs font-mono mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] inline-block" />
          Base Sepolia · x402 + USDC · Smart Contract
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold mb-5 leading-tight tracking-tight">
          The Policy &amp; Payment Layer<br />
          <span className="text-[#6366f1]">for Autonomous AI Citations</span>
        </h1>
        <p className="text-xl text-[#8b8b9e] max-w-2xl mx-auto mb-10 leading-relaxed">
          Agents enforce configurable spend policies, pay creators in USDC, and publish tamper-evident Policy Receipts anchored on Base Sepolia.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/demo"
            className="bg-[#00ff88] hover:bg-[#00e87a] text-black font-bold px-8 py-3.5 rounded-xl transition-colors"
          >
            Live Demo →
          </Link>
          <Link
            href="/ask"
            className="bg-[#6366f1] hover:bg-indigo-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors"
          >
            Ask a Question
          </Link>
          <Link
            href="/market"
            className="border border-[#1e1e2e] hover:border-[#8b8b9e] text-[#8b8b9e] hover:text-[#f0f0f5] font-semibold px-8 py-3.5 rounded-xl transition-colors"
          >
            Source Market
          </Link>
        </div>
      </section>

      {/* ── 4 Proof Pillars ── */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PROOF_PILLARS.map(({ icon, title, color, border }) => (
            <div key={title} className={`rounded-xl p-4 border ${border} bg-[#00ff88]/5 text-center`}>
              <div className={`text-2xl font-mono mb-2 ${color}`}>{icon}</div>
              <div className="text-xs text-[#f0f0f5] font-medium leading-snug">{title}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Live Market Stats ── */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-[#1e1e2e]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-[#f0f0f5]">Live Market Stats</h2>
          <Link href="/traction" className="text-xs text-[#6366f1] hover:text-indigo-300 transition-colors">
            Full dashboard →
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Creators Paid", value: stats?.creatorsPaid ?? "—", accent: "text-[#00ff88]" },
            {
              label: "USDC Routed",
              value: stats ? `$${(stats.totalUSDCRouted / 1_000_000).toFixed(4)}` : "—",
              accent: "text-[#00ff88]",
            },
            { label: "Public Receipts", value: stats?.totalDecisions ?? "—", accent: "text-[#6366f1]" },
            { label: "Paid Citations", value: stats?.paidCitations ?? "—", accent: "text-[#00ff88]" },
          ].map(({ label, value, accent }) => (
            <div key={label} className="bg-[#111118] rounded-xl p-5 border border-[#1e1e2e] text-center">
              <div className={`text-2xl font-bold font-mono ${accent}`}>{value}</div>
              <div className="text-[#8b8b9e] text-xs mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-[#1e1e2e]">
        <h2 className="text-lg font-semibold text-[#f0f0f5] mb-8">How CitePay Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {HOW_IT_WORKS.map(({ n, title, desc }) => (
            <div key={n} className="bg-[#111118] rounded-xl p-5 border border-[#1e1e2e]">
              <div className="font-mono text-xs text-[#4a4a5e] mb-2">{n}</div>
              <h3 className="font-semibold text-[#f0f0f5] mb-1 font-mono text-sm">{title}</h3>
              <p className="text-[#8b8b9e] text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
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
            { decision: "PAY",               source: "x402: HTTP-Native Payments", creator: "@coinbase", paid: "$0.0020", reason: "High relevance, bonded creator, fair price.",      score: 72 },
            { decision: "REFUSE",            source: "Generic Blog Post",           creator: "@unknown",  paid: "$0.0000", reason: "Relevant but overpriced relative to budget.",      score: 41 },
            { decision: "SKIP",              source: "Unrelated Marketing Page",    creator: "@marketer", paid: "$0.0000", reason: "Weak relevance to query.",                          score: 18 },
            { decision: "BLOCKED_BY_POLICY", source: "Unbonded Research Post",      creator: "@anon",     paid: "$0.0000", reason: "Blocked by policy: require_bonded_source.",         score: 67 },
          ].map(({ decision, source, creator, paid, reason, score }) => {
            const { card, badge } = DECISION_COLOR[decision];
            return (
              <div key={decision} className={`rounded-xl p-5 border ${card}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${badge}`}>
                    {decision}
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
        <div className="bg-[#111118] rounded-xl border border-[#6366f1]/30 p-6 sm:p-8">
          <div className="text-xs font-mono text-[#6366f1] mb-3">Agent API</div>
          <h2 className="text-xl font-bold text-[#f0f0f5] mb-3">
            One endpoint. Verifiable citations. Real USDC payments.
          </h2>
          <p className="text-[#8b8b9e] text-sm mb-6 leading-relaxed">
            Any AI agent can POST to <code className="text-[#f0f0f5] bg-[#0a0a0f] px-1.5 py-0.5 rounded">/api/ask</code> with an X-PAYMENT header to get structured, cited answers backed by on-chain receipts.
          </p>
          <div className="bg-[#0a0a0f] rounded-lg p-4 font-mono text-xs text-[#00ff88] overflow-x-auto border border-[#1e1e2e] mb-6">
{`curl -X POST /api/ask \\
  -H "X-PAYMENT: <x402-proof>" \\
  -d '{ "query": "...", "budget": 0.05 }'

← { "answer": "...", "decisions": [...], "receiptIds": [...] }`}
          </div>
          <div className="flex gap-4 flex-wrap">
            <Link href="/ask" className="bg-[#6366f1] hover:bg-indigo-500 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm">
              Try the workbench
            </Link>
            <Link href="/demo" className="border border-[#1e1e2e] hover:border-[#8b8b9e] text-[#8b8b9e] hover:text-[#f0f0f5] font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm">
              Watch the demo
            </Link>
          </div>
        </div>
      </section>

      {/* ── For Creators / For Agents ── */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-[#1e1e2e]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="bg-[#111118] rounded-xl p-6 border border-[#1e1e2e]">
            <div className="text-xs font-mono text-[#8b8b9e] mb-3">For Creators</div>
            <h3 className="font-semibold text-lg text-[#f0f0f5] mb-2">Get paid when AI cites you</h3>
            <p className="text-[#8b8b9e] text-sm mb-4 leading-relaxed">
              Register your articles, research, or content. Earn USDC each time an AI agent cites your work. Add a credibility bond to increase selection priority.
            </p>
            <Link href="/market" className="text-[#6366f1] hover:text-indigo-300 text-sm transition-colors">
              Register a source →
            </Link>
          </div>
          <div className="bg-[#111118] rounded-xl p-6 border border-[#1e1e2e]">
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
            CitePay Markets — Proof-of-Paid-Citation for AI Agents
          </div>
          <div className="flex gap-6 text-sm text-[#8b8b9e]">
            <Link href="/demo" className="hover:text-[#f0f0f5] transition-colors">Demo</Link>
            <Link href="/market" className="hover:text-[#f0f0f5] transition-colors">Market</Link>
            <Link href="/traction" className="hover:text-[#f0f0f5] transition-colors">Traction</Link>
            <Link href="/ask" className="hover:text-[#f0f0f5] transition-colors">Ask</Link>
            <a
              href="https://github.com/cyberrockng/citepay-markets"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#f0f0f5] transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
