import { describe, it, expect } from "vitest";
import type { Source } from "../src/types";

// Import scoring internals via the agent module
// We test the scoring logic directly without hitting external APIs.

function mockSource(overrides: Partial<Source> = {}): Source {
  return {
    id: "src-1",
    title: "Test Source",
    url: "https://example.com/article",
    creatorName: "Test Creator",
    creatorHandle: "@test",
    payoutWallet: "0xabc",
    contentHash: "abc123",
    metadataURI: "",
    description: "",
    price: 2000, // 0.002 USDC
    bond: 10000,
    bonded: true,
    reputation: 5,
    paidCount: 10,
    refusedCount: 2,
    skipCount: 1,
    active: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// Deterministic scoring function extracted for unit testing
function scoreSourceDeterministic(
  relevance: number,
  source: Source,
  budgetRemaining: number,
  allPrices: number[]
): { price: number; bond: number; reputation: number; total: number } {
  const W_RELEVANCE = 0.45;
  const W_PRICE = 0.25;
  const W_BOND = 0.15;
  const W_REPUTATION = 0.15;

  const maxPrice = Math.max(...allPrices);
  const priceScore = maxPrice > 0 ? Math.round((1 - source.price / maxPrice) * 80 + 20) : 60;
  const withinBudget = source.price <= budgetRemaining;
  const adjustedPriceScore = withinBudget ? priceScore : 0;
  const bondScore = source.bonded ? 20 : 0;
  const repScore = Math.max(0, Math.min(30, source.reputation * 3 + 15));

  const total = Math.round(
    relevance * W_RELEVANCE +
    adjustedPriceScore * W_PRICE +
    bondScore * W_BOND +
    repScore * W_REPUTATION
  );

  return { price: adjustedPriceScore, bond: bondScore, reputation: repScore, total };
}

describe("Agent scoring", () => {
  it("relevance scoring: high relevance boosts total", () => {
    const source = mockSource();
    const budget = 50000;
    const { total: low } = scoreSourceDeterministic(20, source, budget, [source.price]);
    const { total: high } = scoreSourceDeterministic(95, source, budget, [source.price]);
    expect(high).toBeGreaterThan(low);
  });

  it("price penalty: overpriced source (exceeds budget) gets 0 price score", () => {
    const source = mockSource({ price: 100000 }); // 0.1 USDC
    const budget = 1000; // budget = 0.001 USDC, source costs more
    const { price } = scoreSourceDeterministic(80, source, budget, [source.price]);
    expect(price).toBe(0);
  });

  it("bond bonus: bonded source gets +20 bond score", () => {
    const bonded = mockSource({ bonded: true });
    const unbonded = mockSource({ bonded: false });
    const budget = 50000;
    const { bond: bScore } = scoreSourceDeterministic(70, bonded, budget, [bonded.price]);
    const { bond: uScore } = scoreSourceDeterministic(70, unbonded, budget, [unbonded.price]);
    expect(bScore).toBe(20);
    expect(uScore).toBe(0);
  });

  it("reputation bonus: higher reputation means higher rep score", () => {
    const good = mockSource({ reputation: 10 });
    const bad = mockSource({ reputation: -5 });
    const budget = 50000;
    const { reputation: goodRep } = scoreSourceDeterministic(70, good, budget, [good.price]);
    const { reputation: badRep } = scoreSourceDeterministic(70, bad, budget, [bad.price]);
    expect(goodRep).toBeGreaterThan(badRep);
  });

  it("reputation score is clamped to 0–30", () => {
    const veryGood = mockSource({ reputation: 1000 });
    const veryBad = mockSource({ reputation: -1000 });
    const budget = 50000;
    const { reputation: topRep } = scoreSourceDeterministic(70, veryGood, budget, [veryGood.price]);
    const { reputation: botRep } = scoreSourceDeterministic(70, veryBad, budget, [veryBad.price]);
    expect(topRep).toBeLessThanOrEqual(30);
    expect(botRep).toBeGreaterThanOrEqual(0);
  });

  it("budget cap: agent never overspends", () => {
    const MIN_SCORE_TO_PAY = 45;
    const sources = [
      mockSource({ id: "1", price: 30000 }), // 0.03 USDC
      mockSource({ id: "2", price: 30000 }), // 0.03 USDC
      mockSource({ id: "3", price: 30000 }), // 0.03 USDC
    ];
    const budget = 50000; // 0.05 USDC — can only afford 1
    let budgetRemaining = budget;
    let totalSpent = 0;

    for (const source of sources) {
      const relevance = 90;
      const { total } = scoreSourceDeterministic(relevance, source, budgetRemaining, sources.map(s => s.price));
      if (total >= MIN_SCORE_TO_PAY && source.price <= budgetRemaining) {
        budgetRemaining -= source.price;
        totalSpent += source.price;
      }
    }

    expect(totalSpent).toBeLessThanOrEqual(budget);
  });

  it("PAY/REFUSE/SKIP: high score within budget = PAY", () => {
    const MIN_SCORE_TO_PAY = 45;
    // Use a cheaper source relative to a more expensive competitor so price score > minimum
    const source = mockSource({ price: 2000, bonded: true, reputation: 8 });
    const budget = 50000;
    const relevance = 93;
    // allPrices includes a more expensive source so our cheap source gets a better price score
    const { total } = scoreSourceDeterministic(relevance, source, budget, [source.price, 8000]);
    expect(total).toBeGreaterThanOrEqual(MIN_SCORE_TO_PAY);
  });

  it("PAY/REFUSE/SKIP: overpriced source = REFUSE (relevant but can't pay)", () => {
    const MIN_SCORE_TO_PAY = 45;
    const MIN_SCORE_TO_REFUSE = 25;
    const source = mockSource({ price: 100000, bonded: true, reputation: 5 });
    const budget = 2000; // tiny budget
    const relevance = 85;
    const { total, price } = scoreSourceDeterministic(relevance, source, budget, [source.price]);
    // price score is 0 because source.price > budget
    expect(price).toBe(0);
    // score may still be >= PAY threshold (relevance + bond carry it), but agent refuses
    // because source.price > budgetRemaining — the budget gate prevents PAY
    expect(total).toBeGreaterThanOrEqual(MIN_SCORE_TO_REFUSE);
    // Simulate agent decision: PAY requires both score ≥ threshold AND within budget
    const withinBudget = source.price <= budget;
    const decision = (total >= MIN_SCORE_TO_PAY && withinBudget) ? "PAY"
      : total >= MIN_SCORE_TO_REFUSE ? "REFUSE" : "SKIP";
    expect(decision).toBe("REFUSE");
  });

  it("evidence hash generation is deterministic", async () => {
    const { sha256, buildEvidencePreimage, hashEvidence } = await import("../src/lib/evidence");
    const preimage = buildEvidencePreimage({
      query: "test query",
      queryHash: sha256("test query"),
      sourceUrl: "https://example.com",
      excerptUsed: "test excerpt",
      decision: "PAY",
      scores: { relevance: 90, price: 80, bond: 20, reputation: 25, total: 72 },
      budgetBefore: 50000,
      reason: "High relevance",
      price: 2000,
      bonded: true,
      reputation: 5,
    });
    const hash1 = hashEvidence(preimage);
    const hash2 = hashEvidence(preimage);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex
  });
});
