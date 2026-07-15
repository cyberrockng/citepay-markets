import { NextResponse } from "next/server";
import { getClaimClearanceById, getClearanceCertificateByClearanceId, getClaimClearancesByCertificateId, getReceiptById } from "@/lib/db";
import { getNeonClaimClearanceById, getNeonClearanceCertificateByClearanceId, getNeonClaimClearancesByIds, getNeonReceiptById } from "@/lib/neon";
import type { ClaimClearance } from "@/lib/clear/types";

export const dynamic = "force-dynamic";

function redactClearance(clearance: ClaimClearance): ClaimClearance {
  if (clearance.visibility !== "private_hash_only") return clearance;
  return {
    ...clearance,
    claimText: "[private_hash_only]",
    quoteText: "[private_hash_only]",
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clearance = getClaimClearanceById(id) ?? await getNeonClaimClearanceById(id);
  if (!clearance) {
    return NextResponse.json({ error: "Clearance not found" }, { status: 404 });
  }

  const certificate = getClearanceCertificateByClearanceId(id) ?? await getNeonClearanceCertificateByClearanceId(id);
  let certificateClearances = certificate ? getClaimClearancesByCertificateId(certificate.certificateId) : [];
  if (certificate && certificateClearances.length === 0) {
    certificateClearances = await getNeonClaimClearancesByIds(certificate.claimClearanceIds);
  }
  const underlyingReceipt = clearance.underlyingCitationReceiptId
    ? getReceiptById(clearance.underlyingCitationReceiptId) ?? await getNeonReceiptById(clearance.underlyingCitationReceiptId)
    : null;
  const settlement = underlyingReceipt?.txHash
    ? {
      txHash: underlyingReceipt.txHash,
      amountMicro: clearance.amountPaidMicro,
      settledAt: underlyingReceipt.createdAt,
      explorerUrl: `https://testnet.arcscan.app/tx/${underlyingReceipt.txHash}`,
    }
    : null;

  return NextResponse.json({
    decision: clearance.decision,
    contentHash: `sha256:${clearance.receiptHash}`,
    visibility: clearance.visibility ?? "public",
    settlement,
    clearance: redactClearance(clearance),
    certificate,
    certificateClearances: certificateClearances.map(redactClearance),
    underlyingReceipt,
  });
}
