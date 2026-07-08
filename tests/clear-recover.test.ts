import { describe, expect, it } from "vitest";
import type { Source } from "../src/types";
import { auditMandate, matchAndEvaluateCandidate } from "../src/lib/clear/recover";

function source(overrides: Partial<Source> = {}): Source {
  return {
    id: "source-1",
    title: "Arc Testnet USDC Settlement",
    url: "https://example.com/arc",
    creatorName: "Creator",
    creatorHandle: "@creator",
    payoutWallet: "0xcreator",
    contentHash: "content-hash",
    metadataURI: "",
    description: "Arc settles USDC-native payments for autonomous agents in sub-second finality.",
    price: 2_000,
    bond: 0,
    bonded: true,
    reputation: 1,
    paidCount: 0,
    refusedCount: 0,
    skipCount: 0,
    active: true,
    createdAt: "2026-07-07T00:00:00.000Z",
    onChainId: 14,
    ...overrides,
  };
}

const NOW = "2026-07-07T00:00:00.000Z";

describe("recovery audit", () => {
  it("marks a claim recoverable when the quote genuinely appears in the matched source", () => {
    const sources = [source()];
    const mandate = auditMandate(NOW);
    const finding = matchAndEvaluateCandidate(
      {
        claimText: "Arc settles agent payments quickly.",
        quoteText: "Arc settles USDC-native payments for autonomous agents in sub-second finality.",
        matchedSourceTitle: "Arc Testnet USDC Settlement",
        supportScore: 90,
      },
      sources,
      "answer-hash",
      mandate,
      NOW
    );
    expect(finding.decision).toBe("CLEARED");
    expect(finding.quoteVerified).toBe(true);
    expect(finding.wouldBeAmountDueMicro).toBe(2_000);
    // Settlement looks the source up by onChainId, not the ephemeral local
    // id (regenerated on every cold-start reseed) — this must be populated
    // whenever a source is matched, or /recover/settle can never find it.
    expect(finding.matchedSourceOnChainId).toBe(14);
  });

  it("marks a claim unsupported when the quote is not present in the matched source, even with a high score", () => {
    const sources = [source()];
    const mandate = auditMandate(NOW);
    const finding = matchAndEvaluateCandidate(
      {
        claimText: "Arc has zero transaction fees.",
        quoteText: "Arc has completely free, zero-cost transactions for everyone.",
        matchedSourceTitle: "Arc Testnet USDC Settlement",
        supportScore: 97,
      },
      sources,
      "answer-hash",
      mandate,
      NOW
    );
    expect(finding.decision).toBe("UNSUPPORTED");
    expect(finding.quoteVerified).toBe(false);
    expect(finding.wouldBeAmountDueMicro).toBe(0);
  });

  it("marks a claim unmatched when no registered source title plausibly matches", () => {
    const sources = [source()];
    const mandate = auditMandate(NOW);
    const finding = matchAndEvaluateCandidate(
      {
        claimText: "Some unrelated claim about a source CitePay doesn't know.",
        quoteText: "A quote from nowhere in particular.",
        matchedSourceTitle: null,
        supportScore: 80,
      },
      sources,
      "answer-hash",
      mandate,
      NOW
    );
    expect(finding.decision).toBe("UNMATCHED");
    expect(finding.matchedSourceId).toBeNull();
    expect(finding.matchedSourceOnChainId).toBeNull();
    expect(finding.wouldBeAmountDueMicro).toBe(0);
  });

  it("audit mandate never caps recovery below any real price and always requires a quote span", () => {
    const mandate = auditMandate(NOW);
    expect(mandate.requireQuoteSpan).toBe(true);
    expect(mandate.budgetCapMicro).toBeGreaterThan(1_000_000);
  });
});
