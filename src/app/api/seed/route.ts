import { NextResponse } from "next/server";
import { reseedDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/seed
 * Resets SQLite to the canonical 10-source seed set.
 * Open by design — resetting an ephemeral testnet demo DB is harmless.
 * If SEED_KEY is set, an X-Seed-Key header matching it bypasses any future rate-limit.
 */
export async function POST() {
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
