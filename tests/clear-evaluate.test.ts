import { describe, expect, it } from "vitest";
import type { Source } from "../src/types";
import type { ClearMandateConfig } from "../src/lib/clear/types";
import { evaluateClaimClearance } from "../src/lib/clear/evaluate";
import { authenticateClearApiRequest, buildClearApiKeyRecord } from "../src/lib/clear/auth";
import { runClearCheck } from "../src/lib/clear/check";
import { createClearMandate } from "../src/lib/clear/mandate";
import { runClearSettle } from "../src/lib/clear/settle-api";
import { hashClearApiKey } from "../src/lib/clear/auth";
import { getClearMandateConfigById, insertClearApiKey, insertClearSettlementIdempotency } from "../src/lib/db";
import { GET as getClearance } from "../src/app/api/clear/[id]/route";

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
