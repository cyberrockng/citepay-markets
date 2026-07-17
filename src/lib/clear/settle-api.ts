import type { Receipt, Source } from "@/types";
import type { ClaimClearance, ClearMandateConfig, ClearSettlementIdempotencyRecord } from "./types";
import type { ClearApiAuth } from "./auth";
import { evaluateClaimClearance, buildReceiptHash } from "./evaluate";
import { sourceText } from "./source-text";
import { createPaidReceipt, PaymentNotConfirmedError } from "./settle";
import { sha256 } from "@/lib/evidence";
import {
  ensureClearMandateBudgetRow,
  getAllSources,
  getClaimClearanceById,
  getClearMandateConfigById,
  getClearSettlementIdempotencyByHash,
  getReceiptById,
  getSpentMicroByMandateConfigId,
  hasSettledClaim,
  insertClaimClearance,
  insertClearSettlementIdempotency,
  releaseClearMandateBudget,
  reserveClearMandateBudget,
  reserveClearSettlementLock,
} from "@/lib/db";
import {
  ensureNeonClearMandateBudgetRow,
  getNeonClaimClearanceById,
  getNeonClearMandateConfigById,
  getNeonClearSettlementIdempotencyByHash,
  getNeonHasSettledClaim,
  getNeonReceiptById,
  getNeonSpentMicroByMandateConfigId,
  isNeonEnabled,
  releaseNeonClearMandateBudget,
  reserveNeonClearMandateBudget,
  tryReserveNeonClearSettlementLock,
} from "@/lib/neon";
import { isExplicitDevModeEnabled } from "@/lib/env-gates";

type JsonObject = Record<string, unknown>;

export type ClearSettleResult =
  | { status: 200; body: ClearSettleSuccess }
  | { status: 400 | 402 | 403 | 404 | 409 | 422 | 502; body: { error: string; field?: string; clearance?: unknown; paymentStatus?: string; chainSettlement?: boolean } };

export interface ClearSettleSuccess {
  settled: true;
  clearanceId: string;
  mandateConfigId: string;
  receiptId: string;
  txHash: string | null;
  paymentStatus: "confirmed" | "simulated";
  chainSettlement: boolean;
  amountMicro: number;
  receiptUrl: string;
  remainingBudgetMicro: number;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(input: JsonObject, field: string, max: number): { ok: true; value: string } | { ok: false; status: 400; error: string; field: string } {
  const value = input[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, status: 400, error: `${field} is required.`, field };
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    return { ok: false, status: 400, error: `${field} exceeds ${max} character limit.`, field };
  }
  return { ok: true, value: trimmed };
}

function existingSettlementResponse(
  clearance: ClaimClearance,
  mandate: ClearMandateConfig,
  receipt: Receipt,
  baseUrl: string
): ClearSettleSuccess {
  return {
    settled: true,
    clearanceId: clearance.clearanceId,
    mandateConfigId: mandate.mandateConfigId,
    receiptId: clearance.underlyingCitationReceiptId ?? receipt.id,
    txHash: receipt.paymentStatus === "confirmed" ? receipt.txHash : null,
    paymentStatus: receipt.paymentStatus ?? "simulated",
    chainSettlement: receipt.paymentStatus === "confirmed",
    amountMicro: clearance.amountPaidMicro,
    receiptUrl: `${baseUrl.replace(/\/$/, "")}/clearance/${clearance.clearanceId}`,
    remainingBudgetMicro: Math.max(0, mandate.budgetCapMicro - clearance.amountPaidMicro),
  };
}

function findRegisteredSource(clearance: ClaimClearance): Source | null {
  const sources = getAllSources();
  if (clearance.onChainSourceId !== null) {
    const byOnChain = sources.find((s) => s.onChainId === clearance.onChainSourceId);
    if (byOnChain) return byOnChain;
  }
  return sources.find((s) => s.id === clearance.sourceId) ?? null;
}

function allowSimulatedSettlement(): boolean {
  return process.env.CLEAR_SETTLE_ALLOW_SIMULATED === "true" && isExplicitDevModeEnabled();
}

async function idempotencyRecord(hash: string): Promise<ClearSettlementIdempotencyRecord | null> {
  return getClearSettlementIdempotencyByHash(hash) ?? await getNeonClearSettlementIdempotencyByHash(hash);
}

function parseStoredResponse(record: ClearSettlementIdempotencyRecord): ClearSettleSuccess | null {
  try {
    return JSON.parse(record.responseJson) as ClearSettleSuccess;
  } catch {
    return null;
  }
}

/**
 * Reserve budget on the single authoritative store: Neon in prod (cross-instance), SQLite in
 * local dev/tests. Reserving on only the authoritative store — rather than both — avoids the two
 * mirrors ever disagreeing on whether the cap was breached. Returns the new reserved total, or
 * null if this reservation would exceed the cap.
 */
async function reserveBudget(mandateConfigId: string, budgetCapMicro: number, amountMicro: number): Promise<number | null> {
  if (isNeonEnabled()) {
    await ensureNeonClearMandateBudgetRow(mandateConfigId, budgetCapMicro);
    return reserveNeonClearMandateBudget(mandateConfigId, amountMicro);
  }
  ensureClearMandateBudgetRow(mandateConfigId, budgetCapMicro);
  return reserveClearMandateBudget(mandateConfigId, amountMicro);
}

