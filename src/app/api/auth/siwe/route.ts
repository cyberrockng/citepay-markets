import { NextRequest, NextResponse } from "next/server";
import { SiweMessage } from "siwe";
import { nonceStore } from "../nonce/route";

export const dynamic = "force-dynamic";

function safeError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  let body: { message?: string; signature?: string; sessionId?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const { message, signature, sessionId } = body;
  if (!message || !signature || !sessionId) {
    console.warn("[auth/siwe] Missing message, signature, or sessionId");
    return safeError("Wallet sign-in request is incomplete. Try connecting again.", 400);
  }

  const stored = nonceStore.get(sessionId);
  if (!stored || stored.expiresAt < Date.now()) {
    console.warn("[auth/siwe] Expired or invalid nonce");
    return safeError("Wallet sign-in expired. Try connecting again.", 401);
  }

  try {
    const siweMessage = new SiweMessage(message);
    const result      = await siweMessage.verify({ signature, nonce: stored.nonce });

    if (!result.success) {
      console.warn("[auth/siwe] Verification failed");
      return safeError("Wallet signature could not be verified.", 401);
    }

    nonceStore.delete(sessionId);

    return NextResponse.json({
      success: true,
      address: siweMessage.address,
      chainId: siweMessage.chainId,
    });
  } catch (err) {
    console.error("[auth/siwe] Verification threw:", err);
    return safeError("Wallet sign-in could not be completed.", 401);
  }
}
