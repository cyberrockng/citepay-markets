import { NextRequest, NextResponse } from "next/server";
import { getSourceById, getReceiptsBySourceId, updateSourceHash } from "@/lib/db";
import { contentHashFromText } from "@/lib/evidence";
import { fetchAndHash, verifyContentHash } from "@/lib/content-hash";

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

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  // Manual content hash update (legacy — used by source detail page textarea)
  if (body.action === "update-hash" && body.content) {
    const newHash = contentHashFromText(String(body.content));
    updateSourceHash(id, newHash);
    return NextResponse.json({ success: true, newHash, previousHash: source.contentHash });
  }

  // Live URL fetch + re-hash
  if (body.action === "refresh-hash") {
    const fetched = await fetchAndHash(source.url);
    const changed = fetched.hash !== source.contentHash;
    if (changed) updateSourceHash(id, fetched.hash);
    return NextResponse.json({
      success:        true,
      action:         "refresh-hash",
      previousHash:   source.contentHash,
      newHash:        fetched.hash,
      changed,
      contentLength:  fetched.contentLength,
      fetchSource:    fetched.source,
      fetchedAt:      fetched.fetchedAt,
      fetchError:     fetched.error ?? null,
    });
  }

  // Verify current URL against stored hash (non-mutating)
  if (body.action === "verify") {
    const result = await verifyContentHash({
      url:        source.url,
      storedHash: source.contentHash,
      label:      source.title,
    });
    return NextResponse.json({
      sourceId:      id,
      sourceTitle:   source.title,
      sourceUrl:     source.url,
      storedHash:    source.contentHash,
      liveHash:      result.liveHash,
      verdict:       result.verdict,
      verdictDetail: result.verdictDetail,
      verified:      result.verified,
      contentLength: result.contentLength,
      fetchedAt:     result.fetchedAt,
      fetchError:    result.fetchError ?? null,
    });
  }

  return NextResponse.json({ error: "Unknown action. Valid: update-hash, refresh-hash, verify" }, { status: 400 });
}
