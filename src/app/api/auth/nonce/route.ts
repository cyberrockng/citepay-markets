import { NextResponse } from "next/server";
import { generateNonce } from "siwe";

// In-memory nonce store: address → nonce (fine for demo; resets on cold start)
export const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();

export const dynamic = "force-dynamic";

export async function GET() {
  const nonce     = generateNonce();
  const sessionId = crypto.randomUUID();
  nonceStore.set(sessionId, { nonce, expiresAt: Date.now() + 5 * 60 * 1000 });

  return NextResponse.json({ nonce, sessionId });
}
