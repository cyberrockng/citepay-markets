import { NextRequest, NextResponse } from "next/server";
import { reseedDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/seed
 * Resets SQLite to the canonical 10-source seed set — useful for demo resets.
 * Requires X-Seed-Key header matching SEED_KEY env var (or AGENT_PRIVATE_KEY as fallback).
 */
export async function POST(req: NextRequest) {
  const providedKey = req.headers.get("x-seed-key") ?? req.headers.get("x-api-key");
  const expectedKey = process.env.SEED_KEY ?? process.env.AGENT_PRIVATE_KEY;

  if (expectedKey && providedKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized — provide X-Seed-Key header" }, { status: 401 });
  }

  const { sourcesInserted } = reseedDb();
  return NextResponse.json({
    ok: true,
    message: `Database reset — ${sourcesInserted} sources seeded`,
    sourcesInserted,
  });
}

/** GET /api/seed — health check (no auth needed, no mutation) */
export async function GET() {
  return NextResponse.json({
    info: "POST /api/seed with X-Seed-Key header to reset the demo database",
  });
}
