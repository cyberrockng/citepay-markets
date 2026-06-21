import { NextResponse } from "next/server";
import { getDCWWalletInfo, isDCWEnabled } from "@/lib/circle-dcw";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDCWEnabled()) {
    return NextResponse.json({ enabled: false, wallet: null });
  }
  const wallet = await getDCWWalletInfo();
  return NextResponse.json({ enabled: true, wallet });
}
