import { NextRequest, NextResponse } from "next/server";
import { sha256 } from "./evidence";

// ── Arc Testnet constants ──────────────────────────────────────────────────
export const ARC_CHAIN_ID     = 5042002;
export const ARC_NETWORK      = `eip155:${ARC_CHAIN_ID}`;
export const ARC_USDC         = "0x3600000000000000000000000000000000000000";
export const ARC_GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
export const ARC_RPC          = "https://rpc.testnet.arc.network";
export const ARC_EXPLORER     = "https://testnet.arcscan.app";

// Query fee — upto scheme: buyer signs a max budget, CitePay charges per source cited.
// Min = 1 source at $0.001. Max = 10 sources at $0.001 each = $0.01.
export const QUERY_FEE_USDC      = 0.001;
export const QUERY_FEE_MICRO     = Math.round(QUERY_FEE_USDC * 1_000_000); // 1000 micro-USDC (min)
export const QUERY_FEE_MAX_MICRO = 10_000; // $0.01 — buyer-signed ceiling for upto scheme
export const QUERY_FEE_PER_SOURCE_MICRO = 1_000; // $0.001 per paid source
export const PAYMENT_RECEIVER = (
  process.env.AGENT_WALLET_ADDRESS || "0x5389688243328c26a92b301faEEAb5fbf9AFf105"
) as `0x${string}`;

/** Compute actual charge based on number of sources cited — upto dynamic pricing. */
export function computeActualCharge(sourcesCharged: number): number {
  return Math.max(QUERY_FEE_MICRO, Math.min(sourcesCharged * QUERY_FEE_PER_SOURCE_MICRO, QUERY_FEE_MAX_MICRO));
}

function buildPaymentRequirements() {
  return {
    scheme: "exact" as const, // Circle Gateway requires exact — upto is surfaced in response metadata
    network: ARC_NETWORK,
    asset: ARC_USDC,
    amount: String(QUERY_FEE_MICRO), // buyer pays minimum upfront; actual charge returned in response
    payTo: PAYMENT_RECEIVER,
    maxTimeoutSeconds: 345600,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: ARC_GATEWAY_WALLET,
      pricing: "upto",
      minChargeMicro: QUERY_FEE_MICRO,
      maxChargeMicro: QUERY_FEE_MAX_MICRO,
      chargePerSourceMicro: QUERY_FEE_PER_SOURCE_MICRO,
    },
  };
}

/**
 * Return HTTP 402 with Circle Gateway payment requirements.
 * Header: PAYMENT-REQUIRED (base64 JSON) — consumed by GatewayClient.
 */
export function build402Response(resource: string): NextResponse {
  const requirements = buildPaymentRequirements();
  const paymentRequired = {
    x402Version: 2,
    resource: {
      url: resource,
      description:
        "Pay $0.001 USDC nanopayment to run a CitePay citation query on Arc.",
      mimeType: "application/json",
    },
    accepts: [requirements],
  };

  return new NextResponse(
    JSON.stringify({
      error: "Payment Required",
      message:
        "POST /api/ask requires a $0.001 USDC nanopayment via Circle Gateway on Arc testnet.",
      paymentRequired,
      arc: {
        network: ARC_NETWORK,
        usdc: ARC_USDC,
        gatewayWallet: ARC_GATEWAY_WALLET,
        explorer: ARC_EXPLORER,
      },
    }),
    {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(paymentRequired)).toString("base64"),
        "X-Payment-Required": "true",
      },
    }
  );
}

/**
 * Verify a Circle Gateway nanopayment.
 *
 * Primary path: `payment-signature` header (base64 JSON) verified via
 *   BatchFacilitatorClient from @circle-fin/x402-batching/server.
 *
 * Fallback (dev/demo): `X-PAYMENT` header accepted in dev mode so
 *   the web UI demo still works without a funded Gateway wallet.
 */
export async function verifyGatewayPayment(req: NextRequest): Promise<{
  valid: boolean;
  txHash?: string;
  payer?: string;
  error?: string;
}> {
  const paymentSignature = req.headers.get("payment-signature");
  const legacyPayment    = req.headers.get("X-PAYMENT") || req.headers.get("x-payment");

  // Dev fallback: X-PAYMENT for web UI / curl demos.
  // Explicitly blocked in production even if X402_DEV_MODE is set — prevents accidental bypass.
  const devMode =
    (process.env.NODE_ENV === "development" || process.env.X402_DEV_MODE === "true") &&
    process.env.VERCEL_ENV !== "production";
  if (devMode && legacyPayment && !paymentSignature) {
    const fakeTx = `0x${sha256(legacyPayment + Date.now()).substring(0, 64)}`;
    return { valid: true, txHash: fakeTx };
  }

  if (!paymentSignature) {
    return { valid: false, error: "Missing payment-signature header" };
  }

  try {
    const { BatchFacilitatorClient } = await import(
      "@circle-fin/x402-batching/server"
    );
    const gatewayUrl = process.env.CIRCLE_GATEWAY_URL ?? "https://gateway-api-testnet.circle.com";
    const facilitator   = new BatchFacilitatorClient({ url: gatewayUrl });
    const requirements  = buildPaymentRequirements();
    const paymentPayload = JSON.parse(
      Buffer.from(paymentSignature, "base64").toString("utf-8")
    );

    const verifyResult = await facilitator.verify(paymentPayload, requirements);
    if (!verifyResult.isValid) {
      return { valid: false, error: `Gateway verify: ${verifyResult.invalidReason ?? "Verification failed"}` };
    }

    const settleResult = await facilitator.settle(paymentPayload, requirements);
    if (!settleResult.success) {
      return { valid: false, error: settleResult.errorReason ?? "Settlement failed" };
    }

    return {
      valid: true,
      txHash: settleResult.transaction ?? undefined,
      payer:  settleResult.payer ?? verifyResult.payer ?? undefined,
    };
  } catch (err) {
    return { valid: false, error: String(err) };
  }
}
