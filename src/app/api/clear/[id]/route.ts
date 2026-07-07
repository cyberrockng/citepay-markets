import { NextResponse } from "next/server";
import { getClaimClearanceById, getClearanceCertificateByClearanceId, getClaimClearancesByCertificateId } from "@/lib/db";
import { getNeonClaimClearanceById, getNeonClearanceCertificateByClearanceId, getNeonClaimClearancesByIds } from "@/lib/neon";

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

  return NextResponse.json({
    clearance,
    certificate,
    certificateClearances,
  });
}
