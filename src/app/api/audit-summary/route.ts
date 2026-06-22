import { NextRequest, NextResponse } from "next/server";
import { getReceiptsFiltered } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentAddress = searchParams.get("agent");
  const purposeCode  = searchParams.get("purpose");
  const since        = searchParams.get("since");
  const limit        = Math.min(Number(searchParams.get("limit") || 50), 200);

  const receipts = getReceiptsFiltered({ agentAddress, purposeCode, since, limit });

  const byPurpose: Record<string, { count: number; totalMicro: number }> = {};
  for (const r of receipts) {
    const code = r.purposeCode || (r.decision === "PAY" ? "CITE" : r.decision);
    if (!byPurpose[code]) byPurpose[code] = { count: 0, totalMicro: 0 };
    byPurpose[code].count++;
    byPurpose[code].totalMicro += r.amountPaid;
  }

  const uniqueCreators = new Set(
    receipts.filter((r) => r.decision === "PAY").map((r) => r.creatorWallet)
  ).size;
  const totalMicro = receipts
    .filter((r) => r.decision === "PAY")
    .reduce((s, r) => s + r.amountPaid, 0);

  return NextResponse.json({
    query: { agentAddress, purposeCode, since, limit },
    summary: {
      totalReceipts: receipts.length,
      uniqueCreatorsPaid: uniqueCreators,
      totalUSDCPaid: (totalMicro / 1e6).toFixed(6),
      byPurpose,
    },
    receipts: receipts.map((r) => ({
      id: r.id,
      purposeCode: r.purposeCode || (r.decision === "PAY" ? "CITE" : r.decision),
      decision: r.decision,
      sourceTitle: r.sourceTitle,
      creatorWallet: r.creatorWallet,
      amountPaid: r.amountPaid,
      txHash: r.txHash,
      agentAddress: r.agentAddress,
      createdAt: r.createdAt,
      evidenceHash: r.evidenceHash,
    })),
    generatedAt: new Date().toISOString(),
  });
}
