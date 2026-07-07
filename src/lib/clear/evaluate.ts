import type { Source } from "../../types";
import type { ClaimClearance, ClaimDecision, ClearMandateConfig } from "./types";
import { verifyQuoteSpan } from "./quote-verify";
import { hashClearObject } from "./hash";
import { sha256 } from "../evidence";

export interface ClaimClearanceInput {
  clearanceId: string;
  mandate: ClearMandateConfig;
  source: Source;
  answerHash: string;
  claimText: string;
  quoteText: string;
  sourceFullText: string;
  supportScore: number;
  sessionSpentMicro: number;
  nowIso?: string;
}

interface TraceEntry {
  rule: string;
  passed: boolean;
  detail: string;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function includesCaseFold(list: string[] | null, value: string | null | undefined): boolean {
  if (!list || !value) return false;
  const folded = value.toLowerCase();
  return list.some((item) => item.toLowerCase() === folded);
}

function decisionCountsAsBlocked(decision: ClaimDecision): boolean {
  return decision === "BLOCKED_LICENSE" || decision === "BLOCKED_POLICY" || decision === "OVER_CAP";
}

export function buildReceiptHash(clearance: Omit<ClaimClearance, "receiptHash">): string {
  return hashClearObject({
    clearanceId: clearance.clearanceId,
    mandateConfigId: clearance.mandateConfigId,
    sourceId: clearance.sourceId,
    onChainSourceId: clearance.onChainSourceId,
    answerHash: clearance.answerHash,
    claimHash: clearance.claimHash,
    quoteText: clearance.quoteText,
    quoteStart: clearance.quoteStart,
    quoteEnd: clearance.quoteEnd,
    quoteVerified: clearance.quoteVerified,
    supportScore: clearance.supportScore,
    decision: clearance.decision,
    amountDueMicro: clearance.amountDueMicro,
    amountPaidMicro: clearance.amountPaidMicro,
    underlyingCitationReceiptId: clearance.underlyingCitationReceiptId,
    policyTrace: clearance.policyTrace,
  });
}

export function evaluateClaimClearance(input: ClaimClearanceInput): ClaimClearance {
  const now = input.nowIso ?? new Date().toISOString();
  const trace: TraceEntry[] = [];
  const sourceLicense = input.source.licenseClass ?? "standard";
  const sourceType = input.source.assetType ?? input.source.category ?? "article";
  const sourceDomain = domainOf(input.source.url);
  const quote = verifyQuoteSpan(input.quoteText, input.sourceFullText);
  let decision: ClaimDecision = "CLEARED";
  let amountDueMicro = input.source.price;

  const mandateActive = !input.mandate.expiresAt || new Date(input.mandate.expiresAt).getTime() > Date.now();
  trace.push({
    rule: "mandate_active",
    passed: mandateActive,
    detail: mandateActive ? "Mandate is active for this clearance run." : "Mandate is expired.",
  });
  if (!mandateActive) decision = "BLOCKED_POLICY";

  const licenseAllowed = !input.mandate.requiredLicenseClass || sourceLicense === input.mandate.requiredLicenseClass;
  trace.push({
    rule: "license_allowed",
    passed: licenseAllowed,
    detail: licenseAllowed
      ? `License ${sourceLicense} satisfies mandate.`
      : `License ${sourceLicense} does not satisfy ${input.mandate.requiredLicenseClass}.`,
  });
  if (decision === "CLEARED" && !licenseAllowed) decision = "BLOCKED_LICENSE";

  const typeAllowed = !input.mandate.allowedSourceTypes || includesCaseFold(input.mandate.allowedSourceTypes, sourceType);
  const domainBlocked = includesCaseFold(input.mandate.blockedDomains, sourceDomain);
  const walletBlocked = includesCaseFold(input.mandate.blockedWallets, input.source.payoutWallet);
  const publisherVerified = !input.mandate.requirePublisherVerified || input.source.verificationStatus === "verified";
  const policyAllowed = typeAllowed && !domainBlocked && !walletBlocked && publisherVerified;
  trace.push({
    rule: "source_policy_allowed",
    passed: policyAllowed,
    detail: policyAllowed
      ? "Source type, domain, wallet, and verification status satisfy mandate."
      : "Source failed type, domain, wallet, or publisher-verification policy.",
  });
  if (decision === "CLEARED" && !policyAllowed) decision = "BLOCKED_POLICY";

  trace.push({
    rule: "quote_verified",
    passed: quote.verified,
    detail: quote.verified
      ? `Exact quote span verified at ${quote.quoteStart}-${quote.quoteEnd}.`
      : "Exact quote was not found in source text.",
  });
  if (decision === "CLEARED" && input.mandate.requireQuoteSpan && !quote.verified) decision = "UNSUPPORTED";

  const supportAllowed = input.supportScore >= input.mandate.minSupportScore;
  trace.push({
    rule: "support_score",
    passed: supportAllowed,
    detail: `Support score ${input.supportScore}/100; mandate requires ${input.mandate.minSupportScore}.`,
  });
  if (decision === "CLEARED" && !supportAllowed) decision = "UNSUPPORTED";

  const underClaimCap = amountDueMicro <= input.mandate.maxPricePerClaimMicro;
  const underBudget = input.sessionSpentMicro + amountDueMicro <= input.mandate.budgetCapMicro;
  trace.push({
    rule: "price_and_budget",
    passed: underClaimCap && underBudget,
    detail: underClaimCap && underBudget
      ? "Price and remaining budget allow settlement."
      : "Claim price exceeds cap or remaining mandate budget.",
  });
  if (decision === "CLEARED" && (!underClaimCap || !underBudget)) decision = "OVER_CAP";

  if (decision !== "CLEARED") amountDueMicro = 0;

  const challengeDeadline = new Date(new Date(now).getTime() + input.mandate.challengeWindowSeconds * 1000).toISOString();
  const withoutHash: Omit<ClaimClearance, "receiptHash"> = {
    clearanceId: input.clearanceId,
    mandateConfigId: input.mandate.mandateConfigId,
    sourceId: input.source.id,
    onChainSourceId: input.source.onChainId ?? null,
    answerHash: input.answerHash,
    claimHash: sha256(input.claimText),
    claimText: input.claimText,
    quoteText: input.quoteText,
    quoteStart: quote.quoteStart,
    quoteEnd: quote.quoteEnd,
    quoteVerified: quote.verified,
    supportScore: input.supportScore,
    licenseClass: sourceLicense,
    amountDueMicro,
    amountPaidMicro: 0,
    underlyingCitationReceiptId: null,
    onChainMandateId: input.mandate.onChainMandateId,
    decision,
    policyTrace: JSON.stringify(trace, null, 2),
    anchorTx: null,
    challengeStatus: "NONE",
    challengeDeadline,
    createdAt: now,
  };

  if (decisionCountsAsBlocked(decision) || decision === "UNSUPPORTED") {
    withoutHash.challengeDeadline = null;
  }

  return { ...withoutHash, receiptHash: buildReceiptHash(withoutHash) };
}

export function buildCertificateHash(input: {
  answerHash: string;
  mandateConfigId: string;
  claimClearanceIds: string[];
  clearedCount: number;
  blockedCount: number;
  unsupportedCount: number;
  totalPaidMicro: number;
}): string {
  return hashClearObject(input);
}
