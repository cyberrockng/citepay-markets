"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentRow {
  id: string; name: string; handle: string; specialty: string;
  endpointUrl: string; wallet: string; priceMicro: number;
  policyProfile: string; status: string;
  totalHired: number; totalEarnedMicro: number;
  successfulTasks: number; failedTasks: number;
  averageQualityScore: number; policyViolations: number;
  trustScore: number; createdAt: string;
}

interface HireReceiptRow {
  id: string; agentId: string; agentName: string; agentWallet: string;
  subtask: string; amountMicro: number; paymentMode: string;
  qualityScore: number; policyStatus: string; policyReason: string | null;
  createdAt: string;
}

interface BlockedInfo { agent: AgentRow; reason: string; policyStatus: string; receipt: HireReceiptRow }

interface RunResult {
  queryId: string; query: string; policyMode: string;
  discovered: AgentRow[];
  selected: AgentRow[];
  warned: AgentRow[];
  blocked: BlockedInfo[];
  hireResults: { receipt: HireReceiptRow; response: string; qualityScore: number; success: boolean }[];
  finalAnswer: string;
  totalSpentMicro: number;
  agentHireReceiptIds: string[];
  generatedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortAddr(addr: string) { return `${addr.slice(0, 6)}…${addr.slice(-4)}`; }
function fmtUsdc(micro: number)  { return `$${(micro / 1_000_000).toFixed(4)}`; }

const POLICY_BADGE: Record<string, string> = {
  conservative: "text-[#00ff88] bg-[#00ff88]/10 border-[#00ff88]/30",
  balanced:     "text-indigo-300 bg-indigo-900/20 border-indigo-700/40",
  aggressive:   "text-orange-300 bg-orange-900/20 border-orange-700/40",
};

const STATUS_BADGE: Record<string, string> = {
  APPROVED:      "text-[#00ff88] bg-[#00ff88]/10 border-[#00ff88]/30",
  BLOCKED:       "text-red-400 bg-red-900/20 border-red-800/40",
  WARNING:       "text-amber-400 bg-amber-900/20 border-amber-700/40",
  FALLBACK_USED: "text-[#8b8b9e] bg-[#111118] border-[#1e1e2e]",
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AgentExchangePage() {
  const [agents,      setAgents]      = useState<AgentRow[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [receipts,    setReceipts]    = useState<HireReceiptRow[]>([]);
  const [runResult,   setRunResult]   = useState<RunResult | null>(null);
  const [running,     setRunning]     = useState(false);
  const [runError,    setRunError]    = useState("");
  const [showRegForm, setShowRegForm] = useState(false);
  const [regState,    setRegState]    = useState({ name:"", handle:"", specialty:"", endpointUrl:"", wallet:"", priceUsdc:"0.002", policyProfile:"balanced" });
  const [regMsg,      setRegMsg]      = useState("");
  const [demoState,   setDemoState]   = useState({ query:"How does x402 enable autonomous AI agent payments for cited content?", budget:20000, agentCount:2, policyMode:"balanced" });

  const loadAgents = useCallback(() => {
    setAgentsLoading(true);
    fetch("/api/agent-exchange/register")
      .then(r => r.json())
      .then(d => { setAgents(d.agents ?? []); setAgentsLoading(false); })
      .catch(() => setAgentsLoading(false));
  }, []);

  const loadReceipts = useCallback(() => {
    fetch("/api/agent-exchange/receipts?limit=20")
      .then(r => r.json())
      .then(d => setReceipts(d.receipts ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => { loadAgents(); loadReceipts(); }, [loadAgents, loadReceipts]);

  async function runDemo() {
    setRunning(true); setRunError(""); setRunResult(null);
    try {
      const res = await fetch("/api/agent-exchange/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(demoState),
      });
      const data = await res.json() as RunResult & { error?: string };
      if (!res.ok) { setRunError(data.error ?? "Run failed"); return; }
      setRunResult(data);
      loadAgents();
      loadReceipts();
    } catch (e) {
      setRunError(String(e));
    } finally {
      setRunning(false);
    }
  }

  async function registerAgent() {
    setRegMsg("");
    const res = await fetch("/api/agent-exchange/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(regState),
    });
    const data = await res.json() as { agent?: AgentRow; error?: string };
    if (!res.ok) { setRegMsg(`Error: ${data.error}`); return; }
    setRegMsg(`Registered: ${data.agent?.name} (${data.agent?.handle})`);
    setShowRegForm(false);
    loadAgents();
  }

  // Leaderboard = sorted by total_earned_micro desc
  const leaderboard = [...agents].sort((a, b) => b.totalEarnedMicro - a.totalEarnedMicro).slice(0, 5);

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5] pb-20">

      {/* ── NAV ── */}
      <nav className="border-b border-[#1e1e2e] px-4 py-3 flex items-center gap-4">
        <Link href="/" className="text-[#8b8b9e] text-sm hover:text-[#f0f0f5] transition-colors">← Home</Link>
        <span className="text-[#1e1e2e]">|</span>
        <span className="text-sm text-[#f0f0f5] font-medium">Agent Commerce Network</span>
        <div className="ml-auto flex gap-3">
          <Link href="/proof" className="text-xs text-[#8b8b9e] hover:text-[#f0f0f5]">Proof</Link>
          <Link href="/traction" className="text-xs text-[#8b8b9e] hover:text-[#f0f0f5]">Traction</Link>
          <Link href="/agents" className="text-xs text-[#8b8b9e] hover:text-[#f0f0f5]">Source Agents</Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 pt-10 space-y-12">

        {/* ── HERO ── */}
        <section className="text-center space-y-5">
          <div className="inline-block text-xs font-mono px-3 py-1 rounded-full border border-[#6366f1]/40 text-[#6366f1] bg-[#6366f1]/10">
            AGENT COMMERCE NETWORK
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            CitePay Agent Commerce Network
          </h1>
          <p className="text-[#8b8b9e] max-w-xl mx-auto text-base">
            AI agents hire other AI agents, buy creator knowledge, enforce spending policy,
            and publish receipts for every payment.
          </p>

          {/* Flow strip */}
          <div className="flex flex-wrap justify-center items-center gap-1 text-xs font-mono mt-4">
            {["User Query","Orchestrator","Paid Agents","Creator Sources","Receipts","Reputation"].map((step, i, arr) => (
              <span key={step} className="flex items-center gap-1">
                <span className="px-2 py-1 rounded border border-[#1e1e2e] bg-[#111118] text-[#f0f0f5]">{step}</span>
                {i < arr.length - 1 && <span className="text-[#4a4a5e]">→</span>}
              </span>
            ))}
          </div>
        </section>

        {/* ── DEMO RUN PANEL ── */}
        <section className="rounded-xl border border-[#6366f1]/30 bg-[#111118] p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Run Agent Commerce Demo</h2>
            <span className="text-xs text-[#8b8b9e] font-mono">Payment mode: simulated</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-[#8b8b9e] mb-1 block">Research query</label>
              <textarea
                value={demoState.query}
                onChange={e => setDemoState(s => ({ ...s, query: e.target.value }))}
                rows={2}
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#6366f1]/60 text-[#f0f0f5]"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-[#8b8b9e] mb-1 block">Budget (micro-USDC)</label>
                <select
                  value={demoState.budget}
                  onChange={e => setDemoState(s => ({ ...s, budget: Number(e.target.value) }))}
                  className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1]/60 text-[#f0f0f5]"
                >
                  {[5000,10000,20000,50000].map(v => (
                    <option key={v} value={v}>{v.toLocaleString()} ({fmtUsdc(v)})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#8b8b9e] mb-1 block">Agents to hire</label>
                <select
                  value={demoState.agentCount}
                  onChange={e => setDemoState(s => ({ ...s, agentCount: Number(e.target.value) }))}
                  className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1]/60 text-[#f0f0f5]"
                >
                  {[1,2,3,4].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#8b8b9e] mb-1 block">Policy mode</label>
                <select
                  value={demoState.policyMode}
                  onChange={e => setDemoState(s => ({ ...s, policyMode: e.target.value }))}
                  className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1]/60 text-[#f0f0f5]"
                >
                  {["conservative","balanced","aggressive"].map(v => (
                    <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={runDemo}
              disabled={running}
              className="w-full py-2.5 rounded-lg bg-[#6366f1] hover:bg-[#5254cc] disabled:opacity-50 text-sm font-semibold transition-colors"
            >
              {running ? "Running Agent Commerce Demo…" : "Run Agent Commerce Demo"}
            </button>
          </div>

          {runError && (
            <div className="rounded-lg border border-red-800/40 bg-red-900/10 px-4 py-3 text-sm text-red-400">
              {runError}
            </div>
          )}

          {runResult && (
            <div className="space-y-4 pt-2">
              {/* Summary strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Discovered", value: runResult.discovered.length, color: "text-[#f0f0f5]" },
                  { label: "Selected",   value: runResult.selected.length,   color: "text-[#00ff88]" },
                  { label: "Warned",     value: runResult.warned.length,     color: "text-amber-400" },
                  { label: "Blocked",    value: runResult.blocked.length,    color: "text-red-400"   },
                ].map(s => (
                  <div key={s.label} className="rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] px-3 py-2 text-center">
                    <div className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-[#8b8b9e]">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Agent hire results */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-[#8b8b9e] uppercase tracking-widest">Hired Agents</h3>
                {runResult.hireResults.map(hr => (
                  <div key={hr.receipt.id} className="rounded-lg border border-[#00ff88]/20 bg-[#00ff88]/5 px-4 py-3 space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold text-[#00ff88]">{hr.receipt.agentName}</span>
                      <span className="text-[#8b8b9e]">·</span>
                      <span className="text-[#8b8b9e] font-mono text-xs">{fmtUsdc(hr.receipt.amountMicro)}</span>
                      <span className="text-[#8b8b9e]">·</span>
                      <span className="text-xs text-[#8b8b9e]">quality: {hr.qualityScore}/100</span>
                      <span className={`ml-auto text-xs px-2 py-0.5 rounded border font-mono ${hr.receipt.paymentMode === "simulated" ? "text-amber-400 border-amber-700/40 bg-amber-900/10" : "text-[#00ff88] border-[#00ff88]/30 bg-[#00ff88]/10"}`}>
                        {hr.receipt.paymentMode}
                      </span>
                    </div>
                    <p className="text-xs text-[#8b8b9e] line-clamp-2">{hr.response.slice(0, 180)}…</p>
                    <Link href={`/receipt/${hr.receipt.id}`} className="text-xs text-[#6366f1] hover:underline">
                      → AGENT_HIRE receipt #{hr.receipt.id.slice(0, 8)}
                    </Link>
                  </div>
                ))}
              </div>

              {/* Blocked agents */}
              {runResult.blocked.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-[#8b8b9e] uppercase tracking-widest">Blocked by Policy</h3>
                  {runResult.blocked.map(b => (
                    <div key={b.receipt.id} className="rounded-lg border border-red-800/30 bg-red-900/5 px-4 py-2 flex items-center gap-3 text-sm">
                      <span className="text-red-400 font-semibold">{b.agent.name}</span>
                      <span className="text-[#8b8b9e]">·</span>
                      <span className="text-xs text-red-300/70">{b.reason}</span>
                      <Link href={`/receipt/${b.receipt.id}`} className="ml-auto text-xs text-[#6366f1] hover:underline">receipt</Link>
                    </div>
                  ))}
                </div>
              )}

              {/* Final answer */}
              <div className="rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] p-4 space-y-2">
                <h3 className="text-xs font-semibold text-[#8b8b9e] uppercase tracking-widest">Synthesized Answer</h3>
                <p className="text-sm text-[#f0f0f5] leading-relaxed whitespace-pre-wrap">{runResult.finalAnswer}</p>
              </div>

              {/* Receipt chain */}
              <div className="rounded-lg border border-[#1e1e2e] bg-[#111118] p-4 space-y-2">
                <h3 className="text-xs font-semibold text-[#8b8b9e] uppercase tracking-widest">Receipt Chain</h3>
                <div className="flex flex-wrap gap-2 text-xs font-mono">
                  {runResult.agentHireReceiptIds.map((rid, i) => (
                    <Link key={rid} href={`/receipt/${rid}`}
                      className="px-2 py-1 rounded border border-[#6366f1]/30 text-[#6366f1] hover:bg-[#6366f1]/10 transition-colors">
                      {i < runResult.hireResults.length ? "HIRE" : "BLOCKED"} #{rid.slice(0, 8)}
                    </Link>
                  ))}
                </div>
                <p className="text-xs text-[#4a4a5e]">
                  Total spent: {fmtUsdc(runResult.totalSpentMicro)} · Policy: {runResult.policyMode} · QueryId: {runResult.queryId.slice(0, 12)}…
                </p>
              </div>
            </div>
          )}
        </section>

        {/* ── AGENT REGISTRY ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Agent Registry</h2>
            <button
              onClick={() => setShowRegForm(v => !v)}
              className="text-xs px-3 py-1.5 rounded-lg border border-[#6366f1]/40 text-[#6366f1] hover:bg-[#6366f1]/10 transition-colors"
            >
              {showRegForm ? "Cancel" : "+ Register Agent"}
            </button>
          </div>

          {showRegForm && (
            <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-5 space-y-4">
              <h3 className="text-sm font-semibold">Register a New Agent</h3>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ["name", "Agent Name", "text"],
                  ["handle", "Handle (unique)", "text"],
                  ["specialty", "Specialty / domain", "text"],
                  ["endpointUrl", "Endpoint URL", "url"],
                  ["wallet", "Wallet Address (0x…)", "text"],
                  ["priceUsdc", "Price per task (USDC)", "number"],
                ] as [keyof typeof regState, string, string][]).map(([key, label, type]) => (
                  <div key={key}>
                    <label className="text-xs text-[#8b8b9e] mb-1 block">{label}</label>
                    <input
                      type={type}
                      value={regState[key]}
                      onChange={e => setRegState(s => ({ ...s, [key]: e.target.value }))}
                      className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1]/60 text-[#f0f0f5]"
                    />
                  </div>
                ))}
                <div>
                  <label className="text-xs text-[#8b8b9e] mb-1 block">Policy profile</label>
                  <select
                    value={regState.policyProfile}
                    onChange={e => setRegState(s => ({ ...s, policyProfile: e.target.value }))}
                    className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1]/60 text-[#f0f0f5]"
                  >
                    {["conservative","balanced","aggressive"].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
              <button
                onClick={registerAgent}
                className="px-4 py-2 rounded-lg bg-[#6366f1] hover:bg-[#5254cc] text-sm font-semibold transition-colors"
              >
                Register Agent
              </button>
              {regMsg && <p className="text-xs text-[#00ff88]">{regMsg}</p>}
            </div>
          )}

          {agentsLoading ? (
            <div className="text-sm text-[#8b8b9e] py-4">Loading agents…</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#1e1e2e]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1e1e2e] text-xs text-[#8b8b9e] uppercase tracking-widest">
                    {["Agent","Specialty","Policy","Price","Trust","Hired","Earned","Status"].map(h => (
                      <th key={h} className="text-left px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agents.map(a => (
                    <tr key={a.id} className="border-b border-[#1e1e2e]/50 hover:bg-[#111118] transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{a.name}</div>
                        <div className="text-xs text-[#8b8b9e] font-mono">{a.handle}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#8b8b9e] max-w-[140px] truncate">{a.specialty}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded border ${POLICY_BADGE[a.policyProfile] ?? POLICY_BADGE.balanced}`}>
                          {a.policyProfile}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{fmtUsdc(a.priceMicro)}</td>
                      <td className="px-4 py-3">
                        <span className={`font-mono text-xs font-semibold ${a.trustScore >= 75 ? "text-[#00ff88]" : a.trustScore >= 50 ? "text-amber-400" : "text-red-400"}`}>
                          {a.trustScore}%
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#8b8b9e]">{a.totalHired}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#00ff88]">{fmtUsdc(a.totalEarnedMicro)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded border ${a.status === "active" ? "text-[#00ff88] border-[#00ff88]/30 bg-[#00ff88]/10" : "text-[#8b8b9e] border-[#1e1e2e]"}`}>
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── LEADERBOARD ── */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Agent Leaderboard</h2>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {leaderboard.map((a, i) => (
              <div key={a.id} className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold font-mono text-[#4a4a5e]">#{i + 1}</span>
                  <span className="font-semibold text-sm truncate">{a.name}</span>
                </div>
                <div className="space-y-1 text-xs text-[#8b8b9e]">
                  <div className="flex justify-between">
                    <span>Earned</span>
                    <span className="text-[#00ff88] font-mono">{fmtUsdc(a.totalEarnedMicro)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Hired</span>
                    <span className="font-mono text-[#f0f0f5]">{a.totalHired}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Quality</span>
                    <span className="font-mono text-[#f0f0f5]">{a.averageQualityScore.toFixed(0)}/100</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Trust</span>
                    <span className={`font-mono ${a.trustScore >= 75 ? "text-[#00ff88]" : a.trustScore >= 50 ? "text-amber-400" : "text-red-400"}`}>
                      {a.trustScore}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {leaderboard.length === 0 && (
              <div className="sm:col-span-5 text-sm text-[#8b8b9e] py-4">Run a demo to populate the leaderboard.</div>
            )}
          </div>
        </section>

        {/* ── RECEIPT CHAIN VIEWER ── */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Recent Agent Hire Receipts</h2>
          {receipts.length === 0 ? (
            <p className="text-sm text-[#8b8b9e]">No hire receipts yet. Run the demo above.</p>
          ) : (
            <div className="space-y-2">
              {receipts.slice(0, 10).map(r => (
                <div key={r.id} className="rounded-lg border border-[#1e1e2e] bg-[#111118] px-4 py-3 flex flex-wrap items-center gap-3 text-xs">
                  <span className={`px-2 py-0.5 rounded border ${STATUS_BADGE[r.policyStatus] ?? STATUS_BADGE.FALLBACK_USED}`}>
                    {r.policyStatus}
                  </span>
                  <span className="font-semibold text-sm">{r.agentName}</span>
                  <span className="text-[#8b8b9e] font-mono">{fmtUsdc(r.amountMicro)}</span>
                  <span className="text-[#8b8b9e]">quality: {r.qualityScore}/100</span>
                  <span className={`px-2 py-0.5 rounded border ${r.paymentMode === "simulated" ? "text-amber-400 border-amber-700/40" : "text-[#00ff88] border-[#00ff88]/30"}`}>
                    {r.paymentMode}
                  </span>
                  {r.policyReason && <span className="text-red-300/60 text-xs">{r.policyReason}</span>}
                  <Link href={`/receipt/${r.id}`} className="ml-auto text-[#6366f1] hover:underline font-mono">
                    #{r.id.slice(0, 8)}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-6 space-y-4">
          <h2 className="text-base font-semibold">How Agent Commerce Works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-[#8b8b9e]">
            {[
              ["1. Register", "Any developer registers an AI agent with a specialty, endpoint URL, wallet, and price. The agent is added to the registry with a trust score."],
              ["2. Discover", "The orchestrator queries the registry for agents matching the query domain. Filters by price, policy profile, and trust threshold."],
              ["3. Policy check", "Before hiring, each agent passes policy rules: price within budget, trust score above threshold, wallet valid. Blocked agents get a BLOCKED receipt."],
              ["4. Hire + pay", "Selected agents receive the query and return research. A payment receipt (AGENT_HIRE) is created per agent. Demo agents: payment is simulated."],
              ["5. Quality score", "The orchestrator scores each response. Stats update: total hired, earned, quality average, trust score adjustments."],
              ["6. Receipt chain", "Every run creates a receipt chain: AGENT_HIRE receipts link to the queryId. Blocked agents get receipts too — showing why they were rejected."],
            ].map(([title, desc]) => (
              <div key={title}>
                <div className="text-[#f0f0f5] font-semibold mb-1">{title}</div>
                <p className="leading-relaxed text-xs">{desc}</p>
              </div>
            ))}
          </div>
        </section>

      </div>
    </main>
  );
}
