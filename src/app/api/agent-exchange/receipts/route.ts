import { NextRequest, NextResponse } from "next/server";
import { getAgentHireReceipts } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url     = new URL(req.url);
  const queryId = url.searchParams.get("queryId") ?? undefined;
  const limit   = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

  try {
    const receipts = getAgentHireReceipts(queryId, limit);
    return NextResponse.json({ receipts, count: receipts.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
