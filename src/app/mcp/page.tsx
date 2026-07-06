"use client";
import { useState, useEffect } from "react";
import { BackButton } from "@/components/back-button";
import { useTraction } from "@/hooks/use-traction";

const CLAUDE_CONFIG = `{
  "mcpServers": {
    "citepay": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://citepay-markets.vercel.app/api/mcp"]
    }
  }
}`;

const CURSOR_CONFIG = `{
  "mcpServers": {
    "citepay": {
      "url": "https://citepay-markets.vercel.app/api/mcp"
    }
  }
}`;

const WINDSURF_CONFIG = `{
  "mcpServers": {
    "citepay": {
      "serverUrl": "https://citepay-markets.vercel.app/api/mcp",
      "type": "sse"
    }
  }
}`;

const CURL_TEST = `curl -X POST https://citepay-markets.vercel.app/api/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`;

const FLOW_DIAGRAM = `Human: "Research stablecoins for AI agent payments"
        │
        ▼
Claude ──→ cite_query({ query, budget: 0.05 })
        │
        ▼
CitePay Agent
  ├─ Score 10 sources (Claude Haiku)
  ├─ PAY 3 creators in USDC (Circle Gateway → Arc Testnet)
  ├─ Anchor receipts → CitePayMarket.sol
  └─ Return cited answer + receipt URLs
        │
        ▼
Claude: "Based on [Stablecoin Research Hub]..."
        (every citation is paid, public, verifiable)`;

const DEMO_SEQUENCE = [
  { role: "human",       text: "Research how AI agents use stablecoins for autonomous payments" },
  { role: "tool_call",   text: "cite_query({ query: \"AI agents stablecoins autonomous payments\", budget: 0.05 })" },
  { role: "tool_result", text: "{ \"paidCitations\": 7, \"totalPaid\": 28000, \"queryFee\": 1000, \"answer\": \"AI agents use USDC via x402 payment protocol...\" }" },
  { role: "assistant",   text: "Based on 7 cited sources [Stablecoin Research Hub][DeFi Agent Patterns][x402 Protocol Spec]...\n\nEvery citation was paid via Circle Gateway on Arc Testnet. Public Policy Receipts available." },
];

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      className="text-xs px-3 py-1.5 rounded-lg bg-[#1e1e2e] hover:bg-[#2e2e3e] text-[#8b8b9e] hover:text-[#f0f0f5] transition-colors font-mono"
    >
      {copied ? "✓ Copied" : label}
    </button>
  );
}

function DemoTerminal() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [playing, setPlaying] = useState(false);

  function play() {
    setVisibleCount(0);
    setPlaying(true);
  }

  useEffect(() => {
    if (!playing) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (visibleCount >= DEMO_SEQUENCE.length) { setPlaying(false); return; }
    const t = setTimeout(() => setVisibleCount((n) => n + 1), 700);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => clearTimeout(t);
  }, [playing, visibleCount]);

  const roleStyle: Record<string, string> = {
    human:       "text-[#f0f0f5]",
    tool_call:   "text-[#6366f1]",
    tool_result: "text-[#34D399]",
    assistant:   "text-[#a78bfa]",
  };

  const roleLabel: Record<string, string> = {
    human:       "Human",
    tool_call:   "Claude → cite_query",
    tool_result: "CitePay returns",
    assistant:   "Claude answers",
  };

  return (
    <div className="bg-[#0a0a0f] rounded-xl border border-[#1e1e2e] overflow-hidden">
      <div className="px-5 py-3 border-b border-[#1e1e2e] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
          <span className="text-[10px] font-mono text-[#4a4a5e] ml-2">Claude + CitePay MCP</span>
        </div>
        <button
          onClick={play}
          disabled={playing}
          className="text-xs px-3 py-1 rounded bg-[#1e1e2e] hover:bg-[#2e2e3e] text-[#8b8b9e] hover:text-[#f0f0f5] transition-colors font-mono disabled:opacity-50"
        >
          {playing ? "▶ running…" : visibleCount > 0 ? "↺ replay" : "▶ See it in action"}
        </button>
      </div>
      <div className="p-5 space-y-4 min-h-[220px]">
        {visibleCount === 0 && !playing && (
          <div className="flex items-center justify-center h-32 text-[#4a4a5e] text-xs font-mono">
            Click &ldquo;See it in action&rdquo; to watch Claude call CitePay →
          </div>
        )}
        {DEMO_SEQUENCE.slice(0, visibleCount).map((step, i) => (
          <div key={i} className="space-y-1">
            <div className="text-[10px] font-mono text-[#4a4a5e]">{roleLabel[step.role]}</div>
            <div className={`font-mono text-xs whitespace-pre-wrap leading-relaxed ${roleStyle[step.role]}`}>
              {step.text}
            </div>
          </div>
        ))}
        {playing && visibleCount < DEMO_SEQUENCE.length && (
          <div className="font-mono text-xs text-[#4a4a5e] animate-pulse">▊</div>
        )}
      </div>
    </div>
  );
}

