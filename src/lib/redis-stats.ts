/**
 * Persistent traction counters via Vercel Edge Config.
 * Drop-in replacement for the Upstash Redis layer — same exported function signatures.
 *
 * Architecture:
 *   - In-memory accumulator per serverless instance (fast, no I/O on every call)
 *   - Flushes to Edge Config via Vercel API after every PAY decision and every N ops
 *   - Reads from Edge Config on first call (cold-start recovery)
 *   - Fail-open: if Edge Config is not configured, everything silently no-ops
 */

const EC_CONN  = process.env.EDGE_CONFIG;    // e.g. https://edge-config.vercel.com/ecfg_xxx?token=yyy
const EC_ID    = process.env.EDGE_CONFIG_ID; // ecfg_xxx for write API calls
const API_TOK  = process.env.EC_API_TOKEN;   // Vercel API token for writes (EC_* prefix avoids Vercel reserved namespace)
const TEAM_ID  = process.env.EC_TEAM_ID;     // Vercel team ID for write API calls

function isConfigured(): boolean {
  return !!(EC_CONN && EC_ID && API_TOK);
}

// Build correct item URL: extract base+token from connection string, construct /item/{key}?token=
function ecItemUrl(key: string): string | null {
  if (!EC_CONN || !EC_ID) return null;
  try {
    const u = new URL(EC_CONN);
    const token = u.searchParams.get("token") ?? "";
    return `https://edge-config.vercel.com/${EC_ID}/item/${key}?token=${encodeURIComponent(token)}`;
  } catch { return null; }
}

// ── In-memory accumulator ─────────────────────────────────────────────────────

interface Counters {
  totalQueries: number;
  totalDecisions: number;
  paidCitations: number;
  refusals: number;
  skips: number;
  totalUSDCMicro: number;
  shareCardsGenerated: number;
  shareCardsOpened: number;
  challengeCount: number;
}

interface SourceCounts {
  paid: Record<string, number>;
  refused: Record<string, number>;
}

let _loaded = false;
let _dirty  = 0;   // ops since last flush
const _mem: Counters = {
  totalQueries: 0, totalDecisions: 0, paidCitations: 0,
  refusals: 0, skips: 0, totalUSDCMicro: 0,
  shareCardsGenerated: 0, shareCardsOpened: 0, challengeCount: 0,
};
const _src: SourceCounts = { paid: {}, refused: {} };

// ── Edge Config read (cold-start restore) ────────────────────────────────────

async function loadFromEC(): Promise<void> {
  if (_loaded || !isConfigured()) return;
  _loaded = true;
  try {
    const counterUrl = ecItemUrl("counters");
    const sourceUrl  = ecItemUrl("sourceCounts");
    if (counterUrl) {
      const r1 = await fetch(counterUrl);
      if (r1.ok) Object.assign(_mem, await r1.json() as Partial<Counters>);
    }
    if (sourceUrl) {
      const r2 = await fetch(sourceUrl);
      if (r2.ok) {
        const src = await r2.json() as Partial<SourceCounts>;
        if (src.paid)    Object.assign(_src.paid,    src.paid);
        if (src.refused) Object.assign(_src.refused, src.refused);
      }
    }
  } catch { /* fail-open */ }
}

// ── Edge Config write (flush accumulator) ────────────────────────────────────

async function flushToEC(): Promise<void> {
  if (!isConfigured()) return;
  _dirty = 0;
  const teamQ = TEAM_ID ? `?teamId=${TEAM_ID}` : "";
  try {
    await fetch(`https://api.vercel.com/v1/edge-config/${EC_ID}/items${teamQ}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${API_TOK}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          { operation: "upsert", key: "counters",     value: { ..._mem } },
          { operation: "upsert", key: "sourceCounts", value: { ..._src } },
        ],
      }),
    });
  } catch { /* fail-open */ }
}

// Flush after every PAY (important), or after 10 accumulated ops
async function maybeFlush(force = false): Promise<void> {
  _dirty++;
  if (force || _dirty >= 10) await flushToEC();
}

// ── Public API — same signatures as the Upstash Redis version ────────────────

export async function redisIncrQuery(): Promise<void> {
  await loadFromEC();
  _mem.totalQueries++;
  void maybeFlush();
}

export async function redisIncrDecision(
  decision: "PAY" | "REFUSE" | "SKIP" | "BLOCKED_BY_POLICY",
  amountMicro = 0
): Promise<void> {
  await loadFromEC();
  _mem.totalDecisions++;
  if (decision === "PAY") {
    _mem.paidCitations++;
    if (amountMicro > 0) _mem.totalUSDCMicro += amountMicro;
    await maybeFlush(true); // always flush on PAY — most important counter
  } else if (decision === "REFUSE" || decision === "BLOCKED_BY_POLICY") {
    _mem.refusals++;
    void maybeFlush();
  } else if (decision === "SKIP") {
    _mem.skips++;
    void maybeFlush();
  }
}

export async function redisIncrShareCard(): Promise<void> {
  await loadFromEC();
  _mem.shareCardsGenerated++;
  void maybeFlush();
}

export async function redisIncrShareOpened(): Promise<void> {
  await loadFromEC();
  _mem.shareCardsOpened++;
  void maybeFlush();
}

export async function redisIncrChallenge(): Promise<void> {
  await loadFromEC();
  _mem.challengeCount++;
  await maybeFlush(true); // flush challenges immediately
}

export async function redisIncrSourcePaid(sourceId: string): Promise<void> {
  await loadFromEC();
  _src.paid[sourceId] = (_src.paid[sourceId] ?? 0) + 1;
  void maybeFlush();
}

export async function redisIncrSourceRefused(sourceId: string): Promise<void> {
  await loadFromEC();
  _src.refused[sourceId] = (_src.refused[sourceId] ?? 0) + 1;
  void maybeFlush();
}

export async function getRedisSourceCounts(): Promise<{ paid: Record<string, number>; refused: Record<string, number> } | null> {
  if (!isConfigured()) return null;
  await loadFromEC();
  return { paid: { ..._src.paid }, refused: { ..._src.refused } };
}

export interface RedisTractionTotals {
  totalQueries: number;
  totalDecisions: number;
  paidCitations: number;
  refusals: number;
  skips: number;
  totalUSDCMicro: number;
  shareCardsGenerated: number;
  shareCardsOpened: number;
  challengeCount: number;
}

export async function getRedisTotals(): Promise<RedisTractionTotals | null> {
  if (!isConfigured()) return null;
  await loadFromEC();
  return { ..._mem };
}

// Keep REDIS_KEYS export for any code that references it (unused now but prevents import errors)
export const REDIS_KEYS = {
  totalQueries:     "citepay:totalQueries",
  totalDecisions:   "citepay:totalDecisions",
  paidCitations:    "citepay:paidCitations",
  refusals:         "citepay:refusals",
  skips:            "citepay:skips",
  totalUSDCMicro:   "citepay:totalUSDCMicro",
  shareCards:       "citepay:shareCardsGenerated",
  shareOpened:      "citepay:shareCardsOpened",
  challengeCount:   "citepay:challengeCount",
} as const;
