import { NextRequest, NextResponse } from "next/server";
import { getClearancesForWallet } from "@/lib/clear/creator-clearances";
import { clearGetRateLimiter, getClientIp } from "@/lib/clear/rate-limiters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const rl = clearGetRateLimiter(getClientIp(req));
  if (!rl.allowed) {
    const res = NextResponse.json({ error: rl.reason }, { status: 429 });
    if (rl.retryAfterMs) res.headers.set("Retry-After", String(Math.ceil(rl.retryAfterMs / 1000)));
    return res;
  }

  const { wallet } = await params;
  const clearances = await getClearancesForWallet(wallet, req.nextUrl.origin);
  return NextResponse.json({ wallet, clearances });
}
