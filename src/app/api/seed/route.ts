import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { reseedDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/seed
 * Resets the local demo store to the canonical 10-source seed set.
 * Production requires SEED_KEY because receipts/history may be durable.
 */
export async function POST(req: NextRequest) {
  const seedKey = process.env.SEED_KEY;
  const isProduction = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";

  if (isProduction && !seedKey) {
    return NextResponse.json({ error: "seed_disabled" }, { status: 503 });
  }

  if (seedKey && req.headers.get("x-seed-key") !== seedKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
    info: "POST /api/seed resets the local demo database. Production requires X-Seed-Key.",
  });
}
