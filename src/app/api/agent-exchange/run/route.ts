import { NextRequest, NextResponse } from "next/server";
import { runAgentCommerceDemo } from "@/lib/agent-exchange";

export const dynamic = "force-dynamic";

// In-memory rate limit: 1 run per 10s per IP, max 15 per instance lifetime
const _ts  = new Map<string, number>();
const _cnt = new Map<string, number>();

function checkRateLimit(ip: string): { blocked: boolean; reason?: string } {
  const now = Date.now(); const last = _ts.get(ip) ?? 0;
  if (now - last < 10_000) return { blocked: true, reason: `Rate limit: wait ${Math.ceil((10_000 - (now - last)) / 1000)}s between runs` };
  if ((_cnt.get(ip) ?? 0) >= 15) return { blocked: true, reason: "Session limit reached (15 runs)" };
  _ts.set(ip, now); _cnt.set(ip, (_cnt.get(ip) ?? 0) + 1);
  return { blocked: false };
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit(ip);
  if (rl.blocked) return NextResponse.json({ error: rl.reason }, { status: 429 });
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
