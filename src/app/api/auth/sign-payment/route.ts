/**
 * POST /api/auth/sign-payment
 *
 * Signs an EIP-3009 payment authorization via Circle DCW's signTypedData endpoint.
 * Returns a base64 `payment-signature` identical in format to the browser EOA path,
 * so the existing BatchFacilitatorClient.verify() + settle() flow works unchanged.
 *
 * This is the key difference from the legacy session EOA flow:
 *   Legacy: browser calls account.signTypedData() with a raw private key in memory
 *   Circle: server calls client.signTypedData() via Circle's HSM — no key in browser
 */
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { signSessionPayment, isCircleSessionEnabled } from "@/lib/circle-session";

export const dynamic = "force-dynamic";

const ipWindows = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const WINDOW_MS = 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipWindows.get(ip);
  if (!entry || now > entry.resetAt) {
    ipWindows.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function getIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function safeError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  const ip = getIP(req);
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Rate limit: max 10 requests per minute per IP" }, { status: 429 });
  }
  if (!isCircleSessionEnabled()) {
    return NextResponse.json({ error: "Circle session wallets not configured" }, { status: 503 });
  }

  let body: { walletId?: string; walletAddress?: string; siweAddress?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const { walletId, walletAddress, siweAddress } = body;

  if (!walletId || typeof walletId !== "string") {
    console.warn("[auth/sign-payment] Missing walletId");
    return safeError("Payment session is not ready. Create a wallet session and try again.", 400);
  }
  if (!walletAddress || !isAddress(walletAddress)) {
    console.warn("[auth/sign-payment] Invalid walletAddress");
    return safeError("Payment wallet is invalid. Create a fresh wallet session and try again.", 400);
  }
  if (!siweAddress || !isAddress(siweAddress)) {
    console.warn("[auth/sign-payment] Missing or invalid siweAddress");
    return safeError("Complete wallet sign-in before requesting a payment signature.", 401);
  }

  try {
    const paymentSignature = await signSessionPayment(walletId, walletAddress);
    return NextResponse.json({ paymentSignature });
  } catch (err) {
    console.error("[auth/sign-payment] signSessionPayment failed:", err);
    return safeError("Payment signature could not be created. Try again with a fresh wallet session.", 500);
  }
}
