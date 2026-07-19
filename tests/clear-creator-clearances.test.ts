import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { Source } from "../src/types";
import { buildClearApiKeyRecord } from "../src/lib/clear/auth";
import { runClearCheck } from "../src/lib/clear/check";
import { insertClearApiKey, insertSource, updateSourceOnChainId } from "../src/lib/db";
import { getClearancesForWallet } from "../src/lib/clear/creator-clearances";
import { GET as getCreatorClearances } from "../src/app/api/creator/[wallet]/clearances/route";

// Unit fixtures must never be persisted to durable project storage.
delete process.env.DATABASE_URL;

const SOURCE_TEXT = "Exact source evidence supports the cleared claim. Additional context follows.";
const QUOTE = "Exact source evidence supports the cleared claim.";
const WALLET = "0x5389688243328c26a92b301faEEAb5fbf9AFf105";

function registeredSource(overrides: Partial<Source> = {}): Source {
  return {
    id: `src-${Math.random().toString(36).slice(2)}`,
    title: "Registered creator source",
    url: "https://example.com/creator-article",
    creatorName: "Creator",
    creatorHandle: "@creator",
    payoutWallet: WALLET,
    contentHash: "hash",
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
    createdAt: "2026-07-16T00:00:00.000Z",
    onChainId: Math.floor(Math.random() * 1_000_000),
    fullContent: SOURCE_TEXT,
    assetType: "article",
    licenseClass: "standard",
    verificationStatus: "verified",
    riskScore: 0,
    ...overrides,
  };
}

async function checkAgainst(source: Source, auth: { keyHash: string; keyPrefix: string; ownerLabel: string; tier: string }, visibility: "public" | "private_hash_only") {
  return runClearCheck({
    claim: QUOTE,
    quote: QUOTE,
    source: { onChainId: String(source.onChainId) },
    policy: { maxPricePerCitationMicro: 10_000, requiredLicenseClass: "standard" },
    visibility,
  }, auth, "https://citepay.test");
}

describe("getClearancesForWallet", () => {
  it("returns no rows for a wallet with no registered sources", async () => {
    const rows = await getClearancesForWallet("0x0000000000000000000000000000000000dEaD", "https://citepay.test");
    expect(rows).toEqual([]);
  });

  it("finds a clearance tied to a wallet's registered source, redacts private text, and reports no settlement when unpaid", async () => {
    const rawKey = "cpk_test_creator_clearances_key_1234567890";
    const record = buildClearApiKeyRecord(rawKey, "creator-owner", "2026-07-16T00:00:00.000Z");
    insertClearApiKey(record);
    const auth = { keyHash: record.keyHash, keyPrefix: record.keyPrefix, ownerLabel: record.ownerLabel, tier: record.tier };

    const source = registeredSource();
    insertSource(source);
    updateSourceOnChainId(source.id, source.onChainId as number);

    const checkResult = await checkAgainst(source, auth, "private_hash_only");
    if (checkResult.status !== 200) throw new Error(checkResult.body.error);
    expect(checkResult.body.decision).toBe("CLEARED");

    const rows = await getClearancesForWallet(source.payoutWallet, "https://citepay.test");
    const match = rows.find((r) => r.clearanceId === checkResult.body.clearanceId);
    expect(match).toBeDefined();
    expect(match?.decision).toBe("CLEARED");
    expect(match?.settlement).toBeNull();
    expect(match?.receiptUrl).toBe(`https://citepay.test/clearance/${checkResult.body.clearanceId}`);
    expect(match?.visibility).toBe("private_hash_only");
  });

  it("is case-insensitive on the wallet address", async () => {
    const rawKey = "cpk_test_creator_clearances_case_1234567890";
    const record = buildClearApiKeyRecord(rawKey, "creator-owner-2", "2026-07-16T00:00:00.000Z");
    insertClearApiKey(record);
    const auth = { keyHash: record.keyHash, keyPrefix: record.keyPrefix, ownerLabel: record.ownerLabel, tier: record.tier };

    const source = registeredSource({ payoutWallet: WALLET.toLowerCase() });
    insertSource(source);
    updateSourceOnChainId(source.id, source.onChainId as number);
    const checkResult = await checkAgainst(source, auth, "public");
    if (checkResult.status !== 200) throw new Error(checkResult.body.error);

    const rows = await getClearancesForWallet(WALLET.toUpperCase(), "https://citepay.test");
    expect(rows.some((r) => r.clearanceId === checkResult.body.clearanceId)).toBe(true);
  });

  it("rate limits the public creator clearances route by IP", async () => {
    const request = () => new NextRequest(`https://citepay.test/api/creator/${WALLET}/clearances`, {
      headers: { "x-forwarded-for": "203.0.113.88" },
    });

    for (let i = 0; i < 30; i++) {
      const res = await getCreatorClearances(request(), { params: Promise.resolve({ wallet: WALLET }) });
      expect(res.status).toBe(200);
    }

    const blocked = await getCreatorClearances(request(), { params: Promise.resolve({ wallet: WALLET }) });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });
});
