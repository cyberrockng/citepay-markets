/**
 * Neon Postgres — durable cross-instance storage.
 *
 * SQLite at /tmp resets on every Vercel cold start. Neon survives.
 *
 * Three jobs:
 *   1. persistReceipt()  — write every receipt to Neon (fire-and-forget)
 *   2. getNeonTotals()   — traction route reads durable totals instead of FLOOR constants
 *   3. getRecentNeonReceipts() — cold-start hydration helper
 *
 * Gracefully no-ops when DATABASE_URL is not set (local dev / missing env).
 */

import { neon } from "@neondatabase/serverless";
import type { Receipt, EvidencePreimage, ScoreBreakdown } from "@/types";

// Module-level singleton — avoids recreating the connection on every call
let _sql: ReturnType<typeof neon> | null = null;

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!_sql) _sql = neon(url);
  return _sql;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

let _initialised = false;

async function init() {
  if (_initialised) return;
  const sql = getSql();
  if (!sql) return;
  // Split into individual statements — neon's tagged template doesn't support multi-statement strings
  await sql`
    CREATE TABLE IF NOT EXISTS cp_receipts (
      id                  TEXT PRIMARY KEY,
      source_id           TEXT NOT NULL,
      query_id            TEXT NOT NULL,
      agent_address       TEXT NOT NULL,
      creator_wallet      TEXT NOT NULL,
      decision            TEXT NOT NULL,
      query               TEXT NOT NULL,
      query_hash          TEXT NOT NULL,
      source_title        TEXT NOT NULL,
      source_url          TEXT NOT NULL,
      amount_paid         BIGINT NOT NULL DEFAULT 0,
      evidence_hash       TEXT NOT NULL,
      evidence_preimage   JSONB,
      content_hash_at_decision TEXT,
      scores              JSONB,
      reason              TEXT NOT NULL,
      tx_hash             TEXT,
      payment_status      TEXT,
      policy_profile      TEXT,
      policy_rules_passed JSONB,
      policy_rules_failed JSONB,
      policy_reason       TEXT,
      agent_signature     TEXT,
      budget_before       BIGINT,
      budget_after        BIGINT,
      challenged          BOOLEAN NOT NULL DEFAULT FALSE,
      on_chain_receipt_id INTEGER,
      on_chain_tx_hash    TEXT,
      purpose_code        TEXT,
      contribution_weight REAL,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  for (const statement of [
    sql`ALTER TABLE cp_receipts ADD COLUMN IF NOT EXISTS evidence_preimage JSONB`,
    sql`ALTER TABLE cp_receipts ADD COLUMN IF NOT EXISTS content_hash_at_decision TEXT`,
    sql`ALTER TABLE cp_receipts ADD COLUMN IF NOT EXISTS scores JSONB`,
    sql`ALTER TABLE cp_receipts ADD COLUMN IF NOT EXISTS policy_rules_passed JSONB`,
    sql`ALTER TABLE cp_receipts ADD COLUMN IF NOT EXISTS policy_rules_failed JSONB`,
    sql`ALTER TABLE cp_receipts ADD COLUMN IF NOT EXISTS policy_reason TEXT`,
    sql`ALTER TABLE cp_receipts ADD COLUMN IF NOT EXISTS agent_signature TEXT`,
    sql`ALTER TABLE cp_receipts ADD COLUMN IF NOT EXISTS budget_before BIGINT`,
    sql`ALTER TABLE cp_receipts ADD COLUMN IF NOT EXISTS budget_after BIGINT`,
    sql`ALTER TABLE cp_receipts ADD COLUMN IF NOT EXISTS challenged BOOLEAN NOT NULL DEFAULT FALSE`,
    sql`ALTER TABLE cp_receipts ADD COLUMN IF NOT EXISTS contribution_weight REAL`,
  ]) {
    await statement;
  }
  await sql`
    CREATE TABLE IF NOT EXISTS cp_traction (
      key   TEXT PRIMARY KEY,
      value BIGINT NOT NULL DEFAULT 0
    )
  `;
  await sql`
    INSERT INTO cp_traction (key, value) VALUES
      ('total_queries',    0),
      ('paid_citations',   0),
      ('refusals',         0),
      ('skips',            0),
      ('total_paid_micro', 0)
    ON CONFLICT (key) DO NOTHING
  `;
  _initialised = true;
}

// ─── Write ───────────────────────────────────────────────────────────────────

export interface NeonReceipt {
  id: string;
  sourceId: string;
  queryId: string;
  agentAddress: string;
  creatorWallet: string;
  decision: string;
  query: string;
  queryHash: string;
  sourceTitle: string;
  sourceUrl: string;
  amountPaid: number;
  evidenceHash: string;
  evidencePreimage: EvidencePreimage;
  contentHashAtDecision: string;
  scores: ScoreBreakdown;
  reason: string;
  txHash: string | null;
  paymentStatus: string | null;
  policyProfile: string | null;
  policyRulesPassed: string[] | null;
  policyRulesFailed: string[] | null;
  policyReason: string | null;
  agentSignature: string | null;
  budgetBefore: number;
  budgetAfter: number;
  challenged: boolean;
  onChainReceiptId: number | null;
  onChainTxHash: string | null;
  purposeCode: string | null;
  contributionWeight: number | null;
  createdAt: string;
}

export function persistReceipt(r: NeonReceipt): void {
  const sql = getSql();
  if (!sql) return;

  void (async () => {
    try {
      await init();
      await sql`
        INSERT INTO cp_receipts (
          id, source_id, query_id, agent_address, creator_wallet,
          decision, query, query_hash, source_title, source_url,
          amount_paid, evidence_hash, evidence_preimage, content_hash_at_decision,
          scores, reason, tx_hash, payment_status, policy_profile,
          policy_rules_passed, policy_rules_failed, policy_reason, agent_signature,
          budget_before, budget_after, challenged, on_chain_receipt_id, on_chain_tx_hash,
          purpose_code, contribution_weight, created_at
        ) VALUES (
          ${r.id}, ${r.sourceId}, ${r.queryId}, ${r.agentAddress}, ${r.creatorWallet},
          ${r.decision}, ${r.query}, ${r.queryHash}, ${r.sourceTitle}, ${r.sourceUrl},
          ${r.amountPaid}, ${r.evidenceHash}, ${JSON.stringify(r.evidencePreimage)}, ${r.contentHashAtDecision},
          ${JSON.stringify(r.scores)}, ${r.reason}, ${r.txHash}, ${r.paymentStatus},
          ${r.policyProfile}, ${JSON.stringify(r.policyRulesPassed ?? [])}, ${JSON.stringify(r.policyRulesFailed ?? [])},
          ${r.policyReason}, ${r.agentSignature}, ${r.budgetBefore}, ${r.budgetAfter}, ${r.challenged},
          ${r.onChainReceiptId}, ${r.onChainTxHash}, ${r.purposeCode}, ${r.contributionWeight}, ${r.createdAt}
        )
        ON CONFLICT (id) DO UPDATE SET
          tx_hash             = EXCLUDED.tx_hash,
          payment_status      = EXCLUDED.payment_status,
          on_chain_receipt_id = EXCLUDED.on_chain_receipt_id,
          on_chain_tx_hash    = EXCLUDED.on_chain_tx_hash,
          evidence_preimage   = EXCLUDED.evidence_preimage,
          content_hash_at_decision = EXCLUDED.content_hash_at_decision,
          scores              = EXCLUDED.scores,
          policy_rules_passed = EXCLUDED.policy_rules_passed,
          policy_rules_failed = EXCLUDED.policy_rules_failed,
          policy_reason       = EXCLUDED.policy_reason,
          agent_signature     = EXCLUDED.agent_signature,
          budget_before       = EXCLUDED.budget_before,
          budget_after        = EXCLUDED.budget_after,
          challenged          = EXCLUDED.challenged,
          contribution_weight = EXCLUDED.contribution_weight
      `;

      // Increment traction counters
      const decKey =
        r.decision === "PAY"    ? "paid_citations" :
        r.decision === "REFUSE" ? "refusals"       : "skips";
      await sql`
        INSERT INTO cp_traction (key, value) VALUES (${decKey}, 1)
        ON CONFLICT (key) DO UPDATE SET value = cp_traction.value + 1
      `;
      if (r.amountPaid > 0) {
        await sql`
          INSERT INTO cp_traction (key, value) VALUES ('total_paid_micro', ${r.amountPaid})
          ON CONFLICT (key) DO UPDATE SET value = cp_traction.value + ${r.amountPaid}
        `;
      }
    } catch (err) {
      console.error("[neon] persistReceipt failed:", String(err).slice(0, 120));
    }
  })();
}

export function updateNeonReceiptOnChain(id: string, onChainReceiptId: number, onChainTxHash: string): void {
  const sql = getSql();
  if (!sql) return;

  void (async () => {
    try {
      await init();
      await sql`
        UPDATE cp_receipts
        SET on_chain_receipt_id = ${onChainReceiptId},
            on_chain_tx_hash = ${onChainTxHash}
        WHERE id = ${id}
      `;
    } catch (err) {
      console.error("[neon] updateNeonReceiptOnChain failed:", String(err).slice(0, 120));
    }
  })();
}

// ─── Read — traction totals ───────────────────────────────────────────────────

export interface NeonTotals {
  paidCitations:  number;
  refusals:       number;
  skips:          number;
  totalPaidMicro: number;
  creatorsPaid:   number;
  totalQueries:   number;
}

export async function getNeonTotals(): Promise<NeonTotals | null> {
  const sql = getSql();
  if (!sql) return null;
  try {
    await init();
    const [traction, creators, queries] = await Promise.all([
      sql`SELECT key, value FROM cp_traction`,
      sql`SELECT COUNT(DISTINCT creator_wallet) AS c FROM cp_receipts WHERE decision = 'PAY'`,
      sql`SELECT COUNT(DISTINCT query_id) AS c FROM cp_receipts`,
    ]);
    const map = Object.fromEntries(
      (traction as { key: string; value: string }[]).map((r) => [r.key, Number(r.value)])
    );
    return {
      paidCitations:  map["paid_citations"]   ?? 0,
      refusals:       map["refusals"]         ?? 0,
      skips:          map["skips"]            ?? 0,
      totalPaidMicro: map["total_paid_micro"] ?? 0,
      creatorsPaid:   Number((creators as { c: string }[])[0]?.c ?? 0),
      totalQueries:   Number((queries  as { c: string }[])[0]?.c ?? 0),
    };
  } catch (err) {
    console.error("[neon] getNeonTotals failed:", String(err).slice(0, 120));
    return null;
  }
}

// ─── Read — cold-start hydration ─────────────────────────────────────────────

export interface HydratedReceipt {
  id: string;
  sourceId: string;
  queryId: string;
  agentAddress: string;
  creatorWallet: string;
  decision: string;
  query: string;
  queryHash: string;
  sourceTitle: string;
  sourceUrl: string;
  amountPaid: number;
  evidenceHash: string;
  reason: string;
  txHash: string | null;
  paymentStatus: string | null;
  policyProfile: string | null;
  onChainReceiptId: number | null;
  onChainTxHash: string | null;
  purposeCode: string | null;
  createdAt: string;
}

export async function getRecentNeonReceipts(limit = 200): Promise<HydratedReceipt[]> {
  const sql = getSql();
  if (!sql) return [];
  try {
    await init();
    const rows = await sql`
      SELECT * FROM cp_receipts
      ORDER BY created_at DESC
      LIMIT ${limit}
    ` as Record<string, unknown>[];
    return rows.map((r) => ({
      id:                 r.id as string,
      sourceId:           r.source_id as string,
      queryId:            r.query_id as string,
      agentAddress:       r.agent_address as string,
      creatorWallet:      r.creator_wallet as string,
      decision:           r.decision as string,
      query:              r.query as string,
      queryHash:          r.query_hash as string,
      sourceTitle:        r.source_title as string,
      sourceUrl:          r.source_url as string,
      amountPaid:         Number(r.amount_paid),
      evidenceHash:       r.evidence_hash as string,
      reason:             r.reason as string,
      txHash:             r.tx_hash as string | null,
      paymentStatus:      r.payment_status as string | null,
      policyProfile:      r.policy_profile as string | null,
      onChainReceiptId:   r.on_chain_receipt_id != null ? Number(r.on_chain_receipt_id) : null,
      onChainTxHash:      r.on_chain_tx_hash as string | null,
      purposeCode:        r.purpose_code as string | null,
      createdAt:          String(r.created_at),
    }));
  } catch (err) {
    console.error("[neon] getRecentNeonReceipts failed:", String(err).slice(0, 120));
    return [];
  }
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return value as T;
}

export async function getNeonReceiptById(id: string): Promise<Receipt | null> {
  const sql = getSql();
  if (!sql) return null;
  try {
    await init();
    const rows = await sql`
      SELECT * FROM cp_receipts
      WHERE id = ${id}
      LIMIT 1
    ` as Record<string, unknown>[];
    const r = rows[0];
    if (!r) return null;
    const evidencePreimage = parseJson<EvidencePreimage | null>(r.evidence_preimage, null);
    const scores = parseJson<ScoreBreakdown | null>(r.scores, null);
    if (!evidencePreimage || !scores) return null;
    return {
      id: r.id as string,
      sourceId: r.source_id as string,
      queryId: r.query_id as string,
      agentAddress: r.agent_address as string,
      creatorWallet: r.creator_wallet as string,
      decision: r.decision as Receipt["decision"],
      query: r.query as string,
      queryHash: r.query_hash as string,
      sourceTitle: r.source_title as string,
      sourceUrl: r.source_url as string,
      amountPaid: Number(r.amount_paid),
      evidenceHash: r.evidence_hash as string,
      evidencePreimage,
      contentHashAtDecision: (r.content_hash_at_decision as string | null) ?? "",
      scores,
      reason: r.reason as string,
      txHash: r.tx_hash as string | null,
      paymentStatus: (r.payment_status as Receipt["paymentStatus"]) ?? null,
      policyProfile: (r.policy_profile as string | null) ?? null,
      policyRulesPassed: parseJson<string[] | null>(r.policy_rules_passed, null),
      policyRulesFailed: parseJson<string[] | null>(r.policy_rules_failed, null),
      policyReason: (r.policy_reason as string | null) ?? null,
      agentSignature: (r.agent_signature as string | null) ?? null,
      budgetBefore: Number(r.budget_before ?? 0),
      budgetAfter: Number(r.budget_after ?? 0),
      challenged: Boolean(r.challenged),
      createdAt: String(r.created_at),
      onChainReceiptId: r.on_chain_receipt_id != null ? Number(r.on_chain_receipt_id) : null,
      onChainTxHash: r.on_chain_tx_hash as string | null,
      purposeCode: r.purpose_code as string | null,
      contributionWeight: r.contribution_weight != null ? Number(r.contribution_weight) : null,
    };
  } catch (err) {
    console.error("[neon] getNeonReceiptById failed:", String(err).slice(0, 120));
    return null;
  }
}
