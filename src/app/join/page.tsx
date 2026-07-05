"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";

interface JoinResult {
  sourceId: string;
  title: string;
  category: string;
  price: number;
  marketUrl: string;
  message: string;
  contentHash: string;
}

export default function JoinPage() {
  const [url, setUrl]       = useState("");
  const [wallet, setWallet] = useState("");

  // Pre-fill URL when coming from /estimate
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get("url");
    if (prefill) setUrl(prefill);
  }, []);
  const [name, setName]     = useState("");
  const [step, setStep]     = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<JoinResult | null>(null);
  const [error, setError]   = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url || !wallet) return;
    setStep("loading");
    setError("");

    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, wallet, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registration failed");
      setResult(data);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5] flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-[10px] font-mono text-[#34D399] tracking-widest mb-3">CITEPAY MARKETS</div>
          <h1 className="text-2xl font-bold mb-2">Get paid when AI cites your work</h1>
          <p className="text-sm text-[#8b8b9e]">
            Paste your URL. AI agents pay you USDC every time they cite it.
          </p>
        </div>

        {step === "done" && result ? (
          <div className="bg-[#111118] border border-[#34D399]/30 rounded-2xl p-7 text-center space-y-5">
            <div className="w-14 h-14 rounded-full bg-[#34D399]/10 border border-[#34D399]/30 flex items-center justify-center mx-auto">
              <span className="text-[#34D399] text-2xl">✓</span>
            </div>
            <div>
              <div className="font-semibold text-[#f0f0f5] mb-1">{result.title}</div>
              <div className="text-xs text-[#4a4a5e] font-mono">{result.category} · ${(result.price / 1_000_000).toFixed(4)} per citation</div>
            </div>
            <p className="text-sm text-[#8b8b9e]">
              You&apos;re in the CitePay market. Agents will pay you USDC when they cite your content.
            </p>
            <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl p-4 text-xs font-mono text-left space-y-2">
              <div className="flex justify-between">
                <span className="text-[#4a4a5e]">Fingerprint</span>
                <span className="text-[#f0f0f5]">{result.contentHash}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#4a4a5e]">Status</span>
                <span className="text-[#34D399]">active · earning</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <a
                href={result.marketUrl}
                className="bg-[#34D399] hover:bg-[#6EE7B7] text-black font-bold py-3 rounded-xl transition-colors text-sm"
              >
                View your source page →
              </a>
              <button
                onClick={() => { setStep("idle"); setResult(null); setUrl(""); setName(""); }}
                className="text-sm text-[#4a4a5e] hover:text-[#8b8b9e] transition-colors"
              >
                Register another URL
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-7 space-y-5">

            {/* URL */}
            <div>
              <label className="block text-xs font-mono text-[#8b8b9e] mb-2">Your URL *</label>
              <input
                type="url"
                placeholder="https://your-project.com/docs"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                autoFocus
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] focus:border-[#6366f1] rounded-xl px-4 py-3 text-sm font-mono text-[#f0f0f5] placeholder-[#2e2e3e] focus:outline-none transition-colors"
              />
              <p className="text-[10px] text-[#4a4a5e] mt-1.5">
                We auto-detect your title and description — no manual entry needed
              </p>
            </div>

            {/* Wallet */}
            <div>
              <label className="block text-xs font-mono text-[#8b8b9e] mb-2">Payout Wallet *</label>
              <input
                type="text"
                placeholder="0x… Arc Testnet wallet"
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                required
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] focus:border-[#6366f1] rounded-xl px-4 py-3 text-sm font-mono text-[#f0f0f5] placeholder-[#2e2e3e] focus:outline-none transition-colors"
              />
              <p className="text-[10px] text-[#4a4a5e] mt-1.5">
                USDC payments land here on Arc Testnet
              </p>
            </div>

            {/* Name (optional) */}
            <div>
              <label className="block text-xs font-mono text-[#8b8b9e] mb-2">
                Your name / project <span className="text-[#4a4a5e]">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="Auto-detected from your page"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] focus:border-[#6366f1] rounded-xl px-4 py-3 text-sm font-mono text-[#f0f0f5] placeholder-[#2e2e3e] focus:outline-none transition-colors"
              />
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3 text-sm text-red-400 font-mono">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={step === "loading"}
              className="w-full bg-[#6366f1] hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-colors text-sm"
            >
              {step === "loading" ? "Registering…" : "Join the citation market →"}
            </button>

            <div className="text-center space-y-1">
              <p className="text-[10px] text-[#4a4a5e]">
                Free to register · No approval needed · Earnings start immediately
              </p>
              <p className="text-[10px] text-[#2e2e3e]">
                Or register via API:{" "}
                <code className="text-[#4a4a5e]">POST /api/join</code>
              </p>
            </div>
          </form>
        )}

        {/* How it works — compact */}
        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          {[
            { icon: "⚡", title: "Instant", desc: "Registered in seconds, no approval" },
            { icon: "💸", title: "Real USDC", desc: "Payments on Arc Testnet" },
            { icon: "🔒", title: "Verified", desc: "Content hash proves what was cited" },
          ].map((s) => (
            <div key={s.title} className="bg-[#111118]/50 rounded-xl p-3 border border-[#1e1e2e]">
              <div className="text-lg mb-1">{s.icon}</div>
              <div className="text-xs font-semibold text-[#f0f0f5]">{s.title}</div>
              <div className="text-[10px] text-[#4a4a5e] mt-0.5 leading-relaxed">{s.desc}</div>
            </div>
          ))}
        </div>

        <div className="text-center mt-6">
          <BackButton />
        </div>
      </div>
    </main>
  );
}
