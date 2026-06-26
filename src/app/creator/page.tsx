"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";

const ARCSCAN = "https://testnet.arcscan.app";
const CATEGORIES = ["Research", "Protocol", "Infrastructure", "AI/Agents"];

interface RegisteredSource {
  id: string;
  title: string;
  url: string;
  price: number;
  paidCount: number;
  refusedCount: number;
  contentHash: string;
  onChainId?: number | null;
  createdAt: string;
}

interface Citation {
  id: string;
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string;
  amountPaid: number;
  txHash: string | null;
  evidenceHash: string;
  createdAt: string;
  agentAddress: string;
  decision: string;
}

interface CreatorData {
  wallet: string;
  sources: RegisteredSource[];
  receipts: Citation[];
  totalEarned: number;
}

function HashBadge({ hash, label }: { hash: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(hash).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="flex items-center gap-1.5 font-mono text-[10px] text-[#4a4a5e] hover:text-[#6366f1] transition-colors group"
      title={hash}
    >
      <span className="text-[#4a4a5e] group-hover:text-[#6366f1]">{label ?? "hash"}</span>
      <span className="text-[#6366f1]">{hash.slice(0, 8)}…{hash.slice(-6)}</span>
      <span>{copied ? "✓" : "⊕"}</span>
    </button>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl p-4">
      <div className="text-[10px] font-mono text-[#4a4a5e] tracking-widest mb-1">{label}</div>
      <div className="text-xl font-bold text-[#f0f0f5] font-mono">{value}</div>
      {sub && <div className="text-[10px] text-[#4a4a5e] mt-1">{sub}</div>}
    </div>
  );
}

// ── Registration form ─────────────────────────────────────────────────────────

