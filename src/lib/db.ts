import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import type { Source, Receipt, QueryRecord } from "@/types";

const DATA_DIR = process.env.NODE_ENV === "production"
  ? "/tmp"
  : path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "citepay.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  migrate(_db);
  seedIfEmpty(_db);
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
  ]) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }
}

// ─── Auto-seed (production cold start) ───────────────────────────────────────

// on_chain_id values are permanent — assigned when sources were registered on
// CitePayMarket.sol (0x396cf1646EbAeF85ee8428C2d9239C46Ae956085, Base Sepolia)
const SEED_SOURCES = [
  { onChainId: 1,  title: "x402: HTTP-Native Payments for AI Agents", url: "https://x402.org", creatorName: "Coinbase Developer Platform", creatorHandle: "@coinbase", payoutWallet: "0x1234000000000000000000000000000000000001", price: 2000, bond: 10000, contentHash: "70f01a7977012702b243e6a6c2509f6a603b7a61e0241a6f0c3ce845949e1d57", description: "x402 is an open protocol for machine-native payments using HTTP 402 Payment Required. It enables AI agents and automated systems to pay for resources autonomously using USDC on Base." },
  { onChainId: 2,  title: "Circle's Programmable Wallets: Powering Agentic Finance", url: "https://developers.circle.com/w3s/programmable-wallets", creatorName: "Circle Developer Docs", creatorHandle: "@circle", payoutWallet: "0x1234000000000000000000000000000000000002", price: 3000, bond: 10000, contentHash: "33a7a9314b96f7dbea847c48f7d7cb5ed74537485913516e043b565795a930b5", description: "Circle's Programmable Wallets enable developers to create and manage wallets at scale. USDC transfers on Base Sepolia are instant and near-zero cost, making them ideal for micro-payments between AI agents and content creators." },
  { onChainId: 3,  title: "Agentic AI: How Autonomous Agents Will Transform Commerce", url: "https://a16z.com/agentic-ai", creatorName: "Andreessen Horowitz", creatorHandle: "@a16z", payoutWallet: "0x1234000000000000000000000000000000000003", price: 4000, bond: 5000, contentHash: "2b02947de287cdddc2d2440d37cc1c5961cb7d70f3407e609f400d757b58dac6", description: "Agentic AI systems — autonomous agents that plan, act, and pay for resources — represent a fundamental shift in how software works. These agents need on-chain payment rails to operate at scale without human intervention." },
  { onChainId: 4,  title: "The Creator Economy in the Age of AI: Who Gets Paid?", url: "https://mirror.xyz/citepay/creator-economy-ai", creatorName: "Research by CitePay", creatorHandle: "@citepay", payoutWallet: "0x1234000000000000000000000000000000000004", price: 2000, bond: 0, contentHash: "256329962cf8c93150940eb17d0a305c284d2b6c0a406a04add51ac658cffb92", description: "As large language models increasingly answer questions by drawing on creator content without attribution or compensation, a new payment layer is needed. CitePay Markets solves this by making citations accountable and paid." },
  { onChainId: 5,  title: "Base: The Onchain Platform for Everyone", url: "https://base.org", creatorName: "Base Documentation", creatorHandle: "@base", payoutWallet: "0x1234000000000000000000000000000000000005", price: 1500, bond: 10000, contentHash: "d282cc888b86dbd8028f9f6af714587c56a00f7264430541e233df145250acb6", description: "Base is a secure, low-cost, developer-friendly Ethereum L2. With near-zero gas fees and USDC native support, Base is the ideal chain for micro-payment applications like AI citation markets." },
  { onChainId: 6,  title: "Reputation Systems in Decentralized Marketplaces", url: "https://vitalik.eth.limo/general/2023/07/24/biometric.html", creatorName: "Vitalik Buterin", creatorHandle: "@vitalik", payoutWallet: "0x1234000000000000000000000000000000000006", price: 5000, bond: 20000, contentHash: "610d8c75ff1294ae99afa1f0049511f7ead82b6c2f98caff07ca7e881dafe62b", description: "Reputation in decentralized systems should be earned through verifiable on-chain actions, not assigned by central authorities. Source credibility bonds and pay/refuse ratios create objective, game-resistant reputation scores." },
  { onChainId: 7,  title: "HTTP 402 and the Future of Machine Payments", url: "https://docs.cdp.coinbase.com/x402/docs/welcome", creatorName: "Coinbase Developer Platform", creatorHandle: "@coinbase_dev", payoutWallet: "0x1234000000000000000000000000000000000007", price: 2500, bond: 10000, contentHash: "327d0c9a1e2e214d2658b334afac90483ea11836b6676ef8035854a52a08d8b4", description: "HTTP 402 Payment Required has been dormant since the 1990s. x402 revives it as a machine-native payment protocol, enabling any HTTP endpoint to require payment before serving content — perfect for AI agent workflows." },
  { onChainId: 8,  title: "Content Integrity and Hash Verification in Web3", url: "https://ipfs.tech/blog/content-addressing", creatorName: "Protocol Labs", creatorHandle: "@protocollabs", payoutWallet: "0x1234000000000000000000000000000000000008", price: 2000, bond: 5000, contentHash: "77ed5dbce0e8699cf34d041e4db6af0b697821ea25094eca3ee328a4a3dde5d4", description: "Content-addressed storage ensures that what you paid for is what you received. By storing a SHA-256 hash of content at payment time, CitePay Markets can objectively verify if a creator modified their source after receiving payment." },
  { onChainId: 9,  title: "USDC: The Dollar for the Internet", url: "https://www.circle.com/usdc", creatorName: "Circle", creatorHandle: "@circle", payoutWallet: "0x1234000000000000000000000000000000000009", price: 1000, bond: 10000, contentHash: "fac45fcf9ee419e9010f1335ea6f744d2ccd9533f68babea3162e6412a3651df", description: "USDC is a fully reserved, dollar-backed stablecoin that settles instantly on Base. Its programmatic accessibility makes it the default currency for AI agent payments, enabling autonomous financial transactions at internet scale." },
  { onChainId: 10, title: "The Case for AI Agent Accountability: Evidence Logs and Receipts", url: "https://anthropic.com/research/model-cards", creatorName: "Anthropic", creatorHandle: "@anthropic", payoutWallet: "0x1234000000000000000000000000000000000010", price: 3000, bond: 15000, contentHash: "5e49d22dddff4c0357ce8d8c5bf22a75665185ee6cd7c96cd5308b91dac26f13", description: "AI agents that interact with the world on behalf of users must maintain auditable logs of their decisions. A public receipt for every payment, refusal, or skip creates accountability and enables objective dispute resolution." },
];

