/**
 * GET /api/verify/:receiptId
 *
 * Public, non-destructive citation verification.
 * Re-fetches the source URL that was cited, hashes the live content,
 * and compares it to the hash recorded at citation time.
 *
 * Verdicts:
 *   VERIFIED    — live hash matches contentHashAtDecision. Source unchanged.
 *   CHANGED     — live hash differs. Creator modified content after being paid.
 *   FETCH_FAILED — could not reach the source URL.
 *
 * Does not modify any state. To commit a challenge after CHANGED, POST to
 * /api/challenge/:receiptId.
 */

import { NextRequest, NextResponse } from "next/server";
import { getReceiptById, getSourceById } from "@/lib/db";
import { verifyContentHash } from "@/lib/content-hash";

export const dynamic = "force-dynamic";

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

  const httpStatus = result.verdict === "FETCH_FAILED" ? 502 : 200;

  return NextResponse.json(
    {
      receiptId,
      queryId:          receipt.queryId,
      sourceId:         source.id,
      sourceTitle:      source.title,
      sourceUrl:        source.url,
      citedAt:          receipt.createdAt,
      hashAtDecision:   receipt.contentHashAtDecision,
      liveHash:         result.liveHash,
      verdict:          result.verdict,
      verdictDetail:    result.verdictDetail,
      verified:         result.verified,
      contentLength:    result.contentLength,
      fetchedAt:        result.fetchedAt,
      fetchError:       result.fetchError ?? null,
      alreadyChallenged: receipt.challenged,
      challengeable:    result.verdict === "CHANGED" && !receipt.challenged && receipt.decision === "PAY",
      challengeUrl:     `/api/challenge/${receiptId}`,
    },
    { status: httpStatus }
  );
}
