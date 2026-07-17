import { describe, expect, it, beforeEach } from "vitest";
import type { ClaimClearance } from "../src/lib/clear/types";
import {
  ensureClearMandateBudgetRow,
  reserveClearMandateBudget,
  releaseClearMandateBudget,
  getReservedMicroByMandateConfigId,
  insertClaimClearance,
  getDb,
} from "../src/lib/db";

// SQLite is the authoritative store when DATABASE_URL is unset. The cross-instance async race
// (two settles landing on different serverless instances at once) can only be reproduced against
// real Neon, and is covered by the deploy-time live-verify — see PRODUCTION notes. These tests
// prove the conditional-UPDATE primitive itself caps correctly, backfills, and releases.
delete process.env.DATABASE_URL;

function settledClearance(mandateConfigId: string, amountPaidMicro: number, suffix: string): ClaimClearance {
  return {
    clearanceId: `clr_seed_${suffix}`,
    ownerKeyHash: "owner",
    visibility: "public",
    mandateConfigId,
    sourceId: "src_seed",
    onChainSourceId: null,
    answerHash: "a",
    claimHash: `claim_${suffix}`,
    claimText: "seed claim",
    quoteText: "seed quote",
    quoteStart: 0,
    quoteEnd: 1,
    quoteVerified: true,
    supportScore: 100,
    licenseClass: "standard",
    amountDueMicro: amountPaidMicro,
    amountPaidMicro,
    underlyingCitationReceiptId: `rcpt_${suffix}`,
    onChainMandateId: null,
    decision: "CLEARED",
    policyTrace: "[]",
    receiptHash: `hash_${suffix}`,
    anchorTx: null,
    challengeStatus: "NONE",
    challengeDeadline: null,
    createdAt: "2026-07-16T00:00:00.000Z",
  };
}

describe("atomic mandate budget reservation (P0-A)", () => {
  beforeEach(() => {
    getDb().prepare("DELETE FROM clear_mandate_budgets").run();
    getDb().prepare("DELETE FROM claim_clearances").run();
  });

  it("reserves up to the cap and rejects the reservation that would breach it", () => {
    const m = "mnd_cap_basic";
    ensureClearMandateBudgetRow(m, 2500);
    expect(reserveClearMandateBudget(m, 1000)).toBe(1000);
    expect(reserveClearMandateBudget(m, 1000)).toBe(2000);
    expect(reserveClearMandateBudget(m, 1000)).toBeNull(); // 3000 > 2500
    expect(getReservedMicroByMandateConfigId(m)).toBe(2000);
    expect(getReservedMicroByMandateConfigId(m)).toBeLessThanOrEqual(2500);
  });

  it("never exceeds the cap under a burst of reservations", async () => {
    const m = "mnd_burst";
    ensureClearMandateBudgetRow(m, 2500);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => Promise.resolve().then(() => reserveClearMandateBudget(m, 1000)))
    );
    const granted = results.filter((r) => r !== null);
    expect(granted).toHaveLength(2); // only two 1000-reservations fit under 2500
    expect(getReservedMicroByMandateConfigId(m)).toBe(2000);
    expect(getReservedMicroByMandateConfigId(m)).toBeLessThanOrEqual(2500);
  });

  it("releases a reservation so freed budget can be reused", () => {
    const m = "mnd_release";
    ensureClearMandateBudgetRow(m, 2000);
    expect(reserveClearMandateBudget(m, 1000)).toBe(1000);
    expect(reserveClearMandateBudget(m, 1000)).toBe(2000);
    expect(reserveClearMandateBudget(m, 1000)).toBeNull();
    releaseClearMandateBudget(m, 1000); // e.g. payment failed
    expect(getReservedMicroByMandateConfigId(m)).toBe(1000);
    expect(reserveClearMandateBudget(m, 1000)).toBe(2000); // freed slot reusable
  });

  it("lazily backfills reserved_micro from prior actual spend, not zero", () => {
    const m = "mnd_backfill";
    insertClaimClearance(settledClearance(m, 1000, "one")); // prior settled spend of 1000
    ensureClearMandateBudgetRow(m, 2500);
    expect(getReservedMicroByMandateConfigId(m)).toBe(1000); // seeded from prior spend
    expect(reserveClearMandateBudget(m, 1000)).toBe(2000);
    expect(reserveClearMandateBudget(m, 1000)).toBeNull(); // would be 3000 > 2500
  });

  it("ensureClearMandateBudgetRow is idempotent and never disturbs an existing row", () => {
    const m = "mnd_idempotent";
    ensureClearMandateBudgetRow(m, 2500);
    reserveClearMandateBudget(m, 1500);
    ensureClearMandateBudgetRow(m, 999999); // second call must not reset cap or reserved
    expect(getReservedMicroByMandateConfigId(m)).toBe(1500);
    expect(reserveClearMandateBudget(m, 1000)).toBe(2500); // still bound by original 2500 cap
    expect(reserveClearMandateBudget(m, 1)).toBeNull();
  });
});
