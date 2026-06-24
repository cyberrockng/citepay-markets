import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionById, getSessionTurns, addSessionTurn, updateSessionContext } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getSessionById(id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  let body: { query?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const query = body.query?.trim();
  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

  const existingTurns = getSessionTurns(id);
  const turnIndex = existingTurns.length;

  const host = req.headers.get("host") ?? "citepay-markets.vercel.app";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const baseUrl = `${proto}://${host}`;

  // Build context from prior turns (last 3) for Claude
  const priorContext = existingTurns.slice(-3).map((t) =>
    `Q: ${t.query}\nA: ${t.answer.slice(0, 300)}`
  ).join("\n\n");

  // Augment query with session context if we have prior turns
  const augmentedQuery = priorContext
    ? `[Session context — prior Q&A:\n${priorContext}\n]\n\nNew question: ${query}`
    : query;

  // Run the cite query via demo-query (Circle Gateway pays for us)
  let queryResult: {
    queryId?: string; answer?: string;
    decisions?: { decision: string; source: string; amountPaid: number; receiptId?: string }[];
    totalPaid?: number;
  } = {};

  try {
    const res = await fetch(`${baseUrl}/api/demo-query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: augmentedQuery, budget: 0.04, policy: session.policy }),
    });
    queryResult = await res.json() as typeof queryResult;
  } catch (err) {
    return NextResponse.json({ error: `Query failed: ${String(err)}` }, { status: 500 });
  }

  const paid = (queryResult.decisions ?? []).filter((d) => d.decision === "PAY");
  const receiptIds = paid.map((d) => d.receiptId ?? "").filter(Boolean);
  const amountPaid = queryResult.totalPaid ?? 0;

  const turn = addSessionTurn({
    sessionId: id, query, answer: queryResult.answer ?? "(no answer)",
    queryId: queryResult.queryId ?? null,
    citationsPaid: paid.length, amountPaidMicro: amountPaid,
    receiptIds, turnIndex,
  });

  // Update context summary every 3 turns
  if ((turnIndex + 1) % 3 === 0) {
    try {
      const allTurns = getSessionTurns(id);
      const summaryMsg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001", max_tokens: 150,
        messages: [{ role: "user", content: `Summarize this research session in 2 sentences:\n${allTurns.map((t) => `Q: ${t.query}`).join("\n")}` }],
      });
      updateSessionContext(id, (summaryMsg.content[0] as { text: string }).text);
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({
    turn,
    answer: queryResult.answer,
    decisions: queryResult.decisions,
    totalPaid: amountPaid,
    receiptIds,
  });
}
