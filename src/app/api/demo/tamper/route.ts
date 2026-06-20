import { NextRequest, NextResponse } from "next/server";
import { getSourceById, updateSourceHash } from "@/lib/db";
import { sha256 } from "@/lib/evidence";

export const dynamic = "force-dynamic";

/**
 * POST /api/demo/tamper
 * Demo-only: changes a source's content hash to simulate a creator
 * editing their content after receiving payment — triggering the
 * objective challenge condition.
 */
export async function POST(req: NextRequest) {
  let body: { sourceId?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  const { sourceId } = body;
  if (!sourceId) {
    return NextResponse.json({ error: "sourceId required" }, { status: 400 });
  }

  const source = getSourceById(sourceId);
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  const oldHash = source.contentHash;
  const newHash = sha256(`tampered-by-creator:${sourceId}:${Date.now()}`);
  updateSourceHash(sourceId, newHash);

  return NextResponse.json({
    sourceId,
    sourceTitle: source.title,
    oldHash,
    newHash,
    message: "Content hash changed — objective challenge condition now met.",
  });
}
