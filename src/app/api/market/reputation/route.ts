import { NextRequest, NextResponse } from "next/server";
import { getReputationForUrl } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url query parameter required" }, { status: 400 });
  }
  try {
    const rep = getReputationForUrl(url);
    if (!rep) {
      return NextResponse.json({
        url, found: false, trustScore: 0,
        citationCount: 0, paidCount: 0, refusedCount: 0,
        averageScore: null, lastCitedAt: null,
        pricePerCitation: null, creatorHandle: null,
        message: "No citation history for this URL",
      });
    }
    return NextResponse.json(rep);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
