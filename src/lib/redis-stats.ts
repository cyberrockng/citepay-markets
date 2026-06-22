/**
 * Persistent traction counters via Upstash Redis.
 * Layered on top of ephemeral SQLite — Redis survives cold starts, SQLite doesn't.
 * All functions are fail-open: if Redis isn't configured, they silently no-op.
 */

import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

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

export async function redisIncrQuery() {
  const r = getRedis();
  if (!r) return;
  await r.incr(REDIS_KEYS.totalQueries).catch(() => {});
}

export async function redisIncrDecision(decision: "PAY" | "REFUSE" | "SKIP" | "BLOCKED_BY_POLICY", amountMicro = 0) {
  const r = getRedis();
  if (!r) return;
  const pipe = r.pipeline();
  pipe.incr(REDIS_KEYS.totalDecisions);
  if (decision === "PAY") {
    pipe.incr(REDIS_KEYS.paidCitations);
    if (amountMicro > 0) pipe.incrbyfloat(REDIS_KEYS.totalUSDCMicro, amountMicro);
  } else if (decision === "REFUSE" || decision === "BLOCKED_BY_POLICY") {
    pipe.incr(REDIS_KEYS.refusals);
  } else if (decision === "SKIP") {
    pipe.incr(REDIS_KEYS.skips);
  }
  await pipe.exec().catch(() => {});
}

export async function redisIncrShareCard() {
  const r = getRedis();
  if (!r) return;
  await r.incr(REDIS_KEYS.shareCards).catch(() => {});
}

export async function redisIncrShareOpened() {
  const r = getRedis();
  if (!r) return;
  await r.incr(REDIS_KEYS.shareOpened).catch(() => {});
}

export async function redisIncrChallenge() {
  const r = getRedis();
  if (!r) return;
  await r.incr(REDIS_KEYS.challengeCount).catch(() => {});
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
  const r = getRedis();
  if (!r) return null;
  try {
    const keys = Object.values(REDIS_KEYS);
    const vals = await r.mget<(number | null)[]>(...keys);
    const n = (v: number | null) => Number(v ?? 0);
    return {
      totalQueries:      n(vals[0]),
      totalDecisions:    n(vals[1]),
      paidCitations:     n(vals[2]),
      refusals:          n(vals[3]),
      skips:             n(vals[4]),
      totalUSDCMicro:    n(vals[5]),
      shareCardsGenerated: n(vals[6]),
      shareCardsOpened:  n(vals[7]),
      challengeCount:    n(vals[8]),
    };
  } catch {
    return null;
  }
}

// ── Per-source reputation (survives cold starts) ──────────────────────────────

export async function redisIncrSourcePaid(sourceId: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.hincrby("citepay:source:paid", sourceId, 1).catch(() => {});
}

export async function redisIncrSourceRefused(sourceId: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.hincrby("citepay:source:refused", sourceId, 1).catch(() => {});
}

export async function getRedisSourceCounts(): Promise<{ paid: Record<string, number>; refused: Record<string, number> } | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const [paid, refused] = await Promise.all([
      r.hgetall("citepay:source:paid"),
      r.hgetall("citepay:source:refused"),
    ]);
    const toNum = (obj: Record<string, unknown> | null): Record<string, number> => {
      if (!obj) return {};
      return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, Number(v) || 0]));
    };
    return { paid: toNum(paid as Record<string, unknown> | null), refused: toNum(refused as Record<string, unknown> | null) };
  } catch {
    return null;
  }
}
