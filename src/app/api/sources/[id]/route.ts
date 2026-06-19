import { NextRequest, NextResponse } from "next/server";
import { getSourceById, getReceiptsBySourceId, updateSourceHash } from "@/lib/db";
import { contentHashFromText } from "@/lib/evidence";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const source = getSourceById(id);
  if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });
  const receipts = getReceiptsBySourceId(id);
  const paid = receipts.filter((r) => r.decision === "PAY");
  const totalEarned = paid.reduce((s, r) => s + r.amountPaid, 0);
  return NextResponse.json({ source, receipts, totalEarned });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const source = getSourceById(id);
  if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (body.action === "update-hash" && body.content) {
    const newHash = contentHashFromText(String(body.content));
    updateSourceHash(id, newHash);
    return NextResponse.json({ success: true, newHash, previousHash: source.contentHash });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
