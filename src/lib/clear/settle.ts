import { v4 as uuidv4 } from "uuid";
import type { Source, ScoreBreakdown } from "@/types";
import type { ClaimClearance } from "./types";
import { buildEvidencePreimage, hashEvidence, sha256 } from "@/lib/evidence";
import { insertReceipt, updateSourceStats } from "@/lib/db";
import { payCreator } from "@/lib/payments";
import { getAgentAddress } from "@/lib/agent";
import { signReceiptHash } from "@/lib/signature";

/**
 * Real settlement path shared by /clear/demo-run and /clear/recover/settle.
 * Only called after a claim has already cleared every deterministic gate in
 * evaluateClaimClearance() — this function never decides whether to pay,
 * only executes the payment for a decision that was already made in code.
 */
export async function createPaidReceipt(opts: {
  source: Source;
  queryId: string;
  query: string;
  answerHash: string;
  claim: ClaimClearance;
  budgetBefore: number;
}): Promise<{ receiptId: string; txHash: string | null; paymentStatus: "confirmed" | "simulated" | null; amountPaid: number }> {
  const receiptId = uuidv4();
  const queryHash = sha256(opts.query);
  const scores: ScoreBreakdown = {
    relevance: opts.claim.supportScore,
    price: 90,
    bond: opts.source.bonded ? 20 : 0,
    reputation: Math.max(0, Math.min(30, opts.source.reputation * 3 + 15)),
    total: Math.min(100, Math.round(opts.claim.supportScore * 0.75 + 20)),
  };
  const preimage = buildEvidencePreimage({
    query: opts.query,
    queryHash,
    sourceUrl: opts.source.url,
    excerptUsed: opts.claim.quoteText,
    decision: "PAY",
    scores,
    budgetBefore: opts.budgetBefore,
    reason: "Claim cleared: exact quote, license, support, price, and budget checks passed before payment.",
    price: opts.claim.amountDueMicro,
    bonded: opts.source.bonded,
    reputation: opts.source.reputation,
    contributionWeight: 1,
    weightedAmount: opts.claim.amountDueMicro,
  });
  const evidenceHash = hashEvidence(preimage);
  const agentSignature = await signReceiptHash(evidenceHash);
  const payment = await payCreator({
    creatorWallet: opts.source.payoutWallet,
    amountMicroUsdc: opts.claim.amountDueMicro,
    sourceId: opts.source.id,
    receiptId,
  });

  insertReceipt({
    id: receiptId,
    sourceId: opts.source.id,
    queryId: opts.queryId,
    agentAddress: getAgentAddress(),
    creatorWallet: opts.source.payoutWallet,
    decision: "PAY",
    query: opts.query,
    queryHash,
    sourceTitle: opts.source.title,
    sourceUrl: opts.source.url,
    amountPaid: opts.claim.amountDueMicro,
    evidenceHash,
    evidencePreimage: preimage,
    contentHashAtDecision: opts.source.contentHash,
    scores,
    reason: "Claim cleared before payment.",
    txHash: payment.txHash,
    paymentStatus: payment.status,
    policyProfile: "Clear",
    policyRulesPassed: ["license_allowed", "quote_verified", "support_score", "price_and_budget"],
    policyRulesFailed: [],
    policyReason: null,
    agentSignature,
    budgetBefore: opts.budgetBefore,
    budgetAfter: opts.budgetBefore - opts.claim.amountDueMicro,
    challenged: false,
    createdAt: new Date().toISOString(),
    purposeCode: payment.status === "confirmed" ? "CITE" : "CITE_SIMULATED",
    contributionWeight: 1,
  });
  updateSourceStats(opts.source.id, "PAY", 1);

  return {
    receiptId,
    txHash: payment.txHash,
    paymentStatus: payment.status,
    amountPaid: opts.claim.amountDueMicro,
  };
}
