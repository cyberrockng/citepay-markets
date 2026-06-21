import { NextRequest, NextResponse } from "next/server";
import { getAllSources } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category") ?? undefined;
  const sources = getAllSources(category);
  return NextResponse.json({ sources, count: sources.length });
}
