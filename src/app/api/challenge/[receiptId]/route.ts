import { NextRequest, NextResponse } from "next/server";
import { getReceiptById, getSourceById, markReceiptChallenged, updateSourceStats, incrementTraction } from "@/lib/db";
import { redisIncrChallenge } from "@/lib/redis-stats";

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
  void redisIncrChallenge();
  // Creator reputation drops for modifying source after payment
  updateSourceStats(receipt.sourceId, "REFUSE");
  // Agent reputation drops slightly for curating a now-broken source
  incrementTraction(`agent_rep_${receipt.agentAddress}`, -1);

  return NextResponse.json({
    success: true,
    message: "Challenge resolved. Content hash changed — creator reputation slashed, agent reputation adjusted. On Arc mainnet this would trigger on-chain slashing of the creator's bond.",
    receiptId,
    hashAtPayment: receipt.contentHashAtDecision,
    currentHash: source.contentHash,
    slashedAmount: receipt.amountPaid,
    note: "Testnet: reputation slash recorded on-chain; bond forfeiture requires Arc mainnet deployment.",
  });
}
