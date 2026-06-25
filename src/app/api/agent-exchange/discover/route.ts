import { NextRequest, NextResponse } from "next/server";
import { discoverAgents } from "@/lib/agent-exchange";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url    = new URL(req.url);
  const specialty = url.searchParams.get("specialty") ?? "";
  const budget    = Number(url.searchParams.get("budget")  ?? "50000");
  const policy    = url.searchParams.get("policy")  ?? "balanced";

  try {
    const agents = discoverAgents(specialty, budget, policy);
    return NextResponse.json({ agents, count: agents.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
