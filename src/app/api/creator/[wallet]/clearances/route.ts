import { NextRequest, NextResponse } from "next/server";
import { getClearancesForWallet } from "@/lib/clear/creator-clearances";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  const clearances = await getClearancesForWallet(wallet, req.nextUrl.origin);
  return NextResponse.json({ wallet, clearances });
}
