import Anthropic from "@anthropic-ai/sdk";
import type { Source, ScoreBreakdown, AgentDecision, Decision } from "@/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENT_ADDRESS = process.env.AGENT_WALLET_ADDRESS || "0xCITEPAY_AGENT";

// Scoring weights
const W_RELEVANCE   = 0.45;
const W_PRICE       = 0.25;
const W_BOND        = 0.15;
const W_REPUTATION  = 0.15;

// Thresholds
const MIN_SCORE_TO_PAY    = 55;
const MIN_SCORE_TO_REFUSE = 30; // below this = SKIP

export function getAgentAddress(): string {
  return AGENT_ADDRESS;
}

/**
 * Score a single source against a query.
 * Relevance is computed by Claude; others are deterministic.
 */
async function scoreSource(
  query: string,
  source: Source,
  budgetRemaining: number,
  allPrices: number[]
): Promise<{ scores: ScoreBreakdown; excerptUsed: string }> {
  // Relevance via Claude
  const prompt = `You are scoring a creator source for relevance to a research query.

Query: "${query}"

Source title: "${source.title}"
Source URL: ${source.url}
Creator: ${source.creatorName}

Score the relevance from 0 to 100. Return ONLY a JSON object like:
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
    // fallback: use title similarity heuristic
    const queryWords = query.toLowerCase().split(/\s+/);
    const titleWords = source.title.toLowerCase().split(/\s+/);
    const overlap = queryWords.filter((w) => titleWords.includes(w)).length;
    relevance = Math.min(90, overlap * 15 + 30);
  }

  // Price score: cheaper relative to budget = higher score
  const maxPrice = Math.max(...allPrices);
  const priceScore = maxPrice > 0 ? Math.round((1 - source.price / maxPrice) * 80 + 20) : 60;
  const withinBudget = source.price <= budgetRemaining;
  const adjustedPriceScore = withinBudget ? priceScore : 0;

  // Bond score: bonded = +20, unbonded = 0
  const bondScore = source.bonded ? 20 : 0;

  // Reputation score: clamped 0–30
  const repScore = Math.max(0, Math.min(30, source.reputation * 3 + 15));

  const total = Math.round(
    relevance * W_RELEVANCE +
    adjustedPriceScore * W_PRICE +
    bondScore * W_BOND +
    repScore * W_REPUTATION
  );

  return {
    scores: {
      relevance,
      price: adjustedPriceScore,
      bond: bondScore,
      reputation: repScore,
      total,
    },
    excerptUsed,
  };
}

function buildReason(scores: ScoreBreakdown, decision: Decision, source: Source, budgetRemaining: number): string {
  if (decision === "PAY") {
    const parts: string[] = [];
    if (scores.relevance >= 80) parts.push("high relevance");
    else if (scores.relevance >= 60) parts.push("good relevance");
    if (source.bonded) parts.push("bonded creator");
    if (source.reputation >= 3) parts.push("strong reputation");
    if (source.price <= budgetRemaining * 0.5) parts.push("fair price");
    return parts.length ? parts.map((p, i) => i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p).join(", ") + "." : "Best available source within budget.";
  }
  if (decision === "REFUSE") {
    if (source.price > budgetRemaining) return "Source price exceeds remaining budget.";
    if (!source.bonded && scores.relevance < 70) return "Relevant but unverified source; unbonded creator.";
    if (scores.price === 0) return "Relevant but overpriced relative to budget.";
    return "Source fails price or trust threshold.";
  }
  return scores.relevance < 40 ? "Weak relevance to query." : "Not worth considering given current context.";
}

/**
 * Main agent entry: evaluates all sources, returns decisions sorted by score desc.
 */
export async function runBuyerAgent(query: string, budget: number, sources: Source[]): Promise<AgentDecision[]> {
  if (!sources.length) return [];

  const allPrices = sources.map((s) => s.price);
  let budgetRemaining = budget;
  const decisions: AgentDecision[] = [];

  // Score all sources concurrently
  const scored = await Promise.all(
    sources.map(async (source) => {
      const { scores, excerptUsed } = await scoreSource(query, source, budgetRemaining, allPrices);
      return { source, scores, excerptUsed };
    })
  );

  // Sort by total score descending
  scored.sort((a, b) => b.scores.total - a.scores.total);

  for (const { source, scores, excerptUsed } of scored) {
    let decision: Decision;

    if (scores.total >= MIN_SCORE_TO_PAY && source.price <= budgetRemaining) {
      decision = "PAY";
      budgetRemaining -= source.price;
    } else if (scores.total >= MIN_SCORE_TO_REFUSE) {
      decision = "REFUSE";
    } else {
      decision = "SKIP";
    }

    decisions.push({
      sourceId: source.id,
      source,
      decision,
      scores,
      reason: buildReason(scores, decision, source, budgetRemaining + (decision === "PAY" ? source.price : 0)),
      excerptUsed,
    });
  }

  return decisions;
}
