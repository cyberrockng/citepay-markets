import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getBountyById, getBountySubmissions, closeBounty, autoRegisterKnowledge } from "@/lib/db";
import { payCreator } from "@/lib/payments";

export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bounty = getBountyById(id);
  if (!bounty) return NextResponse.json({ error: "Bounty not found" }, { status: 404 });
  if (bounty.status === "closed") return NextResponse.json({ error: "Bounty already closed" }, { status: 409 });

  const submissions = getBountySubmissions(id);
  if (submissions.length === 0) return NextResponse.json({ error: "No submissions to evaluate" }, { status: 400 });

  const host = req.headers.get("host") ?? "citepay-markets.vercel.app";

  try {
    // ── Claude evaluates each submission ──────────────────────────────────────
    const submissionList = submissions.map((s, i) =>
      `[${i + 1}] Creator: ${s.creatorName} (${s.creatorHandle})\nContent:\n${s.content.slice(0, 800)}`
    ).join("\n\n---\n\n");

    const evalMsg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{
        role: "user",
        content: `You are evaluating submissions for a knowledge bounty.

Bounty question: "${bounty.query}"
Budget: $${(bounty.budgetMicro / 1_000_000).toFixed(2)} USDC

Submissions:
${submissionList}

Score each submission 0-100 on: accuracy, relevance, depth, clarity.
Return ONLY valid JSON:
{
  "scores": [
    { "index": 1, "score": 85, "reason": "brief reason" },
    ...
  ],
  "winnerIndex": 1
}`,
      }],
    });

    const evalText = (evalMsg.content[0] as { text: string }).text;
    const jsonMatch = evalText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Claude returned no JSON");
    const evalResult = JSON.parse(jsonMatch[0]) as {
      scores: { index: number; score: number; reason: string }[];
      winnerIndex: number;
    };

    const scoresMap: Record<string, { score: number; reason: string }> = {};
    for (const ev of evalResult.scores) {
      const sub = submissions[ev.index - 1];
      if (sub) scoresMap[sub.id] = { score: ev.score, reason: ev.reason };
    }

    const winner = submissions[evalResult.winnerIndex - 1] ?? submissions[0];

    // ── Pay winner via USDC ───────────────────────────────────────────────────
    let txHash: string | null = null;
    let paidMicro = bounty.budgetMicro;
    try {
      const result = await payCreator({
        creatorWallet: winner.creatorWallet,
        amountMicroUsdc: bounty.budgetMicro,
        sourceId: `bounty-${id}`,
        receiptId: `bounty-win-${id}`,
      });
      txHash = result.txHash;
      paidMicro = bounty.budgetMicro;
    } catch {
      paidMicro = 0;
    }

    // ── Close bounty in DB ────────────────────────────────────────────────────
    closeBounty({
      id,
      winnerSubmissionId: winner.id,
      winnerWallet: winner.creatorWallet,
      winnerPaidMicro: paidMicro,
      winnerTxHash: txHash,
      scores: scoresMap,
    });

    // ── Auto-register winning answer as citable source ────────────────────────
    let knowledgeSourceId: string | null = null;
    try {
      knowledgeSourceId = autoRegisterKnowledge({
        answer: winner.content,
        query: bounty.query,
        queryId: `bounty-${id}`,
        agentWallet: bounty.agentAddress,
        host,
      });
    } catch { /* non-fatal */ }

    return NextResponse.json({
      winner: {
        submissionId: winner.id,
        creatorName: winner.creatorName,
        creatorHandle: winner.creatorHandle,
        creatorWallet: winner.creatorWallet,
        paidMicro,
        txHash,
      },
      scores: evalResult.scores,
      knowledgeSourceId,
      bounty: getBountyById(id),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
