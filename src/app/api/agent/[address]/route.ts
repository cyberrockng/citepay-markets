import { NextRequest, NextResponse } from "next/server";
import { getAllReceipts } from "@/lib/db";

export const dynamic = "force-dynamic";

function getAgentReceipts(agentAddress: string) {
  return getAllReceipts(500).filter((r) => r.agentAddress === agentAddress);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  try {
    const receipts = getAgentReceipts(address);
    const paid = receipts.filter((r) => r.decision === "PAY");
    const refused = receipts.filter((r) => r.decision === "REFUSE");
    const skips = receipts.filter((r) => r.decision === "SKIP");
    const totalPaid = paid.reduce((s, r) => s + r.amountPaid, 0);

    return NextResponse.json({
      agentAddress: address,
      totalDecisions: receipts.length,
      paidCount: paid.length,
      refusedCount: refused.length,
      skipCount: skips.length,
      totalPaid,
      receipts,
    });
  } catch {
    return NextResponse.json({ agentAddress: address, totalDecisions: 0, receipts: [] });
  }
}
