import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { Source, Receipt, QueryRecord } from "@/types";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "citepay.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  migrate(_db);
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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

export function updateSourceStats(id: string, decision: "PAY" | "REFUSE" | "SKIP"): void {
  const db = getDb();
  if (decision === "PAY") {
    db.prepare("UPDATE sources SET paid_count = paid_count + 1, reputation = reputation + 1 WHERE id = ?").run(id);
  } else if (decision === "REFUSE") {
    db.prepare("UPDATE sources SET refused_count = refused_count + 1, reputation = reputation - 1 WHERE id = ?").run(id);
  } else {
    db.prepare("UPDATE sources SET skip_count = skip_count + 1 WHERE id = ?").run(id);
  }
}

export function updateSourceHash(id: string, newHash: string): void {
  getDb().prepare("UPDATE sources SET content_hash = ? WHERE id = ?").run(newHash, id);
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
  };
}

// ─── Receipts ─────────────────────────────────────────────────────────────────

export function insertReceipt(r: Receipt): void {
  getDb().prepare(`
    INSERT INTO receipts (id, source_id, query_id, agent_address, creator_wallet,
      decision, query, query_hash, source_title, source_url, amount_paid,
      evidence_hash, evidence_preimage, content_hash_at_decision, scores, reason,
      tx_hash, budget_before, budget_after, challenged, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    r.id, r.sourceId, r.queryId, r.agentAddress, r.creatorWallet,
    r.decision, r.query, r.queryHash, r.sourceTitle, r.sourceUrl, r.amountPaid,
    r.evidenceHash, JSON.stringify(r.evidencePreimage), r.contentHashAtDecision,
    JSON.stringify(r.scores), r.reason, r.txHash, r.budgetBefore, r.budgetAfter,
    r.challenged ? 1 : 0, r.createdAt
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
    budgetBefore: r.budget_before as number,
    budgetAfter: r.budget_after as number,
    challenged: Boolean(r.challenged),
    createdAt: r.created_at as string,
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
  const challengeCount = (db.prepare("SELECT COUNT(*) as c FROM receipts WHERE challenged = 1").get() as { c: number }).c;
  const activeAgents = (db.prepare("SELECT COUNT(DISTINCT agent_address) as c FROM queries WHERE status = 'completed'").get() as { c: number }).c;

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
    challengeCount,
    activeAgents,
  };
}

export function recordShareCard(receiptId: string, creatorWallet: string): string {
  const { v4: uuidv4 } = require("uuid");
  const id = uuidv4();
  getDb().prepare("INSERT INTO share_cards (id, receipt_id, creator_wallet) VALUES (?, ?, ?)").run(id, receiptId, creatorWallet);
  incrementTraction("share_cards_generated");
  return id;
}
