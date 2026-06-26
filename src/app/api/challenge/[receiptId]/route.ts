import { NextRequest, NextResponse } from "next/server";
import { getReceiptById, getSourceById, markReceiptChallenged, updateSourceStats, incrementTraction, updateSourceHash } from "@/lib/db";
import { redisIncrChallenge } from "@/lib/redis-stats";
import { verifyContentHash } from "@/lib/content-hash";

export const dynamic = "force-dynamic";

/**
 * GET /api/challenge/:receiptId  — non-destructive verification.
 * Re-fetches the source URL, compares live hash against contentHashAtDecision.
 * Returns VERIFIED | CHANGED | FETCH_FAILED without committing any state change.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ receiptId: string }> }
) {
  const { receiptId } = await params;

  const receipt = getReceiptById(receiptId);
  if (!receipt) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });

  const source = getSourceById(receipt.sourceId);
  if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });

  const result = await verifyContentHash({
    url:        source.url,
    storedHash: receipt.contentHashAtDecision,
    label:      source.title,
  });

  // Keep SQLite in sync when we discover the live hash (non-destructive update)
  if (result.verdict === "CHANGED" && result.liveHash) {
    updateSourceHash(source.id, result.liveHash);
  }

  return NextResponse.json({
    receiptId,
    sourceId:             source.id,
    sourceTitle:          source.title,
    sourceUrl:            source.url,
    hashAtDecision:       receipt.contentHashAtDecision,
    liveHash:             result.liveHash,
    verdict:              result.verdict,
    verdictDetail:        result.verdictDetail,
    verified:             result.verified,
    contentLength:        result.contentLength,
    fetchedAt:            result.fetchedAt,
    fetchError:           result.fetchError ?? null,
    alreadyChallenged:    receipt.challenged,
    challengeable:        result.verdict === "CHANGED" && !receipt.challenged && receipt.decision === "PAY",
  });
}

/**
 * POST /api/challenge/:receiptId — commit a challenge.
 * Re-fetches the live content hash. Resolves only if hash changed (objective).
 * On success: marks receipt challenged, slashes creator reputation, updates source hash.
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

  // Re-fetch live content — this is the real comparison
  const result = await verifyContentHash({
    url:        source.url,
    storedHash: receipt.contentHashAtDecision,
    label:      source.title,
  });

  if (result.verdict === "FETCH_FAILED") {
    return NextResponse.json({
      error:   "Could not fetch source URL to verify content",
      detail:  result.fetchError,
      verdict: "FETCH_FAILED",
    }, { status: 502 });
  }

  if (result.verdict === "VERIFIED") {
    return NextResponse.json({
      error:   "Hash unchanged — content matches citation record. Objective slash condition not met.",
      verdict: "VERIFIED",
      hashAtDecision: receipt.contentHashAtDecision,
      liveHash:       result.liveHash,
    }, { status: 400 });
  }

  // Content has changed — commit the challenge
  markReceiptChallenged(receiptId);
  incrementTraction("challenge_count");
  void redisIncrChallenge();

  // Update stored hash to the new live value
  updateSourceHash(source.id, result.liveHash);

  // Creator reputation drops for modifying source after payment
  updateSourceStats(receipt.sourceId, "REFUSE");

  // Agent reputation adjustment
  incrementTraction(`agent_rep_${receipt.agentAddress}`, -1);

  console.log(`[challenge] Receipt ${receiptId} challenged — hash changed on ${source.url}`);

  return NextResponse.json({
    success:        true,
    verdict:        "CHANGED",
    message:        "Challenge resolved. Content changed after citation — creator reputation slashed.",
    receiptId,
    sourceTitle:    source.title,
    sourceUrl:      source.url,
    hashAtDecision: receipt.contentHashAtDecision,
    liveHash:       result.liveHash,
    contentLength:  result.contentLength,
    fetchedAt:      result.fetchedAt,
    slashedAmount:  receipt.amountPaid,
    note:           "Testnet: reputation slash recorded; bond forfeiture requires mainnet deployment.",
  });
}
