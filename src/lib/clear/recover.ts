import { v4 as uuidv4 } from "uuid";
import type { Source } from "@/types";
import type { ClearMandateConfig, RecoveryFinding } from "./types";
import { evaluateClaimClearance } from "./evaluate";
import { hashClearObject } from "./hash";
import { sourceText } from "./source-text";

export interface RecoveryCandidate {
  claimText: string;
  quoteText: string;
  matchedSourceTitle: string | null;
  supportScore: number;
}

export function auditMandate(nowIso = new Date().toISOString()): ClearMandateConfig {
  const base = {
    mandateConfigId: `audit-${uuidv4()}`,
    onChainMandateId: null,
    operatorWallet: "audit-only",
    agentWallet: "audit-only",
    policyName: "recovery-audit",
    budgetCapMicro: Number.MAX_SAFE_INTEGER,
    maxPricePerCitationMicro: Number.MAX_SAFE_INTEGER,
    maxPricePerClaimMicro: Number.MAX_SAFE_INTEGER,
    allowedSourceTypes: null,
    blockedDomains: null,
    blockedWallets: null,
    requiredLicenseClass: null,
    requirePublisherVerified: false,
    requireQuoteSpan: true,
    minSupportScore: 0,
    challengeWindowSeconds: 0,
    expiresAt: null,
    operatorSignature: null,
    createdAt: nowIso,
  };
  return { ...base, mandateHash: hashClearObject(base) };
}

/**
 * Pure, deterministic given its inputs (source lookup + evaluator only —
 * no network calls). Runs every recovery candidate through the exact same
 * evaluateClaimClearance() the live demo uses; there is no separate,
 * relaxed path for content CitePay didn't generate.
 */
export function matchAndEvaluateCandidate(
  candidate: RecoveryCandidate,
  sources: Source[],
  answerHash: string,
  mandate: ClearMandateConfig,
  nowIso = new Date().toISOString()
): RecoveryFinding {
  const matchedSource = candidate.matchedSourceTitle
    ? sources.find((s) => s.title.toLowerCase() === candidate.matchedSourceTitle!.toLowerCase()) ?? null
    : null;

  if (!matchedSource) {
    return {
      claimText: candidate.claimText,
      quoteText: candidate.quoteText,
      matchedSourceId: null,
      matchedSourceOnChainId: null,
      matchedSourceTitle: null,
      quoteVerified: false,
      supportScore: candidate.supportScore,
      decision: "UNMATCHED",
      wouldBeAmountDueMicro: 0,
      policyTrace: null,
      note: "No registered CitePay source plausibly matches this claim — cannot audit against a known evidence asset.",
    };
  }

  const clearance = evaluateClaimClearance({
    clearanceId: uuidv4(),
    mandate,
    source: matchedSource,
    answerHash,
    claimText: candidate.claimText,
    quoteText: candidate.quoteText,
    sourceFullText: sourceText(matchedSource),
    supportScore: candidate.supportScore,
    sessionSpentMicro: 0,
    nowIso,
  });

  return {
    claimText: candidate.claimText,
    quoteText: candidate.quoteText,
    matchedSourceId: matchedSource.id,
    matchedSourceOnChainId: matchedSource.onChainId ?? null,
    matchedSourceTitle: matchedSource.title,
    quoteVerified: clearance.quoteVerified,
    supportScore: candidate.supportScore,
    decision: clearance.decision,
    wouldBeAmountDueMicro: clearance.decision === "CLEARED" ? matchedSource.price : 0,
    policyTrace: clearance.policyTrace,
    note:
      clearance.decision === "CLEARED"
        ? "This citation would have cleared and been paid — recoverable."
        : clearance.decision === "UNSUPPORTED"
        ? "Quoted span does not verifiably appear in the matched source — not recoverable as claimed."
        : `Would not clear: ${clearance.decision}.`,
  };
}
