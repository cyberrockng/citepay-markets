"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { TractionStats } from "@/types";

export default function LandingPage() {
  const [stats, setStats] = useState<TractionStats | null>(null);

  useEffect(() => {
    fetch("/api/traction")
      .then((r) => r.json())
      .then((d) => setStats(d.stats))
      .catch(() => {});
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
          <Link href="/ask" className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3 rounded-lg transition">
            Ask a Question →
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
        <Link href="/traction" className="hover:text-gray-400">Traction</Link> ·{" "}
        <Link href="/market" className="hover:text-gray-400">Market</Link>
      </footer>
    </main>
  );
}
