import { NextRequest, NextResponse } from "next/server";
import { getReceiptById, getSourceById, markReceiptChallenged, updateSourceHash } from "@/lib/db";
import { incrementTraction } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/challenge/:receiptId
 * Objective-only: triggers only if current source content hash differs from
 * the hash recorded at decision time.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ receiptId: string }> }
) {
  const { receiptId } = await params;

  const receipt = getReceiptById(receiptId);
  if (!receipt) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  if (receipt.decision !== "PAY") {
    return NextResponse.json({ error: "Only PAY receipts are challengeable" }, { status: 400 });
  }
  if (receipt.challenged) {
    return NextResponse.json({ error: "Already challenged" }, { status: 400 });
  }

  const source = getSourceById(receipt.sourceId);
  if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });

  if (source.contentHash === receipt.contentHashAtDecision) {
    return NextResponse.json(
      { error: "Hash unchanged — objective slash condition not met. Subjective challenges are not allowed." },
      { status: 400 }
    );
  }

  markReceiptChallenged(receiptId);
  incrementTraction("challenge_count");

  return NextResponse.json({
    success: true,
    message: "Challenge resolved. Content hash changed after payment — creator reputation reduced.",
    receiptId,
    hashAtPayment: receipt.contentHashAtDecision,
    currentHash: source.contentHash,
    refundAmount: receipt.amountPaid,
  });
}
