import { NextRequest, NextResponse } from "next/server";
import { getReceiptById } from "@/lib/db";
import { hashEvidence } from "@/lib/evidence";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const receipt = getReceiptById(id);

  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  // Verify evidence hash is still correct
  const recomputedHash = hashEvidence(receipt.evidencePreimage);
  const hashValid = recomputedHash === receipt.evidenceHash;

  return NextResponse.json({ receipt, hashValid });
}
