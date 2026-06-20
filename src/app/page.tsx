"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { TractionStats } from "@/types";

const DECISION_COLOR: Record<string, string> = {
  PAY: "text-green-400 border-green-800 bg-green-900/20",
  REFUSE: "text-red-400 border-red-800 bg-red-900/20",
  SKIP: "text-gray-400 border-gray-700 bg-gray-800/20",
};

export default function LandingPage() {
  const [stats, setStats] = useState<TractionStats | null>(null);

  useEffect(() => {
    fetch("/api/traction").then((r) => r.json()).then((d) => setStats(d.stats)).catch(() => {});
    // Load a few recent receipts for sample display
    fetch("/api/ask").then(() => {}).catch(() => {});
  }, []);

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 py-24 text-center">
        <div className="inline-block px-3 py-1 rounded-full bg-indigo-900 text-indigo-300 text-xs font-mono mb-6">
          Base Sepolia Testnet · x402 + Circle USDC
        </div>
        <h1 className="text-5xl font-bold mb-4 leading-tight">
          The Citation Economy<br />
          <span className="text-indigo-400">for AI Agents</span>
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-8">
          AI agents pay creators when they cite their work, refuse weak sources,
          and publish auditable receipts proving every decision.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/demo" className="bg-green-600 hover:bg-green-500 text-white font-semibold px-8 py-3 rounded-lg transition">
            Live Demo →
          </Link>
          <Link href="/ask" className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3 rounded-lg transition">
            Ask a Question
          </Link>
          <Link href="/market" className="border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold px-8 py-3 rounded-lg transition">
            View Source Market
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-gray-800">
        <h2 className="text-2xl font-bold mb-8 text-center">How CitePay Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { step: "1", title: "Pay to Query (x402)", desc: "Submit a query. Server returns HTTP 402. Pay a tiny USDC fee. Agent runs with a budget." },
            { step: "2", title: "Agent Scores Sources", desc: "CitePay evaluates 3–5 creator sources on relevance, price, bond, and reputation." },
            { step: "3", title: "Pay, Refuse, or Skip", desc: "Best sources get USDC. Weak or overpriced sources are refused. Every decision gets a public receipt with evidence hash." },
          ].map(({ step, title, desc }) => (
            <div key={step} className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <div className="text-3xl font-bold text-indigo-400 mb-2">{step}</div>
              <h3 className="font-semibold mb-2">{title}</h3>
              <p className="text-gray-400 text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Live Stats */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-gray-800">
        <h2 className="text-2xl font-bold mb-8 text-center">Live Market Stats</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Creators Paid", value: stats?.creatorsPaid ?? "—" },
            { label: "USDC Routed", value: stats ? `$${(stats.totalUSDCRouted / 1_000_000).toFixed(4)}` : "—" },
            { label: "Public Receipts", value: stats?.totalDecisions ?? "—" },
            { label: "Paid Citations", value: stats?.paidCitations ?? "—" },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-900 rounded-xl p-4 border border-gray-800 text-center">
              <div className="text-2xl font-bold text-indigo-400">{value}</div>
              <div className="text-gray-500 text-xs mt-1">{label}</div>
            </div>
          ))}
        </div>
        <div className="text-center mt-6">
          <Link href="/traction" className="text-indigo-400 hover:underline text-sm">
            View full traction dashboard →
          </Link>
        </div>
      </section>

      {/* Sample Receipts */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-gray-800">
        <h2 className="text-2xl font-bold mb-4 text-center">How a Receipt Looks</h2>
        <p className="text-gray-400 text-center text-sm mb-8">Every agent decision — PAY, REFUSE, or SKIP — generates a public receipt with evidence hash and reasoning.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { decision: "PAY", source: "x402: HTTP-Native Payments", creator: "@coinbase", paid: "$0.002", reason: "High relevance, bonded creator, fair price.", score: 72 },
            { decision: "REFUSE", source: "Generic Blog Post", creator: "@unknown", paid: "$0.000", reason: "Relevant but overpriced relative to budget.", score: 41 },
            { decision: "SKIP", source: "Unrelated Marketing Page", creator: "@marketer", paid: "$0.000", reason: "Weak relevance to query.", score: 18 },
          ].map(({ decision, source, creator, paid, reason, score }) => (
            <div key={decision} className={`rounded-xl p-4 border ${DECISION_COLOR[decision]}`}>
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${DECISION_COLOR[decision]}`}>{decision}</span>
                <span className="text-xs text-gray-500">score: {score}/100</span>
              </div>
              <div className="text-sm font-medium text-white mb-1">{source}</div>
              <div className="text-xs text-gray-500 mb-2">{creator}</div>
              <div className="text-xs text-gray-400 mb-3">{reason}</div>
              <div className="text-xs font-mono text-gray-500">
                Paid: <span className={decision === "PAY" ? "text-green-400" : "text-gray-500"}>{paid} USDC</span>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center mt-6">
          <Link href="/ask" className="text-indigo-400 hover:underline text-sm">Try it yourself — ask a question →</Link>
        </div>
      </section>

      {/* CTAs */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-gray-800">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <h3 className="font-semibold text-lg mb-2">For Creators</h3>
            <p className="text-gray-400 text-sm mb-4">
              Register your articles, research, or content. Get paid in USDC when AI agents cite your work. Add a credibility bond to increase selection priority.
            </p>
            <Link href="/market" className="text-indigo-400 hover:underline text-sm">
              Register a source →
            </Link>
          </div>
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <h3 className="font-semibold text-lg mb-2">For AI Agents</h3>
            <p className="text-gray-400 text-sm mb-4">
              POST /api/ask with an X-PAYMENT header to run queries programmatically. Get structured answers with cited, paid sources and receipt IDs.
            </p>
            <Link href="/ask" className="text-indigo-400 hover:underline text-sm">
              Try the API →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 text-center text-gray-600 text-sm">
        CitePay Markets — Built on Base Sepolia with x402 + Circle USDC ·{" "}
        <Link href="/demo" className="hover:text-gray-400">Demo</Link> ·{" "}
        <Link href="/traction" className="hover:text-gray-400">Traction</Link> ·{" "}
        <Link href="/market" className="hover:text-gray-400">Market</Link>
      </footer>
    </main>
  );
}
