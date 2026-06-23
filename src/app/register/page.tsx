"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { TractionStats } from "@/types";

const MIN_PRICE = 500;
const MAX_PRICE = 5000;
const DEFAULT_PRICE = 1500;

function priceToUsd(atomic: number) {
  return (atomic / 1_000_000).toFixed(4);
}

interface RegisteredSource {
  id: string;
  title: string;
  payoutWallet: string;
  price: number;
}

export default function RegisterPage() {
  const [stats, setStats] = useState<TractionStats | null>(null);

  const [creatorName,   setCreatorName]   = useState("");
  const [creatorHandle, setCreatorHandle] = useState("");
  const [url,           setUrl]           = useState("");
  const [title,         setTitle]         = useState("");
  const [description,   setDescription]   = useState("");
  const [payoutWallet,  setPayoutWallet]  = useState("");
  const [price,         setPrice]         = useState(DEFAULT_PRICE);

  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [registered, setRegistered] = useState<RegisteredSource | null>(null);
  const [copied,     setCopied]     = useState(false);

  useEffect(() => {
    fetch("/api/traction")
      .then((r) => r.json())
      .then((d) => setStats(d.stats))
      .catch(() => {});
  }, []);

  function validate(): string {
    if (!creatorName.trim()) return "Your name is required.";
    if (creatorName.length > 72) return "Name must be 72 characters or fewer.";
    if (!url.trim()) return "Content URL is required.";
    if (!url.startsWith("https://")) return "URL must start with https://";
    if (!title.trim()) return "Title is required.";
    if (title.length > 120) return "Title must be 120 characters or fewer.";
    if (!payoutWallet.trim()) return "Arc wallet address is required.";
    if (!/^0x[0-9a-fA-F]{40}$/.test(payoutWallet)) return "Wallet must be a valid 0x address (42 chars).";
    if (description.length > 340) return "Description must be 340 characters or fewer.";
    return "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/sources/register-public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorName:   creatorName.trim(),
          creatorHandle: creatorHandle.trim() || creatorName.trim(),
          url:           url.trim(),
          title:         title.trim(),
          description:   description.trim(),
          payoutWallet:  payoutWallet.trim(),
          price,
        }),
      });
      const data = await res.json() as { source?: RegisteredSource; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Registration failed. Please try again.");
      } else if (data.source) {
        setRegistered(data.source);
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function copyEarningsLink() {
    if (!registered) return;
    navigator.clipboard
      .writeText(`https://citepay-markets.vercel.app/creator/${registered.payoutWallet}`)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  }

  const inputClass =
    "w-full bg-[#111118] border border-[#1e1e2e] rounded-lg px-4 py-3 text-[#f0f0f5] placeholder-[#4a4a5e] focus:outline-none focus:border-[#6366f1] transition-colors text-sm";
  const labelClass = "block text-xs font-mono text-[#8b8b9e] mb-1.5";

  // ── Success panel ──────────────────────────────────────────────────────────
  if (registered) {
    return (
      <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5]">
        <div className="max-w-2xl mx-auto px-6 py-12">
          <Link href="/" className="text-[#4a4a5e] hover:text-[#8b8b9e] text-sm font-mono transition-colors mb-8 inline-block">
            ← Back to CitePay
          </Link>

          <div className="bg-[#111118] rounded-2xl border border-[#00ff88]/30 p-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-[#00ff88] text-3xl">✓</span>
              <h1 className="text-2xl font-bold text-[#f0f0f5]">You&apos;re in the market</h1>
            </div>
            <p className="text-[#8b8b9e] text-sm leading-relaxed mb-6">
              Your content is live. CitePay&apos;s agent will evaluate it for every relevant query
              and pay your wallet directly when it cites you.
            </p>

            <div className="space-y-2 font-mono text-xs text-[#4a4a5e] bg-[#0a0a0f] rounded-lg p-4 mb-6">
              <div className="flex justify-between">
                <span>Source ID</span>
                <span className="text-[#8b8b9e]">{registered.id.slice(0, 8)}…</span>
              </div>
              <div className="flex justify-between">
                <span>Title</span>
                <span className="text-[#8b8b9e] truncate ml-4 max-w-[200px]">{registered.title}</span>
              </div>
              <div className="flex justify-between">
                <span>Price per citation</span>
                <span className="text-[#00ff88]">${priceToUsd(registered.price)} USDC</span>
              </div>
              <div className="flex justify-between">
                <span>Status</span>
                <span className="text-[#00ff88]">active · earning</span>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <Link
                href={`/creator/${registered.payoutWallet}`}
                className="flex items-center justify-between w-full bg-[#6366f1] hover:bg-indigo-500 text-white rounded-lg px-4 py-3 text-sm font-medium transition-colors"
              >
                View your earnings page
                <span>→</span>
              </Link>
              <Link
                href="/ask"
                className="flex items-center justify-between w-full bg-[#0a0a0f] border border-[#1e1e2e] hover:border-[#6366f1]/50 text-[#8b8b9e] hover:text-[#f0f0f5] rounded-lg px-4 py-3 text-sm transition-colors"
              >
                Test a query against your source
                <span>→</span>
              </Link>
            </div>

            <div className="bg-[#0a0a0f] rounded-lg border border-[#1e1e2e] p-4">
              <div className="text-[10px] font-mono text-[#4a4a5e] mb-2">SHARE YOUR EARNINGS PAGE</div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-[#6366f1] truncate flex-1">
                  citepay-markets.vercel.app/creator/{registered.payoutWallet.slice(0, 10)}…
                </span>
                <button
                  onClick={copyEarningsLink}
                  aria-label="Copy earnings page link"
                  className="text-xs font-mono px-3 py-1.5 rounded bg-[#1e1e2e] hover:bg-[#2e2e3e] text-[#8b8b9e] hover:text-[#f0f0f5] transition-colors flex-shrink-0"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ── Registration form ──────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5]">
      <div className="max-w-2xl mx-auto px-6 py-12">

        <Link href="/" className="text-[#4a4a5e] hover:text-[#8b8b9e] text-sm font-mono transition-colors mb-8 inline-block">
          ← Back to CitePay
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#f0f0f5] mb-3">Register Your Content</h1>
          <p className="text-[#8b8b9e] text-sm leading-relaxed mb-4">
            Get paid in USDC every time an AI agent cites your work.
            No approval. No middleman. Register once — earn on every citation.
          </p>
          <div className="flex items-center gap-2 text-xs font-mono text-[#4a4a5e]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse inline-block" />
            Settling on Arc Testnet · Paid via Circle Gateway
          </div>
        </div>

        {/* Live stats bar */}
        {stats && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            {[
              { label: "USDC paid out",       value: `$${(stats.totalUSDCRouted ?? 0).toFixed(3)}` },
              { label: "Citations on-chain",  value: `${stats.paidCitations ?? 0}+`                },
              { label: "ArcScan verified",    value: "100%"                                         },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-3 text-center">
                <div className="text-sm font-bold text-[#00ff88] font-mono">{value}</div>
                <div className="text-[10px] text-[#4a4a5e] mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor="creatorName" className={labelClass}>
                Your name <span className="text-red-400">*</span>
              </label>
              <input
                id="creatorName"
                type="text"
                className={inputClass}
                placeholder="Your full name or brand"
                value={creatorName}
                onChange={(e) => setCreatorName(e.target.value)}
                maxLength={72}
                required
              />
            </div>
            <div>
              <label htmlFor="creatorHandle" className={labelClass}>
                Handle <span className="text-[#4a4a5e]">(optional)</span>
              </label>
              <input
                id="creatorHandle"
                type="text"
                className={inputClass}
                placeholder="@satoshi"
                value={creatorHandle}
                onChange={(e) => setCreatorHandle(e.target.value)}
                maxLength={48}
              />
            </div>
          </div>

          <div>
            <label htmlFor="contentUrl" className={labelClass}>
              Content URL <span className="text-red-400">*</span>
            </label>
            <input
              id="contentUrl"
              type="url"
              className={inputClass}
              placeholder="https://yoursite.com/your-article"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
            <p className="text-[10px] text-[#4a4a5e] mt-1.5">
              Must be a reachable https:// link to one piece of your content.
            </p>
          </div>

          <div>
            <label htmlFor="contentTitle" className={labelClass}>
              Title <span className="text-red-400">*</span>
            </label>
            <input
              id="contentTitle"
              type="text"
              className={inputClass}
              placeholder="Bitcoin: A Peer-to-Peer Electronic Cash System"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              required
            />
          </div>

          <div>
            <label htmlFor="contentDescription" className={labelClass}>
              Description
              <span className="text-[#4a4a5e] ml-2">{description.length}/340</span>
            </label>
            <textarea
              id="contentDescription"
              className={`${inputClass} resize-none h-24`}
              placeholder="Explain what your content covers in 1–2 sentences. This is what the agent reads to decide whether to cite you."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={340}
            />
            <p className="text-[10px] text-[#00ff88]/70 mt-1.5">
              Better descriptions = more citations = more USDC
            </p>
          </div>

          <div>
            <label htmlFor="payoutWallet" className={labelClass}>
              Your Arc wallet <span className="text-red-400">*</span>
            </label>
            <input
              id="payoutWallet"
              type="text"
              className={`${inputClass} font-mono`}
              placeholder="0x..."
              value={payoutWallet}
              onChange={(e) => setPayoutWallet(e.target.value)}
              maxLength={42}
              required
            />
            <p className="text-[10px] text-[#4a4a5e] mt-1.5">
              USDC earnings land here. Must be an Arc Testnet address you control.
            </p>
          </div>

          <div>
            <label htmlFor="priceSlider" className={labelClass}>
              Price per citation
              <span className="text-[#6366f1] ml-2">${priceToUsd(price)} USDC</span>
            </label>
            <input
              id="priceSlider"
              type="range"
              min={MIN_PRICE}
              max={MAX_PRICE}
              step={100}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="w-full accent-[#6366f1] mb-2"
              aria-label={`Price per citation: $${priceToUsd(price)} USDC`}
            />
            <div className="flex justify-between text-[10px] font-mono text-[#4a4a5e]">
              <span>${priceToUsd(MIN_PRICE)} min</span>
              <span className="text-[#8b8b9e]">
                100 citations = ${(price * 100 / 1_000_000).toFixed(2)} USDC
              </span>
              <span>${priceToUsd(MAX_PRICE)} max</span>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-800/50 rounded-lg px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#6366f1] hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg py-3.5 text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Registering your source…
              </>
            ) : (
              "Register & Start Earning →"
            )}
          </button>
        </form>

        {/* How it works */}
        <div className="mt-12 pt-8 border-t border-[#1e1e2e]">
          <div className="text-[10px] font-mono text-[#4a4a5e] mb-5">HOW IT WORKS</div>
          <div className="space-y-4">
            {[
              { n: "01", title: "Register once",     desc: "Your content enters the CitePay market immediately. No approval needed." },
              { n: "02", title: "Agent evaluates",   desc: "Every query, the agent scores your content for relevance and price fairness." },
              { n: "03", title: "Earn per citation", desc: "PAY decisions trigger instant USDC transfer to your wallet on Arc Testnet." },
            ].map(({ n, title: t, desc }) => (
              <div key={n} className="flex gap-4">
                <span className="font-mono text-xs text-[#4a4a5e] w-6 flex-shrink-0 mt-0.5">{n}</span>
                <div>
                  <div className="text-sm font-medium text-[#f0f0f5] mb-0.5">{t}</div>
                  <div className="text-xs text-[#8b8b9e]">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-[#1e1e2e] text-center">
          <p className="text-xs text-[#4a4a5e]">
            Already registered?{" "}
            <Link href="/market" className="text-[#6366f1] hover:underline">
              Browse the market →
            </Link>
          </p>
        </div>

      </div>
    </main>
  );
}
