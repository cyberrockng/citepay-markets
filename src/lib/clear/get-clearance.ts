import { getClaimClearanceById, getClearanceCertificateByClearanceId, getClaimClearancesByCertificateId, getReceiptById } from "@/lib/db";
import { getNeonClaimClearanceById, getNeonClearanceCertificateByClearanceId, getNeonClaimClearancesByIds, getNeonReceiptById } from "@/lib/neon";
import type { ClaimClearance, ClearanceCertificate } from "./types";
import type { Receipt } from "@/types";

/**
 * Never expose the caller's API-key identity on a public surface — ownerKeyHash is
 * stable per key, so leaving it in would let anyone correlate every public clearance
 * back to the same caller. Stripped unconditionally, regardless of visibility.
 */
export function redactClearance(clearance: ClaimClearance): ClaimClearance {
  const sanitized: ClaimClearance = { ...clearance, ownerKeyHash: undefined };
  if (sanitized.visibility !== "private_hash_only") return sanitized;
  return {
    ...sanitized,
    claimText: "[private_hash_only]",
    quoteText: "[private_hash_only]",
  };
}

function redactUnderlyingReceipt(clearance: ClaimClearance, receipt: Receipt | null): Receipt | null {
  if (!receipt || clearance.visibility !== "private_hash_only") return receipt;
  return {
    ...receipt,
    query: "[private_hash_only]",
    evidencePreimage: {
      ...receipt.evidencePreimage,
      query: "[private_hash_only]",
      excerptUsed: "[private_hash_only]",
    },
  };
}

export function confirmedSettlement(clearance: ClaimClearance, receipt: Receipt | null) {
  if (
    clearance.decision !== "CLEARED"
    || clearance.amountPaidMicro <= 0
    || !clearance.underlyingCitationReceiptId
    || receipt?.paymentStatus !== "confirmed"
    || !receipt.txHash
  ) {
    return null;
  }

  return {
    receiptId: receipt.id,
    txHash: receipt.txHash,
    amountMicro: clearance.amountPaidMicro,
    paymentStatus: "confirmed",
    settledAt: receipt.createdAt,
    explorerUrl: `https://testnet.arcscan.app/tx/${receipt.txHash}`,
  };
}

export interface ClearanceLookupResult {
  decision: ClaimClearance["decision"];
  contentHash: string;
  visibility: string;
  settlement: ReturnType<typeof confirmedSettlement>;
  clearance: ClaimClearance;
  certificate: ClearanceCertificate | null;
  certificateClearances: ClaimClearance[];
  underlyingReceipt: Receipt | null;
}

/** Shared by GET /api/clear/[id] and the get_clearance MCP tool — one lookup path, no drift. */
export async function getClearanceById(id: string): Promise<ClearanceLookupResult | null> {
  const clearance = getClaimClearanceById(id) ?? await getNeonClaimClearanceById(id);
  if (!clearance) return null;

  const certificate = getClearanceCertificateByClearanceId(id) ?? await getNeonClearanceCertificateByClearanceId(id);
  let certificateClearances = certificate ? getClaimClearancesByCertificateId(certificate.certificateId) : [];
  if (certificate && certificateClearances.length === 0) {
    certificateClearances = await getNeonClaimClearancesByIds(certificate.claimClearanceIds);
  }
  const underlyingReceipt = clearance.underlyingCitationReceiptId
    ? getReceiptById(clearance.underlyingCitationReceiptId) ?? await getNeonReceiptById(clearance.underlyingCitationReceiptId)
    : null;
  const settlement = confirmedSettlement(clearance, underlyingReceipt);

  return {
    decision: clearance.decision,
    contentHash: `sha256:${clearance.receiptHash}`,
    visibility: clearance.visibility ?? "public",
    settlement,
    clearance: redactClearance(clearance),
    certificate,
    certificateClearances: certificateClearances.map(redactClearance),
    underlyingReceipt: redactUnderlyingReceipt(clearance, underlyingReceipt),
  };
}
