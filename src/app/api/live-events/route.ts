import { NextRequest, NextResponse } from "next/server";
import { getRecentReceipts } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") || 8), 20);
  const receipts = getRecentReceipts(limit);
  const events = receipts.map((r) => ({
    decision: r.decision,
    sourceTitle: r.sourceTitle,
    amountPaid: r.amountPaid,
    txHash: r.txHash,
    timestamp: r.createdAt,
    agentAddress: r.agentAddress,
  }));
  return NextResponse.json({ events });
}
