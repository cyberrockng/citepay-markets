"use client";
import { useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import type { AgentPolicy } from "@/lib/policy";

const EXAMPLES = [
  "Only cite bonded sources, keep spend under $0.01, require high relevance",
  "Aggressive — pay for anything remotely relevant, no caps, maximum citations",
  "Strict DeFi research: only Protocol and Infrastructure sources, min relevance 75",
  "Budget mode: cheapest sources only, stop after 2 citations, no on-chain anchor needed",
  "Premium: real USDC only, bonded sources, full on-chain verification, no simulation",
];

function PolicyField({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex justify-between items-baseline gap-4 py-2 border-b border-white/5 last:border-0">
      <span className="text-white/40 text-sm">{label}</span>
      <div className="text-right">
        <span className="text-white/90 text-sm font-mono">{value}</span>
        {sub && <span className="text-white/30 text-xs ml-2">{sub}</span>}
      </div>
    </div>
  );
}

export default function PolicyPage() {
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ policy: AgentPolicy; explanation: string; confidence: number; presetMatch: string | null } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate() {
    if (!description.trim() || generating) return;
    setGenerating(true); setError(""); setResult(null);
    try {
      const r = await fetch("/api/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const d = await r.json() as { policy?: AgentPolicy; explanation?: string; confidence?: number; presetMatch?: string | null; error?: string };
      if (!r.ok || !d.policy) { setError(d.error ?? "Failed to generate"); return; }
      setResult({ policy: d.policy, explanation: d.explanation ?? "", confidence: d.confidence ?? 80, presetMatch: d.presetMatch ?? null });
    } catch (err) { setError(String(err)); }
    finally { setGenerating(false); }
  }

  function copyPolicy() {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result.policy, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const p = result?.policy;

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <BackButton />
        <span className="text-white/20">|</span>
        <span className="text-sm text-white/50">AI Policy Builder</span>
        <span className="ml-auto px-2 py-0.5 rounded text-xs bg-violet-500/20 text-violet-300 border border-violet-500/30">
          Powered by Claude
        </span>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium mb-4">
            Natural Language → Spend Policy
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">AI Policy Builder</h1>
          <p className="text-lg text-white/50 max-w-xl mx-auto">
            Describe your citation strategy in plain English. Claude converts it into a precise
            AgentSpendPolicy that controls exactly how your agent pays creators.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left: input */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <label className="block text-sm font-medium text-white/70 mb-3" htmlFor="desc">
                Describe your citation strategy
              </label>
              <textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate(); }}
                rows={5}
                placeholder="e.g. I want to only pay for highly relevant sources, keep costs under $0.003 each, and require that all sources have security bonds deposited…"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-violet-500/40 resize-none text-sm leading-relaxed"
              />
              <p className="text-xs text-white/30 mt-2">⌘+Enter to generate</p>

              <button
                onClick={generate}
                disabled={!description.trim() || generating}
                className="mt-4 w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {generating ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Claude is thinking…
                  </span>
                ) : "Generate Policy →"}
              </button>
            </div>

            {/* Example prompts */}
            <div>
              <p className="text-xs text-white/30 uppercase tracking-wider mb-3">Try an example</p>
              <div className="space-y-2">
                {EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => setDescription(ex)}
                    className="w-full text-left px-4 py-2.5 rounded-lg bg-white/[0.02] border border-white/10 text-sm text-white/50 hover:text-white/80 hover:border-white/20 hover:bg-white/[0.04] transition-all">
                    "{ex}"
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: result */}
          <div>
            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-red-400 text-sm mb-4">{error}</div>
            )}

            {result ? (
              <div className="space-y-4">
                {/* Explanation */}
                <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-violet-300">{p!.name}</h3>
                    <div className="flex items-center gap-2">
                      {result.presetMatch && (
                        <span className="px-2 py-0.5 rounded text-xs bg-white/10 text-white/50">
                          ~{result.presetMatch}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded text-xs bg-violet-500/20 text-violet-300">
                        {result.confidence}% confidence
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-white/60 leading-relaxed">{result.explanation}</p>
                </div>

                {/* Policy breakdown */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                  <h4 className="text-xs text-white/40 uppercase tracking-wider mb-3">Policy Parameters</h4>
                  <PolicyField
                    label="Max price per citation"
                    value={p!.maxPricePerCitation === 0 ? "No limit" : `${p!.maxPricePerCitation} μUSDC`}
                    sub={p!.maxPricePerCitation > 0 ? `$${(p!.maxPricePerCitation / 1e6).toFixed(4)}` : undefined}
                  />
                  <PolicyField label="Min relevance score" value={`${p!.minRelevanceScore} / 100`} />
                  <PolicyField label="Require bonded sources" value={p!.requireBonded ? "Yes" : "No"} />
                  <PolicyField
                    label="Session spend cap"
                    value={p!.sessionSpendCap === 0 ? "No cap" : `${p!.sessionSpendCap} μUSDC`}
                    sub={p!.sessionSpendCap > 0 ? `$${(p!.sessionSpendCap / 1e6).toFixed(4)}` : undefined}
                  />
                  <PolicyField label="Require on-chain anchor" value={p!.requireOnChainAnchor ? "Yes" : "No"} />
                  <PolicyField label="Allow simulated payout" value={p!.allowSimulatedPayout ? "Yes" : "Real USDC only"} />
                  <PolicyField label="Max citations per query" value={p!.sufficiencyMaxCitations === 0 ? "No limit" : `${p!.sufficiencyMaxCitations}`} />
                  <PolicyField label="Relevance stop target" value={p!.sufficiencyRelevanceTarget === 0 ? "None" : `${p!.sufficiencyRelevanceTarget}`} />
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button onClick={copyPolicy}
                    className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/70 hover:text-white hover:border-white/40 text-sm transition-colors">
                    {copied ? "Copied!" : "Copy JSON"}
                  </button>
                  <Link
                    href={`/ask?policy=${encodeURIComponent(JSON.stringify(result.policy))}`}
                    className="flex-1 text-center py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity">
                    Run with this policy →
                  </Link>
                </div>

                {/* Raw JSON toggle */}
                <details className="rounded-xl border border-white/10 overflow-hidden">
                  <summary className="px-4 py-3 text-xs text-white/40 cursor-pointer hover:text-white/60 select-none">
                    View raw JSON
                  </summary>
                  <pre className="px-4 pb-4 text-xs text-emerald-400 font-mono overflow-x-auto">
                    {JSON.stringify(result.policy, null, 2)}
                  </pre>
                </details>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center">
                <div className="text-4xl mb-4">⚡</div>
                <p className="text-white/30 text-sm">Your generated policy will appear here</p>
                <p className="text-white/20 text-xs mt-2">Describe what you want → Claude builds it</p>
              </div>
            )}
          </div>
        </div>

        {/* How it works */}
        <div className="mt-16 rounded-2xl border border-white/10 bg-white/[0.02] p-8">
          <h2 className="text-lg font-semibold text-white mb-6">How the Policy Builder works</h2>
          <div className="grid sm:grid-cols-4 gap-6 text-center">
            {[
              { icon: "💬", title: "Plain English", desc: "Describe your goals — no JSON, no sliders" },
              { icon: "🧠", title: "Claude converts", desc: "Claude maps your intent to 9 precise policy parameters" },
              { icon: "⚡", title: "Instant preview", desc: "See exactly what the policy controls before running" },
              { icon: "💸", title: "Run it live", desc: "Activate the policy and watch real USDC flow to creators" },
            ].map((item) => (
              <div key={item.title}>
                <div className="text-2xl mb-3">{item.icon}</div>
                <h4 className="text-sm font-semibold text-white/80 mb-2">{item.title}</h4>
                <p className="text-xs text-white/40">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
