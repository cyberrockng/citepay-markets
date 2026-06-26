import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getArcCitationEvents } from "@/lib/arc-reader";

export const dynamic = "force-dynamic";

const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x396cf1646EbAeF85ee8428C2d9239C46Ae956085";

export async function GET(req: NextRequest) {
  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10),
    500,
  );

  // Build SQLite lookup map: on_chain_receipt_id → receipt row
  const sqliteMap = new Map<number, {
    id: string;
    source_title: string;
    evidence_hash: string;
    created_at: string;
  }>();
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, source_title, evidence_hash, created_at, on_chain_receipt_id
      FROM receipts
      WHERE on_chain_receipt_id IS NOT NULL
    `).all() as { id: string; source_title: string; evidence_hash: string; created_at: string; on_chain_receipt_id: number }[];
    for (const r of rows) sqliteMap.set(r.on_chain_receipt_id, r);
  } catch { /* SQLite cold start — continue with on-chain only */ }

  let onChainSource = false;
  let receipts: Array<{
    receiptId: number;
    sourceId: number;
    agentAddress: string;
    creatorWallet: string;
    amountPaid: number;
    txHash: string;
    arcScanUrl: string;
    sourceTitle?: string;
    evidenceHash?: string;
    sqliteReceiptId?: string;
    createdAt?: string;
  }> = [];

  try {
    // Uses shared 60s cache — no duplicate RPC scans across routes
    const events = await getArcCitationEvents();
    onChainSource = events.length > 0;

    receipts = events
      .slice(-limit)
      .reverse()
      .map((e) => {
        const sqlite = sqliteMap.get(e.receiptId);
        return {
          receiptId: e.receiptId,
          sourceId: e.sourceId,
          agentAddress: e.agentAddress,
          creatorWallet: e.creatorWallet,
          amountPaid: e.amountMicro / 1e6,
          txHash: e.txHash,
          arcScanUrl: `https://testnet.arcscan.app/tx/${e.txHash}`,
          ...(sqlite ? {
            sourceTitle: sqlite.source_title,
            evidenceHash: sqlite.evidence_hash,
            sqliteReceiptId: sqlite.id,
            createdAt: sqlite.created_at,
          } : {}),
        };
      });
  } catch {
    // RPC unavailable — fall back to SQLite confirmed rows
    try {
      const db = getDb();
      const rows = db.prepare(`
        SELECT id, source_title, creator_wallet, amount_paid, tx_hash,
               on_chain_receipt_id, evidence_hash, created_at
        FROM receipts
        WHERE decision = 'PAY' AND payment_status = 'confirmed'
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit) as {
        id: string; source_title: string; creator_wallet: string; amount_paid: number;
        tx_hash: string | null; on_chain_receipt_id: number | null;
        evidence_hash: string; created_at: string;
      }[];
      receipts = rows.map((r) => ({
        receiptId: r.on_chain_receipt_id ?? 0,
        sourceId: 0,
        agentAddress: "",
        creatorWallet: r.creator_wallet,
        amountPaid: r.amount_paid,
        txHash: r.tx_hash ?? "",
        arcScanUrl: r.tx_hash ? `https://testnet.arcscan.app/tx/${r.tx_hash}` : "",
        sourceTitle: r.source_title,
        evidenceHash: r.evidence_hash,
        sqliteReceiptId: r.id,
        createdAt: r.created_at,
      }));
    } catch { /* nothing available */ }
  }

  const totalUSDC = receipts.reduce((s, r) => s + r.amountPaid, 0);

  return NextResponse.json({
    summary: {
      confirmedCount: receipts.length,
      totalUSDC,
      onChainSource,
      contractAddress: CONTRACT,
      explorerUrl: `https://testnet.arcscan.app/address/${CONTRACT}`,
      generatedAt: new Date().toISOString(),
    },
    receipts,
  }, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
  });
}
