import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import type { Source, Receipt, QueryRecord } from "@/types";
import type { ClaimClearance, ClearanceCertificate, ClearApiKeyRecord, ClearMandateConfig, ClearSettlementIdempotencyRecord, RecoveryReport } from "@/lib/clear/types";
import { redisIncrSourcePaid, redisIncrSourceRefused } from "@/lib/redis-stats";
import {
  persistClearanceCertificate,
  persistClaimClearance,
  persistClearApiKey,
  persistClearSettlementIdempotency,
  persistClearMandateConfig,
  persistClearSettlementLock,
  persistRecoveryReport,
  persistReceipt,
  updateNeonReceiptOnChain,
} from "@/lib/neon";

const DATA_DIR = process.env.NODE_ENV === "production"
  ? "/tmp"
  : path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "citepay.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  migrate(_db);
  seedIfEmpty(_db);
  seedAgentRegistryIfEmpty(_db);
  return _db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      creator_handle TEXT NOT NULL,
      payout_wallet TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      metadata_uri TEXT,
      description TEXT NOT NULL DEFAULT '',
      price INTEGER NOT NULL,
      bond INTEGER NOT NULL DEFAULT 0,
      bonded INTEGER NOT NULL DEFAULT 0,
      reputation INTEGER NOT NULL DEFAULT 0,
      paid_count INTEGER NOT NULL DEFAULT 0,
      refused_count INTEGER NOT NULL DEFAULT 0,
      skip_count INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      on_chain_id INTEGER DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      query_id TEXT NOT NULL,
      agent_address TEXT NOT NULL,
      creator_wallet TEXT NOT NULL,
      decision TEXT NOT NULL,
      query TEXT NOT NULL,
      query_hash TEXT NOT NULL,
      source_title TEXT NOT NULL,
      source_url TEXT NOT NULL,
      amount_paid INTEGER NOT NULL DEFAULT 0,
      evidence_hash TEXT NOT NULL,
      evidence_preimage TEXT NOT NULL,
      content_hash_at_decision TEXT NOT NULL,
      scores TEXT NOT NULL,
      reason TEXT NOT NULL,
      tx_hash TEXT,
      budget_before INTEGER NOT NULL,
      budget_after INTEGER NOT NULL,
      challenged INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      on_chain_receipt_id INTEGER DEFAULT NULL,
      on_chain_tx_hash TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS queries (
      id TEXT PRIMARY KEY,
      query TEXT NOT NULL,
      query_hash TEXT NOT NULL,
      budget INTEGER NOT NULL,
      agent_address TEXT NOT NULL,
      query_fee INTEGER NOT NULL DEFAULT 0,
      query_fee_tx_hash TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      total_paid INTEGER NOT NULL DEFAULT 0,
      receipt_ids TEXT NOT NULL DEFAULT '[]',
      answer TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS traction (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS share_cards (
      id TEXT PRIMARY KEY,
      receipt_id TEXT NOT NULL,
      creator_wallet TEXT NOT NULL,
      opened INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO traction (key, value) VALUES
      ('share_cards_generated', 0),
      ('share_cards_opened', 0),
      ('challenge_count', 0),
      ('active_agents', 0);
  `);

  // ── Additive migrations (safe to run on existing DBs) ──────────────────────
  const receiptCols = (db.prepare("PRAGMA table_info(receipts)").all() as { name: string }[]).map((c) => c.name);
  if (!receiptCols.includes("contribution_weight")) {
    db.exec("ALTER TABLE receipts ADD COLUMN contribution_weight REAL DEFAULT NULL");
  }

  const sourceCols = (db.prepare("PRAGMA table_info(sources)").all() as { name: string }[]).map((c) => c.name);
  if (!sourceCols.includes("avg_contribution_weight")) {
    db.exec("ALTER TABLE sources ADD COLUMN avg_contribution_weight REAL NOT NULL DEFAULT 0");
    db.exec("ALTER TABLE sources ADD COLUMN total_contribution_queries INTEGER NOT NULL DEFAULT 0");
  }
  for (const ddl of [
    "ALTER TABLE sources ADD COLUMN asset_type TEXT DEFAULT 'article'",
    "ALTER TABLE sources ADD COLUMN license_class TEXT DEFAULT 'standard'",
    "ALTER TABLE sources ADD COLUMN unit_text_hash TEXT DEFAULT NULL",
    "ALTER TABLE sources ADD COLUMN verification_status TEXT DEFAULT 'unverified'",
    "ALTER TABLE sources ADD COLUMN risk_score INTEGER DEFAULT 0",
  ]) {
    const col = ddl.match(/ADD COLUMN ([a-z_]+)/)?.[1];
    if (col && !sourceCols.includes(col)) db.exec(ddl);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS clear_api_keys (
      key_hash TEXT PRIMARY KEY,
      key_prefix TEXT NOT NULL,
      owner_label TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'stage2',
      revoked_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clear_settlement_idempotency (
      idempotency_key_hash TEXT PRIMARY KEY,
      owner_key_hash TEXT NOT NULL,
      clearance_id TEXT NOT NULL,
      mandate_config_id TEXT NOT NULL,
      receipt_id TEXT DEFAULT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clear_settlement_locks (
      lock_key TEXT PRIMARY KEY,
      owner_key_hash TEXT NOT NULL,
      clearance_id TEXT NOT NULL,
      mandate_config_id TEXT NOT NULL,
      claim_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clear_mandate_configs (
      mandate_config_id TEXT PRIMARY KEY,
      owner_key_hash TEXT DEFAULT NULL,
      on_chain_mandate_id INTEGER DEFAULT NULL,
      operator_wallet TEXT NOT NULL,
      agent_wallet TEXT NOT NULL,
      policy_name TEXT NOT NULL,
      budget_cap_micro INTEGER NOT NULL,
      max_price_per_citation_micro INTEGER NOT NULL,
      max_price_per_claim_micro INTEGER NOT NULL,
      allowed_source_types TEXT DEFAULT NULL,
      blocked_domains TEXT DEFAULT NULL,
      blocked_wallets TEXT DEFAULT NULL,
      required_license_class TEXT DEFAULT NULL,
      require_publisher_verified INTEGER NOT NULL DEFAULT 0,
      require_quote_span INTEGER NOT NULL DEFAULT 1,
      min_support_score INTEGER NOT NULL DEFAULT 0,
      challenge_window_seconds INTEGER NOT NULL DEFAULT 86400,
      expires_at TEXT DEFAULT NULL,
      mandate_hash TEXT NOT NULL,
      operator_signature TEXT DEFAULT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS claim_clearances (
      clearance_id TEXT PRIMARY KEY,
      owner_key_hash TEXT DEFAULT NULL,
      visibility TEXT NOT NULL DEFAULT 'public',
      mandate_config_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      on_chain_source_id INTEGER DEFAULT NULL,
      answer_hash TEXT NOT NULL,
      claim_hash TEXT NOT NULL,
      claim_text TEXT NOT NULL,
      quote_text TEXT NOT NULL,
      quote_start INTEGER NOT NULL,
      quote_end INTEGER NOT NULL,
      quote_verified INTEGER NOT NULL DEFAULT 0,
      support_score INTEGER NOT NULL DEFAULT 0,
      license_class TEXT DEFAULT NULL,
      amount_due_micro INTEGER NOT NULL DEFAULT 0,
      amount_paid_micro INTEGER NOT NULL DEFAULT 0,
      underlying_citation_receipt_id TEXT DEFAULT NULL,
      on_chain_mandate_id INTEGER DEFAULT NULL,
      decision TEXT NOT NULL,
      policy_trace TEXT NOT NULL,
      receipt_hash TEXT NOT NULL,
      anchor_tx TEXT DEFAULT NULL,
      challenge_status TEXT NOT NULL DEFAULT 'NONE',
      challenge_deadline TEXT DEFAULT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clearance_certificates (
      certificate_id TEXT PRIMARY KEY,
      answer_hash TEXT NOT NULL,
      mandate_config_id TEXT NOT NULL,
      on_chain_mandate_id INTEGER DEFAULT NULL,
      claim_clearance_ids TEXT NOT NULL,
      cleared_count INTEGER NOT NULL DEFAULT 0,
      blocked_count INTEGER NOT NULL DEFAULT 0,
      unsupported_count INTEGER NOT NULL DEFAULT 0,
      total_paid_micro INTEGER NOT NULL DEFAULT 0,
      certificate_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clearance_challenges (
      id TEXT PRIMARY KEY,
      clearance_id TEXT NOT NULL,
      challenge_type TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS recovery_reports (
      id TEXT PRIMARY KEY,
      answer_hash TEXT NOT NULL,
      input_answer TEXT NOT NULL,
      findings_json TEXT NOT NULL,
      settlement_plan_json TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'audit_only',
      created_at TEXT NOT NULL
    );
  `);

  const mandateCols = (db.prepare("PRAGMA table_info(clear_mandate_configs)").all() as { name: string }[]).map((c) => c.name);
  if (!mandateCols.includes("owner_key_hash")) {
    db.exec("ALTER TABLE clear_mandate_configs ADD COLUMN owner_key_hash TEXT DEFAULT NULL");
  }
  const clearanceCols = (db.prepare("PRAGMA table_info(claim_clearances)").all() as { name: string }[]).map((c) => c.name);
  if (!clearanceCols.includes("owner_key_hash")) {
    db.exec("ALTER TABLE claim_clearances ADD COLUMN owner_key_hash TEXT DEFAULT NULL");
  }
  if (!clearanceCols.includes("visibility")) {
    db.exec("ALTER TABLE claim_clearances ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'");
  }

  // ── Bounties ────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS bounties (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      query TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      budget_micro INTEGER NOT NULL,
      deadline TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      agent_address TEXT NOT NULL,
      winning_submission_id TEXT DEFAULT NULL,
      winner_wallet TEXT DEFAULT NULL,
      winner_paid_micro INTEGER DEFAULT 0,
      winner_tx_hash TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS bounty_submissions (
      id TEXT PRIMARY KEY,
      bounty_id TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      creator_handle TEXT NOT NULL,
      creator_wallet TEXT NOT NULL,
      content TEXT NOT NULL,
      content_url TEXT DEFAULT NULL,
      evaluation_score INTEGER DEFAULT NULL,
      evaluation_reason TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (bounty_id) REFERENCES bounties(id)
    );
  `);

  // ── Research Sessions ────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Research Session',
      policy TEXT NOT NULL DEFAULT 'balanced',
      total_paid_micro INTEGER NOT NULL DEFAULT 0,
      total_citations INTEGER NOT NULL DEFAULT 0,
      context_summary TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_active TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS session_turns (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      query TEXT NOT NULL,
      answer TEXT NOT NULL,
      query_id TEXT,
      citations_paid INTEGER NOT NULL DEFAULT 0,
      amount_paid_micro INTEGER NOT NULL DEFAULT 0,
      receipt_ids TEXT NOT NULL DEFAULT '[]',
      turn_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
  `);

  // ── Agent Lessons ─────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_lessons (
      id TEXT PRIMARY KEY,
      orchestration_query TEXT NOT NULL,
      lesson TEXT NOT NULL,
      gap_identified TEXT DEFAULT NULL,
      top_sources TEXT DEFAULT NULL,
      weak_sources TEXT DEFAULT NULL,
      score_adjustments TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── Agent Commerce Network ────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_registry (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      handle TEXT UNIQUE NOT NULL,
      specialty TEXT NOT NULL,
      endpoint_url TEXT NOT NULL,
      wallet TEXT NOT NULL,
      price_micro INTEGER NOT NULL DEFAULT 2000,
      policy_profile TEXT NOT NULL DEFAULT 'balanced',
      status TEXT NOT NULL DEFAULT 'active',
      total_hired INTEGER NOT NULL DEFAULT 0,
      total_earned_micro INTEGER NOT NULL DEFAULT 0,
      successful_tasks INTEGER NOT NULL DEFAULT 0,
      failed_tasks INTEGER NOT NULL DEFAULT 0,
      average_quality_score REAL NOT NULL DEFAULT 0,
      policy_violations INTEGER NOT NULL DEFAULT 0,
      trust_score REAL NOT NULL DEFAULT 80,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_hire_receipts (
      id TEXT PRIMARY KEY,
      query_id TEXT NOT NULL,
      orchestrator_id TEXT NOT NULL DEFAULT 'citepay-orchestrator',
      agent_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      agent_wallet TEXT NOT NULL,
      subtask TEXT NOT NULL,
      amount_micro INTEGER NOT NULL DEFAULT 0,
      allocated_budget_micro INTEGER NOT NULL DEFAULT 0,
      payment_mode TEXT NOT NULL DEFAULT 'simulated',
      tx_hash TEXT,
      response_hash TEXT,
      quality_score REAL DEFAULT 0,
      policy_status TEXT NOT NULL DEFAULT 'APPROVED',
      policy_reason TEXT,
      downstream_receipt_ids TEXT DEFAULT '[]',
      cited_agents TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Additive migrations for existing DBs (safe to run repeatedly)
  for (const sql of [
    "ALTER TABLE sources  ADD COLUMN on_chain_id         INTEGER DEFAULT NULL",
    "ALTER TABLE receipts ADD COLUMN on_chain_receipt_id INTEGER DEFAULT NULL",
    "ALTER TABLE receipts ADD COLUMN on_chain_tx_hash    TEXT    DEFAULT NULL",
    "ALTER TABLE receipts ADD COLUMN payment_status        TEXT    DEFAULT NULL",
    "ALTER TABLE receipts ADD COLUMN policy_profile        TEXT    DEFAULT NULL",
    "ALTER TABLE receipts ADD COLUMN policy_rules_passed   TEXT    DEFAULT NULL",
    "ALTER TABLE receipts ADD COLUMN policy_rules_failed   TEXT    DEFAULT NULL",
    "ALTER TABLE receipts ADD COLUMN policy_reason         TEXT    DEFAULT NULL",
    "ALTER TABLE receipts ADD COLUMN agent_signature       TEXT    DEFAULT NULL",
    "ALTER TABLE sources  ADD COLUMN category              TEXT    DEFAULT 'General'",
    "ALTER TABLE receipts ADD COLUMN purpose_code          TEXT    DEFAULT NULL",
    "ALTER TABLE sources  ADD COLUMN source_type           TEXT    DEFAULT 'human'",
    "ALTER TABLE sources  ADD COLUMN synthesized_from      TEXT    DEFAULT NULL",
    "ALTER TABLE sources  ADD COLUMN full_content          TEXT    DEFAULT NULL",
    "ALTER TABLE bounties ADD COLUMN auto_posted                   INTEGER DEFAULT 0",
    "ALTER TABLE bounties ADD COLUMN gap_category                  TEXT    DEFAULT NULL",
    "ALTER TABLE agent_hire_receipts ADD COLUMN allocated_budget_micro INTEGER DEFAULT 0",
    "ALTER TABLE agent_hire_receipts ADD COLUMN cited_agents         TEXT    DEFAULT '[]'",
    "ALTER TABLE agent_registry ADD COLUMN identity_tx_hash          TEXT    DEFAULT NULL",
  ]) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }
}

// ─── Auto-seed (production cold start) ───────────────────────────────────────

// on_chain_id values are permanent — assigned when sources were registered on
// CitePayMarket.sol (0x396cf1646EbAeF85ee8428C2d9239C46Ae956085, Arc Testnet)
// Demo sources: wallets are CitePay-controlled testnet addresses used to
// demonstrate the payment flow. Creator names are independent demo accounts,
// not affiliated with the organizations that publish the referenced URLs.
const SEED_SOURCES = [
  { onChainId: 14, category: "Protocol",       title: "x402: HTTP-Native Payments for AI Agents", url: "https://x402.org", creatorName: "Amara Osei", creatorHandle: "@amara_protocol", payoutWallet: "0x3a0FfFE64537148b3766dA52D983058F98A4e3ce", price: 2000, bond: 10000, contentHash: "70f01a7977012702b243e6a6c2509f6a603b7a61e0241a6f0c3ce845949e1d57", description: "x402 is an open protocol for machine-native payments using HTTP 402 Payment Required. It enables AI agents and automated systems to pay for resources autonomously using USDC on Base." },
  { onChainId: 15, category: "Infrastructure", title: "Circle's Programmable Wallets: Powering Agentic Finance", url: "https://developers.circle.com/w3s/programmable-wallets", creatorName: "Priya Nair", creatorHandle: "@priya_infra", payoutWallet: "0x72101E4882159f3e0B3c176951AcA7816A1710e2", price: 3000, bond: 10000, contentHash: "33a7a9314b96f7dbea847c48f7d7cb5ed74537485913516e043b565795a930b5", description: "Circle's Programmable Wallets enable developers to create and manage wallets at scale. USDC transfers on Arc Testnet are instant and near-zero cost, making them ideal for micro-payments between AI agents and content creators." },
  { onChainId: 16, category: "Research",       title: "Emerging Architectures for LLM Applications", url: "https://a16z.com/2023/06/20/emerging-architectures-for-llm-applications/", creatorName: "James Kweku", creatorHandle: "@kweku_research", payoutWallet: "0xbe575CcebE08895e61c8E45652ff63E4a663d4D9", price: 4000, bond: 5000, contentHash: "2b02947de287cdddc2d2440d37cc1c5961cb7d70f3407e609f400d757b58dac6", description: "A16z research on the emerging software architectures powering LLM applications — context retrieval, agents, orchestration layers, and the new stack that autonomous AI systems are built on." },
  { onChainId: 17, category: "Research",       title: "The Creator Economy in the Age of AI: Who Gets Paid?", url: "https://citepay-markets.vercel.app/economy", creatorName: "CitePay Labs", creatorHandle: "@citepaydemo", payoutWallet: "0xfccead074A3485751351f6b9FF893866A26632AF", price: 2000, bond: 0, contentHash: "256329962cf8c93150940eb17d0a305c284d2b6c0a406a04add51ac658cffb92", description: "As large language models increasingly answer questions by drawing on creator content without attribution or compensation, a new payment layer is needed. CitePay Markets solves this by making citations accountable and paid." },
  { onChainId: 18, category: "Infrastructure", title: "Base: The Onchain Platform for Everyone", url: "https://base.org", creatorName: "Fatou Diallo", creatorHandle: "@fatou_chain", payoutWallet: "0x6ed34b116B5040072619f83Dc25f64C70584e1F6", price: 1500, bond: 10000, contentHash: "d282cc888b86dbd8028f9f6af714587c56a00f7264430541e233df145250acb6", description: "Base is a secure, low-cost, developer-friendly Ethereum L2. With near-zero gas fees and USDC native support, Base is the ideal chain for micro-payment applications like AI citation markets." },
  { onChainId: 19, category: "Research",       title: "Proof of Personhood and Identity in Decentralized Systems", url: "https://vitalik.eth.limo/general/2023/07/24/biometric.html", creatorName: "Dmitri Volkov", creatorHandle: "@dvolkov_research", payoutWallet: "0xF7b09B900A2676f8c2D8bdFE82FF4B0c4C5A6751", price: 5000, bond: 20000, contentHash: "610d8c75ff1294ae99afa1f0049511f7ead82b6c2f98caff07ca7e881dafe62b", description: "Proof of personhood and biometric identity verification in decentralized systems. Explores the trade-offs between privacy-preserving identity solutions and their role in preventing Sybil attacks in open networks." },
  { onChainId: 20, category: "Protocol",       title: "HTTP 402 and the Future of Machine Payments", url: "https://docs.cdp.coinbase.com/x402/docs/welcome", creatorName: "Yuki Tanaka", creatorHandle: "@yuki_protocol", payoutWallet: "0xa20C8F958a31A78Be4bcf33CecA8B463636050ce", price: 2500, bond: 10000, contentHash: "327d0c9a1e2e214d2658b334afac90483ea11836b6676ef8035854a52a08d8b4", description: "HTTP 402 Payment Required has been dormant since the 1990s. x402 revives it as a machine-native payment protocol, enabling any HTTP endpoint to require payment before serving content — perfect for AI agent workflows." },
  { onChainId: 21, category: "Research",       title: "Content Addressing and Data Integrity in IPFS", url: "https://docs.ipfs.tech/concepts/content-addressing/", creatorName: "Sara Mensah", creatorHandle: "@sara_web3", payoutWallet: "0x578087F20dfF74e3dB0841C9514285648B4339DE", price: 2000, bond: 5000, contentHash: "77ed5dbce0e8699cf34d041e4db6af0b697821ea25094eca3ee328a4a3dde5d4", description: "IPFS content addressing uses cryptographic hashes to identify data by what it is, not where it is. This ensures content integrity — the same CID always resolves to the same bytes, making citations verifiable and tamper-evident." },
  { onChainId: 22, category: "Infrastructure", title: "USDC: The Dollar for the Internet", url: "https://www.circle.com/usdc", creatorName: "Leon Okafor", creatorHandle: "@leon_stables", payoutWallet: "0xa9EB31434d3eA3679f36f051492451f3f5912a7C", price: 1000, bond: 10000, contentHash: "fac45fcf9ee419e9010f1335ea6f744d2ccd9533f68babea3162e6412a3651df", description: "USDC is a fully reserved, dollar-backed stablecoin that settles instantly on Base. Its programmatic accessibility makes it the default currency for AI agent payments, enabling autonomous financial transactions at internet scale." },
  { onChainId: 23, category: "AI/Agents",      title: "Model Cards for AI Accountability and Transparency", url: "https://huggingface.co/blog/model-cards", creatorName: "CitePay Research", creatorHandle: "@citepay_research", payoutWallet: "0x9925e934B9aB91353F8525135A83112dF3FC567a", price: 3000, bond: 15000, contentHash: "5e49d22dddff4c0357ce8d8c5bf22a75665185ee6cd7c96cd5308b91dac26f13", description: "Model cards document AI systems' intended uses, performance characteristics, and limitations. The same accountability principle applies to AI agents — every decision, payment, and refusal should carry a verifiable audit trail." },
];

export function reseedDb(): { sourcesInserted: number } {
  const db = getDb();
  db.exec("DELETE FROM sources");
  db.exec("DELETE FROM receipts");
  db.exec("DELETE FROM queries");
  db.exec("UPDATE traction SET value = 0");
  seedIfEmpty(db);
  return { sourcesInserted: SEED_SOURCES.length };
}

function seedIfEmpty(db: Database.Database) {
  const count = (db.prepare("SELECT COUNT(*) as n FROM sources").get() as { n: number }).n;
  if (count > 0) return;
  const stmt = db.prepare(`
    INSERT INTO sources (id, title, url, creator_name, creator_handle, payout_wallet,
      content_hash, description, price, bond, bonded, active, on_chain_id, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const insertMany = db.transaction((rows: typeof SEED_SOURCES) => {
    for (const s of rows) {
      stmt.run(uuidv4(), s.title, s.url, s.creatorName, s.creatorHandle,
        s.payoutWallet, s.contentHash, s.description, s.price, s.bond,
        s.bond > 0 ? 1 : 0, s.onChainId, s.category);
    }
  });
  insertMany(SEED_SOURCES);
}

// ─── Sources ─────────────────────────────────────────────────────────────────

export function insertSource(s: Source): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO sources (id, title, url, creator_name, creator_handle, payout_wallet,
      content_hash, metadata_uri, description, price, bond, bonded, reputation,
      paid_count, refused_count, skip_count, active, created_at, full_content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    s.id, s.title, s.url, s.creatorName, s.creatorHandle, s.payoutWallet,
    s.contentHash, s.metadataURI || "", s.description || "", s.price, s.bond, s.bonded ? 1 : 0,
    s.reputation, s.paidCount, s.refusedCount, s.skipCount, s.active ? 1 : 0,
    s.createdAt, s.fullContent ?? null
  );
}

export function updateSourceContent(id: string, fullContent: string): void {
  getDb().prepare("UPDATE sources SET full_content = ? WHERE id = ?").run(fullContent, id);
}

export function getAllSources(category?: string): Source[] {
  const db = getDb();
  const rows = category
    ? db.prepare("SELECT * FROM sources WHERE active = 1 AND category = ? ORDER BY reputation DESC, paid_count DESC").all(category)
    : db.prepare("SELECT * FROM sources WHERE active = 1 ORDER BY reputation DESC, paid_count DESC").all();
  return rows.map((r) => rowToSource(r as Record<string, unknown>));
}

export function getSourceById(id: string): Source | null {
  const row = getDb().prepare("SELECT * FROM sources WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToSource(row) : null;
}

export function updateSourceStats(
  id: string,
  decision: "PAY" | "REFUSE" | "SKIP" | "BLOCKED_BY_POLICY",
  contributionWeight?: number
): void {
  const db = getDb();
  if (decision === "PAY") {
    if (contributionWeight != null && contributionWeight >= 0) {
      // Rolling average: avg = (avg * n + weight) / (n + 1)
      db.prepare(`
        UPDATE sources SET
          paid_count = paid_count + 1,
          reputation = reputation + 1,
          avg_contribution_weight = (avg_contribution_weight * total_contribution_queries + ?) / (total_contribution_queries + 1),
          total_contribution_queries = total_contribution_queries + 1
        WHERE id = ?
      `).run(contributionWeight, id);
    } else {
      db.prepare("UPDATE sources SET paid_count = paid_count + 1, reputation = reputation + 1 WHERE id = ?").run(id);
    }
    void redisIncrSourcePaid(id);
  } else if (decision === "REFUSE") {
    db.prepare("UPDATE sources SET refused_count = refused_count + 1, reputation = reputation - 1 WHERE id = ?").run(id);
    void redisIncrSourceRefused(id);
  } else if (decision === "BLOCKED_BY_POLICY") {
    db.prepare("UPDATE sources SET skip_count = skip_count + 1 WHERE id = ?").run(id);
    void redisIncrSourceRefused(id);
  } else {
    // SKIP: no reputation change
    db.prepare("UPDATE sources SET skip_count = skip_count + 1 WHERE id = ?").run(id);
  }
}

export function updateSourceHash(id: string, newHash: string): void {
  getDb().prepare("UPDATE sources SET content_hash = ? WHERE id = ?").run(newHash, id);
}

export function updateSourceOnChainId(id: string, onChainId: number): void {
  getDb().prepare("UPDATE sources SET on_chain_id = ? WHERE id = ?").run(onChainId, id);
}

export function updateReceiptOnChain(id: string, onChainReceiptId: number, onChainTxHash: string): void {
  getDb().prepare("UPDATE receipts SET on_chain_receipt_id = ?, on_chain_tx_hash = ? WHERE id = ?")
    .run(onChainReceiptId, onChainTxHash, id);
  updateNeonReceiptOnChain(id, onChainReceiptId, onChainTxHash);
}

function rowToSource(r: Record<string, unknown>): Source {
  return {
    id: r.id as string,
    title: r.title as string,
    url: r.url as string,
    creatorName: r.creator_name as string,
    creatorHandle: r.creator_handle as string,
    payoutWallet: r.payout_wallet as string,
    contentHash: r.content_hash as string,
    metadataURI: r.metadata_uri as string,
    description: (r.description as string) || "",
    price: r.price as number,
    bond: r.bond as number,
    bonded: Boolean(r.bonded),
    reputation: r.reputation as number,
    paidCount: r.paid_count as number,
    refusedCount: r.refused_count as number,
    skipCount: r.skip_count as number,
    active: Boolean(r.active),
    createdAt: r.created_at as string,
    onChainId: (r.on_chain_id as number | null) ?? null,
    category: (r.category as string | null) ?? "General",
    avgContributionWeight: (r.avg_contribution_weight as number | null) ?? 0,
    totalContributionQueries: (r.total_contribution_queries as number | null) ?? 0,
    fullContent: (r.full_content as string | null) ?? null,
    assetType: (r.asset_type as string | null) ?? "article",
    licenseClass: (r.license_class as string | null) ?? "standard",
    unitTextHash: (r.unit_text_hash as string | null) ?? null,
    verificationStatus: (r.verification_status as string | null) ?? "unverified",
    riskScore: (r.risk_score as number | null) ?? 0,
  };
}

function parseJsonArray(value: unknown): string[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value as string);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : null;
  } catch {
    return null;
  }
}

function stringifyNullableArray(value: string[] | null): string | null {
  return value ? JSON.stringify(value) : null;
}

function rowToClearApiKey(r: Record<string, unknown>): ClearApiKeyRecord {
  return {
    keyHash: r.key_hash as string,
    keyPrefix: r.key_prefix as string,
    ownerLabel: r.owner_label as string,
    tier: r.tier as string,
    revokedAt: (r.revoked_at as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

function rowToClearSettlementIdempotency(r: Record<string, unknown>): ClearSettlementIdempotencyRecord {
  return {
    idempotencyKeyHash: r.idempotency_key_hash as string,
    ownerKeyHash: r.owner_key_hash as string,
    clearanceId: r.clearance_id as string,
    mandateConfigId: r.mandate_config_id as string,
    receiptId: (r.receipt_id as string | null) ?? null,
    responseJson: r.response_json as string,
    createdAt: r.created_at as string,
  };
}

export function insertClearApiKey(record: ClearApiKeyRecord): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO clear_api_keys (
      key_hash, key_prefix, owner_label, tier, revoked_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    record.keyHash, record.keyPrefix, record.ownerLabel, record.tier,
    record.revokedAt, record.createdAt
  );
  persistClearApiKey(record);
}

export function getClearApiKeyByHash(keyHash: string): ClearApiKeyRecord | null {
  const row = getDb().prepare("SELECT * FROM clear_api_keys WHERE key_hash = ?").get(keyHash) as Record<string, unknown> | undefined;
  return row ? rowToClearApiKey(row) : null;
}

export function revokeClearApiKey(keyHash: string, revokedAt = new Date().toISOString()): void {
  getDb().prepare("UPDATE clear_api_keys SET revoked_at = ? WHERE key_hash = ?").run(revokedAt, keyHash);
}

export function getClearSettlementIdempotencyByHash(idempotencyKeyHash: string): ClearSettlementIdempotencyRecord | null {
  const row = getDb().prepare(
    "SELECT * FROM clear_settlement_idempotency WHERE idempotency_key_hash = ?"
  ).get(idempotencyKeyHash) as Record<string, unknown> | undefined;
  return row ? rowToClearSettlementIdempotency(row) : null;
}

export function insertClearSettlementIdempotency(record: ClearSettlementIdempotencyRecord): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO clear_settlement_idempotency (
      idempotency_key_hash, owner_key_hash, clearance_id, mandate_config_id,
      receipt_id, response_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.idempotencyKeyHash, record.ownerKeyHash, record.clearanceId,
    record.mandateConfigId, record.receiptId, record.responseJson, record.createdAt
  );
  persistClearSettlementIdempotency(record);
}

export function reserveClearSettlementLock(opts: {
  lockKey: string;
  ownerKeyHash: string;
  clearanceId: string;
  mandateConfigId: string;
  claimHash: string;
  createdAt?: string;
}): boolean {
  const info = getDb().prepare(`
    INSERT OR IGNORE INTO clear_settlement_locks (
      lock_key, owner_key_hash, clearance_id, mandate_config_id, claim_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    opts.lockKey, opts.ownerKeyHash, opts.clearanceId, opts.mandateConfigId,
    opts.claimHash, opts.createdAt ?? new Date().toISOString()
  );
  if (info.changes > 0) {
    persistClearSettlementLock(opts);
    return true;
  }
  return false;
}

export function insertClearMandateConfig(config: ClearMandateConfig): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO clear_mandate_configs (
      mandate_config_id, owner_key_hash, on_chain_mandate_id, operator_wallet, agent_wallet, policy_name,
      budget_cap_micro, max_price_per_citation_micro, max_price_per_claim_micro,
      allowed_source_types, blocked_domains, blocked_wallets, required_license_class,
      require_publisher_verified, require_quote_span, min_support_score,
      challenge_window_seconds, expires_at, mandate_hash, operator_signature, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    config.mandateConfigId, config.ownerKeyHash ?? null, config.onChainMandateId, config.operatorWallet, config.agentWallet, config.policyName,
    config.budgetCapMicro, config.maxPricePerCitationMicro, config.maxPricePerClaimMicro,
    stringifyNullableArray(config.allowedSourceTypes), stringifyNullableArray(config.blockedDomains),
    stringifyNullableArray(config.blockedWallets), config.requiredLicenseClass,
    config.requirePublisherVerified ? 1 : 0, config.requireQuoteSpan ? 1 : 0, config.minSupportScore,
    config.challengeWindowSeconds, config.expiresAt, config.mandateHash, config.operatorSignature, config.createdAt
  );
  persistClearMandateConfig(config);
}

export function insertClaimClearance(clearance: ClaimClearance): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO claim_clearances (
      clearance_id, owner_key_hash, visibility, mandate_config_id, source_id, on_chain_source_id, answer_hash, claim_hash,
      claim_text, quote_text, quote_start, quote_end, quote_verified, support_score,
      license_class, amount_due_micro, amount_paid_micro, underlying_citation_receipt_id,
      on_chain_mandate_id, decision, policy_trace, receipt_hash, anchor_tx,
      challenge_status, challenge_deadline, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    clearance.clearanceId, clearance.ownerKeyHash ?? null, clearance.visibility ?? "public",
    clearance.mandateConfigId, clearance.sourceId, clearance.onChainSourceId,
    clearance.answerHash, clearance.claimHash, clearance.claimText, clearance.quoteText,
    clearance.quoteStart, clearance.quoteEnd, clearance.quoteVerified ? 1 : 0, clearance.supportScore,
    clearance.licenseClass, clearance.amountDueMicro, clearance.amountPaidMicro,
    clearance.underlyingCitationReceiptId, clearance.onChainMandateId, clearance.decision,
    clearance.policyTrace, clearance.receiptHash, clearance.anchorTx,
    clearance.challengeStatus, clearance.challengeDeadline, clearance.createdAt
  );
  persistClaimClearance(clearance);
}

