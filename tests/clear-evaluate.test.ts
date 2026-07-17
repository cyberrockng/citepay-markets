import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import type { Receipt, Source } from "../src/types";
import type { ClaimClearance, ClearMandateConfig } from "../src/lib/clear/types";
import { buildReceiptHash, evaluateClaimClearance } from "../src/lib/clear/evaluate";
import { authenticateClearApiRequest, buildClearApiKeyRecord } from "../src/lib/clear/auth";
import { runClearCheck } from "../src/lib/clear/check";
import { createClearMandate } from "../src/lib/clear/mandate";
import { runClearSettle } from "../src/lib/clear/settle-api";
import { hashClearApiKey } from "../src/lib/clear/auth";
import { getClearApiKeyByHash, getClearMandateConfigById, insertClaimClearance, insertClearApiKey, insertClearSettlementIdempotency, insertReceipt, revokeClearApiKey } from "../src/lib/db";
import { GET as getClearance } from "../src/app/api/clear/[id]/route";
import { badgeState, GET as getClearBadge } from "../src/app/api/clear/[id]/badge/route";
import { clearBadgeEmbedSnippet } from "../src/lib/clear/embed";

const SOURCE_TEXT = "Exact source evidence supports the cleared claim. Additional context follows.";
const QUOTE = "Exact source evidence supports the cleared claim.";

// Unit fixtures must never be persisted to durable project storage.
delete process.env.DATABASE_URL;

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

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: "receipt-1",
    sourceId: "source-1",
    queryId: "query-1",
    agentAddress: "0xagent",
    creatorWallet: "0xcreator",
    decision: "PAY",
    query: "query",
    queryHash: "query-hash",
    sourceTitle: "Source",
    sourceUrl: "https://example.com/source",
    amountPaid: 1_000,
    evidenceHash: "evidence-hash",
    evidencePreimage: {
      query: "query",
      queryHash: "query-hash",
      sourceUrl: "https://example.com/source",
      excerptUsed: QUOTE,
      decision: "PAY",
      scoreInputs: {
        relevance: 90,
        price: "0.001000 USDC",
        bonded: true,
        creatorReputation: 1,
        budgetRemainingBefore: "0.010000 USDC",
      },
      reason: "test fixture",
      timestamp: "2026-07-07T00:00:00.000Z",
    },
    contentHashAtDecision: "content-hash",
    scores: { relevance: 90, price: 90, bond: 20, reputation: 1, total: 90 },
    reason: "test fixture",
    txHash: "0xconfirmed",
    paymentStatus: "confirmed",
    policyProfile: "Clear",
    policyRulesPassed: [],
    policyRulesFailed: [],
    policyReason: null,
    budgetBefore: 10_000,
    budgetAfter: 9_000,
    challenged: false,
    createdAt: "2026-07-07T00:00:00.000Z",
    ...overrides,
  };
}

