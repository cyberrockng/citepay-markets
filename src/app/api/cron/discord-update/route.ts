/**
 * Cron: daily Discord update — runs at 11:00 UTC (12:00 WAT / noon Nigeria)
 * Posts a rotating daily update to the Canteen + Arc hackathon Discord servers
 * via webhook. Set DISCORD_WEBHOOK_URL env var to activate.
 *
 * Schedule: "0 11 * * *" in vercel.json
 * Covers Jun 22–29, 2026 (8 posts, one per day until submission deadline)
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Indexed by date string "YYYY-MM-DD" → Discord message content
const DAILY_UPDATES: Record<string, { title: string; body: string; emoji: string }> = {
  "2026-06-22": {
    emoji: "🚀",
    title: "CitePay Markets — Day 1",
    body: `**CitePay Markets** is live on Arc Testnet.

AI agents pay creators **$0.001 USDC per source cited** — every decision is transparent, on-chain, and auditable.

🔗 Live: https://citepay-markets.vercel.app
📦 Repo: https://github.com/cyberrockng/citepay-markets

Stack: x402 payment gate · Circle Gateway (EIP-3009) · Claude Haiku scoring · CitePayMarket.sol on Arc Testnet

Built for the **Lepton Agents Hackathon** — RFB 01 (Autonomous Paying Agents) + RFB 06 (Creator Monetization).`,
  },
  "2026-06-23": {
    emoji: "⚡",
    title: "CitePay Markets — x402 Payment Flow",
    body: `How the payment gate works in CitePay Markets:

1️⃣ Agent hits \`POST /api/ask\` → gets **HTTP 402** back
2️⃣ Circle Gateway verifies EIP-3009 \`TransferWithAuthorization\` (signed by buyer wallet)
3️⃣ \`BatchFacilitatorClient.settle()\` moves $0.001 USDC on Arc in <500ms
4️⃣ Agent scores 10 creator sources · pays the best ones · refuses low-quality
5️⃣ Every decision anchored on-chain with SHA-256 evidence hash

No MetaMask needed for buyers — Circle Programmable Wallet (DCW) signs via HSM.

🔗 https://citepay-markets.vercel.app/ask`,
  },
  "2026-06-24": {
    emoji: "🔒",
    title: "CitePay Markets — On-Chain Bonding & Slashing",
    body: `Creators put **ETH bonds on the line** when they register sources.

📜 \`CreatorBond.sol\` deployed on Arc Testnet:
• \`postBond()\` — lock ETH as quality collateral
• \`slashBond(receiptId)\` — anyone can slash if the agent finds objective failure
• Bond forfeiture is **live on-chain** — not a reputation score, actual ETH burned

📜 \`CitationMandate.sol\`:
• Records every \`CitationAllowed\` / \`CitationBlocked\` decision on-chain
• Creates a new mandate per buyer session for audit trail

This is how agents get honest sources: creators who cheat lose their bond.

🔗 https://testnet.arcscan.app — search contract \`0x7DBa1C67Fd…\``,
  },
  "2026-06-25": {
    emoji: "🌉",
    title: "CitePay Markets — CCTP Cross-Chain Creator Payouts",
    body: `Creators shouldn't be locked into Arc Testnet to receive payments.

CitePay now supports **CCTP v2 cross-chain payouts** — creators can receive USDC on any supported chain:

🔁 Arc Testnet → Base Sepolia / Ethereum Sepolia / Arbitrum Sepolia / Optimism Sepolia / Avalanche Fuji / Polygon Amoy

How it works:
\`\`\`
POST /api/cctp/fund-creator
{ creatorWallet, amountMicroUsdc, destChain: "Base_Sepolia" }
\`\`\`
→ Burns USDC on Arc
→ Circle CCTP v2 attestation
→ Mints on Base via Circle Forwarder (gasless for creator)

SDK: \`@circle-fin/unified-balance-kit\` · \`spend()\` + CCTP domain 26 (Arc)

🔗 https://citepay-markets.vercel.app/labs/wallet`,
  },
  "2026-06-26": {
    emoji: "📊",
    title: "CitePay Markets — Live Traction on Arc Testnet",
    body: `Real payments. Real receipts. Real on-chain activity.

Live traction from Arc Testnet (updated every query):
• **Citations paid** — agent PAY decisions with on-chain receipts
• **USDC routed** — real test-USDC flowing to creator wallets
• **Policy decisions** — conservative / balanced / aggressive spend policies in use
• **Bonded sources** — creators with ETH at stake

Check live stats: https://citepay-markets.vercel.app/demo

Every payment is a \`CitationPaid\` event on \`CitePayMarket.sol\` — fully auditable on ArcScan.

Built for **RFB 06** — the LLM Crawler Citation-Toll Layer that pays source authors when AI agents ground answers in their work.`,
  },
  "2026-06-27": {
    emoji: "💜",
    title: "CitePay Markets — Circle Programmable Wallet (No MetaMask)",
    body: `Biggest UX milestone this week: **buyers no longer need MetaMask**.

New flow on \`/ask\`:
1. Click **"Create Circle Wallet →"** — no browser extension
2. Circle HSM creates a DCW on Arc Testnet + funds $0.005 (5 queries)
3. Session persists in localStorage (24h) — survives page reload
4. Live USDC balance shown: "0.004 USDC · 4 queries remaining"
5. Click **"Circle Pay & Ask →"** — Circle HSM signs EIP-3009, Gateway settles

Zero private keys in the browser. Circle MPC signs everything server-side.

SDK: \`@circle-fin/developer-controlled-wallets\` · \`signTypedData()\`

🔗 https://citepay-markets.vercel.app/ask`,
  },
  "2026-06-28": {
    emoji: "🤖",
    title: "CitePay Markets — MCP Server + Multi-Agent Orchestration",
    body: `CitePay Markets isn't just a UI — it's an **agent-native API**.

🔧 MCP Server (\`/api/mcp\` — JSON-RPC 2.0):
• \`cite_query\` — pay to query sources (x402 gated)
• \`get_receipt\` — fetch on-chain policy receipt by ID
• \`check_policy\` — inspect agent spend policy rules

🎭 Multi-Agent Orchestration (\`/api/orchestrate\`):
• Decomposes query into sub-questions
• Spawns parallel sub-agents, each paying via Circle Gateway
• Synthesizes responses with citation evidence

Any Claude Code agent, Cursor agent, or custom LLM can plug in via MCP and pay-per-query — no subscription, no API key, just x402.

🔗 https://citepay-markets.vercel.app`,
  },
  "2026-06-29": {
    emoji: "🏁",
    title: "CitePay Markets — Submitted ✓",
    body: `**CitePay Markets** is submitted to the Lepton Agents Hackathon.

What we built in 2 weeks:
✅ x402 pay-per-query gate with Circle Gateway (EIP-3009, <500ms settlement)
✅ AI agent scores sources under configurable Spend Policy (conservative / balanced / aggressive)
✅ On-chain receipts anchored to \`CitePayMarket.sol\` on Arc Testnet
✅ \`CreatorBond.sol\` + \`CitationMandate.sol\` — 43 Solidity tests passing
✅ Circle Programmable Wallet (DCW) buyer path — no MetaMask needed
✅ CCTP v2 cross-chain creator payouts (7 chains)
✅ MCP server for agent-native access
✅ Multi-agent orchestration with parallel sub-agents

🔗 Live: https://citepay-markets.vercel.app
📦 Repo: https://github.com/cyberrockng/citepay-markets

Thanks to @Canteen, @Circle, and @Arc for building the rails that make this possible. The lepton lives again 🪙`,
  },
};

async function postToDiscord(webhookUrl: string, content: { title: string; body: string; emoji: string }) {
  const payload = {
    username: "CitePay Markets",
    avatar_url: "https://citepay-markets.vercel.app/favicon.ico",
    embeds: [
      {
        title: `${content.emoji} ${content.title}`,
        description: content.body,
        color: 0x6366f1,
        footer: { text: "Lepton Agents Hackathon · Jun 15–29 2026 · Arc Testnet" },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord webhook failed: ${res.status} — ${text}`);
  }
  return true;
}

export async function GET(req: NextRequest) {
  // Verify this is a legitimate Vercel cron invocation
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({
      skipped: true,
      reason: "DISCORD_WEBHOOK_URL not set — add it to Vercel env vars to activate daily posts",
    });
  }

  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const content = DAILY_UPDATES[today];

  if (!content) {
    return NextResponse.json({ skipped: true, reason: `No content scheduled for ${today}` });
  }

  try {
    await postToDiscord(webhookUrl, content);
    return NextResponse.json({ ok: true, posted: today, title: content.title });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
