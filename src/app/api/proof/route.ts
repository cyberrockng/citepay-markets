import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10),
    100
  );

  const db = getDb();
  const rows = db.prepare(`
    SELECT id, source_title, creator_wallet, amount_paid, payment_status,
           tx_hash, on_chain_receipt_id, evidence_hash, created_at
    FROM receipts
    WHERE decision = 'PAY' AND payment_status = 'confirmed'
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as {
    id: string;
    source_title: string;
    creator_wallet: string;
    amount_paid: number;
    payment_status: string;
    tx_hash: string | null;
    on_chain_receipt_id: number | null;
    evidence_hash: string;
    created_at: string;
  }[];

  const receipts = rows.map((r) => ({
    receiptId: r.id,
    sourceTitle: r.source_title,
    creatorWallet: r.creator_wallet,
    amountPaid: r.amount_paid,
    paymentStatus: r.payment_status,
    txHash: r.tx_hash,
    onChainReceiptId: r.on_chain_receipt_id,
    evidenceHash: r.evidence_hash,
    createdAt: r.created_at,
    arcScanUrl: r.tx_hash ? `https://testnet.arcscan.app/tx/${r.tx_hash}` : null,
  }));

  const totalUSDC = rows.reduce((s, r) => s + (r.amount_paid ?? 0), 0);

  return NextResponse.json({
    summary: {
      confirmedCount: receipts.length,
      totalUSDC,
      generatedAt: new Date().toISOString(),
    },
    receipts,
  });
}
