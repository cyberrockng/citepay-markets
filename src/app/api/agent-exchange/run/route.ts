import { NextRequest, NextResponse } from "next/server";
import { runAgentCommerceDemo } from "@/lib/agent-exchange";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    query,
    budget     = 20000,
    agentCount = 2,
    policyMode = "balanced",
  } = body as { query?: string; budget?: number; agentCount?: number; policyMode?: string };

  if (!query || String(query).trim().length < 5) {
    return NextResponse.json({ error: "query is required (min 5 chars)" }, { status: 400 });
  }

  const safeBudget     = Math.min(Math.max(Number(budget), 2000), 100_000);
  const safeAgentCount = Math.min(Math.max(Number(agentCount), 1), 4);
  const safePolicy     = ["conservative", "balanced", "aggressive"].includes(String(policyMode))
    ? String(policyMode) : "balanced";

  try {
    const result = await runAgentCommerceDemo(
      String(query).trim(),
      safeBudget,
      safeAgentCount,
      safePolicy,
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
