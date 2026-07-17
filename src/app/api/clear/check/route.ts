import { NextRequest, NextResponse } from "next/server";
import { authenticateClearApiRequest, CLEAR_SCOPE_CLEAR_CHECK, hasClearApiScope } from "@/lib/clear/auth";
import { runClearCheck } from "@/lib/clear/check";
import { clearCheckRateLimiter as _checkRateLimit } from "@/lib/clear/rate-limiters";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await authenticateClearApiRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!hasClearApiScope(auth.auth, CLEAR_SCOPE_CLEAR_CHECK)) {
    return NextResponse.json({ error: "Clear API key is not scoped for clear checks." }, { status: 403 });
  }

  const rl = _checkRateLimit(auth.auth.keyHash);
  if (!rl.allowed) {
    const res = NextResponse.json({ error: rl.reason }, { status: 429 });
    if (rl.retryAfterMs) {
      res.headers.set("Retry-After", String(Math.ceil(rl.retryAfterMs / 1000)));
    }
    return res;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await runClearCheck(body, auth.auth, req.nextUrl.origin);
  return NextResponse.json(result.body, { status: result.status });
}
