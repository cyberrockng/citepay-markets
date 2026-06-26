import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getNeonTotals } from "@/lib/neon";
import { getArcCitationStats } from "@/lib/arc-reader";

export const dynamic = "force-dynamic";

export async function GET() {
  const [neon, arcStats] = await Promise.all([
    getNeonTotals(),
    getArcCitationStats(),
  ]);

  // ── SQLite live data ──────────────────────────────────────────────────────
  let perSource: Array<{ sourceTitle: string; sourceUrl: string; earnedMicro: number; citations: number; creatorWallet: string }> = [];
  let perAgent:  Array<{ agentAddress: string; paidMicro: number; citations: number }> = [];
  let recentPayments: Array<{ sourceTitle: string; agentAddress: string; creatorWallet: string; amountMicro: number; txHash: string | null; createdAt: string }> = [];
  let sqliteTotalMicro = 0;
  let sqlitePaid = 0;
  let sqliteRefusals = 0;
  let sqliteSkips = 0;

  try {
    const db = getDb();

    const totRow = db.prepare(`
      SELECT
        SUM(CASE WHEN decision='PAY' THEN amount_paid ELSE 0 END) AS paid_micro,
        COUNT(CASE WHEN decision='PAY' THEN 1 END)    AS paid_count,
        COUNT(CASE WHEN decision='REFUSE' THEN 1 END) AS refusal_count,
        COUNT(CASE WHEN decision='SKIP' THEN 1 END)   AS skip_count
      FROM receipts
    `).get() as { paid_micro: number | null; paid_count: number; refusal_count: number; skip_count: number };

    sqliteTotalMicro = totRow.paid_micro ?? 0;
    sqlitePaid       = totRow.paid_count;
    sqliteRefusals   = totRow.refusal_count;
    sqliteSkips      = totRow.skip_count;

    perSource = (db.prepare(`
      SELECT
        source_title  AS sourceTitle,
        source_url    AS sourceUrl,
        creator_wallet AS creatorWallet,
        SUM(amount_paid)  AS earnedMicro,
        COUNT(*)          AS citations
      FROM receipts
      WHERE decision = 'PAY'
      GROUP BY source_title, creator_wallet
      ORDER BY earnedMicro DESC
      LIMIT 20
    `).all() as Array<{ sourceTitle: string; sourceUrl: string; creatorWallet: string; earnedMicro: number; citations: number }>);

    perAgent = (db.prepare(`
      SELECT
        agent_address AS agentAddress,
        SUM(amount_paid) AS paidMicro,
        COUNT(*)         AS citations
      FROM receipts
      WHERE decision = 'PAY'
      GROUP BY agent_address
      ORDER BY paidMicro DESC
      LIMIT 10
    `).all() as Array<{ agentAddress: string; paidMicro: number; citations: number }>);

    recentPayments = (db.prepare(`
      SELECT
        source_title   AS sourceTitle,
        agent_address  AS agentAddress,
        creator_wallet AS creatorWallet,
        amount_paid    AS amountMicro,
        tx_hash        AS txHash,
        created_at     AS createdAt
      FROM receipts
      WHERE decision = 'PAY'
      ORDER BY created_at DESC
      LIMIT 20
    `).all() as Array<{ sourceTitle: string; agentAddress: string; creatorWallet: string; amountMicro: number; txHash: string | null; createdAt: string }>);
  } catch { /* cold start — Neon + Arc data still shows */ }

  // ── Merge: take authoritative max for headline numbers ────────────────────
  const paidCitations = Math.max(sqlitePaid, neon?.paidCitations ?? 0, arcStats.citationCount);
  const totalMicro    = Math.max(sqliteTotalMicro, neon?.totalPaidMicro ?? 0, Number(arcStats.totalAmountMicro));
  const refusals      = Math.max(sqliteRefusals, neon?.refusals ?? 0);
  const skips         = Math.max(sqliteSkips, neon?.skips ?? 0);
  const totalDecisions = paidCitations + refusals + skips;
  const payRate       = totalDecisions > 0 ? ((paidCitations / totalDecisions) * 100).toFixed(1) : "0.0";
  const avgMicro      = paidCitations > 0 ? totalMicro / paidCitations : 0;

  return NextResponse.json({
    headline: {
      totalUSDC:    totalMicro / 1e6,
      paidCitations,
      refusals,
      skips,
      totalDecisions,
      payRate,
      avgPerCitation: avgMicro / 1e6,
      uniqueCreators: Math.max(arcStats.uniqueCreators, neon?.creatorsPaid ?? 0),
      uniqueAgents:   arcStats.uniqueAgents,
    },
    perSource,
    perAgent,
    recentPayments,
    sources: {
      neon:    neon != null,
      arc:     arcStats.citationCount > 0,
      sqlite:  sqlitePaid > 0,
    },
    generatedAt: new Date().toISOString(),
  }, {
    headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" },
  });
}