export default function McpPage() {
  const { stats } = useTraction();

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5]">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <BackButton />

        <div className="mt-6 mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111118] border border-[#1e1e2e] text-[#8b8b9e] text-xs font-mono mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] inline-block" />
            Model Context Protocol · HTTP Transport · No API key required
          </div>
          <h1 className="text-3xl font-bold text-[#f0f0f5]">Add CitePay to Claude</h1>
          <p className="text-[#8b8b9e] mt-2">
            Install CitePay as an MCP server. Your AI gets a <code className="text-[#34D399] bg-[#34D399]/10 px-1 rounded">cite_query</code> tool that pays creators in real USDC on every citation — on-chain, verifiable, permanent.
          </p>
        </div>

        {/* Live stats */}
        {stats && (
          <div className="bg-[#111118] rounded-xl border border-[#34D399]/20 p-4 mb-8 grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xl font-bold font-mono text-[#34D399]">{stats.paidCitations}</div>
              <div className="text-[10px] text-[#4a4a5e] font-mono mt-0.5">citations paid</div>
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-[#34D399]">${(stats.totalUSDCRouted).toFixed(4)}</div>
              <div className="text-[10px] text-[#4a4a5e] font-mono mt-0.5">USDC routed</div>
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-[#6366f1]">{stats.totalQueries}</div>
              <div className="text-[10px] text-[#4a4a5e] font-mono mt-0.5">MCP calls</div>
            </div>
          </div>
        )}

        {/* Demo terminal */}
        <div className="mb-8">
          <div className="text-sm font-semibold text-[#f0f0f5] mb-3">See it in action</div>
          <DemoTerminal />
        </div>

        {/* Tools overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          {[
            { name: "cite_query", desc: "Research a question. Agent pays creators in USDC, returns cited answer + public receipts.", color: "text-[#34D399]", border: "border-[#34D399]/20 bg-[#34D399]/5" },
            { name: "get_receipt", desc: "Fetch any Policy Receipt by ID. Verify evidence hash and on-chain anchor.", color: "text-indigo-400", border: "border-indigo-500/20 bg-indigo-900/10" },
            { name: "check_policy", desc: "Inspect agent spend policies. Conservative, Balanced, or Aggressive preset rules.", color: "text-violet-400", border: "border-violet-500/20 bg-violet-900/10" },
          ].map((t) => (
            <div key={t.name} className={`rounded-xl border p-4 ${t.border}`}>
              <div className={`font-mono text-sm font-bold mb-1 ${t.color}`}>{t.name}</div>
              <div className="text-xs text-[#8b8b9e] leading-relaxed">{t.desc}</div>
            </div>
          ))}
        </div>

        {/* Config sections */}
        <div className="space-y-6">
          {/* Claude Code / Desktop */}
          <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1e1e2e] flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-[#f0f0f5]">Claude Code / Claude Desktop</h2>
                <p className="text-xs text-[#8b8b9e] mt-0.5">
                  Add to <code className="text-[#f0f0f5]">~/.claude.json</code> or your project&apos;s <code className="text-[#f0f0f5]">CLAUDE.md</code>
                </p>
              </div>
              <CopyButton text={CLAUDE_CONFIG} label="Copy config" />
            </div>
            <pre className="p-5 text-sm text-[#f0f0f5] font-mono overflow-x-auto bg-[#0a0a0f]">
              <code>{CLAUDE_CONFIG}</code>
            </pre>
            <div className="px-5 py-3 border-t border-[#1e1e2e] text-xs text-[#8b8b9e]">
              Requires <code className="text-[#f0f0f5]">mcp-remote</code> (installed automatically via npx). Works with Claude Code CLI and Claude Desktop app.
            </div>
          </div>

          {/* Cursor */}
          <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1e1e2e] flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-[#f0f0f5]">Cursor / Any MCP Client (HTTP)</h2>
                <p className="text-xs text-[#8b8b9e] mt-0.5">Direct HTTP transport — no proxy needed</p>
              </div>
              <CopyButton text={CURSOR_CONFIG} label="Copy config" />
            </div>
            <pre className="p-5 text-sm text-[#f0f0f5] font-mono overflow-x-auto bg-[#0a0a0f]">
              <code>{CURSOR_CONFIG}</code>
            </pre>
          </div>

          {/* Windsurf */}
          <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1e1e2e] flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-[#f0f0f5]">Windsurf / Codeium</h2>
                <p className="text-xs text-[#8b8b9e] mt-0.5">SSE transport — add to Windsurf MCP settings</p>
              </div>
              <CopyButton text={WINDSURF_CONFIG} label="Copy config" />
            </div>
            <pre className="p-5 text-sm text-[#f0f0f5] font-mono overflow-x-auto bg-[#0a0a0f]">
              <code>{WINDSURF_CONFIG}</code>
            </pre>
          </div>

          {/* Flow diagram */}
          <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1e1e2e] flex items-center justify-between">
              <h2 className="font-semibold text-[#f0f0f5]">What happens on every cite_query call</h2>
            </div>
            <pre className="p-5 text-xs text-[#8b8b9e] font-mono overflow-x-auto bg-[#0a0a0f] leading-relaxed">
              <code>{FLOW_DIAGRAM}</code>
            </pre>
          </div>

          {/* Test the MCP server */}
          <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1e1e2e] flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-[#f0f0f5]">Test the MCP server</h2>
                <p className="text-xs text-[#8b8b9e] mt-0.5">JSON-RPC 2.0 · POST · no auth required</p>
              </div>
              <CopyButton text={CURL_TEST} label="Copy curl" />
            </div>
            <pre className="p-5 text-xs text-[#34D399] font-mono overflow-x-auto bg-[#0a0a0f] leading-relaxed">
              <code>{CURL_TEST}</code>
            </pre>
            <div className="px-5 py-3 border-t border-[#1e1e2e] flex items-center gap-2">
              <CopyButton text="https://citepay-markets.vercel.app/api/mcp" label="Copy URL" />
              <code className="text-xs text-[#4a4a5e] font-mono">https://citepay-markets.vercel.app/api/mcp</code>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-xs text-[#4a4a5e]">
          MCP endpoint: <span className="text-[#8b8b9e]">https://citepay-markets.vercel.app/api/mcp</span>
          {" · "} Arc Testnet · Circle Gateway · No API key required
        </div>
      </div>
    </main>
  );
}
