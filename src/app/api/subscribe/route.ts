/**
 * POST /api/subscribe  — buy a 10-query, 48-hour subscription pass for $0.01 USDC.
 * GET  /api/subscribe  — check pass status (pass token in X-Subscription-Token header).
 *
 * On payment → returns { token, queriesRemaining, expiresAt, paidUSDC }.
 * Token must be stored by the client and sent as X-Subscription-Token on /api/ask.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyGatewayPayment, ARC_NETWORK, ARC_USDC, ARC_GATEWAY_WALLET, PAYMENT_RECEIVER } from "@/lib/x402";
import { createPass, getPassStatus, getNeonPassStatus, PASS_QUERIES, PASS_TTL_HOURS, PASS_PRICE_MICRO } from "@/lib/subscription";
import { getAgentAddress } from "@/lib/agent";

export const dynamic = "force-dynamic";

function build402() {
  const requirements = {
    scheme: "exact" as const,
    network: ARC_NETWORK,
    asset: ARC_USDC,
    amount: String(PASS_PRICE_MICRO),
    payTo: PAYMENT_RECEIVER,
    maxTimeoutSeconds: 345600,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: ARC_GATEWAY_WALLET,
      description: `CitePay subscription pass — ${PASS_QUERIES} queries over ${PASS_TTL_HOURS}h`,
    },
  };
  return new NextResponse(
    JSON.stringify({
      error: "Payment Required",
      message: `Pay $${(PASS_PRICE_MICRO / 1_000_000).toFixed(2)} USDC to get ${PASS_QUERIES} citation queries valid for ${PASS_TTL_HOURS} hours.`,
      pass: { queries: PASS_QUERIES, validHours: PASS_TTL_HOURS, priceUSDC: PASS_PRICE_MICRO / 1_000_000 },
      paymentRequired: { x402Version: 2, accepts: [requirements] },
    }),
    { status: 402, headers: { "Content-Type": "application/json" } }
  );
}

// ── POST — buy a pass ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const hasPayment =
    req.headers.has("payment-signature") ||
    req.headers.has("X-PAYMENT") ||
    req.headers.has("x-payment");

  if (!hasPayment) return build402();

  const { valid, txHash, error: payError } = await verifyGatewayPayment(req);
  if (!valid) {
    return NextResponse.json({ error: "Payment verification failed", detail: payError }, { status: 402 });
  }

  const agentAddress = req.headers.get("X-Agent-Address") || getAgentAddress();
  const pass = createPass(agentAddress, txHash ?? null);

  return NextResponse.json({
    token:            pass.token,
    queriesRemaining: pass.queriesRemaining,
    expiresAt:        pass.expiresAt,
    validHours:       PASS_TTL_HOURS,
    paidUSDC:         PASS_PRICE_MICRO / 1_000_000,
    usage:            "Include X-Subscription-Token: <token> on POST /api/ask to use prepaid queries.",
  });
}

// ── GET — check pass status ───────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const token = req.headers.get("X-Subscription-Token") ?? req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json(
      { error: "Provide X-Subscription-Token header or ?token= query param" },
      { status: 400 }
    );
  }

  // Try SQLite first (fast), fall back to Neon (cross-instance)
  let pass = getPassStatus(token);
  if (!pass) pass = await getNeonPassStatus(token);
  if (!pass) return NextResponse.json({ error: "Pass not found" }, { status: 404 });

  const expiresAtMs = new Date(pass.expiresAt).getTime();
  const expired = new Date() > new Date(expiresAtMs);
  return NextResponse.json({
    token:            pass.token,
    queriesRemaining: expired ? 0 : pass.queriesRemaining,
    hoursLeft:        Math.max(0, Math.round((expiresAtMs - Date.now()) / 3_600_000)),
    expiresAt:        pass.expiresAt,
    expired,
    valid:            !expired && pass.queriesRemaining > 0,
    paidUSDC:         pass.amountMicro / 1_000_000,
    txHash:           pass.txHash,
  });
}
