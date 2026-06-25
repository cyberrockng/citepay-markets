"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";

interface Bounty {
  id: string; title: string; query: string; description: string;
  budgetMicro: number; deadline: string; status: string;
  agentAddress: string; submissionCount?: number;
  winningSubmissionId: string | null; winnerWallet: string | null;
  winnerPaidMicro: number; winnerTxHash: string | null; closedAt: string | null;
}
interface Submission {
  id: string; bountyId: string; creatorName: string; creatorHandle: string;
  creatorWallet: string; content: string; contentUrl: string | null;
  evaluationScore: number | null; evaluationReason: string | null; createdAt: string;
}

export default function BountyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [bounty, setBounty] = useState<Bounty | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs] = useState(Date.now);
  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<{ winner: { creatorName: string; paidMicro: number; txHash: string | null }; knowledgeSourceId: string | null } | null>(null);

  // Submit form
  const [creatorName, setCreatorName] = useState("");
  const [creatorHandle, setCreatorHandle] = useState("");
  const [creatorWallet, setCreatorWallet] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const load = () => {
    fetch(`/api/bounties/${id}`)
      .then((r) => r.json())
      .then((d: { bounty: Bounty; submissions: Submission[] }) => {
        setBounty(d.bounty ?? null);
        setSubmissions(d.submissions ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setSubmitError("");
    try {
      const r = await fetch(`/api/bounties/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorName, creatorHandle, creatorWallet, content }),
      });
      const d = await r.json() as { submission?: Submission; error?: string };
      if (!r.ok) { setSubmitError(d.error ?? "Failed"); setSubmitting(false); return; }
      setSubmissions((prev) => [...prev, d.submission!]);
      setSubmitted(true);
    } catch (err) { setSubmitError(String(err)); }
    finally { setSubmitting(false); }
  }

  async function handleEvaluate() {
    if (!confirm("Evaluate all submissions and pay the winner in USDC?")) return;
    setEvaluating(true);
    try {
      const r = await fetch(`/api/bounties/${id}/evaluate`, { method: "POST" });
      const d = await r.json() as { winner?: { creatorName: string; paidMicro: number; txHash: string | null }; knowledgeSourceId?: string | null; error?: string };
      if (!r.ok) { alert(d.error ?? "Evaluation failed"); setEvaluating(false); return; }
      setEvalResult({ winner: d.winner!, knowledgeSourceId: d.knowledgeSourceId ?? null });
      load();
    } catch (err) { alert(String(err)); }
    finally { setEvaluating(false); }
  }

  if (loading) return (
    <main className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
      <div className="text-white/30">Loading bounty…</div>
    </main>
  );

  if (!bounty) return (
    <main className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
      <div className="text-center">
        <p className="text-white/40 mb-4">Bounty not found</p>
        <Link href="/bounties" className="text-violet-400 hover:text-violet-300">← All bounties</Link>
      </div>
    </main>
  );

  const budget = (bounty.budgetMicro / 1_000_000).toFixed(4);
  const deadline = new Date(bounty.deadline);
  const hoursLeft = Math.max(0, Math.round((deadline.getTime() - nowMs) / 3600000));
  const isOpen = bounty.status === "open" && deadline.getTime() > nowMs;
  const isClosed = bounty.status === "closed";
  const AGENT_ADDRESS = "0x5389688243328c26a92b301faEEAb5fbf9AFf105";

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <BackButton />
        <Link href="/bounties" className="text-white/40 hover:text-white/70 text-sm transition-colors">Bounties</Link>
        <span className="text-white/20">/</span>
        <span className="text-sm text-white/50 truncate max-w-48">{bounty.title}</span>
        <span className="ml-auto">
          <span className={`px-2 py-0.5 rounded text-xs border font-medium ${
            isOpen ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"
            : isClosed ? "text-violet-400 bg-violet-400/10 border-violet-400/30"
            : "text-yellow-400 bg-yellow-400/10 border-yellow-400/30"
          }`}>{bounty.status.toUpperCase()}</span>
        </span>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12 grid lg:grid-cols-3 gap-8">
        {/* Left: bounty detail */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl font-bold text-emerald-400">${budget} USDC</span>
              {isOpen && <span className="text-sm text-white/40">{hoursLeft}h left</span>}
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">{bounty.title}</h1>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-2">Research Question</p>
              <p className="text-white/80 leading-relaxed">{bounty.query}</p>
              {bounty.description && (
                <p className="text-white/50 text-sm mt-3 leading-relaxed">{bounty.description}</p>
              )}
            </div>
          </div>

          {/* Winner announcement */}
          {isClosed && bounty.winnerWallet && (
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-5">
              <h3 className="font-semibold text-violet-300 mb-2">Winner Selected</h3>
              <p className="text-sm text-white/60">
                Paid <span className="text-emerald-400">${(bounty.winnerPaidMicro / 1_000_000).toFixed(4)} USDC</span> to {bounty.winnerWallet.slice(0, 8)}…
              </p>
              {bounty.winnerTxHash && (
                <a href={`https://testnet.arcscan.app/tx/${bounty.winnerTxHash}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-violet-400 hover:text-violet-300 mt-2 block">
                  View on ArcScan →
                </a>
              )}
            </div>
          )}

          {/* Eval result flash */}
          {evalResult && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
              <h3 className="font-semibold text-emerald-300 mb-1">Evaluation complete!</h3>
              <p className="text-sm text-white/60">
                Winner: <span className="text-white">{evalResult.winner.creatorName}</span> — paid ${(evalResult.winner.paidMicro / 1_000_000).toFixed(4)} USDC
              </p>
              {evalResult.knowledgeSourceId && (
                <Link href={`/knowledge/${evalResult.knowledgeSourceId}`}
                  className="text-sm text-violet-400 hover:text-violet-300 mt-2 block">
                  Winning answer registered as citable source →
                </Link>
              )}
            </div>
          )}

          {/* Submissions */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">
              {submissions.length} Submission{submissions.length !== 1 ? "s" : ""}
            </h2>
            {submissions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-8 text-center">
                <p className="text-white/30 text-sm">No submissions yet. Be the first!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {submissions.map((s) => {
                  const isWinner = s.id === bounty.winningSubmissionId;
                  return (
                    <div key={s.id} className={`rounded-xl border p-5 ${
                      isWinner ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/10 bg-white/[0.02]"
                    }`}>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <span className="font-medium text-white/90">{s.creatorName}</span>
                          {s.creatorHandle && <span className="text-xs text-white/40 ml-2">{s.creatorHandle}</span>}
                          {isWinner && <span className="ml-2 px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Winner</span>}
                        </div>
                        {s.evaluationScore !== null && (
                          <span className="text-sm font-bold text-white/70">{s.evaluationScore}/100</span>
                        )}
                      </div>
                      <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">{s.content}</p>
                      {s.evaluationReason && (
                        <p className="text-xs text-white/40 mt-3 italic">{s.evaluationReason}</p>
                      )}
                      <p className="text-xs text-white/30 mt-2">{new Date(s.createdAt).toLocaleString()}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Evaluate button (agent only) */}
          {!isClosed && submissions.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-amber-300">Ready to evaluate?</p>
                <p className="text-xs text-white/40">Claude will score all submissions and pay the winner in USDC</p>
              </div>
              <button onClick={handleEvaluate} disabled={evaluating}
                className="px-5 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap">
                {evaluating ? "Evaluating…" : "Evaluate & Pay →"}
              </button>
            </div>
          )}
        </div>

        {/* Right: submit form */}
        <div className="lg:col-span-1">
          <div className="sticky top-6">
            {isOpen && !submitted ? (
              <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
                <h3 className="font-semibold text-white mb-1">Submit Your Answer</h3>
                <p className="text-xs text-white/40 mb-3">Win <span className="text-emerald-400">${budget} USDC</span> if selected</p>
                <div>
                  <label className="text-xs text-white/50 mb-1 block" htmlFor="s-name">Your name</label>
                  <input id="s-name" value={creatorName} onChange={(e) => setCreatorName(e.target.value)} required
                    placeholder="Abiola Adewale"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30" />
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1 block" htmlFor="s-handle">Handle (optional)</label>
                  <input id="s-handle" value={creatorHandle} onChange={(e) => setCreatorHandle(e.target.value)}
                    placeholder="@yourhandle"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30" />
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1 block" htmlFor="s-wallet">Arc wallet (to receive USDC)</label>
                  <input id="s-wallet" value={creatorWallet} onChange={(e) => setCreatorWallet(e.target.value)} required
                    placeholder="0x…"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30 font-mono text-xs" />
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1 block" htmlFor="s-content">Your answer</label>
                  <textarea id="s-content" value={content} onChange={(e) => setContent(e.target.value)} required rows={6} minLength={50}
                    placeholder="Write your researched answer here. Be specific, accurate, and clear…"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30 resize-none" />
                  <p className="text-xs text-white/30 mt-1">{content.length} chars (min 50)</p>
                </div>
                {submitError && <p className="text-red-400 text-xs">{submitError}</p>}
                <button type="submit" disabled={submitting}
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {submitting ? "Submitting…" : "Submit Answer →"}
                </button>
              </form>
            ) : submitted ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
                <div className="text-2xl mb-2">✓</div>
                <h3 className="font-semibold text-emerald-300 mb-1">Submitted!</h3>
                <p className="text-xs text-white/40">Your answer is in. Good luck!</p>
              </div>
            ) : isClosed ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
                <h3 className="font-semibold text-white/50 mb-1">Bounty Closed</h3>
                <p className="text-xs text-white/30 mb-4">This bounty has been evaluated.</p>
                <Link href="/bounties" className="text-sm text-violet-400 hover:text-violet-300">
                  View open bounties →
                </Link>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
                <h3 className="font-semibold text-yellow-300 mb-1">Deadline Passed</h3>
                <p className="text-xs text-white/30">No more submissions accepted.</p>
              </div>
            )}

            {/* Info */}
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2 text-xs text-white/40">
              <div className="flex justify-between"><span>Budget</span><span className="text-emerald-400">${budget} USDC</span></div>
              <div className="flex justify-between"><span>Submissions</span><span>{submissions.length}</span></div>
              <div className="flex justify-between"><span>Deadline</span><span>{deadline.toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span>Evaluator</span><span>Claude Haiku</span></div>
              <div className="flex justify-between"><span>Network</span><span>Arc Testnet</span></div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
