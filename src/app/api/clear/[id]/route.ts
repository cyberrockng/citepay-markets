import { NextResponse } from "next/server";
import { getClaimClearanceById, getClearanceCertificateByClearanceId, getClaimClearancesByCertificateId, getReceiptById } from "@/lib/db";
import { getNeonClaimClearanceById, getNeonClearanceCertificateByClearanceId, getNeonClaimClearancesByIds, getNeonReceiptById } from "@/lib/neon";

export const dynamic = "force-dynamic";

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

  return NextResponse.json({
    clearance,
    certificate,
    certificateClearances,
    underlyingReceipt,
  });
}
