/**
 * Subscription pass — pay $0.01 once, get 10 queries within 48 hours.
 *
 * Token is HMAC-SHA256(secret, passId) — unforgeable without the server key.
 * Stored in SQLite (fast) + Neon (durable across cold starts).
 */

import { createHmac } from "crypto";
import { getDb } from "@/lib/db";
import { neon } from "@neondatabase/serverless";

export const PASS_QUERIES   = 10;
export const PASS_TTL_HOURS = 48;
export const PASS_PRICE_MICRO = 10_000; // $0.01

const PASS_SECRET = process.env.SUBSCRIPTION_SECRET ?? "citepay-pass-secret-default";

function sign(id: string): string {
  return createHmac("sha256", PASS_SECRET).update(id).digest("hex");
}

// ─── SQLite schema (added via migration) ─────────────────────────────────────

export function ensurePassTable() {
  try {
    getDb().exec(`
      CREATE TABLE IF NOT EXISTS subscription_passes (
        id                TEXT PRIMARY KEY,
        token             TEXT NOT NULL UNIQUE,
        agent_address     TEXT NOT NULL DEFAULT '',
        queries_remaining INTEGER NOT NULL DEFAULT ${PASS_QUERIES},
        expires_at        TEXT NOT NULL,
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        amount_micro      INTEGER NOT NULL DEFAULT ${PASS_PRICE_MICRO},
        tx_hash           TEXT
      )
    `);
  } catch { /* already exists */ }
}

// ─── Create ───────────────────────────────────────────────────────────────────

export interface PassRecord {
  id: string;
  token: string;
  agentAddress: string;
  queriesRemaining: number;
  expiresAt: string;
  createdAt: string;
  amountMicro: number;
  txHash: string | null;
}

export function createPass(agentAddress: string, txHash: string | null): PassRecord {
  ensurePassTable();
  const { v4: uuidv4 } = require("uuid") as { v4: () => string };
  const id = uuidv4();
  const token = sign(id);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PASS_TTL_HOURS * 3600 * 1000).toISOString();
  const createdAt = now.toISOString();

  getDb().prepare(`
    INSERT INTO subscription_passes
      (id, token, agent_address, queries_remaining, expires_at, created_at, amount_micro, tx_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, token, agentAddress, PASS_QUERIES, expiresAt, createdAt, PASS_PRICE_MICRO, txHash);

  // Durable write to Neon — fire-and-forget
  void persistPassToNeon({ id, token, agentAddress, queriesRemaining: PASS_QUERIES, expiresAt, createdAt, amountMicro: PASS_PRICE_MICRO, txHash });

  return { id, token, agentAddress, queriesRemaining: PASS_QUERIES, expiresAt, createdAt, amountMicro: PASS_PRICE_MICRO, txHash };
}

// ─── Validate + consume ───────────────────────────────────────────────────────

export interface ConsumeResult {
  valid: boolean;
  queriesRemaining: number;
  reason?: string;
}

export function validateAndConsume(token: string): ConsumeResult {
  ensurePassTable();
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM subscription_passes WHERE token = ?"
  ).get(token) as Record<string, unknown> | undefined;

  if (!row) return { valid: false, queriesRemaining: 0, reason: "unknown token" };

  const remaining = row.queries_remaining as number;
  const expiresAt = new Date(row.expires_at as string);

  if (new Date() > expiresAt) return { valid: false, queriesRemaining: 0, reason: "pass expired" };
  if (remaining <= 0)         return { valid: false, queriesRemaining: 0, reason: "no queries remaining" };

  db.prepare(
    "UPDATE subscription_passes SET queries_remaining = queries_remaining - 1 WHERE token = ?"
  ).run(token);

  // Sync to Neon
  void decrementNeonPass(token);

  return { valid: true, queriesRemaining: remaining - 1 };
}

// ─── Status (no consume) ─────────────────────────────────────────────────────

export function getPassStatus(token: string): PassRecord | null {
  ensurePassTable();
  const row = getDb().prepare(
    "SELECT * FROM subscription_passes WHERE token = ?"
  ).get(token) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id:               row.id as string,
    token:            row.token as string,
    agentAddress:     row.agent_address as string,
    queriesRemaining: row.queries_remaining as number,
    expiresAt:        row.expires_at as string,
    createdAt:        row.created_at as string,
    amountMicro:      row.amount_micro as number,
    txHash:           row.tx_hash as string | null,
  };
}

// ─── Neon durability ─────────────────────────────────────────────────────────

function getNeonSql() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

async function persistPassToNeon(p: PassRecord) {
  const sql = getNeonSql();
  if (!sql) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS cp_passes (
        id                TEXT PRIMARY KEY,
        token             TEXT NOT NULL UNIQUE,
        agent_address     TEXT NOT NULL DEFAULT '',
        queries_remaining INTEGER NOT NULL DEFAULT ${PASS_QUERIES},
        expires_at        TIMESTAMPTZ NOT NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        amount_micro      INTEGER NOT NULL DEFAULT ${PASS_PRICE_MICRO},
        tx_hash           TEXT
      )
    `;
    await sql`
      INSERT INTO cp_passes (id, token, agent_address, queries_remaining, expires_at, created_at, amount_micro, tx_hash)
      VALUES (${p.id}, ${p.token}, ${p.agentAddress}, ${p.queriesRemaining}, ${p.expiresAt}, ${p.createdAt}, ${p.amountMicro}, ${p.txHash})
      ON CONFLICT (id) DO NOTHING
    `;
  } catch (err) {
    console.error("[subscription] persistPassToNeon failed:", String(err).slice(0, 100));
  }
}

async function decrementNeonPass(token: string) {
  const sql = getNeonSql();
  if (!sql) return;
  try {
    await sql`
      UPDATE cp_passes SET queries_remaining = queries_remaining - 1
      WHERE token = ${token} AND queries_remaining > 0
    `;
  } catch { /* non-critical */ }
}

export async function getNeonPassStatus(token: string): Promise<PassRecord | null> {
  const sql = getNeonSql();
  if (!sql) return null;
  try {
    const rows = await sql`SELECT * FROM cp_passes WHERE token = ${token}` as Record<string, unknown>[];
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id:               r.id as string,
      token:            r.token as string,
      agentAddress:     r.agent_address as string,
      queriesRemaining: Number(r.queries_remaining),
      expiresAt:        String(r.expires_at),
      createdAt:        String(r.created_at),
      amountMicro:      Number(r.amount_micro),
      txHash:           r.tx_hash as string | null,
    };
  } catch { return null; }
}
