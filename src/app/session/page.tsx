"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";

interface Session {
  id: string; title: string; policy: string;
  totalPaidMicro: number; totalCitations: number;
  contextSummary: string | null; createdAt: string; lastActive: string;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [policy, setPolicy] = useState("balanced");

  useEffect(() => {
    fetch("/api/sessions").then((r) => r.json())
      .then((d: { sessions: Session[] }) => { setSessions(d.sessions ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function createSession(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const r = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title || "Research Session", policy }),
      });
      const d = await r.json() as { session: Session };
      window.location.href = `/session/${d.session.id}`;
    } catch { setCreating(false); }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <BackButton />
        <span className="text-white/20">|</span>
        <span className="text-sm text-white/50">Research Sessions</span>
        <span className="ml-auto px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          {sessions.length} sessions
        </span>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium mb-4">
            Multi-turn · Context-aware · Full receipt trail
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">Research Sessions</h1>
          <p className="text-lg text-white/50 max-w-xl mx-auto">
            Ask follow-up questions that build on prior answers. Every turn generates paid citations.
            The full session is shareable with an on-chain receipt trail.
          </p>
        </div>

        {/* Start session form */}
        <form onSubmit={createSession} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 mb-10">
          <h3 className="font-semibold text-white mb-4">Start a new session</h3>
          <div className="flex gap-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Session title (optional)"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-white/30 text-sm" />
            <select value={policy} onChange={(e) => setPolicy(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none">
              <option value="balanced">Balanced</option>
              <option value="conservative">Conservative</option>
              <option value="aggressive">Aggressive</option>
            </select>
            <button type="submit" disabled={creating}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity text-sm whitespace-nowrap">
              {creating ? "Creating…" : "Start →"}
            </button>
          </div>
        </form>

        {/* Session list */}
        {loading ? (
          <div className="text-center py-16 text-white/30">Loading sessions…</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-white/30 mb-2">No sessions yet.</p>
            <p className="text-white/20 text-sm">Start one above and ask your first question.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {sessions.map((s) => (
              <Link key={s.id} href={`/session/${s.id}`} className="group block">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 hover:border-white/20 hover:bg-white/[0.04] transition-all">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-medium text-white/90 group-hover:text-white transition-colors">{s.title}</h3>
                    <span className="px-2 py-0.5 rounded text-xs bg-white/5 text-white/40 border border-white/10 shrink-0">{s.policy}</span>
                  </div>
                  {s.contextSummary && <p className="text-xs text-white/40 mb-3 line-clamp-2">{s.contextSummary}</p>}
                  <div className="flex items-center justify-between text-xs text-white/30">
                    <span>{s.totalCitations} citation{s.totalCitations !== 1 ? "s" : ""} · ${(s.totalPaidMicro / 1e6).toFixed(4)} USDC</span>
                    <span>{new Date(s.lastActive).toLocaleDateString()}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
