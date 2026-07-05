"use client";
import { useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/ui";
import { BackButton } from "@/components/back-button";

const PASS_QUERIES   = 10;
const PASS_HOURS     = 48;
const PASS_PRICE     = 0.01;

interface PassStatus {
  token: string;
  queriesRemaining: number;
  expiresAt: string;
  expired: boolean;
  valid: boolean;
  paidUSDC: number;
  txHash: string | null;
}

export default function SubscribePage() {
  const [token, setToken] = useState("");
  const [savedToken, setSavedToken] = useState("");
  const [status, setStatus] = useState<PassStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");

  // ── Check existing pass ───────────────────────────────────────────────────
  async function checkPass(t: string) {
    if (!t.trim()) return;
    setChecking(true);
    setCheckError("");
    try {
      const r = await fetch(`/api/subscribe?token=${encodeURIComponent(t.trim())}`);
      const d = await r.json();
      if (r.ok) {
        setStatus(d);
        setSavedToken(t.trim());
      } else {
        setCheckError(d.error ?? "Pass not found");
        setStatus(null);
      }
    } catch {
      setCheckError("Network error");
    } finally {
      setChecking(false);
    }
  }

  const hoursLeft = status
    ? Math.max(0, Math.round((new Date(status.expiresAt).getTime() - Date.now()) / 3_600_000))
    : null;

  return (
    <PageShell maxWidth="max-w-2xl">
      <BackButton />
      <h1 className="text-3xl font-bold mt-6 text-[#f0f0f5]">Subscription Pass</h1>
      <p className="text-[#8b8b9e] mt-1 mb-8">
        Pay once, query freely — {PASS_QUERIES} citation queries over {PASS_HOURS} hours for ${PASS_PRICE.toFixed(2)} USDC
      </p>

      {/* What you get */}
      <div className="rounded-xl border border-[#6366f1]/30 bg-[#6366f1]/5 p-6 mb-8">
        <h2 className="text-sm font-semibold text-[#6366f1] uppercase tracking-widest mb-4">What you get</h2>
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[
            { v: `${PASS_QUERIES}`, l: "citation queries" },
            { v: `${PASS_HOURS}h`, l: "validity window" },
            { v: `$${PASS_PRICE.toFixed(2)}`, l: "flat USDC price" },
          ].map((s) => (
            <div key={s.l} className="bg-[#111118] rounded-lg p-4 border border-[#1e1e2e] text-center">
              <div className="text-2xl font-bold font-mono text-[#6366f1]">{s.v}</div>
              <div className="text-[#8b8b9e] text-xs mt-1">{s.l}</div>
            </div>
          ))}
        </div>
        <ul className="space-y-1.5 text-sm text-[#8b8b9e]">
          <li className="flex items-start gap-2"><span className="text-[#6366f1] mt-0.5">✓</span>Skip per-query x402 payment on every <code className="font-mono text-xs bg-[#1e1e2e] px-1 rounded">POST /api/ask</code></li>
          <li className="flex items-start gap-2"><span className="text-[#6366f1] mt-0.5">✓</span>Same source scoring, receipts, and on-chain anchoring as paid queries</li>
          <li className="flex items-start gap-2"><span className="text-[#6366f1] mt-0.5">✓</span>Token works across cold starts — stored in Neon Postgres</li>
          <li className="flex items-start gap-2"><span className="text-[#6366f1] mt-0.5">✓</span>Cheaper than 10 individual queries ($0.001 × 10 = $0.01 — same price, no friction)</li>
        </ul>
      </div>

      {/* How to buy */}
      <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-6 mb-6">
        <h2 className="text-sm font-semibold text-[#f0f0f5] mb-3">How to buy (API)</h2>
        <pre className="text-xs font-mono text-[#8b8b9e] overflow-x-auto whitespace-pre-wrap">
{`# Step 1 — probe the price (returns 402 with payment requirements)
curl https://citepay-markets.vercel.app/api/subscribe

# Step 2 — pay $0.01 via Circle Gateway and get your token
curl -X POST https://citepay-markets.vercel.app/api/subscribe \\
  -H "payment-signature: <your-circle-sig>"

# → { "token": "abc123...", "queriesRemaining": 10, "expiresAt": "..." }

# Step 3 — use the token on /api/ask (no x402 needed)
curl -X POST https://citepay-markets.vercel.app/api/ask \\
  -H "X-Subscription-Token: abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{"query": "How does x402 work?"}'`}
        </pre>
      </div>

      {/* How to use via MCP */}
      <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-6 mb-8">
        <h2 className="text-sm font-semibold text-[#f0f0f5] mb-3">Use from Claude (MCP)</h2>
        <pre className="text-xs font-mono text-[#8b8b9e] overflow-x-auto whitespace-pre-wrap">
{`// In your MCP tool call
{
  "tool": "cite_query",
  "input": {
    "query": "What is x402?",
    "subscriptionToken": "abc123..."
  }
}`}
        </pre>
      </div>

      {/* Check existing pass */}
      <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-6">
        <h2 className="text-sm font-semibold text-[#f0f0f5] mb-4">Check your pass</h2>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && checkPass(token)}
            placeholder="Paste your subscription token…"
            className="flex-1 bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#f0f0f5] placeholder-[#4a4a5e] focus:outline-none focus:border-[#6366f1]/50"
          />
          <button
            onClick={() => checkPass(token)}
            disabled={checking || !token.trim()}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#6366f1] hover:bg-indigo-500 text-white transition-colors disabled:opacity-40"
          >
            {checking ? "Checking…" : "Check"}
          </button>
        </div>

        {checkError && (
          <div className="text-red-400 text-sm mb-3">{checkError}</div>
        )}

        {status && (
          <div className="rounded-lg border border-[#1e1e2e] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#8b8b9e]">Status</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded border font-mono ${
                status.valid
                  ? "text-[#34D399] border-[#34D399]/30 bg-[#34D399]/10"
                  : "text-red-400 border-red-800 bg-red-900/20"
              }`}>
                {status.valid ? "VALID" : status.expired ? "EXPIRED" : "EXHAUSTED"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#8b8b9e]">Queries remaining</span>
              <span className="text-sm font-mono font-bold text-[#f0f0f5]">{status.queriesRemaining} / {PASS_QUERIES}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#8b8b9e]">Expires</span>
              <span className="text-xs font-mono text-[#8b8b9e]">
                {new Date(status.expiresAt).toLocaleString()} ({hoursLeft}h left)
              </span>
            </div>
            {status.txHash && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8b8b9e]">Payment tx</span>
                <a
                  href={`https://testnet.arcscan.app/tx/${status.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-[#6366f1] hover:text-indigo-300"
                >
                  {status.txHash.slice(0, 10)}… arcscan →
                </a>
              </div>
            )}
            {/* Usage bar */}
            <div className="pt-1">
              <div className="h-1.5 rounded-full bg-[#1e1e2e]">
                <div
                  className="h-1.5 rounded-full bg-[#6366f1] transition-all"
                  style={{ width: `${(status.queriesRemaining / PASS_QUERIES) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 text-center text-xs text-[#4a4a5e]">
        Passes stored in Neon Postgres — survive Vercel cold starts.{" "}
        <Link href="/demo" className="text-[#6366f1] hover:text-indigo-300">Try a demo query →</Link>
      </div>
    </PageShell>
  );
}
