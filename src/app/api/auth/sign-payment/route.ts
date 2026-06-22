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

export async function POST(req: NextRequest) {
  if (!isCircleSessionEnabled()) {
    return NextResponse.json({ error: "Circle session wallets not configured" }, { status: 503 });
  }

  let body: { walletId?: string; walletAddress?: string; siweAddress?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const { walletId, walletAddress, siweAddress } = body;

  if (!walletId || typeof walletId !== "string") {
    return NextResponse.json({ error: "walletId required" }, { status: 400 });
  }
  if (!walletAddress || !isAddress(walletAddress)) {
    return NextResponse.json({ error: "walletAddress must be a valid EVM address" }, { status: 400 });
  }
  if (!siweAddress || !isAddress(siweAddress)) {
    return NextResponse.json({ error: "siweAddress required — complete SIWE first" }, { status: 401 });
  }

  try {
    const paymentSignature = await signSessionPayment(walletId, walletAddress);
    return NextResponse.json({ paymentSignature });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