function seedIfEmpty(db: Database.Database) {
  const count = (db.prepare("SELECT COUNT(*) as n FROM sources").get() as { n: number }).n;
  if (count > 0) return;
  const stmt = db.prepare(`
    INSERT INTO sources (id, title, url, creator_name, creator_handle, payout_wallet,
      content_hash, description, price, bond, bonded, active, on_chain_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);
  const insertMany = db.transaction((rows: typeof SEED_SOURCES) => {
    for (const s of rows) {
      stmt.run(uuidv4(), s.title, s.url, s.creatorName, s.creatorHandle,
        s.payoutWallet, s.contentHash, s.description, s.price, s.bond,
        s.bond > 0 ? 1 : 0, s.onChainId);
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
      paid_count, refused_count, skip_count, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    s.id, s.title, s.url, s.creatorName, s.creatorHandle, s.payoutWallet,
    s.contentHash, s.metadataURI || "", s.description || "", s.price, s.bond, s.bonded ? 1 : 0,
    s.reputation, s.paidCount, s.refusedCount, s.skipCount, s.active ? 1 : 0,
    s.createdAt
  );
}

export function getAllSources(): Source[] {
  return getDb().prepare("SELECT * FROM sources WHERE active = 1 ORDER BY reputation DESC, paid_count DESC").all().map((r) => rowToSource(r as Record<string, unknown>));
}

export function getSourceById(id: string): Source | null {
  const row = getDb().prepare("SELECT * FROM sources WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToSource(row) : null;
}

export function updateSourceStats(id: string, decision: "PAY" | "REFUSE" | "SKIP" | "BLOCKED_BY_POLICY"): void {
  const db = getDb();
  if (decision === "PAY") {
    db.prepare("UPDATE sources SET paid_count = paid_count + 1, reputation = reputation + 1 WHERE id = ?").run(id);
  } else if (decision === "REFUSE") {
    db.prepare("UPDATE sources SET refused_count = refused_count + 1, reputation = reputation - 1 WHERE id = ?").run(id);
  } else {
    // SKIP and BLOCKED_BY_POLICY: no reputation change
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
  };
}

// ─── Receipts ─────────────────────────────────────────────────────────────────

export function insertReceipt(r: Receipt): void {
  getDb().prepare(`
    INSERT INTO receipts (id, source_id, query_id, agent_address, creator_wallet,
      decision, query, query_hash, source_title, source_url, amount_paid,
      evidence_hash, evidence_preimage, content_hash_at_decision, scores, reason,
      tx_hash, payment_status, policy_profile, policy_rules_passed, policy_rules_failed,
      policy_reason, budget_before, budget_after, challenged, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    r.id, r.sourceId, r.queryId, r.agentAddress, r.creatorWallet,
    r.decision, r.query, r.queryHash, r.sourceTitle, r.sourceUrl, r.amountPaid,
    r.evidenceHash, JSON.stringify(r.evidencePreimage), r.contentHashAtDecision,
    JSON.stringify(r.scores), r.reason, r.txHash, r.paymentStatus ?? null,
    r.policyProfile ?? null,
    r.policyRulesPassed ? JSON.stringify(r.policyRulesPassed) : null,
    r.policyRulesFailed ? JSON.stringify(r.policyRulesFailed) : null,
    r.policyReason ?? null,
    r.budgetBefore, r.budgetAfter, r.challenged ? 1 : 0, r.createdAt
  );
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

export function getReceiptsByQueryId(queryId: string): Receipt[] {
  return getDb().prepare("SELECT * FROM receipts WHERE query_id = ? ORDER BY created_at DESC").all(queryId).map((r) => rowToReceipt(r as Record<string, unknown>));
}

export function getAllReceipts(limit = 50): Receipt[] {
  return getDb().prepare("SELECT * FROM receipts ORDER BY created_at DESC LIMIT ?").all(limit).map((r) => rowToReceipt(r as Record<string, unknown>));
}

export function markReceiptChallenged(id: string): void {
  getDb().prepare("UPDATE receipts SET challenged = 1 WHERE id = ?").run(id);
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
    budgetBefore: r.budget_before as number,
    budgetAfter: r.budget_after as number,
    challenged: Boolean(r.challenged),
    createdAt: r.created_at as string,
    onChainReceiptId: (r.on_chain_receipt_id as number | null) ?? null,
    onChainTxHash: (r.on_chain_tx_hash as string | null) ?? null,
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
    avgPaymentPerCitation: paidCitations > 0 ? Math.round(totalUSDCRouted / paidCitations) : 0,
    shareCardsGenerated,
    shareCardsOpened,
    challengeCount,
    activeAgents,
    agentReputation,
  };
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
