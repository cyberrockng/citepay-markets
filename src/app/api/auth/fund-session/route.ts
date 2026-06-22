/**
 * POST /api/auth/fund-session
 *
 * Funds a browser-generated session EOA with exactly QUERY_FEE_MICRO micro-USDC
 * so the browser can sign and settle one real x402 payment without the server
 * ever holding the session key.
 *
 * Rate-limited: one session fund per verified SIWE address per cold-start window
 * (in-memory set — fine for hackathon demo).
 */
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { payCreator } from "@/lib/payments";
import { QUERY_FEE_MICRO } from "@/lib/x402";

export const dynamic = "force-dynamic";

const funded = new Set<string>(); // session EOA addresses funded this instance

export async function POST(req: NextRequest) {
  let body: { sessionAddress?: string; siweAddress?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const { sessionAddress, siweAddress } = body;

  if (!sessionAddress || !isAddress(sessionAddress)) {
    return NextResponse.json({ error: "sessionAddress must be a valid EVM address" }, { status: 400 });
  }
  if (!siweAddress || !isAddress(siweAddress)) {
    return NextResponse.json({ error: "siweAddress required — complete SIWE first" }, { status: 401 });
  }
  if (funded.has(sessionAddress.toLowerCase())) {
    return NextResponse.json({ alreadyFunded: true, message: "Session EOA already funded" });
  }

  try {
    const result = await payCreator({
      creatorWallet:   sessionAddress,
      amountMicroUsdc: QUERY_FEE_MICRO,
      sourceId:        "session-fund",
      receiptId:       `fund-${Date.now()}`,
    });

    funded.add(sessionAddress.toLowerCase());

    return NextResponse.json({
      success: true,
      txHash: result.txHash,
      amountMicroUsdc: QUERY_FEE_MICRO,
      sessionAddress,
      status: result.status,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
