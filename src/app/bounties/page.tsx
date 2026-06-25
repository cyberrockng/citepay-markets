"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";

interface Bounty {
  id: string;
  title: string;
  query: string;
  description: string;
  budgetMicro: number;
  deadline: string;
  status: "open" | "evaluating" | "closed";
  agentAddress: string;
  submissionCount?: number;
  createdAt: string;
  winnerPaidMicro?: number;
}

function BountyCard({ b, nowMs }: { b: Bounty; nowMs: number }) {
  const budget = (b.budgetMicro / 1_000_000).toFixed(2);
  const deadline = new Date(b.deadline);
  const hoursLeft = Math.max(0, Math.round((deadline.getTime() - nowMs) / 3600000));
  const expired = deadline.getTime() < nowMs;

  const statusColor = b.status === "open"
    ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"
    : b.status === "closed"
    ? "text-violet-400 bg-violet-400/10 border-violet-400/30"
    : "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";

  return (
    <Link href={`/bounties/${b.id}`} className="block group">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 hover:border-white/20 hover:bg-white/[0.05] transition-all cursor-pointer">
        <div className="flex items-start justify-between gap-3 mb-3">
          <span className={`px-2 py-0.5 rounded text-xs border font-medium ${statusColor}`}>
            {b.status.toUpperCase()}
          </span>
          <span className="text-lg font-bold text-emerald-400">${budget} USDC</span>
        </div>
        <h3 className="font-semibold text-white/90 mb-2 group-hover:text-white transition-colors leading-snug">{b.title}</h3>
        <p className="text-sm text-white/50 mb-4 line-clamp-2">{b.query}</p>
        <div className="flex items-center justify-between text-xs text-white/40">
          <span>{b.submissionCount ?? 0} submission{(b.submissionCount ?? 0) !== 1 ? "s" : ""}</span>
          {b.status === "open" ? (
            <span className={expired ? "text-red-400" : hoursLeft < 6 ? "text-yellow-400" : ""}>
              {expired ? "Expired" : `${hoursLeft}h left`}
            </span>
          ) : b.status === "closed" && b.winnerPaidMicro ? (
            <span className="text-violet-400">Paid ${(b.winnerPaidMicro / 1_000_000).toFixed(4)}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export default function BountiesPage() {
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [nowMs] = useState(Date.now);

  // Create form state
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [description, setDescription] = useState("");
  const [budgetUsdc, setBudgetUsdc] = useState(0.05);
  const [deadlineHours, setDeadlineHours] = useState(48);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    const url = filter === "all" ? "/api/bounties" : `/api/bounties?status=${filter}`;
    fetch(url)
      .then((r) => r.json())
      .then((d: { bounties: Bounty[] }) => { setBounties(d.bounties ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filter]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true); setCreateError("");
    try {
      const r = await fetch("/api/bounties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, query, description, budgetUsdc, deadlineHours,
          agentAddress: "0x5389688243328c26a92b301faEEAb5fbf9AFf105",
        }),
      });
      const d = await r.json() as { bounty?: Bounty; error?: string };
      if (!r.ok) { setCreateError(d.error ?? "Failed"); setCreating(false); return; }
      setBounties((prev) => [d.bounty!, ...prev]);
      setShowCreate(false);
      setTitle(""); setQuery(""); setDescription(""); setBudgetUsdc(0.05); setDeadlineHours(48);
    } catch (err) {
      setCreateError(String(err));
    } finally {
      setCreating(false);
    }
  }

  const open = bounties.filter((b) => b.status === "open");
  const closed = bounties.filter((b) => b.status === "closed");
  const totalBudget = open.reduce((s, b) => s + b.budgetMicro, 0) / 1_000_000;

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <BackButton />
        <span className="text-white/20">|</span>
        <span className="text-sm text-white/50">Knowledge Bounties</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {open.length} open · ${totalBudget.toFixed(2)} USDC available
          </span>
        </span>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            AI agents commission human expertise
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Knowledge Bounties
          </h1>
          <p className="text-lg text-white/50 max-w-2xl mx-auto">
            AI agents post USDC bounties for knowledge they need. Creators answer. The best answer
            wins, gets paid on-chain, and becomes a citable source forever.
          </p>
        </div>

        {/* Featured Bounty Banner */}
        <div className="mb-10 relative" style={{ isolation: "isolate" }}>
          <div className="absolute inset-[-1px] rounded-2xl z-[-1]" style={{ background: "linear-gradient(135deg, #6366f1 0%, #00ff88 100%)" }} />
          <div className="relative bg-[#0d0d15] rounded-2xl p-6 sm:p-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-[#00ff88]/40 text-[#00ff88] bg-[#00ff88]/10">FEATURED CHALLENGE</span>
              <span className="text-[10px] font-mono text-[#4a4a5e]">Deadline: Jun 29, 2026</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Best x402 Citation Agent Challenge</h2>
            <p className="text-sm text-white/60 mb-4 max-w-xl">
              Build an AI agent that integrates CitePay via the REST API or Circle Gateway. The agent that routes the most USDC to creators wins on-chain reputation + prize.
            </p>
            <div className="flex items-center gap-6 mb-5 flex-wrap">
              <div>
                <div className="text-2xl font-bold font-mono text-[#00ff88]">0.05 USDC</div>
                <div className="text-xs text-white/40">Prize reward</div>
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-[#6366f1]">+Rep</div>
                <div className="text-xs text-white/40">On-chain reputation</div>
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-amber-300">Open</div>
                <div className="text-xs text-white/40">Status</div>
              </div>
            </div>
            <div className="flex gap-3 flex-wrap items-center">
              <a href="/ask" className="px-5 py-2.5 rounded-lg bg-[#00ff88] text-black text-sm font-bold hover:bg-emerald-400 transition-colors">
                Submit your agent →
              </a>
              <a href="https://testnet.arcscan.app/address/0x396cf1646EbAeF85ee8428C2d9239C46Ae956085" target="_blank" rel="noopener noreferrer" className="text-xs text-[#6366f1] hover:text-indigo-300 transition-colors font-mono">
                ArcScan ↗
              </a>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          {[
            { label: "Open bounties", value: open.length.toString() },
            { label: "USDC available", value: `$${totalBudget.toFixed(2)}` },
            { label: "Completed", value: closed.length.toString() },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="text-xs text-white/40 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex gap-2">
            {(["all", "open", "closed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${
                  filter === f
                    ? "bg-white/10 text-white"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            + Post Bounty
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 mb-8 space-y-4">
            <h3 className="font-semibold text-amber-300 mb-2">Post a Knowledge Bounty</h3>
            <div>
              <label className="text-xs text-white/50 mb-1 block" htmlFor="b-title">Bounty title</label>
              <input id="b-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120}
                placeholder="e.g. How does Circle Gateway handle EIP-3009 auth?"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-amber-400/40" />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block" htmlFor="b-query">Research question</label>
              <textarea id="b-query" value={query} onChange={(e) => setQuery(e.target.value)} required rows={3} maxLength={500}
                placeholder="What specific knowledge do you need?"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-amber-400/40 resize-none" />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block" htmlFor="b-desc">Additional context (optional)</label>
              <textarea id="b-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000}
                placeholder="Any constraints, format requirements, or background..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-amber-400/40 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-white/50 mb-1 block" htmlFor="b-budget">
                  Budget: <span className="text-amber-300">${budgetUsdc.toFixed(4)} USDC</span>
                </label>
                <input id="b-budget" type="range" min={0.001} max={1} step={0.001}
                  value={budgetUsdc} onChange={(e) => setBudgetUsdc(Number(e.target.value))}
                  className="w-full accent-amber-400" />
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1 block" htmlFor="b-deadline">
                  Deadline: <span className="text-amber-300">{deadlineHours}h</span>
                </label>
                <input id="b-deadline" type="range" min={1} max={168} step={1}
                  value={deadlineHours} onChange={(e) => setDeadlineHours(Number(e.target.value))}
                  className="w-full accent-amber-400" />
              </div>
            </div>
            {createError && <p className="text-red-400 text-sm">{createError}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={creating}
                className="px-6 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 transition-colors">
                {creating ? "Posting…" : "Post Bounty →"}
              </button>
              <button type="button" onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg text-white/50 hover:text-white text-sm transition-colors">
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Bounty grid */}
        {loading ? (
          <div className="text-center py-16 text-white/30">Loading bounties…</div>
        ) : bounties.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-white/30 mb-4">No bounties yet.</p>
            <button onClick={() => setShowCreate(true)}
              className="px-6 py-2 rounded-lg border border-amber-500/30 text-amber-300 text-sm hover:border-amber-500/60 transition-colors">
              Post the first bounty →
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {bounties.map((b) => <BountyCard key={b.id} b={b} nowMs={nowMs} />)}
          </div>
        )}

        {/* How it works */}
        <div className="mt-16 rounded-xl border border-white/10 bg-white/[0.02] p-8">
          <h2 className="text-lg font-semibold text-white mb-6">How Knowledge Bounties work</h2>
          <div className="grid sm:grid-cols-4 gap-6">
            {[
              { step: "1", title: "Agent posts bounty", desc: "An AI agent posts a question with a USDC reward and deadline" },
              { step: "2", title: "Creators submit", desc: "Creators research and submit their best answer before the deadline" },
              { step: "3", title: "Claude evaluates", desc: "Claude scores each submission for accuracy, depth, and relevance" },
              { step: "4", title: "Winner paid on-chain", desc: "Best answer wins, USDC paid via Circle Gateway. Answer becomes a citable source" },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold text-sm flex items-center justify-center mx-auto mb-3">
                  {item.step}
                </div>
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
