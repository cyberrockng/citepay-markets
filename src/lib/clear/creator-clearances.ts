import { getAllSources, getClaimClearancesBySourceKeys, getReceiptById } from "@/lib/db";
import { getNeonClaimClearancesBySourceKeys, getNeonReceiptById } from "@/lib/neon";
import { confirmedSettlement, redactClearance } from "./get-clearance";
import type { ClaimClearance } from "./types";

export interface CreatorClearanceRow {
  clearanceId: string;
  decision: ClaimClearance["decision"];
  visibility: string;
  amountPaidMicro: number;
  contentHash: string;
  receiptUrl: string;
  settlement: ReturnType<typeof confirmedSettlement>;
  createdAt: string;
}

function dedupeByClearanceId(rows: ClaimClearance[]): ClaimClearance[] {
  const byId = new Map<string, ClaimClearance>();
  for (const row of rows) byId.set(row.clearanceId, row);
  return [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Shared by /creator/[wallet]/clearances — every Clear clearance tied to a publisher's registered sources. */
export async function getClearancesForWallet(wallet: string, baseUrl: string): Promise<CreatorClearanceRow[]> {
  const normalizedWallet = wallet.toLowerCase();
  const ownedSources = getAllSources().filter((s) => s.payoutWallet.toLowerCase() === normalizedWallet);
  const sourceIds = ownedSources.map((s) => s.id);
  const onChainSourceIds = ownedSources.map((s) => s.onChainId).filter((id): id is number => id !== null && id !== undefined);
  if (sourceIds.length === 0 && onChainSourceIds.length === 0) return [];

  const [local, neon] = await Promise.all([
    Promise.resolve(getClaimClearancesBySourceKeys(sourceIds, onChainSourceIds)),
    getNeonClaimClearancesBySourceKeys(sourceIds, onChainSourceIds),
  ]);
  const clearances = dedupeByClearanceId([...neon, ...local]).slice(0, 200);
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  return Promise.all(clearances.map(async (clearance) => {
    const receipt = clearance.underlyingCitationReceiptId
      ? getReceiptById(clearance.underlyingCitationReceiptId) ?? await getNeonReceiptById(clearance.underlyingCitationReceiptId)
      : null;
    const redacted = redactClearance(clearance);
    return {
      clearanceId: redacted.clearanceId,
      decision: redacted.decision,
      visibility: redacted.visibility ?? "public",
      amountPaidMicro: redacted.amountPaidMicro,
      contentHash: `sha256:${redacted.receiptHash}`,
      receiptUrl: `${normalizedBaseUrl}/clearance/${redacted.clearanceId}`,
      settlement: confirmedSettlement(clearance, receipt),
      createdAt: redacted.createdAt,
    };
  }));
}
