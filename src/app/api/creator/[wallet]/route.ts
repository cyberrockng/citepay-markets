import { NextRequest, NextResponse } from "next/server";
import { getReceiptsByCreatorWallet, getAllSources, recordShareCard } from "@/lib/db";
import { redisIncrShareCard } from "@/lib/redis-stats";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  const receipts = getReceiptsByCreatorWallet(wallet);
  const sources = getAllSources().filter((s) => s.payoutWallet === wallet);

  const totalEarned = receipts
    .filter((r) => r.decision === "PAY")
    .reduce((sum, r) => sum + r.amountPaid, 0);

  return NextResponse.json({ wallet, sources, receipts, totalEarned });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  const body = await req.json().catch(() => ({}));
  if (body.action === "share" && body.receiptId) {
    const shareId = recordShareCard(body.receiptId, wallet);
    void redisIncrShareCard();
    return NextResponse.json({ shareId, message: "Share card created" });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
