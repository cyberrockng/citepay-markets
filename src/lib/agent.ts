import Anthropic from "@anthropic-ai/sdk";
import type { Source, ScoreBreakdown, AgentDecision, Decision } from "@/types";
import { type AgentPolicy, DEFAULT_POLICY, evaluatePolicy } from "@/lib/policy";
import { getRedisSourceCounts } from "@/lib/redis-stats";
import { probeSourceBudget } from "@/lib/fetch-with-budget";

async function enrichSourcesWithRedis(sources: Source[]): Promise<Source[]> {
  const counts = await getRedisSourceCounts();
  if (!counts) return sources;
  return sources.map((s) => ({
    ...s,
    paidCount:    Math.max(s.paidCount    ?? 0, counts.paid[s.id]    ?? 0),
    refusedCount: Math.max(s.refusedCount ?? 0, counts.refused[s.id] ?? 0),
  }));
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENT_ADDRESS = process.env.AGENT_WALLET_ADDRESS || "0x5389688243328c26a92b301faEEAb5fbf9AFf105";

// Scoring weights
const W_RELEVANCE   = 0.45;
const W_PRICE       = 0.25;
const W_BOND        = 0.15;
const W_REPUTATION  = 0.15;

// Thresholds
const MIN_SCORE_TO_PAY    = 45;
const MIN_SCORE_TO_REFUSE = 25;

export function getAgentAddress(): string {
  return AGENT_ADDRESS;
}

async function scoreSource(
  query: string,
  source: Source,
  budgetRemaining: number,
  allPrices: number[]
): Promise<{ scores: ScoreBreakdown; excerptUsed: string; memoryCached: boolean }> {
  const daysOld = (Date.now() - new Date(source.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  const freshnessBonus = daysOld < 7 ? 5 : daysOld < 30 ? 2 : 0;

  const descriptionLine = source.description ? `\nContent preview: "${source.description.substring(0, 300)}"` : "";
  const freshnessLine = freshnessBonus > 0 ? `\nNote: This is a recently registered source (${Math.round(daysOld)} days old).` : "";
  const prompt = `You are scoring a creator source for relevance to a research query.

Query: "${query}"

Source title: "${source.title}"
Source URL: ${source.url}
Creator: ${source.creatorName}${descriptionLine}${freshnessLine}

Score the relevance from 0 to 100. A score of 80+ means this source directly answers the query. Return ONLY a JSON object like:
{"relevance": 82, "excerpt": "one-sentence summary of why this source is or isn't relevant"}`;

  let relevance = 50;
  let excerptUsed = "No excerpt available";

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 128,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (msg.content[0] as { text: string }).text.trim();
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "{}");
    relevance = Math.max(0, Math.min(100, Number(parsed.relevance) || 50));
    excerptUsed = parsed.excerpt || excerptUsed;
  } catch {
    const queryWords = query.toLowerCase().split(/\s+/);
    const titleWords = source.title.toLowerCase().split(/\s+/);
    const overlap = queryWords.filter((w) => titleWords.includes(w)).length;
    relevance = Math.min(90, overlap * 15 + 30);
  }

  const maxPrice = Math.max(...allPrices);
  const priceScore = maxPrice > 0 ? Math.round((1 - source.price / maxPrice) * 80 + 20) : 60;
  const withinBudget = source.price <= budgetRemaining;
  const adjustedPriceScore = withinBudget ? priceScore : 0;

  const bondScore = source.bonded ? 20 : 0;
  const repScore = Math.max(0, Math.min(30, source.reputation * 3 + 15));

  // Citation memory bonus: sources with prior PAY history get a pre-trust boost
  const memoryBonus = source.paidCount >= 7 ? 12 : source.paidCount >= 3 ? 8 : 0;
  // Persistent low-value penalty: consistently refused sources get penalized
  const memoryPenalty = source.refusedCount > source.paidCount * 2 && source.refusedCount > 2 ? -5 : 0;
  const memoryCached = source.paidCount >= 3;

  const total = Math.min(
    100,
    Math.round(
      relevance * W_RELEVANCE +
      adjustedPriceScore * W_PRICE +
      bondScore * W_BOND +
      repScore * W_REPUTATION +
      freshnessBonus +
      memoryBonus +
      memoryPenalty
    )
  );

  return {
    scores: { relevance, price: adjustedPriceScore, bond: bondScore, reputation: repScore, total },
    excerptUsed,
    memoryCached,
  };
}

function buildReason(
  scores: ScoreBreakdown,
  decision: Decision,
  source: Source,
  budgetRemaining: number,
  policyReason: string | null
): string {
  if (decision === "BLOCKED_BY_POLICY") {
    return policyReason ?? "Blocked by agent spend policy.";
  }
  if (decision === "PAY") {
    const parts: string[] = [];
    if (scores.relevance >= 80) parts.push("high relevance");
    else if (scores.relevance >= 60) parts.push("good relevance");
    if (source.bonded) parts.push("bonded creator");
    if (source.reputation >= 3) parts.push("strong reputation");
    if (source.price <= budgetRemaining * 0.5) parts.push("fair price");
    return parts.length
      ? parts.map((p, i) => i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p).join(", ") + "."
      : "Best available source within budget.";
  }
  if (decision === "REFUSE") {
    if (source.price > budgetRemaining) return "Source price exceeds remaining budget.";
    if (!source.bonded && scores.relevance < 70) return "Relevant but unverified source; unbonded creator.";
    if (scores.price === 0) return "Relevant but overpriced relative to budget.";
    return "Source fails price or trust threshold.";
  }
  return scores.relevance < 40 ? "Weak relevance to query." : "Not worth considering given current context.";
}

// Budget floor: always stop paying when this fraction of budget is spent,
// regardless of policy — leaves headroom for the query fee and gas.
const BUDGET_STOP_FRACTION = 0.88;

export type AgentEvent =
  | { type: "scoring_complete"; count: number }
  | { type: "decision"; sourceTitle: string; decision: string; reason: string; relevance: number; score: number; sufficiencyStop: boolean; memoryCached?: boolean };

export async function runBuyerAgent(
  query: string,
  budget: number,
  sources: Source[],
  policy: AgentPolicy = DEFAULT_POLICY,
  onEvent?: (e: AgentEvent) => void
): Promise<AgentDecision[]> {
  if (!sources.length) return [];

  // Enrich with Redis counts to survive cold starts (paidCount/refusedCount reset to 0 in SQLite)
  const enrichedSources = await enrichSourcesWithRedis(sources);

  const allPrices = enrichedSources.map((s) => s.price);
  let budgetRemaining = budget;
  let sessionSpent = 0;
  const decisions: AgentDecision[] = [];

  const scored = await Promise.all(
    enrichedSources.map(async (source) => {
      const { scores, excerptUsed, memoryCached } = await scoreSource(query, source, budgetRemaining, allPrices);
      return { source, scores, excerptUsed, memoryCached };
    })
  );

  onEvent?.({ type: "scoring_complete", count: scored.length });
  scored.sort((a, b) => b.scores.total - a.scores.total);

  const seenDomains = new Set<string>();
  for (const item of scored) {
    try {
      const domain = new URL(item.source.url).hostname.replace(/^www\./, "");
      if (seenDomains.has(domain)) {
        item.scores.total = Math.max(0, item.scores.total - 10);
      } else {
        seenDomains.add(domain);
      }
    } catch { /* skip malformed URLs */ }
  }

  let citedCount = 0;
  let cumulativeRelevance = 0;

  for (const { source, scores, excerptUsed, memoryCached } of scored) {
    // Sufficiency check: have we gathered enough high-quality citations?
    // Triggered by: citation count, cumulative relevance, or hard budget floor.
    const budgetFloorHit = sessionSpent >= budget * BUDGET_STOP_FRACTION;
    const citationCapHit = policy.sufficiencyMaxCitations > 0 && citedCount >= policy.sufficiencyMaxCitations;
    const relevanceTargetHit = policy.sufficiencyRelevanceTarget > 0 && cumulativeRelevance >= policy.sufficiencyRelevanceTarget;

    if (citedCount > 0 && (budgetFloorHit || citationCapHit || relevanceTargetHit)) {
      const stopReason = budgetFloorHit
        ? "Budget floor reached — preserving remaining balance."
        : citationCapHit
        ? `Sufficient coverage: ${citedCount} citation${citedCount !== 1 ? "s" : ""} gathered (${policy.name} policy limit).`
        : `Sufficient coverage: cumulative relevance ${cumulativeRelevance} reached target (${policy.name} policy).`;

      decisions.push({
        sourceId: source.id,
        source,
        decision: "SKIP",
        scores,
        reason: stopReason,
        excerptUsed,
        policyProfile: policy.name,
        policyRulesPassed: [],
        policyRulesFailed: [],
        policyReason: null,
        sufficiencyStop: true,
        memoryCached,
      });
      onEvent?.({ type: "decision", sourceTitle: source.title, decision: "SKIP", reason: stopReason, relevance: scores.relevance, score: scores.total, sufficiencyStop: true, memoryCached });
      continue;
    }

    // ── Budget probe: explicit price check before scoring commit ─────────────
    const probe = probeSourceBudget({
      sourceId:       source.id,
      sourcePrice:    source.price,
      budgetRemaining,
      policyMaxPrice: policy.maxPricePerCitation || 10_000,
    });

    const policyEval = evaluatePolicy(source, scores, sessionSpent, policy);
    let decision: Decision;

    if (scores.total >= MIN_SCORE_TO_PAY && source.price <= budgetRemaining) {
      if (policyEval.blocked) {
        decision = "BLOCKED_BY_POLICY";
      } else {
        decision = "PAY";
        budgetRemaining -= source.price;
        sessionSpent += source.price;
        citedCount++;
        cumulativeRelevance += scores.relevance;
      }
    } else if (scores.total >= MIN_SCORE_TO_REFUSE) {
      decision = "REFUSE";
    } else {
      decision = "SKIP";
    }

    const policyReason = decision === "BLOCKED_BY_POLICY" ? policyEval.reason : null;

    const reason = buildReason(scores, decision, source, budgetRemaining + (decision === "PAY" ? source.price : 0), policyReason);
    decisions.push({
      sourceId: source.id,
      source,
      decision,
      scores,
      reason,
      excerptUsed,
      policyProfile:     policy.name,
      policyRulesPassed: policyEval.rulesPassed,
      policyRulesFailed: policyEval.rulesFailed,
      policyReason,
      memoryCached,
      probePrice:    probe.sourcePrice,
      probePassed:   probe.probePassed,
      probeDecision: probe.probeDecision,
    });
    onEvent?.({ type: "decision", sourceTitle: source.title, decision, reason, relevance: scores.relevance, score: scores.total, sufficiencyStop: false, memoryCached });
  }

  // Compute contribution weights for PAY decisions.
  // Each cited source earns a share of the total creator budget proportional
  // to its relevance score — same total USDC out, redistributed by contribution.
  const payDecisions = decisions.filter((d) => d.decision === "PAY");
  if (payDecisions.length > 0) {
    const totalRelevance = payDecisions.reduce((sum, d) => sum + d.scores.relevance, 0);
    const totalCreatorBudget = payDecisions.reduce((sum, d) => sum + d.source.price, 0);

    for (const d of payDecisions) {
      d.contributionWeight = totalRelevance > 0
        ? Math.round((d.scores.relevance / totalRelevance) * 10000) / 10000
        : Math.round((1 / payDecisions.length) * 10000) / 10000;
      d.weightedAmount = Math.round(d.contributionWeight * totalCreatorBudget);
    }

    // Correct any rounding drift so total weighted === totalCreatorBudget
    const weightedTotal = payDecisions.reduce((sum, d) => sum + (d.weightedAmount ?? 0), 0);
    const drift = totalCreatorBudget - weightedTotal;
    if (drift !== 0) payDecisions[0].weightedAmount = (payDecisions[0].weightedAmount ?? 0) + drift;
  }

  return decisions;
}

/**
 * Post-synthesis contribution scoring — inline citation counting.
 *
 * Counts how many times each source is cited as [Source Title] in the
 * synthesised answer. More mentions = larger share of the creator budget.
 *
 * Every PAY'd source gets a minimum count of 1 — the agent decided it was
 * worth paying for, so it contributed something even if not directly quoted.
 *
 * Weights sum to 1.0. Payments sum exactly to totalCreatorBudget.
 * No LLM call needed — objective, fast, tamper-resistant.
 */
export function scoreContributionWeights(
  answer: string,
  payDecisions: AgentDecision[]
): void {
  if (payDecisions.length === 0) return;

  // Count [Source Title] occurrences for each PAY'd source (case-insensitive)
  const counts = payDecisions.map((d) => {
    const escaped = d.source.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = answer.match(new RegExp(`\\[${escaped}\\]`, "gi"));
    // Minimum 1 — agent paid for it, so it contributed something
    return Math.max(1, matches?.length ?? 0);
  });

  const totalCounts = counts.reduce((s, c) => s + c, 0);

  // Compute weights proportional to citation count
  const weights = counts.map((c) =>
    Math.round((c / totalCounts) * 10000) / 10000
  );

  // Split total creator budget proportionally — weights sum to 1.0, payments sum to totalBudget
  const totalBudget = payDecisions.reduce((s, d) => s + d.source.price, 0);
  for (let i = 0; i < payDecisions.length; i++) {
    const d = payDecisions[i];
    d.contributionWeight = weights[i];
    d.weightedAmount    = Math.round(totalBudget * weights[i]);
  }

  // Correct rounding drift so payments sum exactly to totalBudget
  const allocated = payDecisions.reduce((s, d) => s + (d.weightedAmount ?? 0), 0);
  const drift = totalBudget - allocated;
  if (drift !== 0) {
    const topIdx = counts.indexOf(Math.max(...counts));
    payDecisions[topIdx].weightedAmount = (payDecisions[topIdx].weightedAmount ?? 0) + drift;
  }
}
