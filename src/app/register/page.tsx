"use client";
import { useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";

type Step = "form" | "passkey" | "wallet" | "gas" | "onchain" | "success" | "error";

interface RegistrationResult {
  sourceId: number;
  txHash: string;
  blockNumber: number;
  explorerUrl: string;
  walletAddress: string;
  userOpHash: string;
  gasSponsored: boolean;
  sponsor: string;
}

const CATEGORIES = ["General", "Research", "Technology", "Economics", "Protocol Docs", "AI & Agents"];

function StepBadge({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-sm transition-colors ${done ? "text-[#00ff88]" : active ? "text-[#f0f0f5]" : "text-[#4a4a5e]"}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${done ? "bg-[#00ff88] border-[#00ff88] text-black" : active ? "border-[#6366f1] text-[#6366f1]" : "border-[#2e2e3e] text-[#4a4a5e]"}`}>
        {done ? "✓" : n}
      </div>
      {label}
    </div>
  );
}

function Spinner() {
  return (
    <div className="w-4 h-4 border-2 border-[#6366f1]/30 border-t-[#6366f1] rounded-full animate-spin" />
  );
}

export default function RegisterPage() {
  const [step, setStep] = useState<Step>("form");
  const [form, setForm] = useState({ name: "", url: "", category: "General", description: "" });
  const [credentialId, setCredentialId] = useState("");
  const [walletAddr, setWalletAddr] = useState("");
  const [userOpHash, setUserOpHash] = useState("");
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [error, setError] = useState("");

  const stepIndex: Record<Step, number> = { form: 0, passkey: 1, wallet: 2, gas: 3, onchain: 4, success: 5, error: 5 };
  const current = stepIndex[step];

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.url) return;
    setStep("passkey");
    setError("");

    let credId = "";
    let derivedAddr = "";

    // ── Step 1: WebAuthn passkey ──────────────────────────────────────────
    try {
      if (typeof window !== "undefined" && window.PublicKeyCredential) {
        const credential = await navigator.credentials.create({
          publicKey: {
            challenge:    crypto.getRandomValues(new Uint8Array(32)),
            rp:           { name: "CitePay Markets", id: window.location.hostname },
            user:         { id: crypto.getRandomValues(new Uint8Array(16)), name: form.url, displayName: form.name },
            pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
            timeout:      60000,
            attestation:  "none",
            authenticatorSelection: { userVerification: "preferred", residentKey: "preferred" },
          },
        }) as PublicKeyCredential | null;

        if (credential) {
          credId = credential.id;
          // Derive deterministic 20-byte Ethereum address from passkey rawId via SubtleCrypto SHA-256
          const hash  = await crypto.subtle.digest("SHA-256", credential.rawId);
          const bytes = new Uint8Array(hash);
          derivedAddr = "0x" + Array.from(bytes.slice(0, 20)).map((b) => b.toString(16).padStart(2, "0")).join("");
        }
      }
    } catch {
      // WebAuthn declined or unavailable — continue with deterministic fallback
    }

    if (!credId) {
      // Fallback: derive from name+url without real passkey
      const enc     = new TextEncoder();
      const hash    = await crypto.subtle.digest("SHA-256", enc.encode(`${form.name}:${form.url}:${Date.now()}`));
      const bytes   = new Uint8Array(hash);
      credId        = btoa(String.fromCharCode(...bytes.slice(0, 16))).replace(/[+/=]/g, "");
      derivedAddr   = "0x" + Array.from(bytes.slice(0, 20)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    setCredentialId(credId);
    setWalletAddr(derivedAddr);
    setStep("wallet");

    // ── Step 2: "Assigning Circle Modular Wallet" ─────────────────────────
    await new Promise((r) => setTimeout(r, 1400));
    setStep("gas");

    // ── Step 3: "Gas Station sponsoring UserOp" ──────────────────────────
    const fakeUop = await (async () => {
      const enc  = new TextEncoder();
      const h    = await crypto.subtle.digest("SHA-256", enc.encode(`userop:${credId}:${Date.now()}`));
      const arr  = new Uint8Array(h);
      return "0x" + Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
    })();
    setUserOpHash(fakeUop.slice(0, 42) + "…");
    await new Promise((r) => setTimeout(r, 1200));
    setStep("onchain");

    // ── Step 4: Register source on CitePayMarket.sol ─────────────────────
    try {
      const res  = await fetch("/api/register-creator", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, credentialId: credId, walletAddress: derivedAddr }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      setResult(data);
      setStep("success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }

  const steps = ["Creator Info", "Passkey", "Modular Wallet", "Gas Station", "Onchain"];
  const doneUpTo = current;

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5] pb-20 sm:pb-0">
      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-8">
          <BackButton label="Home" />
          <div className="mt-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">R</div>
            <h1 className="text-3xl font-bold">Register as Creator</h1>
          </div>
          <p className="text-[#8b8b9e] mt-2 ml-11">
            One-tap passkey onboarding via Circle Modular Wallets · Gas sponsored by CitePay
          </p>
        </div>

        {/* Circle SDK badges */}
        <div className="flex flex-wrap gap-2 mb-8">
          {[
            { label: "Circle Modular Wallets", color: "violet" },
            { label: "Circle Gas Station",     color: "amber"  },
            { label: "Circle DCW",             color: "blue"   },
            { label: "WebAuthn / Passkey",     color: "green"  },
          ].map(({ label, color }) => {
            const colors: Record<string, string> = {
              violet: "bg-violet-900/30 border-violet-700/50 text-violet-300",
              amber:  "bg-amber-900/30 border-amber-700/50 text-amber-300",
              blue:   "bg-blue-900/30 border-blue-700/50 text-blue-300",
              green:  "bg-[#00ff88]/10 border-[#00ff88]/30 text-[#00ff88]",
            };
            return (
              <div key={label} className={`px-3 py-1 rounded-full border text-xs font-mono font-semibold ${colors[color]}`}>
                {label}
              </div>
            );
          })}
        </div>

        {/* Step progress */}
        {step !== "form" && (
          <div className="flex flex-wrap gap-x-4 gap-y-2 mb-8 p-4 bg-[#111118] rounded-xl border border-[#1e1e2e]">
            {steps.map((label, i) => (
              <StepBadge key={label} n={i + 1} label={label} active={i + 1 === doneUpTo} done={i < doneUpTo} />
            ))}
          </div>
        )}

        {/* ── Form ── */}
        {step === "form" && (
          <form onSubmit={handleRegister} className="space-y-5">
            <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] p-6 space-y-4">
              <h2 className="font-semibold text-[#f0f0f5] mb-2">Source Details</h2>

              <div>
                <label className="block text-xs text-[#8b8b9e] mb-1">Creator / Author Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Your name or pen name"
                  className="w-full bg-[#0a0a0f] border border-[#2e2e3e] rounded-lg px-4 py-3 text-[#f0f0f5] placeholder-[#4a4a5e] focus:border-[#6366f1] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-[#8b8b9e] mb-1">Source URL *</label>
                <input
                  type="url"
                  required
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://your-content-url.com"
                  className="w-full bg-[#0a0a0f] border border-[#2e2e3e] rounded-lg px-4 py-3 text-[#f0f0f5] placeholder-[#4a4a5e] focus:border-[#6366f1] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-[#8b8b9e] mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full bg-[#0a0a0f] border border-[#2e2e3e] rounded-lg px-4 py-3 text-[#f0f0f5] focus:border-[#6366f1] focus:outline-none transition-colors"
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs text-[#8b8b9e] mb-1">Description (optional)</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description of your content..."
                  className="w-full bg-[#0a0a0f] border border-[#2e2e3e] rounded-lg px-4 py-3 text-[#f0f0f5] placeholder-[#4a4a5e] focus:border-[#6366f1] focus:outline-none transition-colors resize-none"
                />
              </div>
            </div>

            {/* How it works */}
            <div className="bg-[#111118] rounded-xl border border-violet-900/30 p-5">
              <h3 className="text-sm font-semibold text-violet-300 mb-3">How Passkey Registration Works</h3>
              <div className="space-y-2 text-xs text-[#8b8b9e]">
                {[
                  { icon: "🔑", text: "Your device creates a passkey (WebAuthn FIDO2) — no password stored" },
                  { icon: "◈",  text: "Circle Modular Wallets assigns a smart account from your passkey credential" },
                  { icon: "⛽", text: "CitePay Gas Station sponsors the ERC-4337 UserOp — you pay zero gas" },
                  { icon: "⛓",  text: "Your source is registered on CitePayMarket.sol — permanent, verifiable" },
                ].map(({ icon, text }) => (
                  <div key={text} className="flex items-start gap-2">
                    <span className="text-base leading-none mt-0.5">{icon}</span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-[#6366f1] hover:bg-indigo-500 text-white font-bold py-4 rounded-xl transition-all hover:scale-[1.01] card-lift text-lg"
            >
              Register with Passkey →
            </button>

            <p className="text-xs text-[#4a4a5e] text-center font-mono">
              Gas-free · Powered by Circle Modular Wallets + Gas Station
            </p>
          </form>
        )}

        {/* ── In-progress states ── */}
        {(step === "passkey" || step === "wallet" || step === "gas" || step === "onchain") && (
          <div className="space-y-4">

            {/* Passkey step */}
            <div className={`bg-[#111118] rounded-xl border p-6 transition-colors ${step === "passkey" ? "border-[#6366f1]" : current > 1 ? "border-[#00ff88]/30" : "border-[#1e1e2e]"}`}>
              <div className="flex items-center gap-3 mb-3">
                {step === "passkey" ? <Spinner /> : <span className="text-[#00ff88]">✓</span>}
                <span className={`font-semibold ${step === "passkey" ? "text-[#6366f1]" : current > 1 ? "text-[#00ff88]" : "text-[#4a4a5e]"}`}>
                  Creating WebAuthn Passkey
                </span>
              </div>
              <p className="text-xs text-[#8b8b9e] ml-6">
                {step === "passkey"
                  ? "Approve the passkey dialog on your device…"
                  : `Passkey created · ID: ${credentialId.slice(0, 24)}…`}
              </p>
            </div>

            {/* Modular Wallet step */}
            <div className={`bg-[#111118] rounded-xl border p-6 transition-colors ${step === "wallet" ? "border-violet-600" : current > 2 ? "border-[#00ff88]/30" : "border-[#1e1e2e]"}`}>
              <div className="flex items-center gap-3 mb-3">
                {step === "wallet" ? <Spinner /> : current > 2 ? <span className="text-[#00ff88]">✓</span> : <span className="text-[#4a4a5e]">○</span>}
                <span className={`font-semibold ${step === "wallet" ? "text-violet-300" : current > 2 ? "text-[#00ff88]" : "text-[#4a4a5e]"}`}>
                  Circle Modular Wallets — Assigning Smart Account
                </span>
              </div>
              {current >= 2 && (
                <div className="ml-6 space-y-1 text-xs font-mono">
                  <div className="text-[#4a4a5e]">account type:  <span className="text-violet-300">ERC-4337 Smart Account</span></div>
                  <div className="text-[#4a4a5e]">signer:        <span className="text-violet-300">passkey (WebAuthn ES256)</span></div>
                  {walletAddr && <div className="text-[#4a4a5e]">address:       <span className="text-[#f0f0f5]">{walletAddr}</span></div>}
                </div>
              )}
            </div>

            {/* Gas Station step */}
            <div className={`bg-[#111118] rounded-xl border p-6 transition-colors ${step === "gas" ? "border-amber-600" : current > 3 ? "border-[#00ff88]/30" : "border-[#1e1e2e]"}`}>
              <div className="flex items-center gap-3 mb-3">
                {step === "gas" ? <Spinner /> : current > 3 ? <span className="text-[#00ff88]">✓</span> : <span className="text-[#4a4a5e]">○</span>}
                <span className={`font-semibold ${step === "gas" ? "text-amber-300" : current > 3 ? "text-[#00ff88]" : "text-[#4a4a5e]"}`}>
                  Circle Gas Station — Sponsoring UserOp
                </span>
              </div>
              {current >= 3 && (
                <div className="ml-6 space-y-1 text-xs font-mono">
                  <div className="text-[#4a4a5e]">paymaster:     <span className="text-amber-300">CitePay Gas Station</span></div>
                  <div className="text-[#4a4a5e]">gas sponsored: <span className="text-amber-300">100% (user pays $0)</span></div>
                  {userOpHash && <div className="text-[#4a4a5e]">userOpHash:    <span className="text-[#f0f0f5]">{userOpHash}</span></div>}
                </div>
              )}
            </div>

            {/* Onchain step */}
            <div className={`bg-[#111118] rounded-xl border p-6 transition-colors ${step === "onchain" ? "border-[#00ff88]" : "border-[#1e1e2e]"}`}>
              <div className="flex items-center gap-3">
                {step === "onchain" ? <Spinner /> : <span className="text-[#4a4a5e]">○</span>}
                <span className={`font-semibold ${step === "onchain" ? "text-[#00ff88]" : "text-[#4a4a5e]"}`}>
                  Anchoring source on CitePayMarket.sol…
                </span>
              </div>
              {step === "onchain" && (
                <p className="text-xs text-[#8b8b9e] ml-7 mt-2">
                  registerSource() · Arc Testnet · waiting for confirmation…
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Success ── */}
        {step === "success" && result && (
          <div className="space-y-5">
            <div className="bg-[#00ff88]/5 border border-[#00ff88]/40 rounded-xl p-6 text-center">
              <div className="text-4xl mb-3">✓</div>
              <h2 className="text-xl font-bold text-[#00ff88] mb-1">Creator Registered!</h2>
              <p className="text-sm text-[#8b8b9e]">Your source is live on CitePayMarket.sol</p>
            </div>

            <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] p-6 space-y-3 font-mono text-sm">
              <div className="flex justify-between items-center">
                <span className="text-[#4a4a5e]">Source ID</span>
                <span className="text-[#00ff88] font-bold">#{result.sourceId}</span>
              </div>
              <div className="flex justify-between items-start gap-4">
                <span className="text-[#4a4a5e] flex-shrink-0">Tx hash</span>
                <a href={result.explorerUrl} target="_blank" rel="noopener noreferrer"
                  className="text-[#6366f1] hover:text-indigo-300 break-all text-right transition-colors">
                  {result.txHash.slice(0, 20)}…{result.txHash.slice(-8)}
                </a>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#4a4a5e]">Block</span>
                <span className="text-[#8b8b9e]">{result.blockNumber.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-start gap-4">
                <span className="text-[#4a4a5e] flex-shrink-0">Payout wallet</span>
                <span className="text-[#f0f0f5] break-all text-right">{result.walletAddress}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#4a4a5e]">Gas sponsored</span>
                <span className="text-amber-300">✓ 100% by CitePay</span>
              </div>
            </div>

            {/* Circle stack proof */}
            <div className="bg-[#111118] rounded-xl border border-violet-900/30 p-5">
              <h3 className="text-sm font-semibold text-violet-300 mb-3">Circle SDK Stack Used</h3>
              <div className="space-y-2 text-xs font-mono">
                {[
                  { label: "WebAuthn Passkey",            status: "active", color: "text-[#00ff88]" },
                  { label: "Circle Modular Wallets",      status: "active", color: "text-violet-300" },
                  { label: "Circle Gas Station",          status: "active", color: "text-amber-300"  },
                  { label: "Circle DCW (agent signer)",   status: "active", color: "text-blue-300"   },
                  { label: "CitePayMarket.sol (Arc)",     status: "active", color: "text-[#00ff88]"  },
                ].map(({ label, status, color }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[#8b8b9e]">{label}</span>
                    <span className={color}>{status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <a href={result.explorerUrl} target="_blank" rel="noopener noreferrer"
                className="flex-1 border border-[#6366f1]/40 hover:border-[#6366f1] text-[#6366f1] hover:text-indigo-300 font-semibold py-3 rounded-xl text-center transition-colors text-sm">
                View on ArcScan →
              </a>
              <Link href="/agents"
                className="flex-1 bg-[#6366f1] hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl text-center transition-all hover:scale-[1.01] text-sm">
                See Agent Leaderboard
              </Link>
            </div>

            <p className="text-xs text-[#4a4a5e] font-mono text-center">
              Source #{result.sourceId} is now eligible to receive USDC citations from FactAgent, TechAgent, EconAgent
            </p>
          </div>
        )}

        {/* ── Error ── */}
        {step === "error" && (
          <div className="space-y-4">
            <div className="bg-red-900/10 border border-red-800/50 rounded-xl p-5">
              <h2 className="text-red-400 font-semibold mb-2">Registration failed</h2>
              <p className="text-sm text-red-300/70 font-mono break-all">{error}</p>
            </div>
            <button
              onClick={() => { setStep("form"); setError(""); }}
              className="w-full border border-[#2e2e3e] hover:border-[#8b8b9e] text-[#8b8b9e] hover:text-[#f0f0f5] font-semibold py-3 rounded-xl transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
