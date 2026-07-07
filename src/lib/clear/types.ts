export type ClaimDecision =
  | "CLEARED"
  | "BLOCKED_LICENSE"
  | "BLOCKED_POLICY"
  | "UNSUPPORTED"
  | "OVER_CAP"
  | "PENDING";

export type ChallengeStatus = "NONE" | "OPEN" | "UPHELD" | "REJECTED";

export interface ClearMandateConfig {
  mandateConfigId: string;
  onChainMandateId: number | null;
  operatorWallet: string;
  agentWallet: string;
  policyName: string;
  budgetCapMicro: number;
  maxPricePerCitationMicro: number;
  maxPricePerClaimMicro: number;
  allowedSourceTypes: string[] | null;
  blockedDomains: string[] | null;
  blockedWallets: string[] | null;
  requiredLicenseClass: string | null;
  requirePublisherVerified: boolean;
  requireQuoteSpan: boolean;
  minSupportScore: number;
  challengeWindowSeconds: number;
  expiresAt: string | null;
  mandateHash: string;
  operatorSignature: string | null;
  createdAt: string;
}

export interface ClaimClearance {
  clearanceId: string;
  mandateConfigId: string;
  sourceId: string;
  onChainSourceId: number | null;
  answerHash: string;
  claimHash: string;
  claimText: string;
  quoteText: string;
  quoteStart: number;
  quoteEnd: number;
  quoteVerified: boolean;
  supportScore: number;
  licenseClass: string | null;
  amountDueMicro: number;
  amountPaidMicro: number;
  underlyingCitationReceiptId: string | null;
  onChainMandateId: number | null;
  decision: ClaimDecision;
  policyTrace: string;
  receiptHash: string;
  anchorTx: string | null;
  challengeStatus: ChallengeStatus;
  challengeDeadline: string | null;
  createdAt: string;
}

export interface ClearanceCertificate {
  certificateId: string;
  answerHash: string;
  mandateConfigId: string;
  onChainMandateId: number | null;
  claimClearanceIds: string[];
  clearedCount: number;
  blockedCount: number;
  unsupportedCount: number;
  totalPaidMicro: number;
  certificateHash: string;
  createdAt: string;
}

export interface ClearanceChallenge {
  id: string;
  clearanceId: string;
  challengeType: "QUOTE_NOT_PRESENT" | "LICENSE_MISMATCH" | "OVER_CAP" | "SOURCE_HASH_MISMATCH";
  status: Exclude<ChallengeStatus, "NONE">;
  detail: string;
  createdAt: string;
  resolvedAt: string | null;
}
