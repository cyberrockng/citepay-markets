import { NextResponse } from "next/server";
import { getRecentMissedCitations } from "@/lib/outreach";

export const dynamic = "force-dynamic";

export async function GET() {
  const citations = await getRecentMissedCitations(30);
  return NextResponse.json({ citations });
}
