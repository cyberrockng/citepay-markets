import { NextRequest, NextResponse } from "next/server";
import { hireAgent } from "@/lib/agent-exchange";
import { createRateLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// 1 hire per 8s per IP, max 20 per instance lifetime
const _checkRateLimit = createRateLimiter({ windowMs: 8_000, lifetimeCap: 20 });

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = _checkRateLimit(ip);
  if (!rl.allowed) return NextResponse.json({ error: rl.reason }, { status: 429 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { agentId, query, queryId, budgetMicro } = body as {
    agentId?: string; query?: string; queryId?: string; budgetMicro?: number;
  };

  if (!agentId || !query) {
    return NextResponse.json({ error: "agentId and query are required" }, { status: 400 });
  }

  try {
    const result = await hireAgent(
      String(agentId),
      String(query),
      String(queryId ?? `hire-${Date.now()}`),
      Number(budgetMicro ?? 5000),
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
