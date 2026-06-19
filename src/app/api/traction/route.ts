import { NextResponse } from "next/server";
import { getFullTractionStats } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = getFullTractionStats();
  return NextResponse.json({ stats, generatedAt: new Date().toISOString() });
}
