/**
 * GET /api/cron/gap-agent — Autonomous Knowledge Gap Agent
 *
 * Runs on schedule. Finds queries with low citation scores, clusters them by
 * topic, and automatically posts USDC bounties to fill the knowledge gaps.
 * Self-funded: bounty budget comes from citation revenue earned by the agent.
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getDb, createBounty, getBounties } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AGENT_ADDRESS = "0x5389688243328c26a92b301faEEAb5fbf9AFf105";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  // 1. Find recent queries with low citation success rate
  const lowScoreRows = db.prepare(`
    SELECT q.query, q.id,
           COUNT(r.id) as total_decisions,
           SUM(CASE WHEN r.decision='PAY' THEN 1 ELSE 0 END) as paid_count,
           AVG(CASE WHEN r.scores IS NOT NULL THEN json_extract(r.scores,'$.relevance') ELSE 0 END) as avg_relevance
    FROM queries q
    LEFT JOIN receipts r ON r.query_id = q.id
    WHERE q.created_at >= datetime('now','-24 hours')
    GROUP BY q.id
    HAVING paid_count = 0 OR avg_relevance < 45
    ORDER BY q.created_at DESC LIMIT 20
  `).all() as { query: string; id: string; total_decisions: number; paid_count: number; avg_relevance: number }[];

  if (lowScoreRows.length === 0) {
    return NextResponse.json({ posted: 0, message: "No knowledge gaps detected in last 24h" });
  }

  // 2. Check how many auto-bounties are already open (don't flood)
  const openAutoBounties = getBounties("open").filter((b) => (b as unknown as { autoPosted?: boolean }).autoPosted).length;
  if (openAutoBounties >= 3) {
    return NextResponse.json({ posted: 0, message: `${openAutoBounties} auto-bounties already open — waiting for resolution` });
  }

  const gapQueries = lowScoreRows.slice(0, 6).map((r) => r.query).join("\n");

  // 3. Ask Claude to identify the top 2 knowledge gaps and draft bounty titles
  const gapMsg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: `You are a knowledge gap analyst for an AI citation marketplace. These queries got poor results (no good sources found):

${gapQueries}

Identify the 2 most critical knowledge gaps and draft bounty postings to fill them. Bounties will be posted on a marketplace where human experts can submit answers for USDC rewards.

Return ONLY valid JSON:
[
  {
    "title": "Short bounty title (max 80 chars)",
    "query": "Precise research question that would fill this gap",
    "description": "What kind of answer would be most useful (2 sentences)",
    "category": "Protocol|Infrastructure|Research|AI/Agents"
  }
]`,
    }],
  });

  const gapText = (gapMsg.content[0] as { text: string }).text;
  const gapMatch = gapText.match(/\[[\s\S]*\]/);
  if (!gapMatch) return NextResponse.json({ posted: 0, error: "Claude returned no gaps JSON" });

  let gaps: { title: string; query: string; description: string; category: string }[];
  try { gaps = JSON.parse(gapMatch[0]) as typeof gaps; }
  catch { return NextResponse.json({ posted: 0, error: "Failed to parse gaps" }); }

  // 4. Post bounties (max 2, 0.01 USDC each — self-funded from citation revenue)
  const posted: { id: string; title: string }[] = [];
  for (const gap of gaps.slice(0, 2 - openAutoBounties)) {
    const deadline = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const bounty = createBounty({
      title: gap.title.slice(0, 120),
      query: gap.query.slice(0, 500),
      description: `[Auto-posted by Knowledge Gap Agent]\n\n${gap.description}`.slice(0, 1000),
      budgetMicro: 10_000, // 0.01 USDC
      deadline,
      agentAddress: AGENT_ADDRESS,
    });

    // Mark as auto-posted
    db.prepare("UPDATE bounties SET auto_posted = 1, gap_category = ? WHERE id = ?")
      .run(gap.category, bounty.id);

    posted.push({ id: bounty.id, title: bounty.title });
  }

  return NextResponse.json({
    posted: posted.length,
    bounties: posted,
    gapsAnalyzed: lowScoreRows.length,
    message: `Posted ${posted.length} bounties for detected knowledge gaps`,
  });
}
