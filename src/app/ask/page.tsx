"use client";
import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAccount, useConnect, useDisconnect, useSignMessage } from "wagmi";
import { injected } from "@wagmi/connectors";
import { SiweMessage } from "siwe";
import { decisionStyle } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { POLICY_PRESETS, type AgentPolicy } from "@/lib/policy";
import { arcTestnet } from "@/lib/wagmi";

type Step = "idle" | "waiting_payment" | "running" | "done" | "error";
type WalletStep = "disconnected" | "connected" | "siwe_pending" | "authed" | "funding" | "funded" | "circle_creating" | "circle_ready";
type WalletMode = "eoa" | "circle";

const CIRCLE_SESSION_KEY = "citepay-circle-session";
interface StoredCircleSession {
  walletId:    string;
  address:     string;
  createdAt:   number;
  queriesMax:  number;
}

interface TraceEntry {
  id: number;
  icon: string;
  text: string;
  sub?: string;
  badge?: string;
  badgeClass?: string;
  elapsed: number;
}

interface SourceStatus {
  title: string;
  state: "waiting" | "scoring" | "settled";
  decision?: string;
  score?: number;
  amountPaid?: number;
  memoryCached?: boolean;
}

interface QueryDecision {
  receiptId: string;
  decision: string;
  source: string;
  url: string;
  scores: { relevance: number; price: number; bond: number; reputation: number; total: number };
  reason: string;
  amountPaid: number;
  sourcePrice: number;
  contributionWeight: number | null;
  txHash: string | null;
  evidenceHash: string;
  receiptUrl: string;
  policyProfile: string;
  policyRulesPassed: string[];
  policyRulesFailed: string[];
  policyReason: string | null;
  sufficiencyStop: boolean;
}

interface QueryResult {
  queryId: string;
  answer: string;
  decisions: QueryDecision[];
  totalPaid: number;
  queryFee: number;
  policyProfile: string;
  stoppedEarly: boolean;
}

const DECISION_BADGE: Record<string, string> = {
  PAY:               "border-[#34D399]/60 text-[#34D399] bg-[#34D399]/10",
  REFUSE:            "border-red-600/50 text-red-400 bg-red-900/10",
  SKIP:              "border-[#3e3e4e] text-[#8b8b9e]",
  BLOCKED_BY_POLICY: "border-orange-600/50 text-orange-400 bg-orange-900/10",
  STOP:              "border-amber-600/40 text-amber-400 bg-amber-900/10",
};

const POLICY_OPTIONS = [
  { key: "conservative", label: "Conservative", desc: "Bonded only · max $0.002 · relevance ≥ 70 · stops at 2 citations", color: "border-yellow-600/40 text-yellow-400", active: "border-yellow-500 bg-yellow-900/20" },
  { key: "balanced",     label: "Balanced",     desc: "Default · max $0.005 · relevance ≥ 40 · stops at 3 citations",    color: "border-[#6366f1]/40 text-[#6366f1]", active: "border-[#6366f1] bg-[#6366f1]/10" },
  { key: "aggressive",   label: "Aggressive",   desc: "Higher spend · max $0.01 · relevance ≥ 20 · stops at 5 citations", color: "border-[#34D399]/30 text-[#34D399]", active: "border-[#34D399] bg-[#34D399]/10" },
] as const;

