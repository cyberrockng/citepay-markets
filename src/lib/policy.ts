import type { Source, ScoreBreakdown } from "@/types";

export interface AgentPolicy {
  name: string;
  maxPricePerCitation: number;  // micro USDC (0 = no limit)
  minRelevanceScore: number;    // 0–100
  requireBonded: boolean;
  sessionSpendCap: number;      // micro USDC (0 = no cap)
  requireOnChainAnchor: boolean;
  allowSimulatedPayout: boolean;
}

export interface PolicyRuleResult {
  rule: string;
  passed: boolean;
  detail: string;
}

export interface PolicyEvaluation {
  blocked: boolean;
  rulesPassed: string[];
  rulesFailed: string[];
  reason: string | null;
}

export const POLICY_PRESETS: Record<string, AgentPolicy> = {
  conservative: {
    name: "Conservative",
    maxPricePerCitation: 2000,
    minRelevanceScore: 70,
    requireBonded: true,
    sessionSpendCap: 10000,
    requireOnChainAnchor: true,
    allowSimulatedPayout: false,
  },
  balanced: {
    name: "Balanced",
    maxPricePerCitation: 5000,
    minRelevanceScore: 40,
    requireBonded: false,
    sessionSpendCap: 0,
    requireOnChainAnchor: false,
    allowSimulatedPayout: true,
  },
  aggressive: {
    name: "Aggressive",
    maxPricePerCitation: 10000,
    minRelevanceScore: 20,
    requireBonded: false,
    sessionSpendCap: 0,
    requireOnChainAnchor: false,
    allowSimulatedPayout: true,
  },
};

export const DEFAULT_POLICY = POLICY_PRESETS.balanced;

export function resolvePolicy(input?: string | Partial<AgentPolicy>): AgentPolicy {
  if (!input) return DEFAULT_POLICY;
  if (typeof input === "string") {
    return POLICY_PRESETS[input.toLowerCase()] ?? DEFAULT_POLICY;
  }
  return { ...DEFAULT_POLICY, ...input };
}

export function evaluatePolicy(
  source: Source,
  scores: ScoreBreakdown,
  sessionSpentSoFar: number,
  policy: AgentPolicy
): PolicyEvaluation {
  const rulesPassed: string[] = [];
  const rulesFailed: string[] = [];

  const maxPrice = policy.maxPricePerCitation;
  if (maxPrice === 0 || source.price <= maxPrice) {
    rulesPassed.push(`price_within_max`);
  } else {
    rulesFailed.push(`max_price_exceeded`);
  }

  if (scores.relevance >= policy.minRelevanceScore) {
    rulesPassed.push(`relevance_ok`);
  } else {
    rulesFailed.push(`min_relevance_not_met`);
  }

  if (!policy.requireBonded || source.bonded) {
    rulesPassed.push(`bonded_ok`);
  } else {
    rulesFailed.push(`require_bonded_source`);
  }

  if (!policy.requireOnChainAnchor || source.onChainId) {
    rulesPassed.push(`on_chain_anchor_ok`);
  } else {
    rulesFailed.push(`require_on_chain_anchor`);
  }

  if (policy.sessionSpendCap === 0 || sessionSpentSoFar + source.price <= policy.sessionSpendCap) {
    rulesPassed.push(`spend_cap_ok`);
  } else {
    rulesFailed.push(`session_spend_cap_exceeded`);
  }

  const blocked = rulesFailed.length > 0;
  const reason = blocked
    ? `Blocked by policy: ${rulesFailed.join(", ")}`
    : null;

  return { blocked, rulesPassed, rulesFailed, reason };
}

export function simulatePolicyDecisions(
  decisions: Array<{
    source: string;
    sourcePrice: number;
    sourceBonded: boolean;
    sourceOnChainId: number | null;
    scores: { relevance: number; total: number };
    originalDecision: string;
  }>,
  policy: AgentPolicy
): Array<{ source: string; decision: string; reason: string }> {
  const MIN_SCORE_TO_PAY = 45;
  const MIN_SCORE_TO_REFUSE = 25;
  let sessionSpent = 0;

  return decisions.map((d) => {
    const mockSource = {
      price: d.sourcePrice,
      bonded: d.sourceBonded,
      onChainId: d.sourceOnChainId,
    } as Source;
    const mockScores = { relevance: d.scores.relevance, total: d.scores.total } as ScoreBreakdown;

    const eval_ = evaluatePolicy(mockSource, mockScores, sessionSpent, policy);

    let decision: string;
    let reason: string;

    if (d.scores.total >= MIN_SCORE_TO_PAY && d.sourcePrice <= (sessionSpent < Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : 0)) {
      if (eval_.blocked) {
        decision = "BLOCKED_BY_POLICY";
        reason = eval_.reason ?? "Policy blocked";
      } else {
        decision = "PAY";
        sessionSpent += d.sourcePrice;
        reason = "Meets policy + score threshold";
      }
    } else if (d.scores.total >= MIN_SCORE_TO_REFUSE) {
      decision = "REFUSE";
      reason = "Score below PAY threshold";
    } else {
      decision = "SKIP";
      reason = "Weak relevance";
    }

    return { source: d.source, decision, reason };
  });
}
