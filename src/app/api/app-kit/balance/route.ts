import { NextResponse } from "next/server";
import { getAgentUnifiedBalance, isAppKitEnabled } from "@/lib/app-kit";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAppKitEnabled()) {
    return NextResponse.json({ enabled: false, wallet: null });
  }
  try {
    const wallet = await getAgentUnifiedBalance();
    return NextResponse.json({ enabled: true, wallet });
  } catch (e) {
    return NextResponse.json({ enabled: true, wallet: null, error: String(e) }, { status: 500 });
  }
}
