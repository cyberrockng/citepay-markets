/**
 * GET /api/auction?query=... — Streams per-source relevance scores as SSE events.
 * Each source is scored by Claude concurrently; events arrive as scoring completes.
 */
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAllSources } from "@/lib/db";

export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function scoreSource(
  source: { id: string; title: string; description: string; price: number; bonded: boolean; reputation: number; paidCount: number },
  query: string
): Promise<{ id: string; relevance: number; priceScore: number; reputationScore: number; total: number; reason: string }> {
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 120,
    messages: [{
      role: "user",
      content: `Rate how relevant this source is to the query. Return ONLY JSON.

Query: "${query}"
Source: "${source.title}"
Description: "${source.description.slice(0, 200)}"

JSON format: {"relevance": <0-100>, "reason": "<one sentence>"}`,
    }],
  });
  const text = (msg.content[0] as { text: string }).text;
  const match = text.match(/\{[\s\S]*\}/);
  let relevance = 50;
  let reason = "Unable to score";
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { relevance?: number; reason?: string };
      relevance = Math.min(100, Math.max(0, parsed.relevance ?? 50));
      reason = parsed.reason ?? reason;
    } catch { /* keep defaults */ }
  }

  const priceScore = Math.max(0, 100 - Math.round(source.price / 60));
  const reputationScore = Math.min(30, source.reputation + (source.paidCount * 2));
  const bondBonus = source.bonded ? 20 : 0;
  const total = Math.round(relevance * 0.5 + priceScore * 0.2 + reputationScore * 0.15 + bondBonus * 0.15);

  return { id: source.id, relevance, priceScore, reputationScore, total, reason };
}

export async function GET(req: NextRequest) {
  const query = new URL(req.url).searchParams.get("query") ?? "";
  if (!query.trim()) {
    return new Response("query parameter required", { status: 400 });
  }

  const sources = getAllSources().slice(0, 12);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      send({ type: "start", sourceCount: sources.length, query });

      await Promise.all(
        sources.map(async (source) => {
          try {
            const score = await scoreSource(source, query);
            send({
              type: "score",
              sourceId: source.id,
              title: source.title,
              price: source.price,
              bonded: source.bonded,
              category: source.category,
              ...score,
            });
          } catch {
            send({
              type: "score",
              sourceId: source.id,
              title: source.title,
              price: source.price,
              bonded: source.bonded,
              category: source.category,
              id: source.id, relevance: 0, priceScore: 0, reputationScore: 0, total: 0,
              reason: "Scoring failed",
            });
          }
        })
      );

      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
