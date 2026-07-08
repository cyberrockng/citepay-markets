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
import type { ClaimClearance, ClearanceCertificate, ClearMandateConfig, RecoveryReport } from "@/lib/clear/types";

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
    CREATE TABLE IF NOT EXISTS cp_clear_mandate_configs (
      mandate_config_id TEXT PRIMARY KEY,
      on_chain_mandate_id INTEGER,
      operator_wallet TEXT NOT NULL,
      agent_wallet TEXT NOT NULL,
      policy_name TEXT NOT NULL,
      budget_cap_micro BIGINT NOT NULL,
      max_price_per_citation_micro BIGINT NOT NULL,
      max_price_per_claim_micro BIGINT NOT NULL,
      allowed_source_types JSONB,
      blocked_domains JSONB,
      blocked_wallets JSONB,
      required_license_class TEXT,
      require_publisher_verified BOOLEAN NOT NULL DEFAULT FALSE,
      require_quote_span BOOLEAN NOT NULL DEFAULT TRUE,
      min_support_score INTEGER NOT NULL DEFAULT 0,
      challenge_window_seconds INTEGER NOT NULL DEFAULT 86400,
      expires_at TIMESTAMPTZ,
      mandate_hash TEXT NOT NULL,
      operator_signature TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS cp_claim_clearances (
      clearance_id TEXT PRIMARY KEY,
      mandate_config_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      on_chain_source_id INTEGER,
      answer_hash TEXT NOT NULL,
      claim_hash TEXT NOT NULL,
      claim_text TEXT NOT NULL,
      quote_text TEXT NOT NULL,
      quote_start INTEGER NOT NULL,
      quote_end INTEGER NOT NULL,
      quote_verified BOOLEAN NOT NULL DEFAULT FALSE,
      support_score INTEGER NOT NULL DEFAULT 0,
      license_class TEXT,
      amount_due_micro BIGINT NOT NULL DEFAULT 0,
      amount_paid_micro BIGINT NOT NULL DEFAULT 0,
      underlying_citation_receipt_id TEXT,
      on_chain_mandate_id INTEGER,
      decision TEXT NOT NULL,
      policy_trace JSONB,
      receipt_hash TEXT NOT NULL,
      anchor_tx TEXT,
      challenge_status TEXT NOT NULL DEFAULT 'NONE',
      challenge_deadline TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS cp_clearance_certificates (
      certificate_id TEXT PRIMARY KEY,
      answer_hash TEXT NOT NULL,
      mandate_config_id TEXT NOT NULL,
      on_chain_mandate_id INTEGER,
      claim_clearance_ids JSONB NOT NULL,
      cleared_count INTEGER NOT NULL DEFAULT 0,
      blocked_count INTEGER NOT NULL DEFAULT 0,
      unsupported_count INTEGER NOT NULL DEFAULT 0,
      total_paid_micro BIGINT NOT NULL DEFAULT 0,
      certificate_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS cp_recovery_reports (
      id TEXT PRIMARY KEY,
      answer_hash TEXT NOT NULL,
      input_answer TEXT NOT NULL,
      findings_json JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'audit_only',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

export function persistClearMandateConfig(config: ClearMandateConfig): void {
  const sql = getSql();
  if (!sql) return;
  void (async () => {
    try {
      await init();
      await sql`
        INSERT INTO cp_clear_mandate_configs (
          mandate_config_id, on_chain_mandate_id, operator_wallet, agent_wallet, policy_name,
          budget_cap_micro, max_price_per_citation_micro, max_price_per_claim_micro,
          allowed_source_types, blocked_domains, blocked_wallets, required_license_class,
          require_publisher_verified, require_quote_span, min_support_score,
          challenge_window_seconds, expires_at, mandate_hash, operator_signature, created_at
        ) VALUES (
          ${config.mandateConfigId}, ${config.onChainMandateId}, ${config.operatorWallet}, ${config.agentWallet}, ${config.policyName},
          ${config.budgetCapMicro}, ${config.maxPricePerCitationMicro}, ${config.maxPricePerClaimMicro},
          ${JSON.stringify(config.allowedSourceTypes)}, ${JSON.stringify(config.blockedDomains)}, ${JSON.stringify(config.blockedWallets)}, ${config.requiredLicenseClass},
          ${config.requirePublisherVerified}, ${config.requireQuoteSpan}, ${config.minSupportScore},
          ${config.challengeWindowSeconds}, ${config.expiresAt}, ${config.mandateHash}, ${config.operatorSignature}, ${config.createdAt}
        )
        ON CONFLICT (mandate_config_id) DO UPDATE SET
          on_chain_mandate_id = EXCLUDED.on_chain_mandate_id,
          mandate_hash = EXCLUDED.mandate_hash
      `;
    } catch (err) {
      console.error("[neon] persistClearMandateConfig failed:", String(err).slice(0, 120));
    }
  })();
}

export function persistClaimClearance(clearance: ClaimClearance): void {
  const sql = getSql();
  if (!sql) return;
  void (async () => {
    try {
      await init();
      await sql`
        INSERT INTO cp_claim_clearances (
          clearance_id, mandate_config_id, source_id, on_chain_source_id, answer_hash, claim_hash,
          claim_text, quote_text, quote_start, quote_end, quote_verified, support_score,
          license_class, amount_due_micro, amount_paid_micro, underlying_citation_receipt_id,
          on_chain_mandate_id, decision, policy_trace, receipt_hash, anchor_tx,
          challenge_status, challenge_deadline, created_at
        ) VALUES (
          ${clearance.clearanceId}, ${clearance.mandateConfigId}, ${clearance.sourceId}, ${clearance.onChainSourceId},
          ${clearance.answerHash}, ${clearance.claimHash}, ${clearance.claimText}, ${clearance.quoteText},
          ${clearance.quoteStart}, ${clearance.quoteEnd}, ${clearance.quoteVerified}, ${clearance.supportScore},
          ${clearance.licenseClass}, ${clearance.amountDueMicro}, ${clearance.amountPaidMicro}, ${clearance.underlyingCitationReceiptId},
          ${clearance.onChainMandateId}, ${clearance.decision}, ${clearance.policyTrace}, ${clearance.receiptHash}, ${clearance.anchorTx},
          ${clearance.challengeStatus}, ${clearance.challengeDeadline}, ${clearance.createdAt}
        )
        ON CONFLICT (clearance_id) DO UPDATE SET
          amount_paid_micro = EXCLUDED.amount_paid_micro,
          underlying_citation_receipt_id = EXCLUDED.underlying_citation_receipt_id,
          decision = EXCLUDED.decision,
          receipt_hash = EXCLUDED.receipt_hash,
          challenge_status = EXCLUDED.challenge_status
      `;
    } catch (err) {
      console.error("[neon] persistClaimClearance failed:", String(err).slice(0, 120));
    }
  })();
}

export function persistClearanceCertificate(certificate: ClearanceCertificate): void {
  const sql = getSql();
  if (!sql) return;
  void (async () => {
    try {
      await init();
      await sql`
        INSERT INTO cp_clearance_certificates (
          certificate_id, answer_hash, mandate_config_id, on_chain_mandate_id,
          claim_clearance_ids, cleared_count, blocked_count, unsupported_count,
          total_paid_micro, certificate_hash, created_at
        ) VALUES (
          ${certificate.certificateId}, ${certificate.answerHash}, ${certificate.mandateConfigId}, ${certificate.onChainMandateId},
          ${JSON.stringify(certificate.claimClearanceIds)}, ${certificate.clearedCount}, ${certificate.blockedCount},
          ${certificate.unsupportedCount}, ${certificate.totalPaidMicro}, ${certificate.certificateHash}, ${certificate.createdAt}
        )
        ON CONFLICT (certificate_id) DO UPDATE SET
          claim_clearance_ids = EXCLUDED.claim_clearance_ids,
          certificate_hash = EXCLUDED.certificate_hash,
          total_paid_micro = EXCLUDED.total_paid_micro
      `;
    } catch (err) {
      console.error("[neon] persistClearanceCertificate failed:", String(err).slice(0, 120));
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

function rowToNeonClaimClearance(r: Record<string, unknown>): ClaimClearance {
  return {
    clearanceId: r.clearance_id as string,
    mandateConfigId: r.mandate_config_id as string,
    sourceId: r.source_id as string,
    onChainSourceId: r.on_chain_source_id != null ? Number(r.on_chain_source_id) : null,
    answerHash: r.answer_hash as string,
    claimHash: r.claim_hash as string,
    claimText: r.claim_text as string,
    quoteText: r.quote_text as string,
    quoteStart: Number(r.quote_start),
    quoteEnd: Number(r.quote_end),
    quoteVerified: Boolean(r.quote_verified),
    supportScore: Number(r.support_score),
    licenseClass: (r.license_class as string | null) ?? null,
    amountDueMicro: Number(r.amount_due_micro),
    amountPaidMicro: Number(r.amount_paid_micro),
    underlyingCitationReceiptId: (r.underlying_citation_receipt_id as string | null) ?? null,
    onChainMandateId: r.on_chain_mandate_id != null ? Number(r.on_chain_mandate_id) : null,
    decision: r.decision as ClaimClearance["decision"],
    policyTrace: typeof r.policy_trace === "string" ? r.policy_trace : JSON.stringify(r.policy_trace ?? [], null, 2),
    receiptHash: r.receipt_hash as string,
    anchorTx: (r.anchor_tx as string | null) ?? null,
    challengeStatus: r.challenge_status as ClaimClearance["challengeStatus"],
    challengeDeadline: r.challenge_deadline ? String(r.challenge_deadline) : null,
    createdAt: String(r.created_at),
  };
}

function rowToNeonClearanceCertificate(r: Record<string, unknown>): ClearanceCertificate {
  return {
    certificateId: r.certificate_id as string,
    answerHash: r.answer_hash as string,
    mandateConfigId: r.mandate_config_id as string,
    onChainMandateId: r.on_chain_mandate_id != null ? Number(r.on_chain_mandate_id) : null,
    claimClearanceIds: parseJson<string[]>(r.claim_clearance_ids, []),
    clearedCount: Number(r.cleared_count),
    blockedCount: Number(r.blocked_count),
    unsupportedCount: Number(r.unsupported_count),
    totalPaidMicro: Number(r.total_paid_micro),
    certificateHash: r.certificate_hash as string,
    createdAt: String(r.created_at),
  };
}

export async function getNeonClaimClearanceById(id: string): Promise<ClaimClearance | null> {
  const sql = getSql();
  if (!sql) return null;
  try {
    await init();
    const rows = await sql`
      SELECT * FROM cp_claim_clearances
      WHERE clearance_id = ${id}
      LIMIT 1
    ` as Record<string, unknown>[];
    return rows[0] ? rowToNeonClaimClearance(rows[0]) : null;
  } catch (err) {
    console.error("[neon] getNeonClaimClearanceById failed:", String(err).slice(0, 120));
    return null;
  }
}

function rowToNeonClearMandateConfig(r: Record<string, unknown>): ClearMandateConfig {
  return {
    mandateConfigId: r.mandate_config_id as string,
    onChainMandateId: (r.on_chain_mandate_id as number | null) ?? null,
    operatorWallet: r.operator_wallet as string,
    agentWallet: r.agent_wallet as string,
    policyName: r.policy_name as string,
    budgetCapMicro: Number(r.budget_cap_micro),
    maxPricePerCitationMicro: Number(r.max_price_per_citation_micro),
    maxPricePerClaimMicro: Number(r.max_price_per_claim_micro),
    allowedSourceTypes: (r.allowed_source_types as string[] | null) ?? null,
    blockedDomains: (r.blocked_domains as string[] | null) ?? null,
    blockedWallets: (r.blocked_wallets as string[] | null) ?? null,
    requiredLicenseClass: (r.required_license_class as string | null) ?? null,
    requirePublisherVerified: Boolean(r.require_publisher_verified),
    requireQuoteSpan: Boolean(r.require_quote_span),
    minSupportScore: Number(r.min_support_score),
    challengeWindowSeconds: Number(r.challenge_window_seconds),
    expiresAt: r.expires_at ? String(r.expires_at) : null,
    mandateHash: r.mandate_hash as string,
    operatorSignature: (r.operator_signature as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

export async function getNeonClearMandateConfigById(id: string): Promise<ClearMandateConfig | null> {
  const sql = getSql();
  if (!sql) return null;
  try {
    await init();
    const rows = await sql`
      SELECT * FROM cp_clear_mandate_configs
      WHERE mandate_config_id = ${id}
      LIMIT 1
    ` as Record<string, unknown>[];
    return rows[0] ? rowToNeonClearMandateConfig(rows[0]) : null;
  } catch (err) {
    console.error("[neon] getNeonClearMandateConfigById failed:", String(err).slice(0, 120));
    return null;
  }
}

export async function getNeonSpentMicroByMandateConfigId(mandateConfigId: string): Promise<number> {
  const sql = getSql();
  if (!sql) return 0;
  try {
    await init();
    const rows = await sql`
      SELECT COALESCE(SUM(amount_paid_micro), 0) as spent
      FROM cp_claim_clearances
      WHERE mandate_config_id = ${mandateConfigId}
    ` as { spent: string | number }[];
    return Number(rows[0]?.spent ?? 0);
  } catch (err) {
    console.error("[neon] getNeonSpentMicroByMandateConfigId failed:", String(err).slice(0, 120));
    return 0;
  }
}

export async function getNeonClearanceCertificateByClearanceId(clearanceId: string): Promise<ClearanceCertificate | null> {
  const sql = getSql();
  if (!sql) return null;
  try {
    await init();
    const rows = await sql`
      SELECT * FROM cp_clearance_certificates
      WHERE claim_clearance_ids::text LIKE ${"%" + clearanceId + "%"}
      ORDER BY created_at DESC
      LIMIT 1
    ` as Record<string, unknown>[];
    return rows[0] ? rowToNeonClearanceCertificate(rows[0]) : null;
  } catch (err) {
    console.error("[neon] getNeonClearanceCertificateByClearanceId failed:", String(err).slice(0, 120));
    return null;
  }
}

export async function getNeonClaimClearancesByIds(ids: string[]): Promise<ClaimClearance[]> {
  const sql = getSql();
  if (!sql || ids.length === 0) return [];
  try {
    await init();
    const rows = await sql`
      SELECT * FROM cp_claim_clearances
      WHERE clearance_id = ANY(${ids})
    ` as Record<string, unknown>[];
    const byId = new Map(rows.map((row) => [row.clearance_id as string, rowToNeonClaimClearance(row)]));
    return ids.map((id) => byId.get(id)).filter((c): c is ClaimClearance => Boolean(c));
  } catch (err) {
    console.error("[neon] getNeonClaimClearancesByIds failed:", String(err).slice(0, 120));
    return [];
  }
}

export function persistRecoveryReport(report: RecoveryReport): void {
  const sql = getSql();
  if (!sql) return;
  void (async () => {
    try {
      await init();
      await sql`
        INSERT INTO cp_recovery_reports (id, answer_hash, input_answer, findings_json, status, created_at)
        VALUES (${report.id}, ${report.answerHash}, ${report.inputAnswer}, ${JSON.stringify(report.findings)}, ${report.status}, ${report.createdAt})
        ON CONFLICT (id) DO NOTHING
      `;
    } catch (err) {
      console.error("[neon] persistRecoveryReport failed:", String(err).slice(0, 120));
    }
  })();
}

export async function getNeonRecoveryReportById(id: string): Promise<RecoveryReport | null> {
  const sql = getSql();
  if (!sql) return null;
  try {
    await init();
    const rows = await sql`SELECT * FROM cp_recovery_reports WHERE id = ${id} LIMIT 1` as Record<string, unknown>[];
    if (!rows[0]) return null;
    const row = rows[0];
    const findings = row.findings_json as RecoveryReport["findings"];
    return {
      id: row.id as string,
      answerHash: row.answer_hash as string,
      inputAnswer: row.input_answer as string,
      findings,
      recoverableCount: findings.filter((f) => f.decision === "CLEARED").length,
      unsupportedCount: findings.filter((f) => f.decision === "UNSUPPORTED").length,
      unmatchedCount: findings.filter((f) => f.decision === "UNMATCHED").length,
      totalRecoverableMicro: findings.reduce((sum, f) => sum + (f.decision === "CLEARED" ? f.wouldBeAmountDueMicro : 0), 0),
      status: "audit_only",
      createdAt: row.created_at as string,
    };
  } catch (err) {
    console.error("[neon] getNeonRecoveryReportById failed:", String(err).slice(0, 120));
    return null;
  }
}
