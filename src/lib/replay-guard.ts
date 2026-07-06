/**
 * Replay guard for x402 payment signatures and DirectTransfer tx hashes.
 * Persisted to Neon Postgres so it survives Lambda cold starts.
 * In-memory map acts as a hot-path cache within a single instance.
 */

import { createHmac } from "crypto";
import { neon } from "@neondatabase/serverless";
import { isExplicitDevModeEnabled } from "./env-gates";

const TTL_MS = 600_000; // 10 minutes
const _seen = new Map<string, number>(); // hot cache: fingerprint → timestamp

let _sql: ReturnType<typeof neon> | null = null;
let _tableReady = false;

function getHmacSecret(): string {
  if (process.env.REPLAY_GUARD_SECRET) return process.env.REPLAY_GUARD_SECRET;
  if (isExplicitDevModeEnabled()) return "citepay-replay-guard-dev-only";
  throw new Error("REPLAY_GUARD_SECRET is required outside explicit dev mode");
}

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!_sql) _sql = neon(url);
  return _sql;
}

async function ensureTable() {
  if (_tableReady) return;
  const sql = getSql();
  if (!sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS cp_replay (
      fingerprint TEXT PRIMARY KEY,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS cp_replay_recorded_at ON cp_replay (recorded_at)
  `;
  _tableReady = true;
}

function fingerprint(sig: string): string {
  return createHmac("sha256", getHmacSecret()).update(sig).digest("hex");
}

function pruneMemory(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [fp, ts] of _seen) {
    if (ts < cutoff) _seen.delete(fp);
  }
}

/** Returns true if this signature/tx hash has been seen within the TTL window. */
export async function isReplayed(paymentSignature: string): Promise<boolean> {
  pruneMemory();
  const fp = fingerprint(paymentSignature);

  // Hot cache hit
  if (_seen.has(fp)) return true;

  // Neon check
  const sql = getSql();
  if (!sql) return false;
  try {
    await ensureTable();
    const cutoff = new Date(Date.now() - TTL_MS).toISOString();
    const rows = await sql`
      SELECT 1 FROM cp_replay
      WHERE fingerprint = ${fp} AND recorded_at > ${cutoff}
      LIMIT 1
    ` as unknown[];
    if (rows.length > 0) {
      _seen.set(fp, Date.now()); // populate hot cache
      return true;
    }
  } catch (err) {
    console.error("[replay-guard] isReplayed check failed:", String(err).slice(0, 120));
  }
  return false;
}

/** Records a payment signature as used. Call only after successful verification. */
export async function recordSignature(paymentSignature: string): Promise<void> {
  const fp = fingerprint(paymentSignature);
  _seen.set(fp, Date.now());

  const sql = getSql();
  if (!sql) return;
  try {
    await ensureTable();
    await sql`
      INSERT INTO cp_replay (fingerprint) VALUES (${fp})
      ON CONFLICT (fingerprint) DO UPDATE SET recorded_at = NOW()
    `;
    // Prune expired rows opportunistically
    const cutoff = new Date(Date.now() - TTL_MS).toISOString();
    void sql`DELETE FROM cp_replay WHERE recorded_at < ${cutoff}`.catch(() => {});
  } catch (err) {
    console.error("[replay-guard] recordSignature failed:", String(err).slice(0, 120));
  }
}
