import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") || 8), 20);
  try {
    const rows = getDb().prepare(`
      SELECT r.id, r.decision, r.source_title, r.amount_paid, r.tx_hash,
             r.created_at, r.agent_address, r.reason, r.scores,
             s.creator_handle, s.creator_name
      FROM receipts r
      LEFT JOIN sources s ON s.id = r.source_id
      ORDER BY r.created_at DESC LIMIT ?
    `).all(limit) as Record<string, unknown>[];

    const events = rows.map((r) => ({
      id:            r.id,
      decision:      r.decision,
      sourceTitle:   r.source_title,
      amountPaid:    r.amount_paid,
      txHash:        r.tx_hash,
      timestamp:     r.created_at,
      agentAddress:  r.agent_address,
      reason:        r.reason,
      score:         (() => { try { return (JSON.parse(r.scores as string) as Record<string,number>).total ?? 0; } catch { return 0; } })(),
      creatorHandle: r.creator_handle ?? null,
      creatorName:   r.creator_name  ?? null,
    }));
    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ events: [] });
  }
}
