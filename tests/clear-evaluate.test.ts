import { describe, expect, it } from "vitest";
import type { Source } from "../src/types";
import type { ClearMandateConfig } from "../src/lib/clear/types";
import { evaluateClaimClearance } from "../src/lib/clear/evaluate";

const SOURCE_TEXT = "Exact source evidence supports the cleared claim. Additional context follows.";
const QUOTE = "Exact source evidence supports the cleared claim.";

function mandate(overrides: Partial<ClearMandateConfig> = {}): ClearMandateConfig {
  return {
    mandateConfigId: "mandate-1",
    onChainMandateId: 7,
    operatorWallet: "0xoperator",
    agentWallet: "0xagent",
    policyName: "Clear Test",
    budgetCapMicro: 10_000,
    maxPricePerCitationMicro: 5_000,
    maxPricePerClaimMicro: 3_000,
    allowedSourceTypes: ["article"],
    blockedDomains: null,
    blockedWallets: null,
    requiredLicenseClass: "clear-demo",
    requirePublisherVerified: false,
    requireQuoteSpan: true,
    minSupportScore: 75,
    challengeWindowSeconds: 86_400,
    expiresAt: null,
    mandateHash: "hash",
    operatorSignature: null,
    createdAt: "2026-07-07T00:00:00.000Z",
    ...overrides,
  };
}

function source(overrides: Partial<Source> = {}): Source {
  return {
    id: "source-1",
    title: "Source",
    url: "https://example.com/source",
    creatorName: "Creator",
    creatorHandle: "@creator",
    payoutWallet: "0xcreator",
    contentHash: "content-hash",
    metadataURI: "",
    description: SOURCE_TEXT,
    price: 1_000,
    bond: 0,
    bonded: true,
    reputation: 1,
    paidCount: 0,
    refusedCount: 0,
    skipCount: 0,
    active: true,
    createdAt: "2026-07-07T00:00:00.000Z",
    onChainId: 14,
    assetType: "article",
    licenseClass: "clear-demo",
    verificationStatus: "verified",
    riskScore: 0,
    ...overrides,
  };
}

function evaluate(opts: {
  mandate?: Partial<ClearMandateConfig>;
  source?: Partial<Source>;
  quoteText?: string;
  supportScore?: number;
  sessionSpentMicro?: number;
}) {
  return evaluateClaimClearance({
    clearanceId: "clearance-1",
    mandate: mandate(opts.mandate),
    source: source(opts.source),
    answerHash: "answer-hash",
    claimText: "A claim needs exact evidence before payment.",
    quoteText: opts.quoteText ?? QUOTE,
    sourceFullText: SOURCE_TEXT,
    supportScore: opts.supportScore ?? 90,
    sessionSpentMicro: opts.sessionSpentMicro ?? 0,
    nowIso: "2026-07-07T00:00:00.000Z",
  });
}

describe("evaluateClaimClearance", () => {
  it("clears supported licensed claims within budget", () => {
    const result = evaluate({});
    expect(result.decision).toBe("CLEARED");
    expect(result.amountDueMicro).toBe(1_000);
    expect(result.quoteVerified).toBe(true);
  });

  it("blocks license mismatch before payment", () => {
    const result = evaluate({ source: { licenseClass: "read-only" } });
    expect(result.decision).toBe("BLOCKED_LICENSE");
    expect(result.amountDueMicro).toBe(0);
  });

  it("blocks source policy failures", () => {
    const result = evaluate({ mandate: { blockedDomains: ["example.com"] } });
    expect(result.decision).toBe("BLOCKED_POLICY");
    expect(result.amountDueMicro).toBe(0);
  });

  it("marks absent quotes unsupported even with a high support score", () => {
    const result = evaluate({ quoteText: "A convincing paraphrase that is absent.", supportScore: 99 });
    expect(result.decision).toBe("UNSUPPORTED");
    expect(result.quoteVerified).toBe(false);
    expect(result.amountDueMicro).toBe(0);
  });

  it("marks low advisory support unsupported after quote verification", () => {
    const result = evaluate({ supportScore: 20 });
    expect(result.quoteVerified).toBe(true);
    expect(result.decision).toBe("UNSUPPORTED");
  });

  it("blocks claims over price cap", () => {
    const result = evaluate({ source: { price: 9_000 } });
    expect(result.decision).toBe("OVER_CAP");
    expect(result.amountDueMicro).toBe(0);
  });

  it("blocks claims that exceed remaining budget", () => {
    const result = evaluate({ sessionSpentMicro: 9_500 });
    expect(result.decision).toBe("OVER_CAP");
    expect(result.amountDueMicro).toBe(0);
  });
});
