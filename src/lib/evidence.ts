import crypto from "crypto";
import type { EvidencePreimage, ScoreBreakdown, Decision } from "@/types";

export function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function buildEvidencePreimage(opts: {
  query: string;
  queryHash: string;
  sourceUrl: string;
  excerptUsed: string;
  decision: Decision;
  scores: ScoreBreakdown;
  budgetBefore: number;
  reason: string;
  price: number;
  bonded: boolean;
  reputation: number;
  contributionWeight?: number;
  weightedAmount?: number;
}): EvidencePreimage {
  const scoreInputs: EvidencePreimage["scoreInputs"] = {
    relevance: opts.scores.relevance,
    price: formatUSDC(opts.price),
    bonded: opts.bonded,
    creatorReputation: opts.reputation,
    budgetRemainingBefore: formatUSDC(opts.budgetBefore),
  };
  if (opts.contributionWeight !== undefined) {
    scoreInputs.contributionWeight = opts.contributionWeight;
    scoreInputs.weightedAmountPaid = formatUSDC(opts.weightedAmount ?? opts.price);
  }
  return {
    query: opts.query,
    queryHash: opts.queryHash,
    sourceUrl: opts.sourceUrl,
    excerptUsed: opts.excerptUsed,
    decision: opts.decision,
    scoreInputs,
    reason: opts.reason,
    timestamp: new Date().toISOString(),
  };
}

export function hashEvidence(preimage: EvidencePreimage): string {
  return sha256(JSON.stringify(preimage, null, 2));
}

export function formatUSDC(microUsdc: number): string {
  return `${(microUsdc / 1_000_000).toFixed(6)} USDC`;
}

export function parseUSDC(usdc: number): number {
  return Math.round(usdc * 1_000_000);
}

export function contentHashFromText(text: string): string {
  return sha256(text);
}
