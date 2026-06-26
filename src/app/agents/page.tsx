"use client";
import Link from "next/link";
import { BackButton } from "@/components/back-button";

const BASE = "https://citepay-markets.vercel.app";

export default function AgentsPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5] pb-20">
      <div className="max-w-4xl mx-auto px-6 pt-12 pb-20">
        <BackButton label="Home" />

        {/* Header */}
        <div className="mt-6 mb-12">
          <div className="text-[10px] font-mono text-[#00ff88] tracking-widest mb-3">FOR AGENT DEVELOPERS</div>
          <h1 className="text-3xl font-bold mb-3">
            Connect your agent to CitePay
          </h1>
          <p className="text-[#8b8b9e] text-sm leading-relaxed max-w-2xl">
            CitePay is a live citation market on Arc Testnet. Your agent pays real USDC to creators
            whenever it cites their work — every decision is public, receipted, and on-chain.
            Three ways to integrate:
          </p>
        </div>

        {/* Option 1: MCP */}
        <div className="bg-[#111118] border border-[#6366f1]/30 rounded-2xl p-7 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-[#6366f1]/20 border border-[#6366f1]/30 flex items-center justify-center">
              <span className="text-[#6366f1] text-xs font-mono font-bold">01</span>
            </div>
            <div>
              <div className="font-semibold text-[#f0f0f5]">Claude MCP (fastest)</div>
              <div className="text-xs text-[#4a4a5e]">One command — works in Claude Code, Claude Desktop, Cursor</div>
            </div>
          </div>
          <div className="bg-[#0a0a0f] rounded-lg p-4 font-mono text-xs text-[#00ff88] mb-4 border border-[#1e1e2e]">
            {`npx -y citepay-mcp`}
          </div>
          <p className="text-sm text-[#8b8b9e] mb-4">
            Or add to your Claude config manually — no wallet setup needed for read operations.
            Exposes <span className="text-[#f0f0f5] font-mono">cite_query</span>,{" "}
            <span className="text-[#f0f0f5] font-mono">get_receipt</span>, and{" "}
            <span className="text-[#f0f0f5] font-mono">check_policy</span> as native Claude tools.
          </p>
          <div className="bg-[#0a0a0f] rounded-lg p-4 font-mono text-xs border border-[#1e1e2e] text-[#8b8b9e] space-y-1">
            <div className="text-[#4a4a5e] text-[10px] tracking-widest mb-2">~/.claude.json or claude_desktop_config.json</div>
            <div>{`{`}</div>
            <div className="pl-4">{`"mcpServers": {`}</div>
            <div className="pl-8">{`"citepay": {`}</div>
            <div className="pl-12">{`"command": "npx",`}</div>
            <div className="pl-12">{`"args": ["-y", "citepay-mcp"]`}</div>
            <div className="pl-8">{`}`}</div>
            <div className="pl-4">{`}`}</div>
            <div>{`}`}</div>
          </div>
          <div className="mt-4">
            <Link href="/mcp" className="text-[#6366f1] text-sm hover:text-indigo-300 transition-colors">
              Full MCP docs →
            </Link>
          </div>
        </div>

        {/* Option 2: x402 REST */}
        <div className="bg-[#111118] border border-[#00ff88]/20 rounded-2xl p-7 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-[#00ff88]/10 border border-[#00ff88]/20 flex items-center justify-center">
              <span className="text-[#00ff88] text-xs font-mono font-bold">02</span>
            </div>
            <div>
              <div className="font-semibold text-[#f0f0f5]">x402 REST (Circle Gateway)</div>
              <div className="text-xs text-[#4a4a5e]">Any language — requires USDC on Arc Testnet + Circle Gateway signing</div>
            </div>
          </div>
          <div className="bg-[#0a0a0f] rounded-lg p-4 font-mono text-xs border border-[#1e1e2e] mb-4 overflow-x-auto text-[#8b8b9e]">
            <div className="text-[#4a4a5e] mb-2">// Circle Gateway (JavaScript)</div>
            <div><span className="text-[#6366f1]">const</span>{" client = new GatewayClient({"}</div>
            <div className="pl-4">{"chain: "}<span className="text-[#00ff88]">{"\"arcTestnet\""}</span>{","}</div>
            <div className="pl-4">{"privateKey: "}<span className="text-[#00ff88]">{"process.env.AGENT_KEY"}</span></div>
            <div>{"});"}</div>
            <div className="mt-2"><span className="text-[#6366f1]">const</span>{" { data } = await client.pay("}</div>
            <div className="pl-4"><span className="text-[#00ff88]">{`"${BASE}/api/ask"`}</span>{","}</div>
            <div className="pl-4">{"{ method: \"POST\", body: JSON.stringify({"}</div>
            <div className="pl-8">{"query: \"What is x402?\", policy: \"balanced\""}</div>
            <div className="pl-4">{"}) }"}</div>
            <div>{");"}</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="bg-[#0a0a0f] rounded-lg p-4 border border-[#1e1e2e] text-xs font-mono">
              <div className="text-[#4a4a5e] text-[10px] tracking-widest mb-2">ENDPOINT</div>
              <div className="text-[#f0f0f5]">POST {BASE}/api/ask</div>
              <div className="text-[#4a4a5e] mt-2">Query fee: $0.001 USDC</div>
              <div className="text-[#4a4a5e]">Budget: 0.01 – 1.0 USDC</div>
              <div className="text-[#4a4a5e]">Chain: Arc Testnet (5042002)</div>
            </div>
            <div className="bg-[#0a0a0f] rounded-lg p-4 border border-[#1e1e2e] text-xs font-mono">
              <div className="text-[#4a4a5e] text-[10px] tracking-widest mb-2">BODY PARAMS</div>
              <div><span className="text-[#6366f1]">query</span><span className="text-[#4a4a5e]"> string (required)</span></div>
              <div><span className="text-[#6366f1]">budget</span><span className="text-[#4a4a5e]"> number USDC (0.05)</span></div>
              <div><span className="text-[#6366f1]">policy</span><span className="text-[#4a4a5e]"> conservative|balanced|aggressive</span></div>
              <div><span className="text-[#6366f1]">category</span><span className="text-[#4a4a5e]"> Research|Protocol|AI/Agents</span></div>
            </div>
          </div>

          <div className="bg-[#0a0a0f] rounded-lg p-4 font-mono text-xs border border-[#1e1e2e] text-[#8b8b9e]">
            <div className="text-[#4a4a5e] text-[10px] tracking-widest mb-2">RESPONSE</div>
            <div><span className="text-[#6366f1]">answer</span><span className="text-[#4a4a5e]"> — synthesized answer with inline citations</span></div>
            <div><span className="text-[#6366f1]">decisions[]</span><span className="text-[#4a4a5e]"> — PAY/REFUSE/SKIP per source with VCS weight</span></div>
            <div><span className="text-[#6366f1]">totalPaid</span><span className="text-[#4a4a5e]"> — micro-USDC paid to creators</span></div>
            <div><span className="text-[#6366f1]">receiptIds[]</span><span className="text-[#4a4a5e]"> — verifiable receipts, ArcScan-linked</span></div>
          </div>
        </div>

        {/* Option 3: Demo / No-auth */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-7 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-[#1e1e2e] border border-[#2e2e3e] flex items-center justify-center">
              <span className="text-[#4a4a5e] text-xs font-mono font-bold">03</span>
            </div>
            <div>
              <div className="font-semibold text-[#f0f0f5]">Demo endpoint (no wallet needed)</div>
              <div className="text-xs text-[#4a4a5e]">Test CitePay instantly — server signs payment on your behalf</div>
            </div>
          </div>
          <div className="bg-[#0a0a0f] rounded-lg p-4 font-mono text-xs text-[#00ff88] mb-3 border border-[#1e1e2e]">
            {`curl -X POST ${BASE}/api/demo-query \\
  -H "Content-Type: application/json" \\
  -d '{"query": "What is x402?", "policy": "balanced"}'`}
          </div>
          <p className="text-xs text-[#4a4a5e]">
            Demo mode uses our agent wallet to sign and pay. Real USDC is transferred on Arc Testnet.
            Rate-limited to 1 request per 15s per IP.
          </p>
        </div>

        {/* Cross-project integration */}
        <div className="bg-[#111118] border border-amber-500/20 rounded-2xl p-7 mb-6">
          <div className="text-[10px] font-mono text-amber-400 tracking-widest mb-3">CROSS-PROJECT INTEGRATION</div>
          <h2 className="font-semibold text-[#f0f0f5] mb-3">Register your project&apos;s content as a CitePay source</h2>
          <p className="text-sm text-[#8b8b9e] mb-5 leading-relaxed">
            If you&apos;re building on Arc/Circle in this hackathon, register your docs, blog posts, or
            protocol specs as CitePay sources. Our agent will pay you USDC when it cites your work
            in its answers. Real USDC, real on-chain receipts.
          </p>
          <div className="flex gap-3 flex-wrap">
            <Link
              href="/creator"
              className="bg-amber-500/20 border border-amber-500/40 hover:border-amber-500/70 text-amber-300 font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm"
            >
              Register your docs →
            </Link>
            <Link
              href="/creator"
              className="border border-[#1e1e2e] hover:border-amber-500/30 text-[#8b8b9e] hover:text-amber-300 font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm"
            >
              Register via RSS feed
            </Link>
          </div>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: "/ask",        label: "Try /ask",         desc: "Live query UI" },
            { href: "/mcp",        label: "MCP Setup",        desc: "Claude integration" },
            { href: "/market",     label: "Browse Sources",   desc: "See what is citable" },
            { href: "/economy",    label: "Economy Index",    desc: "Live market stats" },
          ].map(({ href, label, desc }) => (
            <Link key={href} href={href}
              className="bg-[#111118] border border-[#1e1e2e] hover:border-[#6366f1]/30 rounded-xl p-4 text-center transition-colors group">
              <div className="font-semibold text-sm text-[#f0f0f5] group-hover:text-[#6366f1] transition-colors">{label}</div>
              <div className="text-[10px] text-[#4a4a5e] mt-1">{desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