export function insertClearanceCertificate(certificate: ClearanceCertificate): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO clearance_certificates (
      certificate_id, answer_hash, mandate_config_id, on_chain_mandate_id,
      claim_clearance_ids, cleared_count, blocked_count, unsupported_count,
      total_paid_micro, certificate_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    certificate.certificateId, certificate.answerHash, certificate.mandateConfigId, certificate.onChainMandateId,
    JSON.stringify(certificate.claimClearanceIds), certificate.clearedCount, certificate.blockedCount,
    certificate.unsupportedCount, certificate.totalPaidMicro, certificate.certificateHash, certificate.createdAt
  );
  persistClearanceCertificate(certificate);
}

export function insertRecoveryReport(report: RecoveryReport): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO recovery_reports (
      id, answer_hash, input_answer, findings_json, settlement_plan_json, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    report.id, report.answerHash, report.inputAnswer, JSON.stringify(report.findings),
    null, report.status, report.createdAt
  );
  persistRecoveryReport(report);
}

export function getRecoveryReportById(id: string): RecoveryReport | null {
  const row = getDb().prepare("SELECT * FROM recovery_reports WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const findings = JSON.parse(row.findings_json as string) as RecoveryReport["findings"];
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
}

export function getClaimClearanceById(id: string): ClaimClearance | null {
  const row = getDb().prepare("SELECT * FROM claim_clearances WHERE clearance_id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToClaimClearance(row) : null;
}

export function getClearMandateConfigById(id: string): ClearMandateConfig | null {
  const row = getDb().prepare("SELECT * FROM clear_mandate_configs WHERE mandate_config_id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToClearMandateConfig(row) : null;
}

export function getSpentMicroByMandateConfigId(mandateConfigId: string): number {
  const row = getDb().prepare(
    "SELECT COALESCE(SUM(amount_paid_micro), 0) as spent FROM claim_clearances WHERE mandate_config_id = ?"
  ).get(mandateConfigId) as { spent: number };
  return row.spent;
}

export function hasSettledClaim(mandateConfigId: string, claimHash: string): boolean {
  const row = getDb().prepare(`
    SELECT 1
    FROM claim_clearances
    WHERE mandate_config_id = ?
      AND claim_hash = ?
      AND decision = 'CLEARED'
      AND amount_paid_micro > 0
    LIMIT 1
  `).get(mandateConfigId, claimHash) as { 1: number } | undefined;
  return Boolean(row);
}

function rowToClearMandateConfig(r: Record<string, unknown>): ClearMandateConfig {
  return {
    mandateConfigId: r.mandate_config_id as string,
    ownerKeyHash: (r.owner_key_hash as string | null) ?? null,
    onChainMandateId: (r.on_chain_mandate_id as number | null) ?? null,
    operatorWallet: r.operator_wallet as string,
    agentWallet: r.agent_wallet as string,
    policyName: r.policy_name as string,
    budgetCapMicro: r.budget_cap_micro as number,
    maxPricePerCitationMicro: r.max_price_per_citation_micro as number,
    maxPricePerClaimMicro: r.max_price_per_claim_micro as number,
    allowedSourceTypes: parseJsonArray(r.allowed_source_types),
    blockedDomains: parseJsonArray(r.blocked_domains),
    blockedWallets: parseJsonArray(r.blocked_wallets),
    requiredLicenseClass: (r.required_license_class as string | null) ?? null,
    requirePublisherVerified: Boolean(r.require_publisher_verified),
    requireQuoteSpan: Boolean(r.require_quote_span),
    minSupportScore: r.min_support_score as number,
    challengeWindowSeconds: r.challenge_window_seconds as number,
    expiresAt: (r.expires_at as string | null) ?? null,
    mandateHash: r.mandate_hash as string,
    operatorSignature: (r.operator_signature as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

export function getClearanceCertificateById(id: string): ClearanceCertificate | null {
  const row = getDb().prepare("SELECT * FROM clearance_certificates WHERE certificate_id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToClearanceCertificate(row) : null;
}

export function getClearanceCertificateByClearanceId(clearanceId: string): ClearanceCertificate | null {
  const row = getDb().prepare(
    "SELECT * FROM clearance_certificates WHERE claim_clearance_ids LIKE ? ORDER BY created_at DESC LIMIT 1"
  ).get(`%${clearanceId}%`) as Record<string, unknown> | undefined;
  return row ? rowToClearanceCertificate(row) : null;
}

export function getClaimClearancesByCertificateId(certificateId: string): ClaimClearance[] {
  const cert = getClearanceCertificateById(certificateId);
  if (!cert) return [];
  return cert.claimClearanceIds
    .map((id) => getClaimClearanceById(id))
    .filter((c): c is ClaimClearance => Boolean(c));
}

function rowToClaimClearance(r: Record<string, unknown>): ClaimClearance {
  return {
    clearanceId: r.clearance_id as string,
    ownerKeyHash: (r.owner_key_hash as string | null) ?? null,
    visibility: (r.visibility as ClaimClearance["visibility"] | null) ?? "public",
    mandateConfigId: r.mandate_config_id as string,
    sourceId: r.source_id as string,
    onChainSourceId: (r.on_chain_source_id as number | null) ?? null,
    answerHash: r.answer_hash as string,
    claimHash: r.claim_hash as string,
    claimText: r.claim_text as string,
    quoteText: r.quote_text as string,
    quoteStart: r.quote_start as number,
    quoteEnd: r.quote_end as number,
    quoteVerified: Boolean(r.quote_verified),
    supportScore: r.support_score as number,
    licenseClass: (r.license_class as string | null) ?? null,
    amountDueMicro: r.amount_due_micro as number,
    amountPaidMicro: r.amount_paid_micro as number,
    underlyingCitationReceiptId: (r.underlying_citation_receipt_id as string | null) ?? null,
    onChainMandateId: (r.on_chain_mandate_id as number | null) ?? null,
    decision: r.decision as ClaimClearance["decision"],
    policyTrace: r.policy_trace as string,
    receiptHash: r.receipt_hash as string,
    anchorTx: (r.anchor_tx as string | null) ?? null,
    challengeStatus: r.challenge_status as ClaimClearance["challengeStatus"],
    challengeDeadline: (r.challenge_deadline as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

function rowToClearanceCertificate(r: Record<string, unknown>): ClearanceCertificate {
  return {
    certificateId: r.certificate_id as string,
    answerHash: r.answer_hash as string,
    mandateConfigId: r.mandate_config_id as string,
    onChainMandateId: (r.on_chain_mandate_id as number | null) ?? null,
    claimClearanceIds: parseJsonArray(r.claim_clearance_ids) ?? [],
    clearedCount: r.cleared_count as number,
    blockedCount: r.blocked_count as number,
    unsupportedCount: r.unsupported_count as number,
    totalPaidMicro: r.total_paid_micro as number,
    certificateHash: r.certificate_hash as string,
    createdAt: r.created_at as string,
  };
}

// ─── Receipts ─────────────────────────────────────────────────────────────────

export function insertReceipt(r: Receipt): void {
  getDb().prepare(`
    INSERT INTO receipts (id, source_id, query_id, agent_address, creator_wallet,
      decision, query, query_hash, source_title, source_url, amount_paid,
      evidence_hash, evidence_preimage, content_hash_at_decision, scores, reason,
      tx_hash, payment_status, policy_profile, policy_rules_passed, policy_rules_failed,
      policy_reason, agent_signature, budget_before, budget_after, challenged, created_at,
      purpose_code, contribution_weight)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    r.id, r.sourceId, r.queryId, r.agentAddress, r.creatorWallet,
    r.decision, r.query, r.queryHash, r.sourceTitle, r.sourceUrl, r.amountPaid,
    r.evidenceHash, JSON.stringify(r.evidencePreimage), r.contentHashAtDecision,
    JSON.stringify(r.scores), r.reason, r.txHash, r.paymentStatus ?? null,
    r.policyProfile ?? null,
    r.policyRulesPassed ? JSON.stringify(r.policyRulesPassed) : null,
    r.policyRulesFailed ? JSON.stringify(r.policyRulesFailed) : null,
    r.policyReason ?? null, r.agentSignature ?? null,
    r.budgetBefore, r.budgetAfter, r.challenged ? 1 : 0, r.createdAt,
    r.purposeCode ?? null,
    r.contributionWeight ?? null
  );
  // Durable write to Neon — fire-and-forget, never blocks the response
  persistReceipt({
    id: r.id, sourceId: r.sourceId, queryId: r.queryId,
    agentAddress: r.agentAddress, creatorWallet: r.creatorWallet,
    decision: r.decision, query: r.query, queryHash: r.queryHash,
    sourceTitle: r.sourceTitle, sourceUrl: r.sourceUrl,
    amountPaid: r.amountPaid, evidenceHash: r.evidenceHash,
    evidencePreimage: r.evidencePreimage,
    contentHashAtDecision: r.contentHashAtDecision,
    scores: r.scores,
    reason: r.reason, txHash: r.txHash ?? null,
    paymentStatus: r.paymentStatus ?? null, policyProfile: r.policyProfile ?? null,
    policyRulesPassed: r.policyRulesPassed,
    policyRulesFailed: r.policyRulesFailed,
    policyReason: r.policyReason,
    agentSignature: r.agentSignature ?? null,
    budgetBefore: r.budgetBefore,
    budgetAfter: r.budgetAfter,
    challenged: r.challenged,
    onChainReceiptId: r.onChainReceiptId ?? null, onChainTxHash: r.onChainTxHash ?? null,
    purposeCode: r.purposeCode ?? null,
    contributionWeight: r.contributionWeight ?? null,
    createdAt: r.createdAt,
  });
}

export function getReceiptById(id: string): Receipt | null {
  const row = getDb().prepare("SELECT * FROM receipts WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToReceipt(row) : null;
}

export function getReceiptsBySourceId(sourceId: string): Receipt[] {
  return getDb().prepare("SELECT * FROM receipts WHERE source_id = ? ORDER BY created_at DESC").all(sourceId).map((r) => rowToReceipt(r as Record<string, unknown>));
}

export function getReceiptsByCreatorWallet(wallet: string): Receipt[] {
  return getDb().prepare("SELECT * FROM receipts WHERE creator_wallet = ? ORDER BY created_at DESC").all(wallet).map((r) => rowToReceipt(r as Record<string, unknown>));
}

export function getSourcesByWallet(wallet: string): Source[] {
  return getDb().prepare(
    "SELECT * FROM sources WHERE payout_wallet = ? ORDER BY created_at DESC"
  ).all(wallet).map((r) => rowToSource(r as Record<string, unknown>));
}

export function getReceiptsByQueryId(queryId: string): Receipt[] {
  return getDb().prepare("SELECT * FROM receipts WHERE query_id = ? ORDER BY created_at DESC").all(queryId).map((r) => rowToReceipt(r as Record<string, unknown>));
}

export function getAllReceipts(limit = 50): Receipt[] {
  return getDb().prepare("SELECT * FROM receipts ORDER BY created_at DESC LIMIT ?").all(limit).map((r) => rowToReceipt(r as Record<string, unknown>));
}

export function getRecentReceipts(limit = 8): Receipt[] {
  return getDb().prepare("SELECT * FROM receipts ORDER BY created_at DESC LIMIT ?").all(limit).map((r) => rowToReceipt(r as Record<string, unknown>));
}

export function getReceiptsFiltered(opts: {
  agentAddress?: string | null;
  purposeCode?: string | null;
  since?: string | null;
  limit?: number;
}): Receipt[] {
  const db = getDb();
  let sql = `SELECT * FROM receipts WHERE 1=1`;
  const params: (string | number)[] = [];
  if (opts.agentAddress) { sql += ` AND agent_address = ?`; params.push(opts.agentAddress); }
  if (opts.purposeCode)  { sql += ` AND purpose_code = ?`;  params.push(opts.purposeCode); }
  if (opts.since)        { sql += ` AND created_at >= ?`;    params.push(opts.since); }
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(opts.limit ?? 50);
  return db.prepare(sql).all(...params).map((r) => rowToReceipt(r as Record<string, unknown>));
}

export function markReceiptChallenged(id: string): void {
  getDb().prepare("UPDATE receipts SET challenged = 1 WHERE id = ?").run(id);
}

export function getConfirmedPaidCount(): number {
  const row = getDb().prepare(
    "SELECT COUNT(*) as c FROM receipts WHERE decision='PAY' AND payment_status='confirmed'"
  ).get() as { c: number };
  return row.c;
}

export function getTotalConfirmedUSDC(): number {
  const row = getDb().prepare(
    "SELECT SUM(amount_paid) as s FROM receipts WHERE decision='PAY' AND payment_status='confirmed'"
  ).get() as { s: number | null };
  return row.s ?? 0;
}

function rowToReceipt(r: Record<string, unknown>): Receipt {
  return {
    id: r.id as string,
    sourceId: r.source_id as string,
    queryId: r.query_id as string,
    agentAddress: r.agent_address as string,
    creatorWallet: r.creator_wallet as string,
    decision: r.decision as "PAY" | "REFUSE" | "SKIP",
    query: r.query as string,
    queryHash: r.query_hash as string,
    sourceTitle: r.source_title as string,
    sourceUrl: r.source_url as string,
    amountPaid: r.amount_paid as number,
    evidenceHash: r.evidence_hash as string,
    evidencePreimage: JSON.parse(r.evidence_preimage as string),
    contentHashAtDecision: r.content_hash_at_decision as string,
    scores: JSON.parse(r.scores as string),
    reason: r.reason as string,
    txHash: r.tx_hash as string | null,
    paymentStatus: (r.payment_status as "confirmed" | "simulated" | null) ?? null,
    policyProfile: (r.policy_profile as string | null) ?? null,
    policyRulesPassed: r.policy_rules_passed ? JSON.parse(r.policy_rules_passed as string) : null,
    policyRulesFailed: r.policy_rules_failed ? JSON.parse(r.policy_rules_failed as string) : null,
    policyReason: (r.policy_reason as string | null) ?? null,
    agentSignature: (r.agent_signature as string | null) ?? null,
    budgetBefore: r.budget_before as number,
    budgetAfter: r.budget_after as number,
    challenged: Boolean(r.challenged),
    createdAt: r.created_at as string,
    onChainReceiptId: (r.on_chain_receipt_id as number | null) ?? null,
    onChainTxHash: (r.on_chain_tx_hash as string | null) ?? null,
    purposeCode: (r.purpose_code as string | null) ?? null,
    contributionWeight: (r.contribution_weight as number | null) ?? null,
  };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export function insertQuery(q: QueryRecord): void {
  getDb().prepare(`
    INSERT INTO queries (id, query, query_hash, budget, agent_address, query_fee,
      query_fee_tx_hash, status, total_paid, receipt_ids, answer, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    q.id, q.query, q.queryHash, q.budget, q.agentAddress, q.queryFee,
    q.queryFeeTxHash, q.status, q.totalPaid, JSON.stringify(q.receiptIds),
    q.answer, q.createdAt
  );
}

export function updateQuery(id: string, updates: Partial<QueryRecord>): void {
  const db = getDb();
  if (updates.status !== undefined)
    db.prepare("UPDATE queries SET status = ? WHERE id = ?").run(updates.status, id);
  if (updates.answer !== undefined)
    db.prepare("UPDATE queries SET answer = ? WHERE id = ?").run(updates.answer, id);
  if (updates.receiptIds !== undefined)
    db.prepare("UPDATE queries SET receipt_ids = ? WHERE id = ?").run(JSON.stringify(updates.receiptIds), id);
  if (updates.totalPaid !== undefined)
    db.prepare("UPDATE queries SET total_paid = ? WHERE id = ?").run(updates.totalPaid, id);
  if (updates.queryFeeTxHash !== undefined)
    db.prepare("UPDATE queries SET query_fee_tx_hash = ? WHERE id = ?").run(updates.queryFeeTxHash, id);
}

export function getQueryById(id: string): QueryRecord | null {
  const row = getDb().prepare("SELECT * FROM queries WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToQuery(row) : null;
}

function rowToQuery(r: Record<string, unknown>): QueryRecord {
  return {
    id: r.id as string,
    query: r.query as string,
    queryHash: r.query_hash as string,
    budget: r.budget as number,
    agentAddress: r.agent_address as string,
    queryFee: r.query_fee as number,
    queryFeeTxHash: r.query_fee_tx_hash as string | null,
    status: r.status as QueryRecord["status"],
    totalPaid: r.total_paid as number,
    receiptIds: JSON.parse(r.receipt_ids as string),
    answer: r.answer as string | null,
    createdAt: r.created_at as string,
  };
}

// ─── Traction ─────────────────────────────────────────────────────────────────

export function incrementTraction(key: string, by = 1): void {
  getDb().prepare("INSERT INTO traction (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = value + ?").run(key, by, by);
}

export function getTractionValue(key: string): number {
  const row = getDb().prepare("SELECT value FROM traction WHERE key = ?").get(key) as { value: number } | undefined;
  return row?.value ?? 0;
}

export function getFullTractionStats() {
  const db = getDb();

  const totalSources = (db.prepare("SELECT COUNT(*) as c FROM sources").get() as { c: number }).c;
  const bondedSources = (db.prepare("SELECT COUNT(*) as c FROM sources WHERE bonded = 1").get() as { c: number }).c;
  const creatorsPaid = (db.prepare("SELECT COUNT(DISTINCT creator_wallet) as c FROM receipts WHERE decision = 'PAY'").get() as { c: number }).c;
  const distinctCreators = (db.prepare("SELECT COUNT(DISTINCT payout_wallet) as c FROM sources").get() as { c: number }).c;
  const totalQueries = (db.prepare("SELECT COUNT(*) as c FROM queries").get() as { c: number }).c;
  const totalDecisions = (db.prepare("SELECT COUNT(*) as c FROM receipts").get() as { c: number }).c;
  const paidCitations = (db.prepare("SELECT COUNT(*) as c FROM receipts WHERE decision = 'PAY'").get() as { c: number }).c;
  const refusals = (db.prepare("SELECT COUNT(*) as c FROM receipts WHERE decision = 'REFUSE'").get() as { c: number }).c;
  const skips = (db.prepare("SELECT COUNT(*) as c FROM receipts WHERE decision = 'SKIP'").get() as { c: number }).c;
  const totalPaidRow = db.prepare("SELECT SUM(amount_paid) as s FROM receipts WHERE decision = 'PAY'").get() as { s: number | null };
  const totalUSDCRouted = totalPaidRow.s ?? 0;
  const shareCardsGenerated = getTractionValue("share_cards_generated");
  const shareCardsOpened = getTractionValue("share_cards_opened");
  const challengeCount = (db.prepare("SELECT COUNT(*) as c FROM receipts WHERE challenged = 1").get() as { c: number }).c;
  const activeAgents = (db.prepare("SELECT COUNT(DISTINCT agent_address) as c FROM queries WHERE status = 'completed'").get() as { c: number }).c;
  // Agent reputation: sum of all per-agent rep adjustments stored as traction keys
  const agentRepRows = db.prepare("SELECT value FROM traction WHERE key LIKE 'agent_rep_%'").all() as { value: number }[];
  const agentReputation = agentRepRows.reduce((s, r) => s + r.value, 0);

  return {
    creatorsIndexed: distinctCreators,
    creatorsPaid,
    sourcesRegistered: totalSources,
    bondedSources,
    totalQueries,
    totalDecisions,
    paidCitations,
    refusals,
    skips,
    totalUSDCRouted,
    avgPaymentPerCitation: paidCitations > 0 ? totalUSDCRouted / paidCitations : 0,
    shareCardsGenerated,
    shareCardsOpened,
    challengeCount,
    activeAgents,
    agentReputation,
  };
}

export interface LeaderboardEntry {
  agentAddress: string;
  totalDecisions: number;
  paidCount: number;
  refusedCount: number;
  skipCount: number;
  policyBlockedCount: number;
  totalPaid: number;
  topPolicy: string | null;
  lastDecisionAt: string | null;
}

export function getLeaderboard(limit = 50): LeaderboardEntry[] {
  const rows = getDb().prepare(`
    SELECT
      agent_address,
      COUNT(*) AS total_decisions,
      SUM(CASE WHEN decision = 'PAY' THEN 1 ELSE 0 END) AS paid_count,
      SUM(CASE WHEN decision = 'REFUSE' THEN 1 ELSE 0 END) AS refused_count,
      SUM(CASE WHEN decision = 'SKIP' THEN 1 ELSE 0 END) AS skip_count,
      SUM(CASE WHEN decision = 'BLOCKED_BY_POLICY' THEN 1 ELSE 0 END) AS policy_blocked_count,
      SUM(CASE WHEN decision = 'PAY' THEN amount_paid ELSE 0 END) AS total_paid,
      MAX(created_at) AS last_decision_at,
      (SELECT policy_profile FROM receipts r2 WHERE r2.agent_address = receipts.agent_address
       AND r2.policy_profile IS NOT NULL ORDER BY r2.created_at DESC LIMIT 1) AS top_policy
    FROM receipts
    GROUP BY agent_address
    ORDER BY total_paid DESC, paid_count DESC
    LIMIT ?
  `).all(limit) as Record<string, unknown>[];
  return rows.map((r) => ({
    agentAddress: r.agent_address as string,
    totalDecisions: r.total_decisions as number,
    paidCount: r.paid_count as number,
    refusedCount: r.refused_count as number,
    skipCount: r.skip_count as number,
    policyBlockedCount: r.policy_blocked_count as number,
    totalPaid: r.total_paid as number,
    topPolicy: (r.top_policy as string | null) ?? null,
    lastDecisionAt: (r.last_decision_at as string | null) ?? null,
  }));
}

export function recordShareCard(receiptId: string, creatorWallet: string): string {
  const id = uuidv4();
  getDb().prepare("INSERT INTO share_cards (id, receipt_id, creator_wallet) VALUES (?, ?, ?)").run(id, receiptId, creatorWallet);
  incrementTraction("share_cards_generated");
  return id;
}

export function openShareCard(shareId: string): void {
  const row = getDb().prepare("SELECT id FROM share_cards WHERE id = ?").get(shareId) as { id: string } | undefined;
  if (row) {
    getDb().prepare("UPDATE share_cards SET opened = 1 WHERE id = ?").run(shareId);
    incrementTraction("share_cards_opened");
  }
}

// ─── Synthesized Knowledge (Option 3) ────────────────────────────────────────

export interface KnowledgeSource {
  id: string;
  title: string;
  description: string;
  fullContent: string;
  url: string;
  contentHash: string;
  price: number;
  synthesizedFrom: string;
  agentAddress: string;
  createdAt: string;
  paidCount: number;
  category: string;
}

export function autoRegisterKnowledge(opts: {
  answer: string;
  query: string;
  queryId: string;
  agentWallet: string;
  host: string;
}): string {
  const db = getDb();
  const id = uuidv4();
  const contentHash = createHash("sha256").update(opts.answer).digest("hex");
  const shortTitle = opts.query.length > 80
    ? opts.query.slice(0, 77) + "…"
    : opts.query;
  const title = `[AI Synthesis] ${shortTitle}`;
  const proto = opts.host.startsWith("localhost") ? "http" : "https";
  const url = `${proto}://${opts.host}/labs/knowledge/${id}`;
  const description = opts.answer.slice(0, 400);

  db.prepare(`
    INSERT INTO sources (id, title, url, creator_name, creator_handle, payout_wallet,
      content_hash, description, price, bond, bonded, reputation, paid_count, refused_count,
      skip_count, active, category, source_type, synthesized_from, full_content, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    id, title, url,
    "CitePay Orchestrator", "@citepay_agent",
    opts.agentWallet,
    contentHash, description,
    1500, 0, 0, 0, 0, 0, 0, 1,
    "AI/Agents", "ai_synthesized",
    opts.queryId, opts.answer
  );

  return id;
}

export function getKnowledgeById(id: string): KnowledgeSource | null {
  const row = getDb().prepare(
    "SELECT * FROM sources WHERE id = ? AND source_type = 'ai_synthesized'"
  ).get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) || "",
    fullContent: (row.full_content as string) || (row.description as string) || "",
    url: row.url as string,
    contentHash: row.content_hash as string,
    price: row.price as number,
    synthesizedFrom: (row.synthesized_from as string) || "",
    agentAddress: (row.payout_wallet as string) || "",
    createdAt: row.created_at as string,
    paidCount: (row.paid_count as number) || 0,
    category: (row.category as string) || "AI/Agents",
  };
}

export function getRecentKnowledge(limit = 10): KnowledgeSource[] {
  const rows = getDb().prepare(
    "SELECT * FROM sources WHERE source_type = 'ai_synthesized' ORDER BY created_at DESC LIMIT ?"
  ).all(limit) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) || "",
    fullContent: (row.full_content as string) || (row.description as string) || "",
    url: row.url as string,
    contentHash: row.content_hash as string,
    price: row.price as number,
    synthesizedFrom: (row.synthesized_from as string) || "",
    agentAddress: (row.payout_wallet as string) || "",
    createdAt: row.created_at as string,
    paidCount: (row.paid_count as number) || 0,
    category: (row.category as string) || "AI/Agents",
  }));
}

// ─── Reputation (Option 4) ────────────────────────────────────────────────────

export function getReputationForUrl(url: string) {
  const db = getDb();
  const source = db.prepare("SELECT * FROM sources WHERE url = ? LIMIT 1").get(url) as Record<string, unknown> | undefined;
  if (!source) {
    const anyReceipts = db.prepare("SELECT COUNT(*) as c FROM receipts WHERE source_url = ?").get(url) as { c: number };
    if (anyReceipts.c === 0) return null;
    const paid = (db.prepare("SELECT COUNT(*) as c FROM receipts WHERE source_url = ? AND decision = 'PAY'").get(url) as { c: number }).c;
    const refused = (db.prepare("SELECT COUNT(*) as c FROM receipts WHERE source_url = ? AND decision = 'REFUSE'").get(url) as { c: number }).c;
    const lastRow = db.prepare("SELECT created_at FROM receipts WHERE source_url = ? ORDER BY created_at DESC LIMIT 1").get(url) as { created_at: string } | undefined;
    const total = paid + refused;
    return {
      url, found: false, sourceId: null, title: null, trustScore: total > 0 ? Math.round((paid / total) * 100) : 0,
      citationCount: anyReceipts.c, paidCount: paid, refusedCount: refused, averageScore: null,
      lastCitedAt: lastRow?.created_at ?? null, pricePerCitation: null, creatorHandle: null,
    };
  }

  const sourceId = source.id as string;
  const paidCount = (source.paid_count as number) || 0;
  const refusedCount = (source.refused_count as number) || 0;
  const skipCount = (source.skip_count as number) || 0;
  const total = paidCount + refusedCount + skipCount;
  const baseScore = total > 0 ? (paidCount / total) * 100 : 50;
  const repBonus = Math.min(20, ((source.reputation as number) || 0) * 2);
  const trustScore = Math.min(100, Math.round(baseScore + repBonus));

  const scoreRows = db.prepare(
    "SELECT scores FROM receipts WHERE source_id = ? AND decision = 'PAY' ORDER BY created_at DESC LIMIT 20"
  ).all(sourceId) as { scores: string }[];
  const avgScore = scoreRows.length > 0
    ? Math.round(scoreRows.reduce((s, r) => {
        try { return s + (JSON.parse(r.scores) as { total: number }).total; } catch { return s; }
      }, 0) / scoreRows.length)
    : null;

  const lastRow = db.prepare(
    "SELECT created_at FROM receipts WHERE source_id = ? ORDER BY created_at DESC LIMIT 1"
  ).get(sourceId) as { created_at: string } | undefined;

  return {
    url, found: true, sourceId,
    title: source.title as string,
    trustScore,
    citationCount: paidCount + refusedCount + skipCount,
    paidCount,
    refusedCount,
    averageScore: avgScore,
    lastCitedAt: lastRow?.created_at ?? null,
    pricePerCitation: source.price as number,
    creatorHandle: source.creator_handle as string,
    category: source.category as string,
    bonded: Boolean(source.bonded),
  };
}

// ─── Bounties (Option 1) ──────────────────────────────────────────────────────

export interface Bounty {
  id: string;
  title: string;
  query: string;
  description: string;
  budgetMicro: number;
  deadline: string;
  status: "open" | "evaluating" | "closed";
  agentAddress: string;
  winningSubmissionId: string | null;
  winnerWallet: string | null;
  winnerPaidMicro: number;
  winnerTxHash: string | null;
  createdAt: string;
  closedAt: string | null;
  submissionCount?: number;
}

export interface BountySubmission {
  id: string;
  bountyId: string;
  creatorName: string;
  creatorHandle: string;
  creatorWallet: string;
  content: string;
  contentUrl: string | null;
  evaluationScore: number | null;
  evaluationReason: string | null;
  createdAt: string;
}

function rowToBounty(r: Record<string, unknown>): Bounty {
  return {
    id: r.id as string,
    title: r.title as string,
    query: r.query as string,
    description: (r.description as string) || "",
    budgetMicro: r.budget_micro as number,
    deadline: r.deadline as string,
    status: r.status as Bounty["status"],
    agentAddress: r.agent_address as string,
    winningSubmissionId: (r.winning_submission_id as string | null) ?? null,
    winnerWallet: (r.winner_wallet as string | null) ?? null,
    winnerPaidMicro: (r.winner_paid_micro as number) || 0,
    winnerTxHash: (r.winner_tx_hash as string | null) ?? null,
    createdAt: r.created_at as string,
    closedAt: (r.closed_at as string | null) ?? null,
    submissionCount: (r.submission_count as number | undefined) ?? undefined,
  };
}

export function createBounty(opts: {
  title: string;
  query: string;
  description: string;
  budgetMicro: number;
  deadline: string;
  agentAddress: string;
  autoPosted?: boolean;
  gapCategory?: string;
}): Bounty {
  const id = uuidv4();
  const db = getDb();
  db.prepare(`
    INSERT INTO bounties (id, title, query, description, budget_micro, deadline, status, agent_address, auto_posted, gap_category)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
  `).run(
    id, opts.title, opts.query, opts.description,
    opts.budgetMicro, opts.deadline, opts.agentAddress,
    opts.autoPosted ? 1 : 0,
    opts.gapCategory ?? null,
  );
  return getBountyById(id)!;
}

export function getBounties(status?: string, limit = 50): Bounty[] {
  const db = getDb();
  const rows = status
    ? db.prepare(`
        SELECT b.*, COUNT(bs.id) as submission_count
        FROM bounties b LEFT JOIN bounty_submissions bs ON bs.bounty_id = b.id
        WHERE b.status = ? GROUP BY b.id ORDER BY b.created_at DESC LIMIT ?
      `).all(status, limit)
    : db.prepare(`
        SELECT b.*, COUNT(bs.id) as submission_count
        FROM bounties b LEFT JOIN bounty_submissions bs ON bs.bounty_id = b.id
        GROUP BY b.id ORDER BY b.created_at DESC LIMIT ?
      `).all(limit);
  return rows.map((r) => rowToBounty(r as Record<string, unknown>));
}

export function getBountyById(id: string): Bounty | null {
  const row = getDb().prepare(`
    SELECT b.*, COUNT(bs.id) as submission_count
    FROM bounties b LEFT JOIN bounty_submissions bs ON bs.bounty_id = b.id
    WHERE b.id = ? GROUP BY b.id
  `).get(id) as Record<string, unknown> | undefined;
  return row ? rowToBounty(row) : null;
}

export function submitToBounty(opts: {
  bountyId: string;
  creatorName: string;
  creatorHandle: string;
  creatorWallet: string;
  content: string;
  contentUrl?: string;
}): BountySubmission {
  const id = uuidv4();
  const db = getDb();
  db.prepare(`
    INSERT INTO bounty_submissions (id, bounty_id, creator_name, creator_handle, creator_wallet, content, content_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, opts.bountyId, opts.creatorName, opts.creatorHandle, opts.creatorWallet, opts.content, opts.contentUrl ?? null);
  return getBountySubmissions(opts.bountyId).find((s) => s.id === id)!;
}

export function getBountySubmissions(bountyId: string): BountySubmission[] {
  const rows = getDb().prepare(
    "SELECT * FROM bounty_submissions WHERE bounty_id = ? ORDER BY created_at ASC"
  ).all(bountyId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string,
    bountyId: r.bounty_id as string,
    creatorName: r.creator_name as string,
    creatorHandle: r.creator_handle as string,
    creatorWallet: r.creator_wallet as string,
    content: r.content as string,
    contentUrl: (r.content_url as string | null) ?? null,
    evaluationScore: (r.evaluation_score as number | null) ?? null,
    evaluationReason: (r.evaluation_reason as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

// ─── Research Sessions (Build 2) ─────────────────────────────────────────────

export interface Session {
  id: string; title: string; policy: string;
  totalPaidMicro: number; totalCitations: number;
  contextSummary: string | null; createdAt: string; lastActive: string;
  turns?: SessionTurn[];
}
export interface SessionTurn {
  id: string; sessionId: string; query: string; answer: string;
  queryId: string | null; citationsPaid: number; amountPaidMicro: number;
  receiptIds: string[]; turnIndex: number; createdAt: string;
}

export function createSession(opts: { title?: string; policy?: string }): Session {
  const id = uuidv4();
  getDb().prepare(`INSERT INTO sessions (id, title, policy) VALUES (?, ?, ?)`).run(id, opts.title ?? "Research Session", opts.policy ?? "balanced");
  return getSessionById(id)!;
}

export function getSessionById(id: string): Session | null {
  const row = getDb().prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: row.id as string, title: row.title as string, policy: row.policy as string,
    totalPaidMicro: row.total_paid_micro as number, totalCitations: row.total_citations as number,
    contextSummary: (row.context_summary as string | null) ?? null,
    createdAt: row.created_at as string, lastActive: row.last_active as string,
  };
}

export function getRecentSessions(limit = 20): Session[] {
  return (getDb().prepare("SELECT * FROM sessions ORDER BY last_active DESC LIMIT ?").all(limit) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string, title: row.title as string, policy: row.policy as string,
    totalPaidMicro: row.total_paid_micro as number, totalCitations: row.total_citations as number,
    contextSummary: (row.context_summary as string | null) ?? null,
    createdAt: row.created_at as string, lastActive: row.last_active as string,
  }));
}

export function addSessionTurn(opts: {
  sessionId: string; query: string; answer: string; queryId: string | null;
  citationsPaid: number; amountPaidMicro: number; receiptIds: string[]; turnIndex: number;
}): SessionTurn {
  const id = uuidv4();
  const db = getDb();
  db.prepare(`INSERT INTO session_turns (id, session_id, query, answer, query_id, citations_paid, amount_paid_micro, receipt_ids, turn_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, opts.sessionId, opts.query, opts.answer, opts.queryId, opts.citationsPaid, opts.amountPaidMicro, JSON.stringify(opts.receiptIds), opts.turnIndex);
  db.prepare(`UPDATE sessions SET total_paid_micro = total_paid_micro + ?, total_citations = total_citations + ?, last_active = datetime('now') WHERE id = ?`
  ).run(opts.amountPaidMicro, opts.citationsPaid, opts.sessionId);
  return getSessionTurns(opts.sessionId).find((t) => t.id === id)!;
}

export function getSessionTurns(sessionId: string): SessionTurn[] {
  return (getDb().prepare("SELECT * FROM session_turns WHERE session_id = ? ORDER BY turn_index ASC").all(sessionId) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, sessionId: r.session_id as string, query: r.query as string,
    answer: r.answer as string, queryId: (r.query_id as string | null) ?? null,
    citationsPaid: r.citations_paid as number, amountPaidMicro: r.amount_paid_micro as number,
    receiptIds: JSON.parse(r.receipt_ids as string), turnIndex: r.turn_index as number,
    createdAt: r.created_at as string,
  }));
}

export function updateSessionContext(id: string, summary: string): void {
  getDb().prepare("UPDATE sessions SET context_summary = ? WHERE id = ?").run(summary, id);
}

// ─── Agent Lessons (Build 5) ──────────────────────────────────────────────────

export interface AgentLesson {
  id: string; orchestrationQuery: string; lesson: string;
  gapIdentified: string | null; topSources: string | null;
  weakSources: string | null; scoreAdjustments: string | null; createdAt: string;
}

export function insertAgentLesson(opts: {
  orchestrationQuery: string; lesson: string; gapIdentified?: string;
  topSources?: string; weakSources?: string; scoreAdjustments?: string;
}): string {
  const id = uuidv4();
  getDb().prepare(`INSERT INTO agent_lessons (id, orchestration_query, lesson, gap_identified, top_sources, weak_sources, score_adjustments) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, opts.orchestrationQuery, opts.lesson, opts.gapIdentified ?? null, opts.topSources ?? null, opts.weakSources ?? null, opts.scoreAdjustments ?? null);
  return id;
}

export function getRecentLessons(limit = 20): AgentLesson[] {
  return (getDb().prepare("SELECT * FROM agent_lessons ORDER BY created_at DESC LIMIT ?").all(limit) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, orchestrationQuery: r.orchestration_query as string,
    lesson: r.lesson as string, gapIdentified: (r.gap_identified as string | null) ?? null,
    topSources: (r.top_sources as string | null) ?? null, weakSources: (r.weak_sources as string | null) ?? null,
    scoreAdjustments: (r.score_adjustments as string | null) ?? null, createdAt: r.created_at as string,
  }));
}

export function getIntelligenceStats() {
  const db = getDb();
  const categoryRows = db.prepare(`
    SELECT s.category, COUNT(r.id) as cite_count,
           SUM(CASE WHEN r.decision='PAY' THEN 1 ELSE 0 END) as paid,
           SUM(CASE WHEN r.decision='REFUSE' THEN 1 ELSE 0 END) as refused
    FROM receipts r JOIN sources s ON s.id = r.source_id
    GROUP BY s.category ORDER BY cite_count DESC
  `).all() as { category: string; cite_count: number; paid: number; refused: number }[];

  const hourlyFlow = db.prepare(`
    SELECT strftime('%H', created_at) as hour, SUM(amount_paid) as total_paid, COUNT(*) as count
    FROM receipts WHERE decision='PAY' AND created_at >= datetime('now', '-24 hours')
    GROUP BY hour ORDER BY hour
  `).all() as { hour: string; total_paid: number; count: number }[];

  const compoundingScore = (db.prepare(
    "SELECT SUM(paid_count) as s FROM sources WHERE source_type='ai_synthesized'"
  ).get() as { s: number | null }).s ?? 0;

  const autoBounties = (db.prepare(
    "SELECT COUNT(*) as c FROM bounties WHERE auto_posted=1"
  ).get() as { c: number }).c;

  const lessonCount = (db.prepare("SELECT COUNT(*) as c FROM agent_lessons").get() as { c: number }).c;

  const sessionCount = (db.prepare("SELECT COUNT(*) as c FROM sessions").get() as { c: number }).c;
  const sessionPaid = (db.prepare("SELECT SUM(total_paid_micro) as s FROM sessions").get() as { s: number | null }).s ?? 0;

  return { categoryRows, hourlyFlow, compoundingScore, autoBounties, lessonCount, sessionCount, sessionPaid };
}

export function closeBounty(opts: {
  id: string;
  winnerSubmissionId: string;
  winnerWallet: string;
  winnerPaidMicro: number;
  winnerTxHash: string | null;
  scores: Record<string, { score: number; reason: string }>;
}): void {
  const db = getDb();
  db.prepare(`
    UPDATE bounties SET status = 'closed', winning_submission_id = ?, winner_wallet = ?,
    winner_paid_micro = ?, winner_tx_hash = ?, closed_at = datetime('now') WHERE id = ?
  `).run(opts.winnerSubmissionId, opts.winnerWallet, opts.winnerPaidMicro, opts.winnerTxHash, opts.id);
  for (const [subId, ev] of Object.entries(opts.scores)) {
    db.prepare("UPDATE bounty_submissions SET evaluation_score = ?, evaluation_reason = ? WHERE id = ?")
      .run(ev.score, ev.reason, subId);
  }
}

// ─── Agent Commerce Network ───────────────────────────────────────────────────

export interface AgentRegistryRow {
  id: string;
  name: string;
  handle: string;
  specialty: string;
  endpointUrl: string;
  wallet: string;
  priceMicro: number;
  policyProfile: string;
  status: string;
  totalHired: number;
  totalEarnedMicro: number;
  successfulTasks: number;
  failedTasks: number;
  averageQualityScore: number;
  policyViolations: number;
  trustScore: number;
  identityTxHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentHireReceipt {
  id: string;
  queryId: string;
  orchestratorId: string;
  agentId: string;
  agentName: string;
  agentWallet: string;
  subtask: string;
  amountMicro: number;
  allocatedBudgetMicro: number;
  paymentMode: "confirmed" | "live" | "testnet" | "simulated";
  txHash: string | null;
  responseHash: string | null;
  qualityScore: number;
  policyStatus: "APPROVED" | "BLOCKED" | "WARNING" | "FALLBACK_USED";
  policyReason: string | null;
  downstreamReceiptIds: string[];
  citedAgents: { agentId: string; agentName: string; citationFeeMicro: number; txHash: string | null }[];
  createdAt: string;
}

function rowToAgentRegistry(r: Record<string, unknown>): AgentRegistryRow {
  return {
    id: r.id as string,
    name: r.name as string,
    handle: r.handle as string,
    specialty: r.specialty as string,
    endpointUrl: r.endpoint_url as string,
    wallet: r.wallet as string,
    priceMicro: r.price_micro as number,
    policyProfile: r.policy_profile as string,
    status: r.status as string,
    totalHired: r.total_hired as number,
    totalEarnedMicro: r.total_earned_micro as number,
    successfulTasks: r.successful_tasks as number,
    failedTasks: r.failed_tasks as number,
    averageQualityScore: r.average_quality_score as number,
    policyViolations: r.policy_violations as number,
    trustScore: r.trust_score as number,
    identityTxHash: (r.identity_tx_hash as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToAgentHireReceipt(r: Record<string, unknown>): AgentHireReceipt {
  return {
    id: r.id as string,
    queryId: r.query_id as string,
    orchestratorId: r.orchestrator_id as string,
    agentId: r.agent_id as string,
    agentName: r.agent_name as string,
    agentWallet: r.agent_wallet as string,
    subtask: r.subtask as string,
    amountMicro: r.amount_micro as number,
    allocatedBudgetMicro: (r.allocated_budget_micro as number) ?? 0,
    paymentMode: (r.payment_mode as AgentHireReceipt["paymentMode"]) ?? "simulated",
    txHash: (r.tx_hash as string | null) ?? null,
    responseHash: (r.response_hash as string | null) ?? null,
    qualityScore: (r.quality_score as number) ?? 0,
    policyStatus: (r.policy_status as AgentHireReceipt["policyStatus"]) ?? "APPROVED",
    policyReason: (r.policy_reason as string | null) ?? null,
    downstreamReceiptIds: JSON.parse((r.downstream_receipt_ids as string) || "[]"),
    citedAgents: JSON.parse((r.cited_agents as string) || "[]"),
    createdAt: r.created_at as string,
  };
}

const DEMO_AGENTS = [
  {
    id: "agent-fact-001",
    name: "FactAgent",
    handle: "@fact_commerce",
    specialty: "factual research",
    endpoint_url: "https://demo.internal/fact-agent",
    wallet: "0x3a0FfFE64537148b3766dA52D983058F98A4e3ce",
    price_micro: 1500,
    policy_profile: "conservative",
    trust_score: 92,
    policy_violations: 0,
  },
  {
    id: "agent-tech-002",
    name: "TechAgent",
    handle: "@tech_commerce",
    specialty: "technical documentation",
    endpoint_url: "https://demo.internal/tech-agent",
    wallet: "0x72101E4882159f3e0B3c176951AcA7816A1710e2",
    price_micro: 2500,
    policy_profile: "balanced",
    trust_score: 85,
    policy_violations: 0,
  },
  {
    id: "agent-market-003",
    name: "MarketAgent",
    handle: "@market_commerce",
    specialty: "market analysis economics",
    endpoint_url: "https://demo.internal/market-agent",
    wallet: "0xbe575CcebE08895e61c8E45652ff63E4a663d4D9",
    price_micro: 3500,
    policy_profile: "aggressive",
    trust_score: 68,
    policy_violations: 1,
  },
  {
    id: "agent-risky-004",
    name: "RiskyAgent",
    handle: "@risky_commerce",
    specialty: "unknown unverified",
    endpoint_url: "https://demo.internal/risky-agent",
    wallet: "0x0000000000000000000000000000000000000001",
    price_micro: 9000,
    policy_profile: "aggressive",
    trust_score: 20,
    policy_violations: 3,
  },
];

function seedAgentRegistryIfEmpty(db: Database.Database) {
  const count = (db.prepare("SELECT COUNT(*) as n FROM agent_registry").get() as { n: number }).n;
  if (count > 0) return;
  const stmt = db.prepare(`
    INSERT INTO agent_registry (id, name, handle, specialty, endpoint_url, wallet,
      price_micro, policy_profile, trust_score, policy_violations, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `);
  const insert = db.transaction(() => {
    for (const a of DEMO_AGENTS) {
      stmt.run(a.id, a.name, a.handle, a.specialty, a.endpoint_url, a.wallet,
        a.price_micro, a.policy_profile, a.trust_score, a.policy_violations);
    }
  });
  insert();
}

export function getAgentRegistry(statusFilter?: string): AgentRegistryRow[] {
  const db = getDb();
  const rows = statusFilter
    ? db.prepare("SELECT * FROM agent_registry WHERE status = ? ORDER BY trust_score DESC, total_hired DESC").all(statusFilter)
    : db.prepare("SELECT * FROM agent_registry ORDER BY trust_score DESC, total_hired DESC").all();
  return rows.map((r) => rowToAgentRegistry(r as Record<string, unknown>));
}

export function getAgentRegistryById(id: string): AgentRegistryRow | undefined {
  const row = getDb().prepare("SELECT * FROM agent_registry WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToAgentRegistry(row) : undefined;
}

export function registerAgent(data: {
  name: string; handle: string; specialty: string; endpointUrl: string;
  wallet: string; priceMicro: number; policyProfile: string;
}): AgentRegistryRow {
  const id = uuidv4();
  const db = getDb();
  db.prepare(`
    INSERT INTO agent_registry (id, name, handle, specialty, endpoint_url, wallet,
      price_micro, policy_profile, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(id, data.name, data.handle, data.specialty, data.endpointUrl,
    data.wallet, data.priceMicro, data.policyProfile);
  return getAgentRegistryById(id)!;
}

export function updateAgentStats(id: string, stats: {
  successfulTask?: boolean;
  failedTask?: boolean;
  earnedMicro?: number;
  qualityScore?: number;
  policyViolation?: boolean;
}): void {
  const db = getDb();
  const agent = getAgentRegistryById(id);
  if (!agent) return;

  if (stats.successfulTask) {
    db.prepare("UPDATE agent_registry SET total_hired = total_hired + 1, successful_tasks = successful_tasks + 1, updated_at = datetime('now') WHERE id = ?").run(id);
  } else if (stats.failedTask) {
    db.prepare("UPDATE agent_registry SET total_hired = total_hired + 1, failed_tasks = failed_tasks + 1, updated_at = datetime('now') WHERE id = ?").run(id);
  }
  if (stats.earnedMicro) {
    db.prepare("UPDATE agent_registry SET total_earned_micro = total_earned_micro + ?, updated_at = datetime('now') WHERE id = ?").run(stats.earnedMicro, id);
  }
  if (stats.qualityScore !== undefined) {
    const prev = agent.averageQualityScore;
    const tasks = agent.successfulTasks + (stats.successfulTask ? 1 : 0);
    const newAvg = tasks > 1 ? (prev * (tasks - 1) + stats.qualityScore) / tasks : stats.qualityScore;
    db.prepare("UPDATE agent_registry SET average_quality_score = ?, updated_at = datetime('now') WHERE id = ?").run(newAvg, id);
  }
  if (stats.policyViolation) {
    db.prepare("UPDATE agent_registry SET policy_violations = policy_violations + 1, trust_score = MAX(0, trust_score - 5), updated_at = datetime('now') WHERE id = ?").run(id);
  }
}

export function saveAgentHireReceipt(receipt: AgentHireReceipt): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO agent_hire_receipts
      (id, query_id, orchestrator_id, agent_id, agent_name, agent_wallet, subtask,
       amount_micro, allocated_budget_micro, payment_mode, tx_hash, response_hash,
       quality_score, policy_status, policy_reason, downstream_receipt_ids, cited_agents, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    receipt.id, receipt.queryId, receipt.orchestratorId, receipt.agentId, receipt.agentName,
    receipt.agentWallet, receipt.subtask, receipt.amountMicro, receipt.allocatedBudgetMicro ?? 0,
    receipt.paymentMode, receipt.txHash, receipt.responseHash, receipt.qualityScore,
    receipt.policyStatus, receipt.policyReason,
    JSON.stringify(receipt.downstreamReceiptIds),
    JSON.stringify(receipt.citedAgents ?? []),
    receipt.createdAt,
  );
}

export function getAgentHireReceipts(queryId?: string, limit = 50): AgentHireReceipt[] {
  const db = getDb();
  const rows = queryId
    ? db.prepare("SELECT * FROM agent_hire_receipts WHERE query_id = ? ORDER BY created_at DESC LIMIT ?").all(queryId, limit)
    : db.prepare("SELECT * FROM agent_hire_receipts ORDER BY created_at DESC LIMIT ?").all(limit);
  return rows.map((r) => rowToAgentHireReceipt(r as Record<string, unknown>));
}

export function getAgentHireReceiptById(id: string): AgentHireReceipt | undefined {
  const row = getDb().prepare("SELECT * FROM agent_hire_receipts WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToAgentHireReceipt(row) : undefined;
}

export function setAgentIdentityTxHash(agentId: string, txHash: string): void {
  getDb().prepare("UPDATE agent_registry SET identity_tx_hash = ?, updated_at = datetime('now') WHERE id = ?").run(txHash, agentId);
}
