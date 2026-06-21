import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const entries = getLeaderboard(50);
    return NextResponse.json({ entries, count: entries.length });
  } catch {
    return NextResponse.json({ entries: [], count: 0 });
  }
}
