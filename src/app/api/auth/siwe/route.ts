import { NextRequest, NextResponse } from "next/server";
import { SiweMessage } from "siwe";
import { nonceStore } from "../nonce/route";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { message?: string; signature?: string; sessionId?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const { message, signature, sessionId } = body;
  if (!message || !signature || !sessionId) {
    return NextResponse.json({ error: "message, signature, and sessionId required" }, { status: 400 });
  }

  const stored = nonceStore.get(sessionId);
  if (!stored || stored.expiresAt < Date.now()) {
    return NextResponse.json({ error: "Nonce expired or invalid" }, { status: 401 });
  }

  try {
    const siweMessage = new SiweMessage(message);
    const result      = await siweMessage.verify({ signature, nonce: stored.nonce });

    if (!result.success) {
      return NextResponse.json({ error: "SIWE verification failed" }, { status: 401 });
    }

    nonceStore.delete(sessionId);

    return NextResponse.json({
      success: true,
      address: siweMessage.address,
      chainId: siweMessage.chainId,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 401 });
  }
}
