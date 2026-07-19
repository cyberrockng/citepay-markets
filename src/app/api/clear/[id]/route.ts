import { NextResponse } from "next/server";
import { getClearanceById } from "@/lib/clear/get-clearance";
import { clearGetRateLimiter, getClientIp } from "@/lib/clear/rate-limiters";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rl = await clearGetRateLimiter(getClientIp(req));
  if (!rl.allowed) {
    const res = NextResponse.json({ error: rl.reason }, { status: 429 });
    if (rl.retryAfterMs) res.headers.set("Retry-After", String(Math.ceil(rl.retryAfterMs / 1000)));
    return res;
  }

  const { id } = await params;
  const result = await getClearanceById(id);
  if (!result) {
    return NextResponse.json({ error: "Clearance not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}