function RegisterForm({ onRegistered }: { onRegistered: (wallet: string) => void }) {
  const [form, setForm] = useState({
    url: "", title: "", creatorName: "", handle: "",
    wallet: "", description: "", category: "Research", price: 1500,
  });
  const [step, setStep] = useState<"idle" | "fetching" | "registering" | "done" | "error">("idle");
  const [result, setResult] = useState<{
    contentHash: string; contentLength: number; fetchSource: string;
    fetchError?: string; sourceId: string; onChainId?: number;
  } | null>(null);
  const [error, setError] = useState("");

  function set(k: keyof typeof form, v: string | number) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.url || !form.title || !form.creatorName || !form.wallet) return;

    setStep("fetching");
    setError("");

    try {
      setStep("registering");
      const res = await fetch("/api/sources/register-public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url:           form.url,
          title:         form.title,
          creatorName:   form.creatorName,
          creatorHandle: form.handle || form.creatorName,
          payoutWallet:  form.wallet,
          description:   form.description,
          category:      form.category,
          price:         form.price,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registration failed");
      setResult({
        contentHash:   data.contentHash,
        contentLength: data.contentLength,
        fetchSource:   data.contentFetchSource,
        fetchError:    data.contentFetchError ?? undefined,
        sourceId:      data.source.id,
        onChainId:     data.source.onChainId,
      });
      setStep("done");
      onRegistered(form.wallet);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }

  const busy = step === "fetching" || step === "registering";

  return (
    <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
      <div className="text-[10px] font-mono text-[#4a4a5e] tracking-widest mb-4">REGISTER YOUR CONTENT</div>

      {step === "done" && result ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-[#00ff88] font-semibold">
            <span className="text-lg">✓</span>
            <span>You&apos;re in the CitePay market</span>
          </div>
          <p className="text-sm text-[#8b8b9e]">
            Your content has been fingerprinted and registered. When AI agents query topics
            covered by your source, they&apos;ll evaluate and pay you USDC for citations.
          </p>
          <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl p-4 space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-[#4a4a5e]">Content fingerprint</span>
              <HashBadge hash={result.contentHash} label="" />
            </div>
            <div className="flex justify-between">
              <span className="text-[#4a4a5e]">Content length</span>
              <span className="text-[#f0f0f5]">{result.contentLength.toLocaleString()} chars</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#4a4a5e]">Fetch method</span>
              <span className={result.fetchSource === "fetch" ? "text-[#00ff88]" : "text-yellow-400"}>
                {result.fetchSource === "fetch" ? "live URL fetch ✓" : "fallback hash ⚠"}
              </span>
            </div>
            {result.fetchError && (
              <div className="text-yellow-400">{result.fetchError}</div>
            )}
          </div>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => { setStep("idle"); setResult(null); setForm({ url: "", title: "", creatorName: "", handle: "", wallet: form.wallet, description: "", category: "Research", price: 1500 }); }}
              className="text-sm font-mono text-[#6366f1] hover:text-indigo-300 underline"
            >
              Register another source
            </button>
            <Link href={`/source/${result.sourceId}`} className="text-sm font-mono text-[#4a4a5e] hover:text-[#8b8b9e] underline">
              View source page →
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* URL — most important field first */}
          <div>
            <label className="block text-xs font-mono text-[#8b8b9e] mb-1">Content URL *</label>
            <input
              type="url"
              placeholder="https://your-blog.com/article"
              value={form.url}
              onChange={(e) => set("url", e.target.value)}
              required
              className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#f0f0f5] placeholder-[#2e2e3e] focus:outline-none focus:border-[#6366f1] transition-colors"
            />
            <p className="text-[10px] text-[#4a4a5e] mt-1">We&apos;ll fetch and fingerprint this page to create your content hash</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-[#8b8b9e] mb-1">Title *</label>
              <input
                type="text"
                placeholder="Your Article Title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                required maxLength={120}
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#f0f0f5] placeholder-[#2e2e3e] focus:outline-none focus:border-[#6366f1] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#8b8b9e] mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#f0f0f5] focus:outline-none focus:border-[#6366f1] transition-colors"
              >
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-[#8b8b9e] mb-1">Your Name *</label>
              <input
                type="text"
                placeholder="Ada Lovelace"
                value={form.creatorName}
                onChange={(e) => set("creatorName", e.target.value)}
                required maxLength={72}
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#f0f0f5] placeholder-[#2e2e3e] focus:outline-none focus:border-[#6366f1] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#8b8b9e] mb-1">Handle</label>
              <input
                type="text"
                placeholder="@your_handle"
                value={form.handle}
                onChange={(e) => set("handle", e.target.value)}
                maxLength={40}
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#f0f0f5] placeholder-[#2e2e3e] focus:outline-none focus:border-[#6366f1] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-[#8b8b9e] mb-1">
              Payout Wallet (Arc Testnet) *
            </label>
            <input
              type="text"
              placeholder="0x..."
              value={form.wallet}
              onChange={(e) => set("wallet", e.target.value)}
              required pattern="0x[0-9a-fA-F]{40}"
              className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#f0f0f5] placeholder-[#2e2e3e] focus:outline-none focus:border-[#6366f1] transition-colors"
            />
            <p className="text-[10px] text-[#4a4a5e] mt-1">USDC paid here on Arc Testnet when agents cite your work</p>
          </div>

          <div>
            <label className="block text-xs font-mono text-[#8b8b9e] mb-1">
              Description <span className="text-[#4a4a5e]">(optional, max 340 chars)</span>
            </label>
            <textarea
              placeholder="What does this source cover? Why is it valuable to AI researchers?"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              maxLength={340} rows={2}
              className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#f0f0f5] placeholder-[#2e2e3e] focus:outline-none focus:border-[#6366f1] transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-[#8b8b9e] mb-2">
              Citation price: <span className="text-[#00ff88]">${(form.price / 1_000_000).toFixed(4)} USDC</span>
              <span className="text-[#4a4a5e] ml-2">per citation</span>
            </label>
            <input
              type="range" min={500} max={10_000} step={500}
              value={form.price}
              onChange={(e) => set("price", Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-[10px] font-mono text-[#4a4a5e] mt-1">
              <span>$0.0005 min</span>
              <span>$0.01 max</span>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-[#6366f1] hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm"
          >
            {step === "fetching"    ? "Fetching content…"
             : step === "registering" ? "Fingerprinting & registering…"
             : "Register Source →"}
          </button>
        </form>
      )}
    </div>
  );
}

// ── Earnings dashboard ────────────────────────────────────────────────────────

function EarningsDashboard({ wallet }: { wallet: string }) {
  const [data, setData] = useState<CreatorData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch(`/api/creator/${wallet}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [wallet]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 8_000); // poll every 8s for live citations
    return () => clearInterval(iv);
  }, [load]);

  if (loading) {
    return (
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 animate-pulse">
        <div className="h-4 bg-[#1e1e2e] rounded w-32 mb-4" />
        <div className="grid grid-cols-3 gap-3">
          {[0,1,2].map((i) => <div key={i} className="h-20 bg-[#1e1e2e] rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const citations = data.receipts.filter((r) => r.decision === "PAY");
  const totalEarned = data.totalEarned;

  return (
    <div className="space-y-4">
      {/* Headline stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="TOTAL EARNED"
          value={`$${(totalEarned / 1e6).toFixed(4)}`}
          sub="USDC on Arc Testnet"
        />
        <StatCard
          label="CITATIONS PAID"
          value={String(citations.length)}
          sub={`${data.receipts.length} total decisions`}
        />
        <StatCard
          label="SOURCES"
          value={String(data.sources.length)}
          sub="registered sources"
        />
        <StatCard
          label="AVG PER CITE"
          value={citations.length > 0 ? `$${(totalEarned / citations.length / 1e6).toFixed(4)}` : "—"}
          sub="USDC per citation"
        />
      </div>

      {/* Sources */}
      {data.sources.length > 0 && (
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5">
          <div className="text-[10px] font-mono text-[#4a4a5e] tracking-widest mb-3">YOUR SOURCES</div>
          <div className="space-y-2">
            {data.sources.map((s) => (
              <div key={s.id} className="flex items-start gap-3 p-3 rounded-xl bg-[#0a0a0f] border border-[#1e1e2e]">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[#f0f0f5] truncate">{s.title}</div>
                  <div className="text-[10px] font-mono text-[#4a4a5e] truncate mt-0.5">{s.url}</div>
                  <div className="flex items-center gap-3 mt-1">
                    <HashBadge hash={s.contentHash} label="hash" />
                    <span className="text-[10px] font-mono text-[#4a4a5e]">
                      ${(s.price / 1e6).toFixed(4)}/cite
                    </span>
                    {s.onChainId && (
                      <span className="text-[10px] font-mono text-[#00ff88]">on-chain #{s.onChainId}</span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-bold text-[#00ff88] font-mono">
                    {s.paidCount} <span className="text-[10px] text-[#4a4a5e]">citations</span>
                  </div>
                  <Link href={`/source/${s.id}`} className="text-[10px] font-mono text-[#6366f1] hover:text-indigo-300">
                    view →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live citation feed */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-mono text-[#4a4a5e] tracking-widest">CITATION FEED</div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#4a4a5e]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse inline-block" />
            live · 8s refresh
          </div>
        </div>

        {citations.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-3xl mb-3">⏳</div>
            <div className="text-sm text-[#8b8b9e]">No citations yet</div>
            <div className="text-xs text-[#4a4a5e] mt-1">
              Run a query on <Link href="/demo" className="text-[#6366f1] hover:underline">demo</Link> or{" "}
              <Link href="/orchestrate" className="text-[#6366f1] hover:underline">orchestrate</Link> to trigger a citation
            </div>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {citations.map((r) => (
              <div key={r.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-[#0a0a0f] border border-[#1e1e2e]">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00ff88] mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-[#f0f0f5] truncate">{r.sourceTitle}</span>
                    <span className="text-[10px] font-mono text-[#00ff88] font-bold">
                      +${(r.amountPaid / 1e6).toFixed(4)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] font-mono text-[#4a4a5e]">
                      {new Date(r.createdAt).toLocaleTimeString()}
                    </span>
                    <span className="text-[10px] font-mono text-[#4a4a5e]">
                      Agent {r.agentAddress.slice(0, 8)}…
                    </span>
                    {r.txHash && (
                      <a
                        href={`${ARCSCAN}/tx/${r.txHash}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-[10px] font-mono text-[#6366f1] hover:text-indigo-300"
                      >
                        tx ↗
                      </a>
                    )}
                    <Link
                      href={`/receipt/${r.id}`}
                      className="text-[10px] font-mono text-[#4a4a5e] hover:text-[#8b8b9e]"
                    >
                      receipt →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Wallet link */}
      <div className="text-center">
        <Link
          href={`/creator/${wallet}`}
          className="text-xs font-mono text-[#4a4a5e] hover:text-[#8b8b9e] underline"
        >
          Full creator profile →
        </Link>
      </div>
    </div>
  );
}

// ── RSS Feed registration form ────────────────────────────────────────────────

function RssForm({ onRegistered }: { onRegistered: (wallet: string) => void }) {
  const [form, setForm] = useState({
    feedUrl: "", creatorName: "", handle: "", wallet: "",
    category: "Research", price: 1500,
  });
  const [step, setStep] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<{
    registered: number; failed: number; message: string;
    sources: Array<{ id: string; title: string; url: string; error?: string }>;
  } | null>(null);
  const [error, setError] = useState("");

  function set(k: keyof typeof form, v: string | number) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.feedUrl || !form.creatorName || !form.wallet) return;
    setStep("loading");
    setError("");
    try {
      const res = await fetch("/api/sources/register-rss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedUrl:      form.feedUrl,
          creatorName:  form.creatorName,
          handle:       form.handle || form.creatorName,
          payoutWallet: form.wallet,
          category:     form.category,
          price:        form.price,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registration failed");
      setResult(data);
      setStep("done");
      if (data.registered > 0) onRegistered(form.wallet);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }

  const busy = step === "loading";

  return (
    <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6" id="rss">
      <div className="text-[10px] font-mono text-[#4a4a5e] tracking-widest mb-4">REGISTER YOUR ENTIRE FEED</div>

      {step === "done" && result ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-[#00ff88] font-semibold">
            <span className="text-lg">✓</span>
            <span>{result.message}</span>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {result.sources.filter((s) => !s.error).map((s) => (
              <div key={s.id} className="flex items-center gap-2 px-3 py-2 bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg text-xs font-mono">
                <span className="text-[#00ff88]">✓</span>
                <span className="text-[#f0f0f5] flex-1 truncate">{s.title}</span>
                <a href={`/source/${s.id}`} className="text-[#6366f1] hover:text-indigo-300 shrink-0">view →</a>
              </div>
            ))}
            {result.sources.filter((s) => s.error).map((s, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 bg-[#0a0a0f] border border-red-900/30 rounded-lg text-xs font-mono">
                <span className="text-red-400">✗</span>
                <span className="text-[#8b8b9e] flex-1 truncate">{s.title}</span>
                <span className="text-red-400 text-[10px]">fetch failed</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => { setStep("idle"); setResult(null); }}
            className="text-sm font-mono text-[#6366f1] hover:text-indigo-300 underline"
          >
            Register another feed
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-[#8b8b9e] mb-1">RSS / Atom Feed URL *</label>
            <input
              type="url"
              placeholder="https://your-blog.com/feed.xml"
              value={form.feedUrl}
              onChange={(e) => set("feedUrl", e.target.value)}
              required
              className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#f0f0f5] placeholder-[#2e2e3e] focus:outline-none focus:border-[#6366f1] transition-colors"
            />
            <p className="text-[10px] text-[#4a4a5e] mt-1">
              We parse your feed and fingerprint up to 20 articles — all registered at once
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-[#8b8b9e] mb-1">Your Name *</label>
              <input
                type="text"
                placeholder="Ada Lovelace"
                value={form.creatorName}
                onChange={(e) => set("creatorName", e.target.value)}
                required
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#f0f0f5] placeholder-[#2e2e3e] focus:outline-none focus:border-[#6366f1] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#8b8b9e] mb-1">Handle</label>
              <input
                type="text"
                placeholder="@ada"
                value={form.handle}
                onChange={(e) => set("handle", e.target.value)}
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#f0f0f5] placeholder-[#2e2e3e] focus:outline-none focus:border-[#6366f1] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-[#8b8b9e] mb-1">Payout Wallet *</label>
            <input
              type="text"
              placeholder="0x…"
              value={form.wallet}
              onChange={(e) => set("wallet", e.target.value)}
              required
              className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#f0f0f5] placeholder-[#2e2e3e] focus:outline-none focus:border-[#6366f1] transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-[#8b8b9e] mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#f0f0f5] focus:outline-none focus:border-[#6366f1] transition-colors"
              >
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-[#8b8b9e] mb-1">
                Price per citation <span className="text-[#4a4a5e]">({(form.price / 1_000_000).toFixed(4)} USDC)</span>
              </label>
              <input
                type="range" min={500} max={10000} step={250}
                value={form.price}
                onChange={(e) => set("price", Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-sm text-red-400 font-mono">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-[#6366f1] hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
          >
            {busy ? "Fetching and registering articles…" : "Register all articles from feed →"}
          </button>
        </form>
      )}
    </div>
  );
}

// ── Wallet lookup bar ─────────────────────────────────────────────────────────

function WalletLookup({ onWallet }: { onWallet: (w: string) => void }) {
  const [input, setInput] = useState("");
  return (
    <div className="flex gap-2">
      <input
        type="text"
        placeholder="0x… paste your wallet to see earnings"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="flex-1 bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#f0f0f5] placeholder-[#2e2e3e] focus:outline-none focus:border-[#6366f1] transition-colors"
      />
      <button
        onClick={() => { if (/^0x[0-9a-fA-F]{40}$/.test(input.trim())) onWallet(input.trim()); }}
        className="bg-[#1e1e2e] hover:bg-[#2e2e3e] text-[#f0f0f5] font-mono text-sm px-4 rounded-lg transition-colors"
      >
        Look up
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CreatorPage() {
  const [activeWallet, setActiveWallet] = useState<string | null>(null);
  const [regTab, setRegTab] = useState<"url" | "rss">("url");

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5]">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <BackButton />

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#f0f0f5] mb-2">Get paid when AI cites your work</h1>
          <p className="text-sm text-[#8b8b9e] leading-relaxed">
            Register your articles, research, or documentation. Every time an AI agent cites
            your work, you earn USDC — instantly, on Arc Testnet. No approval needed.
          </p>
        </div>

        {/* How it works */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { n: "1", title: "Register", desc: "Paste your URL or RSS feed. We fingerprint the content." },
            { n: "2", title: "Get cited", desc: "Agents evaluate your source for relevance and pay you." },
            { n: "3", title: "Earn USDC", desc: "Payment flows to your wallet on Arc Testnet instantly." },
          ].map((s) => (
            <div key={s.n} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-3 text-center">
              <div className="w-7 h-7 rounded-full bg-[#6366f1]/20 text-[#6366f1] text-xs font-bold font-mono flex items-center justify-center mx-auto mb-2">
                {s.n}
              </div>
              <div className="text-xs font-semibold text-[#f0f0f5] mb-1">{s.title}</div>
              <div className="text-[10px] text-[#4a4a5e] leading-relaxed">{s.desc}</div>
            </div>
          ))}
        </div>

        {/* Registration tabs */}
        <div className="flex gap-1 mb-4 bg-[#111118] border border-[#1e1e2e] rounded-xl p-1">
          <button
            onClick={() => setRegTab("url")}
            className={`flex-1 py-2 text-xs font-mono font-semibold rounded-lg transition-colors ${
              regTab === "url"
                ? "bg-[#6366f1] text-white"
                : "text-[#4a4a5e] hover:text-[#8b8b9e]"
            }`}
          >
            Single URL
          </button>
          <button
            onClick={() => setRegTab("rss")}
            className={`flex-1 py-2 text-xs font-mono font-semibold rounded-lg transition-colors ${
              regTab === "rss"
                ? "bg-[#6366f1] text-white"
                : "text-[#4a4a5e] hover:text-[#8b8b9e]"
            }`}
          >
            RSS Feed <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-[#00ff88]/20 text-[#00ff88] font-mono">NEW</span>
          </button>
        </div>

        {/* Registration */}
        {regTab === "url" ? (
          <RegisterForm onRegistered={(wallet) => setActiveWallet(wallet)} />
        ) : (
          <RssForm onRegistered={(wallet) => setActiveWallet(wallet)} />
        )}

        {/* Earnings */}
        <div className="mt-8">
          {activeWallet ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="text-[10px] font-mono text-[#4a4a5e] tracking-widest">YOUR EARNINGS</div>
                <span className="text-[10px] font-mono text-[#4a4a5e]">{activeWallet.slice(0, 10)}…{activeWallet.slice(-6)}</span>
              </div>
              <EarningsDashboard wallet={activeWallet} />
            </>
          ) : (
            <div className="space-y-3">
              <div className="text-[10px] font-mono text-[#4a4a5e] tracking-widest">ALREADY REGISTERED?</div>
              <WalletLookup onWallet={setActiveWallet} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
