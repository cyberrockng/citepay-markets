"use client";
import { useState, useEffect, use, useRef } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";

interface SessionTurn {
  id: string; query: string; answer: string; queryId: string | null;
  citationsPaid: number; amountPaidMicro: number; receiptIds: string[]; turnIndex: number; createdAt: string;
}
interface Session {
  id: string; title: string; policy: string;
  totalPaidMicro: number; totalCitations: number; contextSummary: string | null;
}
interface Decision { decision: string; source: string; amountPaid: number; receiptId?: string; }

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [session, setSession] = useState<Session | null>(null);
  const [turns, setTurns] = useState<SessionTurn[]>([]);
  const [query, setQuery] = useState("");
  const [asking, setAsking] = useState(false);
  const [liveDecisions, setLiveDecisions] = useState<Decision[]>([]);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/sessions/${id}`)
      .then((r) => r.json())
      .then((d: { session: Session; turns: SessionTurn[] }) => {
        setSession(d.session); setTurns(d.turns ?? []);
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, asking]);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || asking) return;
    setQuery(""); setAsking(true); setLiveDecisions([]); setError("");

    try {
      const r = await fetch(`/api/sessions/${id}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const d = await r.json() as {
        turn?: SessionTurn; answer?: string;
        decisions?: Decision[]; totalPaid?: number; error?: string;
      };
      if (!r.ok) { setError(d.error ?? "Failed"); setAsking(false); return; }
      if (d.decisions) setLiveDecisions(d.decisions);
      if (d.turn) {
        setTurns((prev) => [...prev, d.turn!]);
        setSession((prev) => prev ? {
          ...prev,
          totalPaidMicro: prev.totalPaidMicro + (d.turn!.amountPaidMicro),
          totalCitations: prev.totalCitations + d.turn!.citationsPaid,
        } : prev);
      }
    } catch (err) { setError(String(err)); }
    finally { setAsking(false); setLiveDecisions([]); }
  }

  if (!session) return (
    <main className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
      <div className="text-white/30">Loading session…</div>
    </main>
  );

  const totalUSDC = (session.totalPaidMicro / 1e6).toFixed(4);

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-white/10 px-4 py-3 flex items-center gap-3 shrink-0">
        <BackButton />
        <Link href="/session" className="text-white/40 hover:text-white/70 text-sm transition-colors">Sessions</Link>
        <span className="text-white/20">/</span>
        <span className="text-sm text-white/70 truncate max-w-48">{session.title}</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-white/30 font-mono">{session.totalCitations} citations · ${totalUSDC} USDC</span>
          <span className="px-2 py-0.5 rounded text-xs bg-white/5 text-white/40 border border-white/10">{session.policy}</span>
        </div>
      </div>

      {/* Context banner */}
      {session.contextSummary && (
        <div className="px-4 py-2 bg-violet-500/5 border-b border-violet-500/20 text-xs text-violet-300 text-center">
          Session context: {session.contextSummary}
        </div>
      )}

      {/* Turns */}
      <div className="flex-1 overflow-y-auto max-w-3xl w-full mx-auto px-4 py-6 space-y-8">
        {turns.length === 0 && !asking && (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">🔬</div>
            <p className="text-white/30 mb-2">No questions yet</p>
            <p className="text-white/20 text-sm">Ask your first question below. Each answer is backed by paid citations.</p>
          </div>
        )}

        {turns.map((turn, i) => (
          <div key={turn.id} className="space-y-4">
            {/* User question */}
            <div className="flex justify-end">
              <div className="max-w-lg rounded-2xl rounded-tr-sm bg-indigo-600/20 border border-indigo-500/30 px-4 py-3">
                <p className="text-white/90 text-sm leading-relaxed">{turn.query}</p>
              </div>
            </div>

            {/* Agent answer */}
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-emerald-400 flex items-center justify-center text-xs font-bold shrink-0 mt-1">AI</div>
              <div className="flex-1 space-y-3">
                <div className="rounded-2xl rounded-tl-sm bg-white/[0.03] border border-white/10 px-5 py-4">
                  <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap">{turn.answer}</p>
                </div>

                {/* Citation receipts */}
                {turn.citationsPaid > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {turn.receiptIds.slice(0, 4).map((rid) => (
                      <Link key={rid} href={`/receipt/${rid}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Receipt #{i + 1}
                      </Link>
                    ))}
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/40">
                      ${(turn.amountPaidMicro / 1e6).toFixed(4)} USDC · {turn.citationsPaid} source{turn.citationsPaid !== 1 ? "s" : ""} paid
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Live thinking state */}
        {asking && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <div className="max-w-lg rounded-2xl rounded-tr-sm bg-indigo-600/20 border border-indigo-500/30 px-4 py-3 opacity-60">
                <p className="text-white/70 text-sm">Asking…</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-emerald-400 flex items-center justify-center text-xs font-bold shrink-0 mt-1 animate-pulse">AI</div>
              <div className="flex-1 space-y-3">
                <div className="rounded-2xl rounded-tl-sm bg-white/[0.03] border border-white/10 px-5 py-4">
                  <div className="flex items-center gap-2 text-white/30 text-sm">
                    <span className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce"
                          style={{ animationDelay: `${i * 150}ms` }} />
                      ))}
                    </span>
                    Searching and paying citations…
                  </div>
                  {liveDecisions.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {liveDecisions.slice(0, 4).map((d, i) => (
                        <div key={i} className={`text-xs font-mono flex items-center gap-2 ${d.decision === "PAY" ? "text-emerald-400" : "text-white/30"}`}>
                          <span>{d.decision === "PAY" ? "✓" : "·"}</span>
                          <span className="truncate">{d.source}</span>
                          {d.decision === "PAY" && <span>${(d.amountPaid / 1e6).toFixed(4)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-red-400 text-sm">{error}</div>}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/10 px-4 py-4 shrink-0">
        <form onSubmit={ask} className="max-w-3xl mx-auto flex gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={asking}
            placeholder={turns.length > 0 ? "Ask a follow-up question…" : "Ask your first question…"}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 text-sm disabled:opacity-50"
          />
          <button type="submit" disabled={!query.trim() || asking}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity text-sm whitespace-nowrap">
            {asking ? "…" : "Ask →"}
          </button>
        </form>
        <p className="text-center text-xs text-white/20 mt-2">
          Context-aware · Every answer backed by USDC citations · {turns.length} turn{turns.length !== 1 ? "s" : ""} so far
        </p>
      </div>
    </main>
  );
}