function evaluate(opts: {
  clearanceId?: string;
  mandate?: Partial<ClearMandateConfig>;
  source?: Partial<Source>;
  quoteText?: string;
  supportScore?: number;
  sessionSpentMicro?: number;
}) {
  return evaluateClaimClearance({
    clearanceId: opts.clearanceId ?? "clearance-1",
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

function rehashClearance(clearance: ClaimClearance): ClaimClearance {
  const withoutHash = Object.fromEntries(
    Object.entries(clearance).filter(([key]) => key !== "receiptHash")
  ) as Omit<ClaimClearance, "receiptHash">;
  return { ...withoutHash, receiptHash: buildReceiptHash(withoutHash) };
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

describe("Clear API auth and check handler", () => {
  it("authenticates hashed cpk_ keys and rejects missing keys", async () => {
    const rawKey = "cpk_test_valid_auth_key_1234567890";
    const record = buildClearApiKeyRecord(rawKey, "test-owner", "2026-07-15T00:00:00.000Z");
    insertClearApiKey(record);

    const good = await authenticateClearApiRequest({
      headers: { get: (name: string) => name.toLowerCase() === "authorization" ? `Bearer ${rawKey}` : null },
    });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.auth.keyHash).toBe(record.keyHash);

    const missing = await authenticateClearApiRequest({
      headers: { get: () => null },
    });
    expect(missing.ok).toBe(false);
  });

  it("a revoked key is rejected on its next request", async () => {
    const rawKey = "cpk_test_revocation_key_1234567890";
    const record = buildClearApiKeyRecord(rawKey, "revocation-owner", "2026-07-16T00:00:00.000Z");
    insertClearApiKey(record);

    const before = await authenticateClearApiRequest({
      headers: { get: (name: string) => name.toLowerCase() === "authorization" ? `Bearer ${rawKey}` : null },
    });
    expect(before.ok).toBe(true);

    await revokeClearApiKey(record.keyHash);
    expect(getClearApiKeyByHash(record.keyHash)?.revokedAt).not.toBeNull();

    const after = await authenticateClearApiRequest({
      headers: { get: (name: string) => name.toLowerCase() === "authorization" ? `Bearer ${rawKey}` : null },
    });
    expect(after.ok).toBe(false);
  });

  it("checks inline citations and stores private-hash receipts without public text leakage", async () => {
    const rawKey = "cpk_test_clear_check_key_1234567890";
    const record = buildClearApiKeyRecord(rawKey, "check-owner", "2026-07-15T00:00:00.000Z");
    insertClearApiKey(record);
    const auth = { keyHash: record.keyHash, keyPrefix: record.keyPrefix, ownerLabel: record.ownerLabel, tier: record.tier };
    const source = "Exact source evidence supports the cleared claim. Additional context follows.";

    const result = await runClearCheck({
      claim: "Exact source evidence supports the cleared claim.",
      quote: "Exact source evidence supports the cleared claim.",
      source: { text: source, label: "Inline source", licenseClass: "standard" },
      policy: { maxPricePerCitationMicro: 0, requiredLicenseClass: "standard" },
      visibility: "private_hash_only",
    }, auth, "https://citepay.test");

    expect(result.status).toBe(200);
    if (result.status !== 200) throw new Error(result.body.error);
    expect(result.body.decision).toBe("CLEARED");
    expect(result.body.checks.quoteVerified).toBe(true);
    expect(result.body.receiptUrl).toContain(`/clearance/${result.body.clearanceId}`);

    const res = await getClearance(new Request("https://citepay.test"), {
      params: Promise.resolve({ id: result.body.clearanceId }),
    });
    const json = await res.json() as { clearance: { claimText: string; quoteText: string; visibility: string } };
    expect(json.clearance.visibility).toBe("private_hash_only");
    expect(json.clearance.claimText).toBe("[private_hash_only]");
    expect(json.clearance.quoteText).toBe("[private_hash_only]");
  });

  it("rejects arbitrary source URLs in Stage 2", async () => {
    const auth = { keyHash: "owner-hash", keyPrefix: "cpk_owner", ownerLabel: "owner", tier: "stage2" };
    const result = await runClearCheck({
      claim: "A claim.",
      quote: "A quote.",
      sourceUrl: "https://example.com/source",
      source: { text: "A quote.", label: "Inline source" },
      policy: { maxPricePerCitationMicro: 0, requiredLicenseClass: "standard" },
    }, auth, "https://citepay.test");

    expect(result.status).toBe(400);
    if (result.status !== 200) expect(result.body.field).toBe("sourceUrl");
  });

  it("rejects an oversized inline licenseClass", async () => {
    const auth = { keyHash: "owner-hash-license-cap", keyPrefix: "cpk_owner", ownerLabel: "owner", tier: "stage2" };
    const result = await runClearCheck({
      claim: "A claim.",
      quote: "A quote.",
      source: { text: SOURCE_TEXT, label: "Inline source", licenseClass: "x".repeat(65) },
      policy: { maxPricePerCitationMicro: 0, requiredLicenseClass: "standard" },
    }, auth, "https://citepay.test");

    expect(result.status).toBe(413);
    if (result.status !== 200) expect(result.body.field).toBe("licenseClass");
  });

  it("marks absent inline quotes unsupported", async () => {
    const auth = { keyHash: "owner-hash-2", keyPrefix: "cpk_owner", ownerLabel: "owner", tier: "stage2" };
    const result = await runClearCheck({
      claim: "Exact source evidence supports the cleared claim.",
      quote: "This fabricated quote is not present.",
      source: { text: SOURCE_TEXT, label: "Inline source", licenseClass: "standard" },
      policy: { maxPricePerCitationMicro: 0, requiredLicenseClass: "standard" },
      visibility: "public",
    }, auth, "https://citepay.test");

    expect(result.status).toBe(200);
    if (result.status !== 200) throw new Error(result.body.error);
    expect(result.body.decision).toBe("UNSUPPORTED");
    expect(result.body.checks.quoteVerified).toBe(false);
  });

  it("creates a real persisted off-chain mandate owned by the API key", async () => {
    const rawKey = "cpk_test_mandate_key_1234567890";
    const record = buildClearApiKeyRecord(rawKey, "mandate-owner", "2026-07-15T00:00:00.000Z");
    insertClearApiKey(record);
    const auth = { keyHash: record.keyHash, keyPrefix: record.keyPrefix, ownerLabel: record.ownerLabel, tier: record.tier };

    const result = await createClearMandate({
      name: "standard docs policy",
      requiredLicenseClass: "standard",
      maxPricePerCitationMicro: 100_000,
      totalBudgetMicro: 5_000_000,
    }, auth);

    expect(result.status).toBe(201);
    if (result.status !== 201) throw new Error(result.body.error);
    expect(result.body.mandateConfigId).toMatch(/^mnd_/);
    expect(result.body.onChainMandateId).toBeNull();
    expect(result.body.anchoring).toBe("not_anchored");

    const stored = getClearMandateConfigById(result.body.mandateConfigId);
    expect(stored?.ownerKeyHash).toBe(record.keyHash);
    expect(stored?.requiredLicenseClass).toBe("standard");
    expect(stored?.budgetCapMicro).toBe(5_000_000);
  });

  it("lets a created mandate be used immediately by clear check", async () => {
    const record = buildClearApiKeyRecord("cpk_test_mandate_check_key_1234567890", "mandate-check-owner", "2026-07-15T00:00:00.000Z");
    insertClearApiKey(record);
    const auth = { keyHash: record.keyHash, keyPrefix: record.keyPrefix, ownerLabel: record.ownerLabel, tier: record.tier };
    const mandateResult = await createClearMandate({
      name: "standard check policy",
      requiredLicenseClass: "standard",
      maxPricePerCitationMicro: 100_000,
      totalBudgetMicro: 5_000_000,
    }, auth);
    if (mandateResult.status !== 201) throw new Error(mandateResult.body.error);

    const checkResult = await runClearCheck({
      claim: "Exact source evidence supports the cleared claim.",
      quote: "Exact source evidence supports the cleared claim.",
      source: { text: SOURCE_TEXT, label: "Inline source", licenseClass: "standard" },
      policy: { mandateConfigId: mandateResult.body.mandateConfigId },
      visibility: "public",
    }, auth, "https://citepay.test");

    expect(checkResult.status).toBe(200);
    if (checkResult.status !== 200) throw new Error(checkResult.body.error);
    expect(checkResult.body.decision).toBe("CLEARED");
  });

  it("returns the same clearance for repeated owner, mandate, and externalRef", async () => {
    const record = buildClearApiKeyRecord("cpk_test_external_ref_key_1234567890", "external-ref-owner", "2026-07-17T00:00:00.000Z");
    insertClearApiKey(record);
    const auth = { keyHash: record.keyHash, keyPrefix: record.keyPrefix, ownerLabel: record.ownerLabel, tier: record.tier };
    const mandateResult = await createClearMandate({
      name: "external ref policy",
      requiredLicenseClass: "standard",
      maxPricePerCitationMicro: 100_000,
      totalBudgetMicro: 5_000_000,
    }, auth);
    if (mandateResult.status !== 201) throw new Error(mandateResult.body.error);

    const externalRef = `shadow-float-${randomUUID()}`;
    const first = await runClearCheck({
      claim: "Exact source evidence supports the cleared claim.",
      quote: "Exact source evidence supports the cleared claim.",
      source: { text: SOURCE_TEXT, label: "Inline source", licenseClass: "standard" },
      policy: { mandateConfigId: mandateResult.body.mandateConfigId },
      externalRef,
      visibility: "public",
    }, auth, "https://citepay.test");
    if (first.status !== 200) throw new Error(first.body.error);
    expect(first.body.decision).toBe("CLEARED");
    expect(first.body.externalRef).toBe(externalRef);

    const retryWithDifferentPayload = await runClearCheck({
      claim: "A different claim should not replace the idempotent clearance.",
      quote: "This fabricated quote is not present.",
      source: { text: SOURCE_TEXT, label: "Inline source", licenseClass: "standard" },
      policy: { mandateConfigId: mandateResult.body.mandateConfigId },
      externalRef,
      visibility: "private_hash_only",
    }, auth, "https://citepay.test");
    if (retryWithDifferentPayload.status !== 200) throw new Error(retryWithDifferentPayload.body.error);
    expect(retryWithDifferentPayload.body.clearanceId).toBe(first.body.clearanceId);
    expect(retryWithDifferentPayload.body.decision).toBe("CLEARED");
    expect(retryWithDifferentPayload.body.externalRef).toBe(externalRef);

    const res = await getClearance(new Request("https://citepay.test"), {
      params: Promise.resolve({ id: first.body.clearanceId }),
    });
    const json = await res.json() as { externalRef: string | null; clearance: ClaimClearance };
    expect(json.externalRef).toBe(externalRef);
    expect(json.clearance.externalRef).toBe(externalRef);
    expect(json.clearance.claimText).toBe("Exact source evidence supports the cleared claim.");
  });

  it("rejects invalid mandate license and budget values", async () => {
    const auth = { keyHash: "mandate-invalid-owner", keyPrefix: "cpk_invalid", ownerLabel: "owner", tier: "stage2" };
    const badLicense = await createClearMandate({
      name: "bad license",
      requiredLicenseClass: "fake-license",
      maxPricePerCitationMicro: 100,
      totalBudgetMicro: 100,
    }, auth);
    expect(badLicense.status).toBe(400);
    if (badLicense.status !== 201) expect(badLicense.body.field).toBe("requiredLicenseClass");

    const badBudget = await createClearMandate({
      name: "bad budget",
      requiredLicenseClass: "standard",
      maxPricePerCitationMicro: 200,
      totalBudgetMicro: 100,
    }, auth);
    expect(badBudget.status).toBe(400);
    if (badBudget.status !== 201) expect(badBudget.body.field).toBe("maxPricePerCitationMicro");
  });

  it("requires explicit confirmation before settlement", async () => {
    const auth = { keyHash: "settle-confirm-owner", keyPrefix: "cpk_settle", ownerLabel: "owner", tier: "stage2" };
    const result = await runClearSettle({
      clearanceId: "clr_missing_confirm",
      mandateConfigId: "mnd_missing_confirm",
      idempotencyKey: "settle-1",
    }, auth, "https://citepay.test");

    expect(result.status).toBe(400);
    if (result.status !== 200) expect(result.body.field).toBe("confirm");
  });

  it("does not settle inline clearances as paid registered-source settlements", async () => {
    const record = buildClearApiKeyRecord("cpk_test_settle_inline_key_1234567890", "settle-inline-owner", "2026-07-15T00:00:00.000Z");
    insertClearApiKey(record);
    const auth = { keyHash: record.keyHash, keyPrefix: record.keyPrefix, ownerLabel: record.ownerLabel, tier: record.tier };
    const mandateResult = await createClearMandate({
      name: "settle policy",
      requiredLicenseClass: "standard",
      maxPricePerCitationMicro: 100_000,
      totalBudgetMicro: 5_000_000,
    }, auth);
    if (mandateResult.status !== 201) throw new Error(mandateResult.body.error);
    const checkResult = await runClearCheck({
      claim: "Exact source evidence supports the cleared claim.",
      quote: "Exact source evidence supports the cleared claim.",
      source: { text: SOURCE_TEXT, label: "Inline source", licenseClass: "standard" },
      policy: { mandateConfigId: mandateResult.body.mandateConfigId },
      visibility: "public",
    }, auth, "https://citepay.test");
    if (checkResult.status !== 200) throw new Error(checkResult.body.error);
    expect(checkResult.body.decision).toBe("CLEARED");
    // P0-B: an inline CLEARED result must self-declare it cannot be settled, at check time.
    expect(checkResult.body.settleable).toBe(false);
    expect(checkResult.body.settlementRequirement).toBe("registered_source");

    const settleResult = await runClearSettle({
      clearanceId: checkResult.body.clearanceId,
      mandateConfigId: mandateResult.body.mandateConfigId,
      idempotencyKey: "settle-inline-1",
      confirm: true,
    }, auth, "https://citepay.test");

    expect(settleResult.status).toBe(422);
    if (settleResult.status !== 200) {
      expect(settleResult.body.error).toContain("registered source");
    }
  });

  it("enforces settlement ownership before any payment attempt", async () => {
    const ownerRecord = buildClearApiKeyRecord("cpk_test_settle_owner_key_1234567890", "settle-owner", "2026-07-15T00:00:00.000Z");
    insertClearApiKey(ownerRecord);
    const owner = { keyHash: ownerRecord.keyHash, keyPrefix: ownerRecord.keyPrefix, ownerLabel: ownerRecord.ownerLabel, tier: ownerRecord.tier };
    const other = { keyHash: "different-owner-hash", keyPrefix: "cpk_other", ownerLabel: "other", tier: "stage2" };
    const mandateResult = await createClearMandate({
      name: "ownership policy",
      requiredLicenseClass: "standard",
      maxPricePerCitationMicro: 100_000,
      totalBudgetMicro: 5_000_000,
    }, owner);
    if (mandateResult.status !== 201) throw new Error(mandateResult.body.error);
    const checkResult = await runClearCheck({
      claim: "Exact source evidence supports the cleared claim.",
      quote: "Exact source evidence supports the cleared claim.",
      source: { text: SOURCE_TEXT, label: "Inline source", licenseClass: "standard" },
      policy: { mandateConfigId: mandateResult.body.mandateConfigId },
    }, owner, "https://citepay.test");
    if (checkResult.status !== 200) throw new Error(checkResult.body.error);

    const settleResult = await runClearSettle({
      clearanceId: checkResult.body.clearanceId,
      mandateConfigId: mandateResult.body.mandateConfigId,
      idempotencyKey: "settle-owner-1",
      confirm: true,
    }, other, "https://citepay.test");

    expect(settleResult.status).toBe(403);
    if (settleResult.status !== 200) expect(settleResult.body.field).toBe("clearanceId");
  });

  it("refuses settlement for unsupported clearances", async () => {
    const auth = { keyHash: "settle-unsupported-owner", keyPrefix: "cpk_unsup", ownerLabel: "owner", tier: "stage2" };
    const mandateResult = await createClearMandate({
      name: "unsupported policy",
      requiredLicenseClass: "standard",
      maxPricePerCitationMicro: 100_000,
      totalBudgetMicro: 5_000_000,
    }, auth);
    if (mandateResult.status !== 201) throw new Error(mandateResult.body.error);
    const checkResult = await runClearCheck({
      claim: "Exact source evidence supports the cleared claim.",
      quote: "This fabricated quote is not present.",
      source: { text: SOURCE_TEXT, label: "Inline source", licenseClass: "standard" },
      policy: { mandateConfigId: mandateResult.body.mandateConfigId },
    }, auth, "https://citepay.test");
    if (checkResult.status !== 200) throw new Error(checkResult.body.error);
    expect(checkResult.body.decision).toBe("UNSUPPORTED");

    const settleResult = await runClearSettle({
      clearanceId: checkResult.body.clearanceId,
      mandateConfigId: mandateResult.body.mandateConfigId,
      idempotencyKey: "settle-unsupported-1",
      confirm: true,
    }, auth, "https://citepay.test");

    expect(settleResult.status).toBe(422);
    if (settleResult.status !== 200) expect(settleResult.body.error).toContain("UNSUPPORTED");
  });

  it("rejects reused idempotency keys for different clearances", async () => {
    const auth = { keyHash: "settle-idempotency-owner", keyPrefix: "cpk_idem", ownerLabel: "owner", tier: "stage2" };
    const idempotencyKey = "same-key";
    insertClearSettlementIdempotency({
      idempotencyKeyHash: hashClearApiKey(`${auth.keyHash}:${idempotencyKey}`),
      ownerKeyHash: auth.keyHash,
      clearanceId: "clr_original",
      mandateConfigId: "mnd_original",
      receiptId: "receipt_original",
      responseJson: JSON.stringify({
        settled: true,
        clearanceId: "clr_original",
        mandateConfigId: "mnd_original",
        receiptId: "receipt_original",
        txHash: null,
        paymentStatus: "simulated",
        chainSettlement: false,
        amountMicro: 0,
        receiptUrl: "https://citepay.test/clearance/clr_original",
        remainingBudgetMicro: 0,
      }),
      createdAt: "2026-07-15T00:00:00.000Z",
    });

    const result = await runClearSettle({
      clearanceId: "clr_different",
      mandateConfigId: "mnd_different",
      idempotencyKey,
      confirm: true,
    }, auth, "https://citepay.test");

    expect(result.status).toBe(409);
    if (result.status !== 200) expect(result.body.field).toBe("idempotencyKey");
  });
});

describe("Clear badge state", () => {
  it("returns a cacheable svg badge for unknown clearances", async () => {
    const res = await getClearBadge(new Request("https://citepay.test/api/clear/missing/badge"), {
      params: Promise.resolve({ id: "missing-badge-clearance" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(await res.text()).toContain("Not found");
  });

  it("renders unknown clearances as not found without failing embed layout", () => {
    expect(badgeState(null, null)).toMatchObject({
      status: "not_found",
      text: "Not found",
    });
  });

  it("renders unsupported clearances as not cleared", () => {
    const unsupported = evaluate({ quoteText: "A fabricated quote.", supportScore: 99 });

    expect(badgeState(unsupported, null)).toMatchObject({
      status: "not_cleared",
      text: "Not cleared: UNSUPPORTED",
    });
  });

  it("renders cleared unpaid clearances as cleared", () => {
    expect(badgeState(evaluate({}), null)).toMatchObject({
      status: "cleared",
      text: "Cleared",
    });
  });

  it("does not render paid for simulated receipts", () => {
    const clearance = {
      ...evaluate({}),
      amountPaidMicro: 1_000,
      underlyingCitationReceiptId: "receipt-simulated",
    };

    expect(badgeState(clearance, receipt({
      id: "receipt-simulated",
      paymentStatus: "simulated",
      txHash: "0xsimulated",
    }))).toMatchObject({
      status: "cleared",
      text: "Cleared",
    });
  });

  it("renders paid only for confirmed linked receipt with tx hash", () => {
    const clearance = {
      ...evaluate({}),
      amountPaidMicro: 1_000,
      underlyingCitationReceiptId: "receipt-confirmed",
    };

    expect(badgeState(clearance, receipt({
      id: "receipt-confirmed",
      paymentStatus: "confirmed",
      txHash: "0xconfirmed",
    }))).toMatchObject({
      status: "paid",
      text: "Cleared Paid",
    });
  });
});

describe("Clear public receipt API", () => {
  it("returns top-level receipt fields and public claim evidence", async () => {
    const clearance = evaluate({ clearanceId: "clearance-public-receipt-api" });
    insertClaimClearance(clearance);

    const res = await getClearance(new Request("https://citepay.test"), {
      params: Promise.resolve({ id: clearance.clearanceId }),
    });
    const json = await res.json() as {
      decision: string;
      contentHash: string;
      visibility: string;
      settlement: null;
      clearance: ClaimClearance;
    };

    expect(res.status).toBe(200);
    expect(json.decision).toBe("CLEARED");
    expect(json.contentHash).toBe(`sha256:${clearance.receiptHash}`);
    expect(json.visibility).toBe("public");
    expect(json.settlement).toBeNull();
    expect(json.clearance.claimText).toBe(clearance.claimText);
    expect(json.clearance.quoteText).toBe(clearance.quoteText);
  });

  it("never exposes ownerKeyHash, public or private", async () => {
    const publicClearance = { ...evaluate({ clearanceId: "clearance-ownerhash-public" }), ownerKeyHash: "owner-hash-should-not-leak" };
    insertClaimClearance(publicClearance);
    const publicRes = await getClearance(new Request("https://citepay.test"), {
      params: Promise.resolve({ id: publicClearance.clearanceId }),
    });
    const publicRaw = await publicRes.text();
    expect(publicRaw).not.toContain("owner-hash-should-not-leak");
    const publicJson = JSON.parse(publicRaw) as { clearance: ClaimClearance };
    expect(publicJson.clearance.ownerKeyHash).toBeUndefined();

    const privateClearance = {
      ...evaluate({ clearanceId: "clearance-ownerhash-private" }),
      ownerKeyHash: "owner-hash-should-not-leak-2",
      visibility: "private_hash_only" as const,
    };
    insertClaimClearance(privateClearance);
    const privateRes = await getClearance(new Request("https://citepay.test"), {
      params: Promise.resolve({ id: privateClearance.clearanceId }),
    });
    const privateRaw = await privateRes.text();
    expect(privateRaw).not.toContain("owner-hash-should-not-leak-2");
  });

  it("redacts private-hash claim and quote text, including receipt preimage excerpts", async () => {
    const receiptId = `receipt-private-receipt-api-${randomUUID()}`;
    const clearance = rehashClearance({
      ...evaluate({ clearanceId: "clearance-private-receipt-api" }),
      visibility: "private_hash_only",
      amountPaidMicro: 1_000,
      underlyingCitationReceiptId: receiptId,
    });
    insertReceipt(receipt({
      id: receiptId,
      query: `[Clear] ${clearance.claimText}`,
      txHash: "0xprivateconfirmed",
      paymentStatus: "confirmed",
    }));
    insertClaimClearance(clearance);

    const res = await getClearance(new Request("https://citepay.test"), {
      params: Promise.resolve({ id: clearance.clearanceId }),
    });
    const json = await res.json() as {
      settlement: { txHash: string; paymentStatus: "confirmed"; amountMicro: number } | null;
      clearance: ClaimClearance;
      underlyingReceipt: Receipt;
    };

    expect(res.status).toBe(200);
    expect(json.clearance.visibility).toBe("private_hash_only");
    expect(json.clearance.claimText).toBe("[private_hash_only]");
    expect(json.clearance.quoteText).toBe("[private_hash_only]");
    expect(json.underlyingReceipt.query).toBe("[private_hash_only]");
    expect(json.underlyingReceipt.evidencePreimage.query).toBe("[private_hash_only]");
    expect(json.underlyingReceipt.evidencePreimage.excerptUsed).toBe("[private_hash_only]");
    expect(json.settlement).toMatchObject({
      txHash: "0xprivateconfirmed",
      paymentStatus: "confirmed",
      amountMicro: 1_000,
    });
  });

  it("does not populate settlement for simulated receipts", async () => {
    const receiptId = `receipt-simulated-receipt-api-${randomUUID()}`;
    const clearance = rehashClearance({
      ...evaluate({ clearanceId: "clearance-simulated-receipt-api" }),
      amountPaidMicro: 1_000,
      underlyingCitationReceiptId: receiptId,
    });
    insertReceipt(receipt({
      id: receiptId,
      txHash: "0xsimulatednotsettled",
      paymentStatus: "simulated",
    }));
    insertClaimClearance(clearance);

    const res = await getClearance(new Request("https://citepay.test"), {
      params: Promise.resolve({ id: clearance.clearanceId }),
    });
    const json = await res.json() as { settlement: unknown };

    expect(res.status).toBe(200);
    expect(json.settlement).toBeNull();
  });

  it("builds badge embed snippets with the requested clearance id", () => {
    const snippet = clearBadgeEmbedSnippet("https://citepay.test/", "clearance-embed-receipt-api");

    expect(snippet).toContain("https://citepay.test/clearance/clearance-embed-receipt-api");
    expect(snippet).toContain("https://citepay.test/api/clear/clearance-embed-receipt-api/badge");
  });
});
