"use client";
import { useState } from "react";
import { BackButton } from "@/components/back-button";

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

const EXAMPLE_QUERY = `// After adding CitePay as MCP, just ask Claude:
"Use cite_query to research: How do AI agents use stablecoins for autonomous payments?"

// Claude will:
// 1. Call cite_query with your question
// 2. CitePay agent scores 10 sources, pays creators in USDC
// 3. Returns cited answer + public Policy Receipts
// 4. Every payment is on-chain on Arc via Circle Gateway`;

interface CopyButtonProps {
  text: string;
  label: string;
}

function CopyButton({ text, label }: CopyButtonProps) {
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

export default function McpPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5]">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <BackButton label="Home" />

        <div className="mt-6 mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111118] border border-[#1e1e2e] text-[#8b8b9e] text-xs font-mono mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] inline-block" />
            Model Context Protocol · HTTP Transport
          </div>
          <h1 className="text-3xl font-bold text-[#f0f0f5]">Add CitePay to Claude</h1>
          <p className="text-[#8b8b9e] mt-2">
            Install CitePay as an MCP server in Claude Code or Claude Desktop. Your AI gets a <code className="text-[#00ff88] bg-[#00ff88]/10 px-1 rounded">cite_query</code> tool that pays creators in real USDC on every citation.
          </p>
        </div>

        {/* Tools overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          {[
            { name: "cite_query", desc: "Research a question. Agent pays creators in USDC, returns cited answer + public receipts.", color: "text-[#00ff88]", border: "border-[#00ff88]/20 bg-[#00ff88]/5" },
            { name: "get_receipt", desc: "Fetch any Policy Receipt by ID. Verify evidence hash and on-chain anchor.", color: "text-indigo-400", border: "border-indigo-500/20 bg-indigo-900/10" },
            { name: "check_policy", desc: "Inspect agent spend policies. Conservative, Balanced, or Aggressive preset rules.", color: "text-violet-400", border: "border-violet-500/20 bg-violet-900/10" },
          ].map((t) => (
            <div key={t.name} className={`rounded-xl border p-4 ${t.border}`}>
              <div className={`font-mono text-sm font-bold mb-1 ${t.color}`}>{t.name}</div>
              <div className="text-xs text-[#8b8b9e] leading-relaxed">{t.desc}</div>
            </div>
          ))}
        </div>

        {/* Claude Code / Claude Desktop */}
        <div className="space-y-6">
          <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1e1e2e] flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-[#f0f0f5]">Claude Code / Claude Desktop</h2>
                <p className="text-xs text-[#8b8b9e] mt-0.5">
                  Add to <code className="text-[#f0f0f5]">~/.claude.json</code> or your project's <code className="text-[#f0f0f5]">CLAUDE.md</code>
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

          {/* Usage example */}
          <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1e1e2e] flex items-center justify-between">
              <h2 className="font-semibold text-[#f0f0f5]">Usage Example</h2>
              <CopyButton text={EXAMPLE_QUERY} label="Copy" />
            </div>
            <pre className="p-5 text-xs text-[#8b8b9e] font-mono overflow-x-auto bg-[#0a0a0f] leading-relaxed">
              <code>{EXAMPLE_QUERY}</code>
            </pre>
          </div>

          {/* API direct */}
          <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] p-5">
            <h2 className="font-semibold text-[#f0f0f5] mb-3">Direct API (curl / fetch)</h2>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CopyButton text="https://citepay-markets.vercel.app/api/mcp" label="Copy URL" />
                <code className="text-xs text-[#8b8b9e] font-mono">https://citepay-markets.vercel.app/api/mcp</code>
              </div>
              <div className="flex items-center gap-2">
                <CopyButton text={`curl -s -X POST https://citepay-markets.vercel.app/api/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"cite_query","arguments":{"query":"What is Circle USDC?"}}}'`} label="Copy curl" />
                <span className="text-xs text-[#4a4a5e] font-mono">JSON-RPC 2.0 · POST · no auth required</span>
              </div>
            </div>
          </div>

          {/* What happens */}
          <div className="bg-[#0a0a0f] rounded-xl border border-[#1e1e2e] p-5">
            <div className="text-xs text-[#4a4a5e] font-mono mb-3">{"// what happens on every cite_query call"}</div>
            <div className="space-y-2 font-mono text-xs">
              {[
                { step: "01", text: "Claude calls cite_query with your question", color: "text-indigo-400" },
                { step: "02", text: "CitePay agent scores 10 sources for relevance, price, bond, reputation", color: "text-[#f0f0f5]" },
                { step: "03", text: "PAY decisions: USDC transferred to creators on Arc via Circle Gateway", color: "text-[#00ff88]" },
                { step: "04", text: "Every decision → signed Policy Receipt (public, tamper-evident)", color: "text-[#f0f0f5]" },
                { step: "05", text: "PAY receipts anchored on-chain: CitePayMarket.sol on Arc Testnet", color: "text-violet-400" },
                { step: "06", text: "Returns cited answer + receipt URLs for full audit trail", color: "text-[#f0f0f5]" },
              ].map((s) => (
                <div key={s.step} className="flex gap-3">
                  <span className="text-[#4a4a5e]">{s.step}</span>
                  <span className={s.color}>{s.text}</span>
                </div>
              ))}
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
