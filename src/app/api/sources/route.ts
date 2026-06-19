import { NextResponse } from "next/server";
import { getAllSources } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const sources = getAllSources();
  return NextResponse.json({ sources, count: sources.length });
}
