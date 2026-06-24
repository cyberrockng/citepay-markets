import { NextResponse } from "next/server";
import { getIntelligenceStats } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(getIntelligenceStats());
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
