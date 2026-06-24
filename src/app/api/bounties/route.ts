import { NextRequest, NextResponse } from "next/server";
import { getBounties, createBounty } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  try {
    const bounties = getBounties(status);
    return NextResponse.json({ bounties });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { title, query, description, budgetUsdc, deadlineHours, agentAddress } = body as {
    title?: string; query?: string; description?: string;
    budgetUsdc?: number; deadlineHours?: number; agentAddress?: string;
  };

  if (!title || !query || !budgetUsdc || !agentAddress) {
    return NextResponse.json({ error: "title, query, budgetUsdc, agentAddress required" }, { status: 400 });
  }

  const hours = Math.min(Math.max(Number(deadlineHours) || 48, 1), 168);
  const deadline = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  const budgetMicro = Math.round(Number(budgetUsdc) * 1_000_000);

  try {
    const bounty = createBounty({
      title: String(title).slice(0, 120),
      query: String(query).slice(0, 500),
      description: String(description || "").slice(0, 1000),
      budgetMicro,
      deadline,
      agentAddress: String(agentAddress),
    });
    return NextResponse.json({ bounty }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
