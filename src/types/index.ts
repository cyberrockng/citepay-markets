export type Decision = "PAY" | "REFUSE" | "SKIP" | "BLOCKED_BY_POLICY";

export interface Source {
  id: string;
  title: string;
  url: string;
  creatorName: string;
  creatorHandle: string;
  payoutWallet: string;
  contentHash: string;
  metadataURI: string;
  description: string;
  price: number; // USDC micro (6 decimals)
  bond: number;
  bonded: boolean;
  reputation: number;
  paidCount: number;
  refusedCount: number;
  skipCount: number;
  active: boolean;
  createdAt: string;
  onChainId?: number | null; // CitePayMarket.sol sourceId once registered
}

export interface ScoreBreakdown {
  relevance: number;    // 0–100
  price: number;        // 0–100 (higher = cheaper relative to budget)
  bond: number;         // 0 or 20
  reputation: number;   // 0–30
  total: number;        // weighted sum
}

export interface AgentDecision {
  sourceId: string;
  source: Source;
  decision: Decision;
  scores: ScoreBreakdown;
  reason: string;
  excerptUsed?: string;
  policyProfile: string;
  policyRulesPassed: string[];
  policyRulesFailed: string[];
  policyReason: string | null;
}

export interface EvidencePreimage {
  query: string;
  queryHash: string;
  sourceUrl: string;
  excerptUsed: string;
  decision: Decision;
  scoreInputs: {
    relevance: number;
    price: string;
    bonded: boolean;
    creatorReputation: number;
    budgetRemainingBefore: string;
  };
  reason: string;
  timestamp: string;
}

export interface Receipt {
  id: string;
  sourceId: string;
  queryId: string;
  agentAddress: string;
  creatorWallet: string;
  decision: Decision;
  query: string;
  queryHash: string;
  sourceTitle: string;
  sourceUrl: string;
  amountPaid: number;
  evidenceHash: string;
  evidencePreimage: EvidencePreimage;
  contentHashAtDecision: string;
  scores: ScoreBreakdown;
  reason: string;
  txHash: string | null;
  paymentStatus: "confirmed" | "simulated" | null;
  policyProfile: string | null;
  policyRulesPassed: string[] | null;
  policyRulesFailed: string[] | null;
  policyReason: string | null;
  budgetBefore: number;
  budgetAfter: number;
  challenged: boolean;
  createdAt: string;
  onChainReceiptId?: number | null; // CitePayMarket.sol receiptId
  onChainTxHash?: string | null;    // tx that wrote to the contract
}

export interface QueryRecord {
  id: string;
  query: string;
  queryHash: string;
  budget: number;
  agentAddress: string;
  queryFee: number;
  queryFeeTxHash: string | null;
  status: "pending" | "paid" | "completed" | "failed";
  totalPaid: number;
  receiptIds: string[];
  answer: string | null;
  createdAt: string;
}

export interface TractionStats {
  creatorsIndexed: number;
  creatorsPaid: number;
  sourcesRegistered: number;
  bondedSources: number;
  totalQueries: number;
  totalDecisions: number;
  paidCitations: number;
  refusals: number;
  skips: number;
  totalUSDCRouted: number;
  avgPaymentPerCitation: number;
  shareCardsGenerated: number;
  shareCardsOpened: number;
  challengeCount: number;
  activeAgents: number;
  agentReputation: number;
}
