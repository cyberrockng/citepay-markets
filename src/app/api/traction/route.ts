import { NextResponse } from "next/server";
import { getFullTractionStats } from "@/lib/db";
import { getRedisTotals } from "@/lib/redis-stats";

export const dynamic = "force-dynamic";

export async function GET() {
  const [sqlite, redis] = await Promise.all([
    Promise.resolve(getFullTractionStats()),
    getRedisTotals(),
  ]);

  // Redis is the source of truth for cumulative counters (survives cold starts).
  // SQLite has live counts for this instance — take the higher of the two so we
  // never show a number smaller than what Redis recorded historically.
  const stats = redis
    ? {
        ...sqlite,
        totalQueries:        Math.max(sqlite.totalQueries,     redis.totalQueries),
        totalDecisions:      Math.max(sqlite.totalDecisions,   redis.totalDecisions),
        paidCitations:       Math.max(sqlite.paidCitations,    redis.paidCitations),
        refusals:            Math.max(sqlite.refusals,         redis.refusals),
        skips:               Math.max(sqlite.skips,            redis.skips),
        totalUSDCRouted:     Math.max(sqlite.totalUSDCRouted,  redis.totalUSDCMicro / 1e6),
        shareCardsGenerated: Math.max(sqlite.shareCardsGenerated, redis.shareCardsGenerated),
        shareCardsOpened:    Math.max(sqlite.shareCardsOpened,    redis.shareCardsOpened),
        challengeCount:      Math.max(sqlite.challengeCount,      redis.challengeCount),
        avgPaymentPerCitation: redis.paidCitations > 0
          ? Math.round((redis.totalUSDCMicro / 1e6) / redis.paidCitations * 1e6) / 1e6
          : sqlite.avgPaymentPerCitation,
      }
    : sqlite;

  return NextResponse.json({ stats, generatedAt: new Date().toISOString() });
}
