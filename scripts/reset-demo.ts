/**
 * Reset demo state for a clean final submission run.
 * Keeps all 10 seeded sources (preserving on_chain_id).
 * Clears all receipts, queries, share cards, and traction counters.
 * Resets source stats to neutral (rep 0, counts 0).
 *
 * Run: npx tsx scripts/reset-demo.ts
 * Then: visit /demo once to generate fresh live activity
 */
import Database from "better-sqlite3";
import { resolve } from "path";

const db = new Database(resolve(process.cwd(), "data/citepay.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const reset = db.transaction(() => {
  // Clear all activity history
  const receipts    = db.prepare("DELETE FROM receipts").run();
  const queries     = db.prepare("DELETE FROM queries").run();
  const shareCards  = db.prepare("DELETE FROM share_cards").run();

  // Reset source stats to neutral — keep sources and on_chain_id
  const sources = db.prepare(`
    UPDATE sources
    SET reputation   = 0,
        paid_count   = 0,
        refused_count = 0,
        skip_count   = 0
  `).run();

  // Reset traction counters
  db.prepare("UPDATE traction SET value = 0").run();

  // Remove any agent reputation keys from previous runs
  db.prepare("DELETE FROM traction WHERE key LIKE 'agent_rep_%'").run();

  return { receipts: receipts.changes, queries: queries.changes, shareCards: shareCards.changes, sources: sources.changes };
});

const result = reset();

console.log("✓ Reset complete");
console.log(`  Receipts cleared:   ${result.receipts}`);
console.log(`  Queries cleared:    ${result.queries}`);
console.log(`  Share cards cleared: ${result.shareCards}`);
console.log(`  Sources reset:      ${result.sources}`);
console.log();
console.log("Next: visit /demo and click 'Start Demo' once for a fresh live run.");
