import { NextRequest, NextResponse } from "next/server";
import { getReceiptById, getAgentHireReceiptById } from "@/lib/db";
import { hashEvidence } from "@/lib/evidence";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Standard citation receipt
  const receipt = getReceiptById(id);
  if (receipt) {
    const recomputedHash = hashEvidence(receipt.evidencePreimage);
    const hashValid = recomputedHash === receipt.evidenceHash;
    return NextResponse.json({ receipt, hashValid, receiptType: "CITATION" });
  }

  // Agent hire receipt
  const hireReceipt = getAgentHireReceiptById(id);
  if (hireReceipt) {
    return NextResponse.json({ receipt: hireReceipt, hashValid: true, receiptType: "AGENT_HIRE" });
  }

  return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
}
