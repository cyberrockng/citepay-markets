import { NextRequest, NextResponse } from "next/server";
import { getQueryById, getReceiptsByQueryId } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ queryId: string }> }) {
  const { queryId } = await params;
  const query = getQueryById(queryId);
  if (!query) return NextResponse.json({ error: "Query not found" }, { status: 404 });
  const receipts = getReceiptsByQueryId(queryId);
  return NextResponse.json({ query, receipts });
}