function PaymentFlowVisualizer({ step, traces, sourceGrid }: {
  step: Step;
  traces: TraceEntry[];
  sourceGrid: SourceStatus[];
}) {
  const traceText = traces.map(t => (t.text + " " + (t.sub ?? "")).toLowerCase()).join(" ");
  const stages = [
    {
      id: 1, label: "x402 Gate", sub: "402 → verify",
      done: step === "running" || step === "done",
      active: step === "waiting_payment",
    },
    {
      id: 2, label: "Pay Query", sub: "Circle Gateway",
      done: step === "running" || step === "done",
      active: traceText.includes("gateway") || traceText.includes("payment") || traceText.includes("signing"),
    },
    {
      id: 3, label: "Score Sources", sub: "AI evaluates",
      done: step === "done" || (step === "running" && sourceGrid.some(s => s.state === "settled")),
      active: step === "running" && sourceGrid.some(s => s.state === "scoring"),
    },
    {
      id: 4, label: "Pay Creators", sub: "USDC on-chain",
      done: step === "done" && sourceGrid.some(s => s.decision === "PAY"),
      active: step === "running" && (traceText.includes("pay") || sourceGrid.some(s => s.decision === "PAY")),
    },
    {
      id: 5, label: "Anchor", sub: "CitePayMarket.sol",
      done: step === "done",
      active: traceText.includes("anchor") || traceText.includes("on-chain"),
    },
  ];
  return (
    <div className="bg-[#0a0a10] rounded-xl border border-[#1e1e2e] p-4 mb-4">
      <div className="text-[10px] font-mono text-[#4a4a5e] mb-3">PAYMENT FLOW — LIVE</div>
      <div className="flex items-start gap-0">
        {stages.map((s, i) => {
          const cls = s.done
            ? "border-[#34D399] text-[#34D399] bg-[#34D399]/10"
            : s.active
            ? "border-[#6366f1] text-[#6366f1] bg-[#6366f1]/10 animate-pulse"
            : "border-[#1e1e2e] text-[#4a4a5e] bg-[#0a0a0f]";
          return (
            <div key={s.id} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center min-w-0 flex-shrink-0">
                <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-mono font-bold ${cls}`}>
                  {s.done ? "✓" : s.id}
                </div>
                <div className="text-[9px] font-mono text-center mt-1 leading-tight px-0.5">
                  <div className={s.done ? "text-[#34D399]" : s.active ? "text-[#6366f1]" : "text-[#4a4a5e]"}>{s.label}</div>
                  <div className="text-[#2e2e3e]">{s.sub}</div>
                </div>
              </div>
              {i < stages.length - 1 && (
                <div className={`h-0.5 flex-1 mx-1 rounded transition-colors duration-700 ${s.done ? "bg-[#34D399]" : "bg-[#1e1e2e]"}`} style={{ marginTop: "-14px" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatPolicyRule(rule: string): string {
  const map: Record<string, string> = {
    "min_relevance_not_met": "low relevance",
    "price_within_max":      "price too high",
    "spend_cap_ok":          "budget cap reached",
    "bonded_ok":             "unbonded source",
    "on_chain_anchor_ok":    "not on-chain",
  };
  return map[rule] ?? rule.replace(/_/g, " ");
}

export default function AskPage() {
  return <Suspense><AskPageContent /></Suspense>;
}

function AskPageContent() {
  const searchParams = useSearchParams();
  const [query, setQuery]         = useState(() => searchParams.get("query") ?? "");
  const [budget, setBudget]       = useState("0.05");
  const [policyKey, setPolicyKey] = useState<"conservative" | "balanced" | "aggressive">("balanced");
  const [step, setStep]           = useState<Step>("idle");
  const [result, setResult]       = useState<QueryResult | null>(null);
  const [error, setError]         = useState("");
  const [traces, setTraces]       = useState<TraceEntry[]>([]);
  const [sourceGrid, setSourceGrid] = useState<SourceStatus[]>([]);

  // Circle Wallet — independent of MetaMask, persisted in localStorage
  const [circleReady, setCircleReady]         = useState(false);
  const [circleCreating, setCircleCreating]   = useState(false);
  const [circleWalletId, setCircleWalletId]   = useState<string | null>(null);
  const [circleWalletAddress, setCircleWalletAddress] = useState<string | null>(null);
  const [circleBalance, setCircleBalance]     = useState<number | null>(null);
  const [circleError, setCircleError]         = useState("");

  // MetaMask / EOA wallet state (advanced mode)
  const [walletStep, setWalletStep]       = useState<WalletStep>("disconnected");
  const [walletMode, setWalletMode]       = useState<WalletMode>("circle");
  const [siweAddress, setSiweAddress]     = useState<string | null>(null);
  const [sessionKey, setSessionKey]       = useState<`0x${string}` | null>(null);
  const [walletError, setWalletError]     = useState("");

  const consoleRef = useRef<HTMLDivElement>(null);
  const traceIdRef = useRef(0);
  const startMsRef = useRef(0);

  const { address, isConnected, chain } = useAccount();
  const { connectAsync }                = useConnect();
  const { disconnectAsync }             = useDisconnect();
  const { signMessageAsync }            = useSignMessage();

  const isActive      = step !== "idle" && step !== "error" && step !== "done";
  const policy: AgentPolicy = POLICY_PRESETS[policyKey];
  const circlePaymentReady = walletStep === "circle_ready" && circleWalletId !== null && circleWalletAddress !== null && siweAddress !== null;
  const eoaPaymentReady = walletStep === "funded" && sessionKey !== null;
  const useWalletMode = eoaPaymentReady || circlePaymentReady;
  const circleNeedsSignIn = circleReady && !circlePaymentReady;
  const canSubmit = query.trim() !== "" && !isActive && !circleNeedsSignIn;

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!isConnected && walletStep !== "disconnected") {
      setWalletStep("disconnected");
      setSiweAddress(null);
      setSessionKey(null);
    } else if (isConnected && walletStep === "disconnected") {
      setWalletStep("connected");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isConnected, walletStep]);

  // Restore Circle session from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CIRCLE_SESSION_KEY);
      if (!raw) return;
      const s: StoredCircleSession = JSON.parse(raw);
      const age = Date.now() - s.createdAt;
      if (age > 24 * 60 * 60 * 1000) { localStorage.removeItem(CIRCLE_SESSION_KEY); return; }
      /* eslint-disable react-hooks/set-state-in-effect */
      setCircleWalletId(s.walletId);
      setCircleWalletAddress(s.address);
      setCircleReady(true);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch { /* ignore */ }
  }, []);

  // Poll Circle session balance every 8s when active
  useEffect(() => {
    if (!circleReady || !circleWalletAddress) return;
    let cancelled = false;
    async function poll() {
      if (cancelled) return;
      try {
        const r = await fetch(`/api/auth/circle-session?address=${circleWalletAddress}`).then(x => x.json());
        if (!cancelled) setCircleBalance(r.balanceMicro ?? null);
      } catch { /* ignore */ }
    }
    poll();
    const id = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(id); };
  }, [circleReady, circleWalletAddress]);

  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [traces]);

  function addTrace(entry: Omit<TraceEntry, "id" | "elapsed">) {
    setTraces((t) => [...t, { ...entry, id: traceIdRef.current++, elapsed: Date.now() - startMsRef.current }]);
  }

  // ── Wallet actions ────────────────────────────────────────────────────────

  async function handleConnect() {
    setWalletError("");
    try {
      await connectAsync({ connector: injected() });
      setWalletStep("connected");
    } catch (err) { setWalletError(String(err)); }
  }

  async function handleSIWE() {
    if (!address) return;
    setWalletError("");
    setWalletStep("siwe_pending");
    try {
      const { nonce, sessionId } = await fetch("/api/auth/nonce").then((r) => r.json());
      const siweMsg = new SiweMessage({
        domain:    window.location.host,
        address,
        statement: "Sign in to CitePay Markets to use non-custodial payments.",
        uri:       window.location.origin,
        version:   "1",
        chainId:   arcTestnet.id,
        nonce,
      });
      const message   = siweMsg.prepareMessage();
      const signature = await signMessageAsync({ message });
      const res = await fetch("/api/auth/siwe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature, sessionId }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error);
      setSiweAddress(res.address);
      setWalletStep("authed");
    } catch (err) {
      setWalletError(String(err));
      setWalletStep("connected");
    }
  }

  async function handleFundSession() {
    if (!siweAddress) return;
    setWalletError("");
    setWalletStep("funding");
    const { generatePrivateKey } = await import("viem/accounts");
    const key = generatePrivateKey();
    const { sessionEOAAddress } = await import("@/lib/x402-client");
    const sessAddr = sessionEOAAddress(key);
    try {
      const res = await fetch("/api/auth/fund-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionAddress: sessAddr, siweAddress }),
      }).then((r) => r.json());
      if (res.error && !res.alreadyFunded) throw new Error(res.error);
      setSessionKey(key);
      setWalletStep("funded");
    } catch (err) {
      setWalletError(String(err));
      setWalletStep("authed");
    }
  }

  // Direct Circle wallet — no MetaMask required
  async function handleCreateCircleWalletDirect() {
    setCircleError("");
    setCircleCreating(true);
    try {
      const res = await fetch("/api/auth/circle-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      const session: StoredCircleSession = {
        walletId:   res.walletId,
        address:    res.address,
        createdAt:  Date.now(),
        queriesMax: res.queriesMax ?? 5,
      };
      localStorage.setItem(CIRCLE_SESSION_KEY, JSON.stringify(session));
      setCircleWalletId(res.walletId);
      setCircleWalletAddress(res.address);
      setCircleReady(true);
    } catch (err) {
      setCircleError(String(err));
    } finally {
      setCircleCreating(false);
    }
  }

  function handleResetCircleWallet() {
    localStorage.removeItem(CIRCLE_SESSION_KEY);
    setCircleReady(false);
    setCircleWalletId(null);
    setCircleWalletAddress(null);
    setCircleBalance(null);
    setCircleError("");
  }

  // MetaMask-gated Circle wallet (legacy path — still works when connected)
  async function handleCreateCircleWallet() {
    if (!siweAddress) return;
    setWalletError("");
    setWalletStep("circle_creating");
    try {
      const res = await fetch("/api/auth/circle-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siweAddress }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      const session: StoredCircleSession = {
        walletId:   res.walletId,
        address:    res.address,
        createdAt:  Date.now(),
        queriesMax: res.queriesMax ?? 5,
      };
      localStorage.setItem(CIRCLE_SESSION_KEY, JSON.stringify(session));
      setCircleWalletId(res.walletId);
      setCircleWalletAddress(res.address);
      setCircleReady(true);
      setWalletStep("circle_ready");
    } catch (err) {
      setWalletError(String(err));
      setWalletStep("authed");
    }
  }

  async function handleDisconnect() {
    await disconnectAsync();
    setWalletStep("disconnected");
    setSiweAddress(null);
    setSessionKey(null);
    setCircleWalletId(null);
    setCircleWalletAddress(null);
  }

  // ── Stream event handler ──────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyStreamEvent(event: Record<string, any>) {
    const { type } = event;
    if (type === "payment_accepted") {
      addTrace({ icon: "✓", text: `Demo payment accepted · ${event.formatted} USDC via Circle Gateway`, badgeClass: "text-[#34D399]" });
    } else if (type === "scoring_start") {
      addTrace({ icon: "🔍", text: `Scoring ${event.total} sources with Claude Haiku…`, sub: `${event.policy} policy active` });
    } else if (type === "scoring_complete") {
      addTrace({ icon: "🔍", text: `Scoring complete · ${event.count} sources evaluated` });
    } else if (type === "decision") {
      const isSuffStop = event.sufficiencyStop;
      const badge      = isSuffStop ? "STOP" : event.decision === "BLOCKED_BY_POLICY" ? "BLOCKED" : event.decision;
      const badgeClass = DECISION_BADGE[isSuffStop ? "STOP" : event.decision] ?? DECISION_BADGE.SKIP;
      const policyNote = event.decision === "BLOCKED_BY_POLICY" && (event.policyRulesFailed as string[] | undefined)?.length
        ? `  blocked: ${formatPolicyRule((event.policyRulesFailed as string[])[0])}`
        : "";
      addTrace({ icon: event.decision === "PAY" ? "→" : isSuffStop ? "⚡" : "·", text: event.sourceTitle as string, sub: `rel ${event.relevance}  score ${event.score}  ${event.reason}${policyNote}`, badge, badgeClass });
      setSourceGrid((prev) => {
        const entry: SourceStatus = { title: event.sourceTitle as string, state: "settled", decision: event.decision as string, score: event.score as number, amountPaid: event.amountPaid as number, memoryCached: event.memoryCached as boolean | undefined };
        const existing = prev.findIndex((s) => s.title === event.sourceTitle);
        if (existing >= 0) { const n = [...prev]; n[existing] = entry; return n; }
        return [...prev.filter((s) => s.state === "scoring").slice(1), ...prev.filter((s) => s.state !== "scoring"), entry];
      });
    } else if (type === "weights") {
      const list = (event.weights as { sourceTitle: string; weight: number }[])
        .map((w) => `${w.sourceTitle.split(":")[0].trim()} ${(w.weight * 100).toFixed(0)}%`).join("  ·  ");
      addTrace({ icon: "⚖", text: "Contribution weights computed", sub: list, badgeClass: "text-[#a78bfa]" });
    } else if (type === "paying") {
      addTrace({ icon: "💸", text: `Paying ${event.sourceTitle}`, sub: `${event.formatted} USDC → creator wallet` });
    } else if (type === "paid") {
      addTrace({ icon: "✓", text: `Paid ${event.sourceTitle} · ${event.formatted} USDC`, sub: `${event.status === "confirmed" ? "✓ on-chain" : "⚠ simulated"}  tx ${(event.txHash as string).slice(0, 22)}…`, badgeClass: "text-[#34D399]" });
    } else if (type === "anchoring") {
      addTrace({ icon: "⛓", text: `Anchoring ${event.sourceTitle} on-chain…` });
    } else if (type === "anchored") {
      addTrace({ icon: "⛓", text: `Anchored · on-chain receipt #${event.onChainReceiptId}`, sub: `tx ${(event.anchorTxHash as string).slice(0, 22)}…`, badgeClass: "text-[#6366f1]" });
    } else if (type === "answer_generating") {
      addTrace({ icon: "✍", text: "Generating answer from cited sources…" });
    } else if (type === "done") {
      const d = event.decisions as QueryDecision[];
      const paid = d.filter((x) => x.decision === "PAY").length;
      addTrace({ icon: "✅", text: `Done · ${paid} cited · $${(event.totalPaid / 1_000_000).toFixed(4)} USDC routed`, sub: `PAY ${paid}  REFUSE ${d.filter((x) => x.decision === "REFUSE").length}  SKIP ${d.filter((x) => x.decision === "SKIP").length}${event.stoppedEarly ? "  ⚡ early stop" : ""}`, badgeClass: "text-[#34D399]" });
      setSourceGrid((prev) => prev.map((s) => s.state === "scoring" ? { ...s, state: "settled", title: "—" } : s));
      setResult(event as QueryResult);
      setStep("done");
    } else if (type === "error") {
      addTrace({ icon: "✗", text: event.message, badgeClass: "text-red-400" });
      setError(event.message);
      setStep("error");
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    if (circleNeedsSignIn) {
      const message = "Please complete wallet sign-in above first — no payment was attempted.";
      setError(message);
      setStep("error");
      return;
    }
    setResult(null); setError(""); setTraces([]); setSourceGrid([]);
    traceIdRef.current = 0;
    // eslint-disable-next-line react-hooks/purity
    startMsRef.current = Date.now();
    setStep("waiting_payment");
    if (circlePaymentReady && circleWalletId && circleWalletAddress && siweAddress) {
      await runCircleWalletMode(circleWalletId, circleWalletAddress, siweAddress);
    } else if (walletStep === "funded" && sessionKey) {
      await runWalletMode(sessionKey);
    } else {
      await runDemoMode();
    }
  }

  async function runCircleWalletMode(walletId: string, walletAddress: string, siweAddr: string) {
    // Step 1: Prove the 402 gate
    addTrace({ icon: "→", text: "POST /api/ask", sub: "no payment header — proving x402 gate" });
    const res1 = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, budget: parseFloat(budget), policy: policyKey }),
    });
    if (res1.status !== 402) { setStep("error"); setError(`Expected 402, got ${res1.status}`); return; }
    addTrace({ icon: "←", text: "402 Payment Required", sub: "x402 payment requirements received", badge: "402", badgeClass: "text-amber-400 border-amber-600/40 bg-amber-900/10" });

    // Step 2: Sign EIP-3009 via Circle DCW HSM — no browser key
    addTrace({ icon: "◈", text: "Requesting EIP-3009 signature from Circle Programmable Wallet…", sub: `DCW ${walletId.slice(0, 8)}… · HSM signs, no raw key in browser`, badgeClass: "text-[#a78bfa]" });
    let paymentSignature: string;
    try {
      const signRes = await fetch("/api/auth/sign-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletId, walletAddress, siweAddress: siweAddr }),
      }).then((r) => r.json());
      if (signRes.error) throw new Error(signRes.error);
      paymentSignature = signRes.paymentSignature;
    } catch {
      setStep("error");
      setError("Please complete wallet sign-in above first — no payment was attempted.");
      return;
    }
    addTrace({ icon: "✓", text: "EIP-3009 signed by Circle Programmable Wallet · sending to /api/ask…", sub: `Circle HSM · ${walletAddress.slice(0, 10)}… · no private key in browser`, badgeClass: "text-[#34D399]" });

    // Step 3: Submit with Circle-signed payment
    setStep("running");
    setSourceGrid(Array(8).fill(null).map(() => ({ title: "Evaluating...", state: "scoring" as const })));
    const res2 = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", "payment-signature": paymentSignature },
      body: JSON.stringify({ query, budget: parseFloat(budget), policy: policyKey }),
    });
    if (!res2.ok) {
      const err = await res2.json().catch(() => ({ error: `HTTP ${res2.status}` }));
      const msg = err.detail || err.error || `Payment failed (${res2.status})`;
      addTrace({ icon: "✗", text: msg, badgeClass: "text-red-400" });
      setStep("error"); setError(msg); return;
    }
    addTrace({ icon: "✓", text: "Circle Programmable Wallet payment settled · Circle Gateway · Arc Testnet", badgeClass: "text-[#34D399]" });
    addTrace({ icon: "✍", text: "Agent scoring + generating answer…" });

    const data: QueryResult = await res2.json();
    setSourceGrid(data.decisions.map((d) => ({ title: d.source, state: "settled" as const, decision: d.decision, score: d.scores.total, amountPaid: d.amountPaid })));
    data.decisions.forEach((d) => {
      const isSuffStop = d.sufficiencyStop;
      const badge      = isSuffStop ? "STOP" : d.decision === "BLOCKED_BY_POLICY" ? "BLOCKED" : d.decision;
      const badgeClass = DECISION_BADGE[isSuffStop ? "STOP" : d.decision] ?? DECISION_BADGE.SKIP;
      const policyNote = d.decision === "BLOCKED_BY_POLICY" && d.policyRulesFailed?.length
        ? `  blocked: ${formatPolicyRule(d.policyRulesFailed[0])}`
        : "";
      addTrace({ icon: d.decision === "PAY" ? "→" : isSuffStop ? "⚡" : "·", text: d.source, sub: `rel ${d.scores.relevance}  score ${d.scores.total}  ${d.reason}${policyNote}`, badge, badgeClass });
    });
    const paid = data.decisions.filter((x) => x.decision === "PAY").length;
    addTrace({ icon: "✅", text: `Done · ${paid} cited · $${(data.totalPaid / 1_000_000).toFixed(4)} USDC routed`, badgeClass: "text-[#34D399]" });
    setResult(data);
    setStep("done");
  }

  async function runWalletMode(key: `0x${string}`) {
    // Step 1: Hit /api/ask without payment to show the real 402 gate
    addTrace({ icon: "→", text: "POST /api/ask", sub: "no payment header — proving x402 gate" });
    const res1 = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, budget: parseFloat(budget), policy: policyKey }),
    });
    if (res1.status !== 402) { setStep("error"); setError(`Expected 402, got ${res1.status}`); return; }
    addTrace({ icon: "←", text: "402 Payment Required", sub: "x402 payment requirements received", badge: "402", badgeClass: "text-amber-400 border-amber-600/40 bg-amber-900/10" });

    // Step 2: Sign EIP-3009 with session EOA — entirely in browser
    addTrace({ icon: "🔑", text: "Signing EIP-3009 in browser with session EOA…", sub: "GatewayWalletBatched domain · no server key involved", badgeClass: "text-[#a78bfa]" });
    let paymentSig: string;
    try {
      const { signX402Payment } = await import("@/lib/x402-client");
      paymentSig = await signX402Payment(key);
    } catch (err) { setStep("error"); setError("Signing failed: " + String(err)); return; }
    addTrace({ icon: "✓", text: "Payment signed · sending payment-signature to /api/ask…", badgeClass: "text-[#34D399]" });

    // Step 3: Real /api/ask with payment-signature header
    setStep("running");
    setSourceGrid(Array(8).fill(null).map(() => ({ title: "Evaluating...", state: "scoring" as const })));
    const res2 = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", "payment-signature": paymentSig },
      body: JSON.stringify({ query, budget: parseFloat(budget), policy: policyKey }),
    });
    if (!res2.ok) {
      const err = await res2.json().catch(() => ({ error: `HTTP ${res2.status}` }));
      const msg = err.detail || err.error || `Payment failed (${res2.status})`;
      addTrace({ icon: "✗", text: msg, badgeClass: "text-red-400" });
      setStep("error"); setError(msg); return;
    }

    addTrace({ icon: "✓", text: "Non-custodial payment settled · Circle Gateway · Arc Testnet", badgeClass: "text-[#34D399]" });
    addTrace({ icon: "✍", text: "Agent scoring + generating answer…" });

    const data: QueryResult = await res2.json();
    setSourceGrid(data.decisions.map((d) => ({ title: d.source, state: "settled" as const, decision: d.decision, score: d.scores.total, amountPaid: d.amountPaid })));
    // Render decisions in console
    data.decisions.forEach((d) => {
      const isSuffStop = d.sufficiencyStop;
      const badge      = isSuffStop ? "STOP" : d.decision === "BLOCKED_BY_POLICY" ? "BLOCKED" : d.decision;
      const badgeClass = DECISION_BADGE[isSuffStop ? "STOP" : d.decision] ?? DECISION_BADGE.SKIP;
      const policyNote = d.decision === "BLOCKED_BY_POLICY" && d.policyRulesFailed?.length
        ? `  blocked: ${formatPolicyRule(d.policyRulesFailed[0])}`
        : "";
      addTrace({ icon: d.decision === "PAY" ? "→" : isSuffStop ? "⚡" : "·", text: d.source, sub: `rel ${d.scores.relevance}  score ${d.scores.total}  ${d.reason}${policyNote}`, badge, badgeClass });
    });
    const paid = data.decisions.filter((x) => x.decision === "PAY").length;
    addTrace({ icon: "✅", text: `Done · ${paid} cited · $${(data.totalPaid / 1_000_000).toFixed(4)} USDC routed`, badgeClass: "text-[#34D399]" });
    setResult(data);
    setStep("done");
  }

  async function runDemoMode() {
    // Step 1: Show 402 proof
    addTrace({ icon: "→", text: "POST /api/ask", sub: "no payment header — proving x402 gate" });
    const res1 = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, budget: parseFloat(budget), policy: policyKey }),
    });
    if (res1.status !== 402) { setStep("error"); setError("Expected 402 Payment Required but got: " + res1.status); return; }
    addTrace({ icon: "←", text: "402 Payment Required", sub: "x402 payment details in header", badge: "402", badgeClass: "text-amber-400 border-amber-600/40 bg-amber-900/10" });
    addTrace({ icon: "◈", text: `${policy.name} policy`, sub: `max $${(policy.maxPricePerCitation / 1_000_000).toFixed(3)}  min relevance ${policy.minRelevanceScore}${policy.requireBonded ? "  bonded only" : ""}  stop at ${policy.sufficiencyMaxCitations} citations` });

    // Step 2: Stream agent execution
    setStep("running");
    setSourceGrid(Array(10).fill(null).map(() => ({ title: "Evaluating...", state: "scoring" as const })));
    let res2: Response;
    try {
      res2 = await fetch("/api/demo-query-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, budget: parseFloat(budget), policy: policyKey }),
      });
    } catch (err) { setStep("error"); setError(String(err)); return; }
    if (!res2.ok || !res2.body) { setStep("error"); setError("Stream failed: " + res2.status); return; }

    const reader  = res2.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try { applyStreamEvent(JSON.parse(line.slice(6))); } catch { /* skip */ }
      }
    }
  }

  // ── Wallet bar ────────────────────────────────────────────────────────────

  const WALLET_LABEL: Record<WalletStep, string> = {
    disconnected:    "Connect MetaMask →",
    connected:       "Sign In with Ethereum →",
    siwe_pending:    "Check MetaMask…",
    authed:          walletMode === "circle" ? "Create Circle Wallet →" : "Fund session (free) →",
    funding:         "Funding…",
    funded:          `✓ EOA Ready · ${address?.slice(0, 6)}…${address?.slice(-4)}`,
    circle_creating: "Creating Circle Wallet…",
    circle_ready:    `✓ Circle Wallet · ${circleWalletAddress?.slice(0, 6)}…${circleWalletAddress?.slice(-4)}`,
  };

  const WALLET_BTN: Record<WalletStep, string> = {
    disconnected:    "border-[#3e3e4e] text-[#8b8b9e] hover:border-[#6366f1] hover:text-[#6366f1]",
    connected:       "border-[#6366f1]/40 text-[#6366f1] hover:border-[#6366f1]",
    siwe_pending:    "border-[#4a4a5e] text-[#8b8b9e] cursor-not-allowed",
    authed:          "border-[#a78bfa]/40 text-[#a78bfa] hover:border-[#a78bfa]",
    funding:         "border-[#4a4a5e] text-[#8b8b9e] cursor-not-allowed",
    funded:          "border-[#34D399]/40 text-[#34D399] bg-[#34D399]/5 cursor-default",
    circle_creating: "border-[#4a4a5e] text-[#8b8b9e] cursor-not-allowed",
    circle_ready:    "border-[#a78bfa]/40 text-[#a78bfa] bg-[#a78bfa]/5 cursor-default",
  };

  function walletClick() {
    if (walletStep === "disconnected") handleConnect();
    else if (walletStep === "connected") handleSIWE();
    else if (walletStep === "authed") {
      if (walletMode === "circle") handleCreateCircleWallet();
      else handleFundSession();
    }
  }

  const isWalletClickable = ["disconnected", "connected", "authed"].includes(walletStep);

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5]">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8">
          <BackButton />
          <h1 className="text-3xl font-semibold tracking-tight mt-4 text-[var(--text-primary)] sm:text-4xl">Agent Workbench</h1>
          <p className="text-[var(--text-secondary)] mt-2">Set a spend policy · Pay to query · Every decision gets a public Policy Receipt</p>
        </div>

        <div className="mb-4 rounded-xl border border-[#6366f1]/30 bg-[#6366f1]/5 p-4 text-sm text-[var(--text-secondary)]">
          No wallet ready yet?{" "}
          <Link href="/demo" className="font-semibold text-[#6366f1] transition-colors hover:text-indigo-300">
            Try the one-click demo
          </Link>
          {" "}to see the full pay → cite → receipt flow without setup.
        </div>

        {/* Circle Wallet hero panel — no MetaMask required */}
        <div className={`rounded-xl border mb-4 p-5 transition-all ${circleReady ? "bg-[#1a1228] border-[#a78bfa]/40" : "bg-[#111118] border-[#2e1e4e]/60"}`}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">C</div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#a78bfa] flex items-center gap-2">
                  Circle Programmable Wallet
                  {circleReady && <span className="text-[10px] bg-[#a78bfa]/20 border border-[#a78bfa]/40 px-1.5 py-0.5 rounded font-mono">ACTIVE</span>}
                </div>
                <div className="text-xs text-[#8b8b9e] mt-0.5">
                  {circleReady
                    ? <>
                        <span className="font-mono text-[#a78bfa]">{circleWalletAddress?.slice(0, 12)}…{circleWalletAddress?.slice(-6)}</span>
                        {" · "}
                        {circleBalance !== null
                          ? <>{(circleBalance / 1e6).toFixed(4)} USDC · {Math.max(0, Math.floor(circleBalance / 1000))} {Math.floor(circleBalance / 1000) === 1 ? "query" : "queries"} remaining</>
                          : "loading balance…"}
                        {" · EIP-3009 signed by Circle HSM · no browser key"}
                      </>
                    : "No wallet extension needed · Circle HSM signs payments · funds 5 queries ($0.005 USDC)"}
                </div>
                {circleError && <div className="text-xs text-red-400 mt-1">{circleError}</div>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {circleReady && (
                <button
                  onClick={handleResetCircleWallet}
                  className="text-[10px] font-mono text-[#4a4a5e] hover:text-[#8b8b9e] border border-[#1e1e2e] rounded px-2 py-1 transition-colors"
                >
                  new session
                </button>
              )}
              {!circleReady && (
                <button
                  onClick={handleCreateCircleWalletDirect}
                  disabled={circleCreating}
                  className="bg-[#a78bfa] hover:bg-violet-400 disabled:opacity-50 text-black font-semibold px-4 py-2 rounded-lg text-sm transition-all hover:scale-105 disabled:cursor-not-allowed"
                >
                  {circleCreating ? "Creating…" : "Create Circle Wallet →"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Wallet bar (MetaMask / EOA — advanced mode) */}
        <div className="bg-[#111118] rounded-xl px-5 py-3 border border-[#1e1e2e] mb-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-xs min-w-0">
            <span className="font-mono shrink-0">🔐</span>
            <span className="font-semibold text-[#8b8b9e] shrink-0">Non-custodial</span>
            <span className="text-[#4a4a5e] truncate">
              {walletStep === "disconnected"    && "Connect MetaMask to sign real x402 payments — server never sees your key"}
              {walletStep === "connected"       && `${address?.slice(0, 10)}… on ${chain?.name ?? "unknown network"} · Sign in with Ethereum to continue`}
              {walletStep === "siwe_pending"    && "Sign the message in MetaMask…"}
              {walletStep === "authed"          && (walletMode === "circle"
                ? `Verified as ${siweAddress?.slice(0, 10)}… · Circle creates a Programmable Wallet (DCW) — no raw key in browser`
                : `Verified as ${siweAddress?.slice(0, 10)}… · fund a $0.001 session EOA to enable non-custodial payments`)}
              {walletStep === "funding"         && "Sending $0.001 USDC to browser-generated session EOA…"}
              {walletStep === "funded"          && "Session EOA funded · browser signs EIP-3009 · Circle Gateway settles on Arc"}
              {walletStep === "circle_creating" && "Creating Circle Programmable Wallet on Arc Testnet via Circle DCW API…"}
              {walletStep === "circle_ready"    && `Circle Wallet ${circleWalletAddress?.slice(0, 10)}… ready · EIP-3009 signed by Circle HSM · no browser key`}
            </span>
            {walletError && <span className="text-red-400 shrink-0 text-[11px]">{walletError}</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Mode toggle — visible once SIWE authenticated */}
            {(walletStep === "authed") && (
              <div className="flex items-center rounded border border-[#1e1e2e] overflow-hidden text-[10px] font-mono">
                <button
                  onClick={() => setWalletMode("circle")}
                  className={`px-2 py-1 transition-colors ${walletMode === "circle" ? "bg-[#a78bfa]/20 text-[#a78bfa] border-r border-[#1e1e2e]" : "text-[#4a4a5e] border-r border-[#1e1e2e] hover:text-[#8b8b9e]"}`}
                >
                  Circle DCW
                </button>
                <button
                  onClick={() => setWalletMode("eoa")}
                  className={`px-2 py-1 transition-colors ${walletMode === "eoa" ? "bg-[#6366f1]/20 text-[#6366f1]" : "text-[#4a4a5e] hover:text-[#8b8b9e]"}`}
                >
                  EOA
                </button>
              </div>
            )}
            {walletStep !== "disconnected" && walletStep !== "funded" && walletStep !== "circle_ready" && (
              <button onClick={handleDisconnect} className="text-[#4a4a5e] hover:text-[#8b8b9e] text-xs underline">disconnect</button>
            )}
            <button
              onClick={walletClick}
              disabled={!isWalletClickable}
              className={`border rounded px-3 py-1.5 text-xs font-mono transition-all ${WALLET_BTN[walletStep]}`}
            >
              {WALLET_LABEL[walletStep]}
            </button>
          </div>
        </div>

        {/* Mode tag */}
        <div className="mb-4 text-xs font-mono text-[#4a4a5e]">
          mode: {(circleReady || walletStep === "circle_ready")
            ? <span className="text-[#a78bfa]">Circle Programmable Wallet · DCW HSM signs EIP-3009 · no browser private key · Circle Gateway settles on-chain</span>
            : useWalletMode
            ? <span className="text-[#34D399]">non-custodial EOA · browser signs EIP-3009 · Circle Gateway verifies + settles on-chain</span>
            : <span className="text-[#6366f1]">demo · server GatewayClient · streaming agent console</span>}
        </div>

        {/* Policy Selector */}
        <div className="bg-[#111118] rounded-xl p-5 border border-[#1e1e2e] mb-6">
          <span className="text-xs font-semibold text-[#8b8b9e] uppercase tracking-widest">Agent Spend Policy</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            {POLICY_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setPolicyKey(opt.key)}
                disabled={isActive}
                className={`rounded-lg p-4 border text-left transition-all ${policyKey === opt.key ? opt.active + " border-2" : "border-[#1e1e2e] hover:border-[#3e3e4e]"}`}
              >
                <div className={`font-semibold text-sm mb-1 ${policyKey === opt.key ? opt.color.split(" ")[1] : "text-[#f0f0f5]"}`}>{opt.label}</div>
                <div className="text-[#8b8b9e] text-xs leading-relaxed">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Payment Flow Visualizer */}
        {step !== "idle" && (
          <PaymentFlowVisualizer step={step} traces={traces} sourceGrid={sourceGrid} />
        )}

        {/* Decision Matrix — animated status glyphs */}
        {(step === "running" || step === "done") && sourceGrid.length > 0 && (
          <div className="mb-6 bg-[#0a0a0f] rounded-xl border border-[#1e1e2e] p-4">
            <div className="text-[10px] font-mono text-[#4a4a5e] mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] inline-block animate-pulse" />
              AGENT DECISION MATRIX — {sourceGrid.filter((s) => s.state === "settled").length}/{sourceGrid.length} evaluated
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {sourceGrid.map((s, i) => {
                const glyph = s.state === "waiting" ? "□"
                  : s.state === "scoring" ? "◎"
                  : s.decision === "PAY" ? "▰"
                  : s.decision === "REFUSE" || s.decision === "BLOCKED_BY_POLICY" ? "✗"
                  : "—";
                const glyphColor = s.decision === "PAY" ? "text-[#34D399]"
                  : s.decision === "REFUSE" ? "text-red-400"
                  : s.decision === "BLOCKED_BY_POLICY" ? "text-orange-400"
                  : s.state === "scoring" ? "text-yellow-400 animate-pulse"
                  : "text-[#4a4a5e]";
                return (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-[#111118] border border-[#1e1e2e]">
                    <span className={`font-mono text-sm w-4 flex-shrink-0 ${glyphColor}`}>{glyph}</span>
                    {s.memoryCached && s.state === "settled" && (
                      <span className="text-[10px] font-mono text-[#6366f1] flex-shrink-0" title="Pre-ranked from citation history">↺</span>
                    )}
                    <span className="text-xs text-[#8b8b9e] truncate flex-1">{s.title || "Evaluating source…"}</span>
                    {s.decision === "PAY" && s.amountPaid != null && s.amountPaid > 0 && (
                      <span className="text-[10px] font-mono text-[#34D399] flex-shrink-0">${(s.amountPaid / 1e6).toFixed(4)}</span>
                    )}
                    {s.score != null && s.state === "settled" && (
                      <span className="text-[10px] font-mono text-[#4a4a5e] flex-shrink-0">{s.score}</span>
                    )}
                  </div>
                );
              })}
            </div>
            {step === "done" && (() => {
              const memorySavings = sourceGrid.filter((s) => s.memoryCached && s.decision === "PAY").length;
              return memorySavings > 0 ? (
                <div className="mt-3 pt-3 border-t border-[#1e1e2e] text-[10px] font-mono text-[#6366f1]">
                  ↺ {memorySavings} source{memorySavings !== 1 ? "s" : ""} pre-ranked from citation history · market intelligence compounds
                </div>
              ) : null;
            })()}
          </div>
        )}

        {/* Two-column */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Form */}
          <form onSubmit={handleSubmit} className="bg-[#111118] rounded-xl p-6 border border-[#1e1e2e]">
            <h2 className="font-semibold text-[#f0f0f5] mb-4">Research Question</h2>
            <textarea
              className="w-full bg-[#0a0a0f] border border-[#1e1e2e] focus:border-[#6366f1] rounded-lg px-4 py-3 text-[#f0f0f5] placeholder-[#4a4a5e] focus:outline-none resize-none transition-colors mb-4"
              rows={4}
              placeholder="e.g. What makes x402 useful for AI agents?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isActive}
            />
            <div className="mb-4">
              <label className="block text-xs text-[#8b8b9e] mb-1">Agent Budget (USDC)</label>
              <input
                type="number" step="0.01" min="0.01" max="1.0"
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] focus:border-[#6366f1] rounded-lg px-4 py-2 text-[#f0f0f5] focus:outline-none transition-colors"
                value={budget} onChange={(e) => setBudget(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              className={`w-full font-semibold px-6 py-3 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${(circleReady || walletStep === "circle_ready") ? "bg-[#a78bfa] hover:bg-violet-400 text-black" : useWalletMode ? "bg-[#34D399] hover:bg-emerald-400 text-black" : "bg-[#6366f1] hover:bg-indigo-500 text-white"}`}
            >
              {isActive ? "Running…" : circleNeedsSignIn ? "Complete Sign-In First" : (circlePaymentReady || walletStep === "circle_ready") ? "Circle Pay & Ask →" : useWalletMode ? "Sign & Ask →" : "Ask →"}
            </button>
            <p className="text-[#4a4a5e] text-xs mt-3">
              {circleNeedsSignIn
                ? "Connect your wallet and sign in above to use Circle Pay & Ask. No payment has been attempted."
                : (circlePaymentReady || walletStep === "circle_ready")
                ? "Circle DCW HSM signs EIP-3009 · no private key in browser · Circle Gateway settles on Arc Testnet"
                : useWalletMode
                ? "Your browser signs the EIP-3009 auth · server never sees your session key · Circle Gateway settles on Arc"
                : `Demo mode · $${(policy.maxPricePerCitation / 1_000_000).toFixed(3)} max · ${policy.name} policy`}
            </p>
          </form>

          {/* Console */}
          <div className="bg-[#0a0a0f] rounded-xl border border-[#1e1e2e] flex flex-col min-h-[300px]">
            <div className="px-4 py-2.5 border-b border-[#1e1e2e] flex items-center justify-between">
              <span className="text-[#4a4a5e] text-xs font-mono">{"// Agent Console"}</span>
              {isActive && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute h-2 w-2 rounded-full bg-[#6366f1] opacity-75" />
                  <span className="relative rounded-full h-2 w-2 bg-[#6366f1]" />
                </span>
              )}
            </div>
            {traces.length === 0 && step === "idle" && (
              <div className="flex-1 flex items-center justify-center text-[#4a4a5e] text-xs font-mono px-4 text-center">
                {useWalletMode ? "EIP-3009 signing + agent reasoning will appear here" : "Agent reasoning trace will stream here live"}
              </div>
            )}
            <div ref={consoleRef} className="flex-1 overflow-y-auto p-4 space-y-1.5 font-mono text-xs max-h-[400px]">
              {traces.map((t) => (
                <div key={t.id} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-[#4a4a5e] shrink-0 w-12 text-right tabular-nums">
                    {t.elapsed < 1000 ? `${t.elapsed}ms` : `${(t.elapsed / 1000).toFixed(1)}s`}
                  </span>
                  <span className="shrink-0 w-4 text-center">{t.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={t.badgeClass ?? "text-[#f0f0f5]"}>{t.text}</span>
                      {t.badge && <span className={`px-1.5 py-0 rounded border text-[10px] ${t.badgeClass ?? "border-[#3e3e4e] text-[#8b8b9e]"}`}>{t.badge}</span>}
                    </div>
                    {t.sub && <div className="text-[#4a4a5e] mt-0.5 truncate" title={t.sub}>{t.sub}</div>}
                  </div>
                </div>
              ))}
              {isActive && <div className="text-[#6366f1] animate-pulse pl-16">…</div>}
            </div>
          </div>
        </div>

        {error && <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 mb-6 text-red-400 text-sm">{error}</div>}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#1e1e2e] flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-[#f0f0f5]">Source Competition Board</h2>
                  <p className="text-[#8b8b9e] text-xs mt-0.5">{result.decisions.length} sources · <span className="text-[#6366f1]">{result.policyProfile}</span> policy</p>
                </div>
                <div className="flex items-center gap-2">
                  {(circleReady || walletStep === "circle_ready") && <span className="px-2.5 py-1 rounded-full bg-[#a78bfa]/10 border border-[#a78bfa]/40 text-[#a78bfa] text-xs font-mono">Circle DCW</span>}
                {walletStep === "funded" && <span className="px-2.5 py-1 rounded-full bg-[#34D399]/10 border border-[#34D399]/40 text-[#34D399] text-xs font-mono">non-custodial</span>}
                  {result.stoppedEarly && <span className="px-2.5 py-1 rounded-full bg-amber-900/30 border border-amber-600/40 text-amber-400 text-xs font-mono">⚡ early stop</span>}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1e1e2e]">
                      {["Source","Price","Rel%","Score","Decision","Reason"].map((h) => (
                        <th key={h} className={`px-4 py-3 text-xs text-[#8b8b9e] font-medium ${h === "Source" || h === "Reason" ? "text-left" : h === "Decision" ? "text-center" : "text-right"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.decisions.map((d) => (
                      <tr key={d.receiptId} className="border-b border-[#1e1e2e] hover:bg-[#0a0a0f]/40 transition-colors">
                        <td className="px-4 py-3"><a href={d.url} target="_blank" rel="noopener noreferrer" className="text-[#6366f1] hover:text-indigo-300 transition-colors">{d.source}</a></td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          <span className={d.decision === "PAY" ? "text-[#34D399]" : "text-[#8b8b9e]"}>${(d.amountPaid / 1_000_000).toFixed(4)}</span>
                          {d.decision === "PAY" && d.contributionWeight !== null && (
                            <span className="ml-1.5 text-[#a78bfa] text-[10px]">({(d.contributionWeight * 100).toFixed(0)}%)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-[#f0f0f5]">{d.scores.relevance}%</td>
                        <td className="px-4 py-3 text-right text-[#f0f0f5]">{d.scores.total}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded border font-mono text-xs ${d.sufficiencyStop ? DECISION_BADGE.STOP : decisionStyle(d.decision)}`}>
                            {d.sufficiencyStop ? "STOP" : d.decision === "BLOCKED_BY_POLICY" ? "BLOCKED" : d.decision}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#8b8b9e] text-xs max-w-[200px] truncate" title={d.reason}>
                          {d.reason}
                          {d.decision === "BLOCKED_BY_POLICY" && d.policyRulesFailed?.length
                            ? <span className="ml-1 text-orange-400/70">[{formatPolicyRule(d.policyRulesFailed[0])}]</span>
                            : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-[#111118] rounded-xl p-6 border border-[#1e1e2e]">
              <h2 className="font-semibold mb-3 text-[#f0f0f5]">Answer</h2>
              <p className="text-[#f0f0f5] leading-relaxed whitespace-pre-wrap">{result.answer}</p>
            </div>

            <div className="bg-[#111118] rounded-xl p-6 border border-[#1e1e2e]">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-semibold text-[#f0f0f5]">Policy Receipt Audit Trail</h2>
                <span className="text-xs text-[#4a4a5e]">every decision is public</span>
              </div>
              <div className="space-y-2">
                {result.decisions.map((d) => {
                  const isPay = d.decision === "PAY";
                  const isBlocked = d.decision === "BLOCKED_BY_POLICY";
                  return (
                    <Link key={d.receiptId} href={d.receiptUrl} className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${isPay ? "border-[#34D399]/30 hover:border-[#34D399]/60 bg-[#34D399]/5" : isBlocked ? "border-orange-700/30 hover:border-orange-600/50 bg-orange-900/10" : "border-[#1e1e2e] hover:border-[#6366f1]/30 opacity-60 hover:opacity-80"}`}>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded border font-mono text-xs ${decisionStyle(d.decision)}`}>{d.decision === "BLOCKED_BY_POLICY" ? "BLOCKED" : d.decision}</span>
                        <span className={`text-sm ${isPay ? "text-[#f0f0f5]" : "text-[#8b8b9e]"}`}>{d.source}</span>
                      </div>
                      <span className={`text-xs ${isPay ? "text-[#6366f1]" : isBlocked ? "text-orange-400" : "text-[#4a4a5e]"}`}>{isPay ? "View receipt →" : isBlocked ? "Policy receipt →" : "Audit log →"}</span>
                    </Link>
                  );
                })}
              </div>
              <div className="mt-4 pt-4 border-t border-[#1e1e2e] flex justify-between text-sm text-[#8b8b9e]">
                <span>Total USDC paid: <span className="text-[#34D399] font-mono">${(result.totalPaid / 1_000_000).toFixed(4)}</span></span>
                <span>Query fee: <span className="text-[#f0f0f5] font-mono">${(result.queryFee / 1_000_000).toFixed(4)}</span></span>
              </div>
            </div>

            <button
              onClick={() => { setStep("idle"); setResult(null); setTraces([]); setError(""); }}
              className="text-[#8b8b9e] hover:text-[#f0f0f5] text-sm underline transition-colors"
            >
              Ask another question
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
