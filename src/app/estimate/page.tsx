"use client";

import { useState } from "react";
import Link from "next/link";

interface EstimateResult {
  url: string;
  title: string;
  description: string;
  queriesAnalyzed: number;
  liveQueriesUsed: number;
  matches: number;
  conversionRate: number;
  estimatedEarningsMicro: number;
  estimatedEarningsUSD: string;
  projectedMonthlyMicro: number;
  projectedMonthlyUSD: string;
  defaultPriceMicro: number;
  topMatches: { query: string; relevance: number; excerpt: string }[];
  registerUrl: string;
}

export default function EstimatePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [error, setError] = useState("");
  const [step, setStep] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    setError("");

    const steps = [
      "Fetching your page…",
      "Indexing content…",
      "Scoring against real queries…",
      "Calculating earnings…",
    ];
    let i = 0;
    setStep(steps[0]);
    const ticker = setInterval(() => {
      i = Math.min(i + 1, steps.length - 1);
      setStep(steps[i]);
    }, 3000);

    try {
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Estimation failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      clearInterval(ticker);
      setLoading(false);
      setStep("");
    }
  }

  const hasEarnings = result && result.matches > 0;

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-white/50 hover:text-white transition-colors">
          ← CitePay Markets
        </Link>
        <Link
          href="/join"
          className="text-xs bg-green-500 hover:bg-green-400 text-black font-semibold px-4 py-2 rounded-full transition-colors"
        >
          Register & Get Paid
        </Link>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-block text-xs font-mono bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-3 py-1 rounded-full mb-6">
            AI Citation Earnings Estimator
          </div>
          <h1 className="text-4xl font-bold mb-4 leading-tight">
            How much is AI costing you?
          </h1>
          <p className="text-white/60 text-lg">
            Paste any URL. We score it against real queries from AI agents
            and show what you would have earned — if you were registered.
          </p>
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="mb-10">
          <div className="flex gap-3">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-site.com/your-article"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white placeholder-white/30 focus:outline-none focus:border-green-500/50 focus:bg-white/8 transition-all text-sm"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="bg-green-500 hover:bg-green-400 disabled:bg-white/10 disabled:text-white/30 text-black font-semibold px-6 py-4 rounded-xl transition-colors whitespace-nowrap text-sm"
            >
              {loading ? "Analyzing…" : "Estimate"}
            </button>
          </div>
          {loading && (
            <p className="text-white/40 text-xs mt-3 text-center animate-pulse">{step}</p>
          )}
        </form>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm mb-8">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Page title */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-xs text-white/40 mb-1">Analyzed page</p>
              <p className="font-semibold text-white">{result.title}</p>
              <p className="text-xs text-white/40 mt-1 truncate">{result.url}</p>
            </div>

            {/* Big number */}
            <div className={`rounded-2xl p-8 text-center border ${hasEarnings ? "bg-green-500/10 border-green-500/20" : "bg-white/5 border-white/10"}`}>
              {hasEarnings ? (
                <>
                  <p className="text-white/60 text-sm mb-2">You would have earned</p>
                  <p className="text-6xl font-bold text-green-400 mb-1">
                    ${result.estimatedEarningsUSD}
                  </p>
                  <p className="text-white/40 text-sm mb-4">
                    from {result.matches} of {result.queriesAnalyzed} queries this period
                  </p>
                  <div className="border-t border-white/10 pt-4">
                    <p className="text-white/50 text-xs mb-1">Projected monthly (if registered now)</p>
                    <p className="text-2xl font-bold text-white">
                      ${result.projectedMonthlyUSD}
                      <span className="text-sm font-normal text-white/40 ml-2">/ month</span>
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-4xl mb-3">😶</p>
                  <p className="text-white font-semibold mb-1">No matches in current queries</p>
                  <p className="text-white/50 text-sm">
                    This page didn&apos;t match recent queries — but query topics change daily.
                    Register anyway and start earning when your topic comes up.
                  </p>
                </>
              )}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-white">{result.queriesAnalyzed}</p>
                <p className="text-xs text-white/40 mt-1">Queries analyzed</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-green-400">{result.matches}</p>
                <p className="text-xs text-white/40 mt-1">Would cite you</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-white">{result.conversionRate}%</p>
                <p className="text-xs text-white/40 mt-1">Citation rate</p>
              </div>
            </div>

            {/* Top matching queries */}
            {result.topMatches.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <p className="text-sm font-semibold mb-4 text-white/80">Queries that would cite you</p>
                <div className="space-y-3">
                  {result.topMatches.map((m, i) => (
                    <div key={i} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                      <div className="mt-0.5 text-xs font-mono bg-green-500/20 text-green-400 px-2 py-0.5 rounded shrink-0">
                        {m.relevance}
                      </div>
                      <div>
                        <p className="text-sm text-white/90">{m.query}</p>
                        {m.excerpt && (
                          <p className="text-xs text-white/40 mt-0.5">{m.excerpt}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* How it works note */}
            <div className="bg-white/3 border border-white/5 rounded-xl p-4 text-xs text-white/40 space-y-1">
              <p>Scores based on {result.liveQueriesUsed} live queries + representative samples. Default price: ${(result.defaultPriceMicro / 1_000_000).toFixed(4)} per citation. You set your own price at registration.</p>
            </div>

            {/* CTA */}
            <div className="bg-gradient-to-br from-green-500/15 to-emerald-600/10 border border-green-500/25 rounded-2xl p-6 text-center">
              <p className="text-lg font-bold text-white mb-1">
                {hasEarnings ? "Start collecting what you're owed" : "Get in before your topic trends"}
              </p>
              <p className="text-sm text-white/50 mb-5">
                Registration takes 30 seconds. Two fields: your URL and your wallet.
              </p>
              <Link
                href={`/join?url=${encodeURIComponent(result.url)}`}
                className="inline-block bg-green-500 hover:bg-green-400 text-black font-bold px-8 py-3 rounded-xl transition-colors text-sm"
              >
                Register {result.title.slice(0, 30)}{result.title.length > 30 ? "…" : ""} →
              </Link>
              <p className="text-xs text-white/30 mt-3">
                Paid in USDC on Arc Testnet · Verifiable on-chain · No platform cut
              </p>
            </div>
          </div>
        )}

        {/* How it works — shown before results */}
        {!result && !loading && (
          <div className="mt-12 border-t border-white/10 pt-10">
            <p className="text-center text-white/40 text-xs mb-8 uppercase tracking-widest">How it works</p>
            <div className="grid grid-cols-3 gap-6">
              {[
                { n: "01", title: "We fetch your page", body: "CitePay reads your content and indexes the full text — the same way our scoring agent sees it." },
                { n: "02", title: "Scored against real queries", body: "We run your content against recent queries from AI agents using our live citation scoring model." },
                { n: "03", title: "You see the dollar amount", body: "Every query that would have paid you is shown with the relevance score and the amount you missed." },
              ].map(({ n, title, body }) => (
                <div key={n} className="text-center">
                  <div className="text-3xl font-bold text-white/10 mb-3">{n}</div>
                  <p className="text-sm font-semibold text-white mb-2">{title}</p>
                  <p className="text-xs text-white/40">{body}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