async function releaseBudget(mandateConfigId: string, amountMicro: number): Promise<void> {
  if (isNeonEnabled()) {
    await releaseNeonClearMandateBudget(mandateConfigId, amountMicro);
    return;
  }
  releaseClearMandateBudget(mandateConfigId, amountMicro);
}

async function recordIdempotentSuccess(opts: {
  idempotencyKeyHash: string;
  ownerKeyHash: string;
  clearanceId: string;
  mandateConfigId: string;
  receiptId: string;
  response: ClearSettleSuccess;
}) {
  insertClearSettlementIdempotency({
    idempotencyKeyHash: opts.idempotencyKeyHash,
    ownerKeyHash: opts.ownerKeyHash,
    clearanceId: opts.clearanceId,
    mandateConfigId: opts.mandateConfigId,
    receiptId: opts.receiptId,
    responseJson: JSON.stringify(opts.response),
    createdAt: new Date().toISOString(),
  });
}

export async function runClearSettle(input: unknown, auth: ClearApiAuth, baseUrl: string): Promise<ClearSettleResult> {
  if (!isObject(input)) {
    return { status: 400, body: { error: "JSON body must be an object." } };
  }

  const clearanceId = requiredString(input, "clearanceId", 80);
  if (!clearanceId.ok) return { status: clearanceId.status, body: { error: clearanceId.error, field: clearanceId.field } };
  const mandateConfigId = requiredString(input, "mandateConfigId", 80);
  if (!mandateConfigId.ok) return { status: mandateConfigId.status, body: { error: mandateConfigId.error, field: mandateConfigId.field } };
  const idempotencyKey = requiredString(input, "idempotencyKey", 64);
  if (!idempotencyKey.ok) return { status: idempotencyKey.status, body: { error: idempotencyKey.error, field: idempotencyKey.field } };
  if (input.confirm !== true) {
    return { status: 400, body: { error: "Explicit confirm: true is required to settle a clearance.", field: "confirm" } };
  }

  const idempotencyKeyHash = sha256(`${auth.keyHash}:${idempotencyKey.value}`);
  const existingIdempotency = await idempotencyRecord(idempotencyKeyHash);
  if (existingIdempotency) {
    if (existingIdempotency.clearanceId !== clearanceId.value || existingIdempotency.mandateConfigId !== mandateConfigId.value) {
      return { status: 409, body: { error: "idempotencyKey was already used for a different clearance or mandate.", field: "idempotencyKey" } };
    }
    const stored = parseStoredResponse(existingIdempotency);
    if (stored) return { status: 200, body: stored };
    return { status: 409, body: { error: "Stored idempotency response is unreadable; use a new idempotencyKey." } };
  }

  const clearance = getClaimClearanceById(clearanceId.value) ?? await getNeonClaimClearanceById(clearanceId.value);
  if (!clearance) return { status: 404, body: { error: "Unknown clearanceId.", field: "clearanceId" } };
  if (clearance.ownerKeyHash && clearance.ownerKeyHash !== auth.keyHash) {
    return { status: 403, body: { error: "This API key does not own the requested clearance.", field: "clearanceId" } };
  }
  if (clearance.mandateConfigId !== mandateConfigId.value) {
    return { status: 400, body: { error: "mandateConfigId does not match the clearance.", field: "mandateConfigId" } };
  }

  const mandate = getClearMandateConfigById(mandateConfigId.value) ?? await getNeonClearMandateConfigById(mandateConfigId.value);
  if (!mandate) return { status: 404, body: { error: "Unknown mandateConfigId.", field: "mandateConfigId" } };
  if (mandate.ownerKeyHash && mandate.ownerKeyHash !== auth.keyHash) {
    return { status: 403, body: { error: "This API key does not own the requested mandate.", field: "mandateConfigId" } };
  }

  if (clearance.amountPaidMicro > 0 && clearance.underlyingCitationReceiptId) {
    const receipt = getReceiptById(clearance.underlyingCitationReceiptId) ?? await getNeonReceiptById(clearance.underlyingCitationReceiptId);
    if (!receipt) return { status: 409, body: { error: "Clearance is marked paid, but its underlying receipt is unavailable." } };
    const response = existingSettlementResponse(clearance, mandate, receipt, baseUrl);
    await recordIdempotentSuccess({
      idempotencyKeyHash,
      ownerKeyHash: auth.keyHash,
      clearanceId: clearance.clearanceId,
      mandateConfigId: mandate.mandateConfigId,
      receiptId: response.receiptId,
      response,
    });
    return { status: 200, body: response };
  }

  if (clearance.decision !== "CLEARED") {
    return { status: 422, body: { error: `Cannot settle clearance with decision ${clearance.decision}.`, clearance } };
  }

  const source = findRegisteredSource(clearance);
  if (!source || source.url.startsWith("inline://")) {
    return { status: 422, body: { error: "Inline sources cannot be settled — re-run clear_claim/check with a registered source.onChainId (a catalog source with a real payout wallet), then settle that clearance. See docs/AGENTS.md → \"Settleable end-to-end path\"." } };
  }

  const alreadySettled =
    hasSettledClaim(mandate.mandateConfigId, clearance.claimHash) || await getNeonHasSettledClaim(mandate.mandateConfigId, clearance.claimHash);
  if (alreadySettled) {
    return { status: 409, body: { error: "This claim has already been settled under this mandate." } };
  }

  const lockKey = sha256(`${mandate.mandateConfigId}:${clearance.claimHash}`);
  const localReserved = reserveClearSettlementLock({
    lockKey,
    ownerKeyHash: auth.keyHash,
    clearanceId: clearance.clearanceId,
    mandateConfigId: mandate.mandateConfigId,
    claimHash: clearance.claimHash,
  });
  const neonReserved = await tryReserveNeonClearSettlementLock({
    lockKey,
    ownerKeyHash: auth.keyHash,
    clearanceId: clearance.clearanceId,
    mandateConfigId: mandate.mandateConfigId,
    claimHash: clearance.claimHash,
  });
  if (!localReserved || !neonReserved) {
    return { status: 409, body: { error: "This claim is already being settled or has been settled." } };
  }

  const spentSoFar = Math.max(
    getSpentMicroByMandateConfigId(mandate.mandateConfigId),
    await getNeonSpentMicroByMandateConfigId(mandate.mandateConfigId)
  );
  const current = evaluateClaimClearance({
    clearanceId: clearance.clearanceId,
    mandate,
    source,
    answerHash: clearance.answerHash,
    claimText: clearance.claimText,
    quoteText: clearance.quoteText,
    sourceFullText: sourceText(source),
    supportScore: clearance.supportScore,
    sessionSpentMicro: spentSoFar,
  });
  if (current.decision !== "CLEARED") {
    return { status: current.decision === "OVER_CAP" ? 402 : 422, body: { error: `Would not clear under current mandate: ${current.decision}.`, clearance: current } };
  }

  // Atomic budget gate. The re-evaluation above still checks the cap advisorily against SUM(paid),
  // but this reservation is the authoritative enforcement: it cannot be split by a concurrent
  // settle of a different claim on the same mandate, so total reserved can never exceed the cap.
  const reservedAfter = await reserveBudget(mandate.mandateConfigId, mandate.budgetCapMicro, current.amountDueMicro);
  if (reservedAfter === null) {
    return { status: 402, body: { error: "Would not clear under current mandate: OVER_CAP (mandate budget exhausted).", clearance: current } };
  }

  let payment: Awaited<ReturnType<typeof createPaidReceipt>>;
  try {
    payment = await createPaidReceipt({
      source,
      queryId: `clear-${clearance.clearanceId}`,
      query: `[Clear] ${clearance.claimText}`,
      answerHash: clearance.answerHash,
      claim: current,
      budgetBefore: mandate.budgetCapMicro - spentSoFar,
      requireConfirmed: !allowSimulatedSettlement(),
    });
  } catch (err) {
    // Payment did not go through — release the speculative reservation so it does not permanently
    // consume budget with no corresponding payment.
    await releaseBudget(mandate.mandateConfigId, current.amountDueMicro);
    if (err instanceof PaymentNotConfirmedError) {
      return {
        status: 502,
        body: {
          error: "Payment did not confirm; no settled clearance was recorded.",
          paymentStatus: err.payment.status,
          chainSettlement: false,
        },
      };
    }
    throw err;
  }

  // Payment confirmed. From here on the reservation stands permanently (never released) — it is
  // the authoritative record that this claim's amount was consumed from the mandate budget.
  const updatedWithoutHash = {
    ...current,
    ownerKeyHash: clearance.ownerKeyHash ?? auth.keyHash,
    visibility: clearance.visibility ?? "public",
    amountPaidMicro: payment.amountPaid,
    underlyingCitationReceiptId: payment.receiptId,
  };
  const settled: ClaimClearance = { ...updatedWithoutHash, receiptHash: buildReceiptHash(updatedWithoutHash) };
  insertClaimClearance(settled);

  const response: ClearSettleSuccess = {
    settled: true,
    clearanceId: settled.clearanceId,
    mandateConfigId: mandate.mandateConfigId,
    receiptId: payment.receiptId,
    txHash: payment.paymentStatus === "confirmed" ? payment.txHash : null,
    paymentStatus: payment.paymentStatus ?? "simulated",
    chainSettlement: payment.paymentStatus === "confirmed",
    amountMicro: payment.amountPaid,
    receiptUrl: `${baseUrl.replace(/\/$/, "")}/clearance/${settled.clearanceId}`,
    remainingBudgetMicro: Math.max(0, mandate.budgetCapMicro - reservedAfter),
  };
  await recordIdempotentSuccess({
    idempotencyKeyHash,
    ownerKeyHash: auth.keyHash,
    clearanceId: settled.clearanceId,
    mandateConfigId: mandate.mandateConfigId,
    receiptId: payment.receiptId,
    response,
  });
  return { status: 200, body: response };
}
