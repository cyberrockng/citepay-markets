import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROTATING_QUERIES = [
  "How does the x402 protocol enable AI agents to pay for content autonomously?",
  "What are the benefits of using Circle Gateway for stablecoin micro-payments?",
  "How do creator bonds and reputation systems prevent citation fraud in AI?",
  "What makes Arc Testnet ideal for high-throughput AI agent micro-transactions?",
  "How can multi-agent orchestration improve research quality and citation accuracy?",
  "What role does USDC play in enabling trustless creator compensation?",
  "How do Agent Spend Policies protect budgets in autonomous AI systems?",
  "What is the economic model behind the AI citation economy?",
  "How does on-chain evidence hashing make AI decisions verifiable and tamper-proof?",
  "Why is Circle's x402 batching protocol important for agentic commerce at scale?",
];

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = ROTATING_QUERIES[Math.floor(Math.random() * ROTATING_QUERIES.length)];

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  try {
    const res = await fetch(`${baseUrl}/api/demo-query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, budget: 0.03, policy: "balanced" }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ success: false, error: err.slice(0, 200), query });
    }

    const data = await res.json() as {
      decisions?: Array<{ decision: string; amountPaid?: number }>;
      totalPaid?: number;
    };
    const receiptsGenerated = (data.decisions ?? []).length;
    const totalPaid = data.totalPaid ?? 0;

    return NextResponse.json({ success: true, query, receiptsGenerated, totalPaid });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err), query });
  }
}
