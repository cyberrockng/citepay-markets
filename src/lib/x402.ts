import { NextRequest, NextResponse } from "next/server";
import { sha256 } from "./evidence";
import { isReplayed, recordSignature } from "./replay-guard";

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

function buildGatewayRequirements() {
  return {
    scheme: "exact" as const,
    network: ARC_NETWORK,
    asset: ARC_USDC,
    amount: String(QUERY_FEE_MICRO),
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

function buildDirectTransferRequirements() {
  return {
    scheme: "exact" as const,
    network: ARC_NETWORK,
    asset: ARC_USDC,
    amount: String(QUERY_FEE_MICRO),
    payTo: PAYMENT_RECEIVER,
    maxTimeoutSeconds: 600,
    extra: {
      name: "DirectTransfer",
      version: "1",
      header: "X-Arc-Tx-Hash",
      description: `Send ≥${QUERY_FEE_MICRO} micro-USDC (${QUERY_FEE_USDC} USDC) to payTo on Arc Testnet, then include the confirmed tx hash in the X-Arc-Tx-Hash header. Tx must be confirmed within 10 minutes.`,
    },
  };
}

// Keep a single-source alias for the primary scheme
function buildPaymentRequirements() { return buildGatewayRequirements(); }

/**
 * Return HTTP 402 advertising both payment schemes:
 *   1. GatewayWalletBatched — Circle Gateway (primary, for x402 clients)
 *   2. DirectTransfer       — raw Arc USDC tx + X-Arc-Tx-Hash header (for any EVM agent)
 */
export function build402Response(resource: string): NextResponse {
  const paymentRequired = {
    x402Version: 2,
    resource: {
      url: resource,
      description: "Pay $0.001 USDC to run a CitePay citation query on Arc Testnet.",
      mimeType: "application/json",
    },
    accepts: [
      buildGatewayRequirements(),
      buildDirectTransferRequirements(),
    ],
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

/**
 * Verify a direct Arc USDC transfer payment.
 *
 * The payer sends USDC to PAYMENT_RECEIVER on Arc Testnet, then includes
 * the confirmed tx hash in the `X-Arc-Tx-Hash` request header.
 *
 * Checks:
 *   - Tx exists and succeeded on Arc Testnet
 *   - Has a USDC Transfer log to PAYMENT_RECEIVER of ≥ QUERY_FEE_MICRO
 *   - Block timestamp is within the last 10 minutes
 *   - Tx hash has not been replayed
 */
export async function verifyDirectPayment(req: NextRequest): Promise<{
  valid: boolean;
  txHash?: string;
  payer?: string;
  error?: string;
}> {
  const txHash =
    req.headers.get("X-Arc-Tx-Hash") ??
    req.headers.get("x-arc-tx-hash") ??
    "";

  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return { valid: false, error: "Missing or malformed X-Arc-Tx-Hash header (expect 0x + 64 hex chars)" };
  }

  if (isReplayed(txHash)) {
    return { valid: false, error: "Tx hash already used — each payment is single-use" };
  }

  try {
    // 1. Fetch tx receipt
    const receiptRes = await fetch(ARC_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash] }),
      signal: AbortSignal.timeout(8_000),
    });
    const { result: receipt } = await receiptRes.json() as { result: {
      status: string; blockNumber: string;
      logs: Array<{ address: string; topics: string[]; data: string }>;
    } | null };

    if (!receipt) return { valid: false, error: "Transaction not found or not yet confirmed on Arc" };
    if (receipt.status !== "0x1") return { valid: false, error: "Transaction reverted on-chain" };

    // 2. Verify recency via block timestamp
    const blockRes = await fetch(ARC_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_getBlockByNumber", params: [receipt.blockNumber, false] }),
      signal: AbortSignal.timeout(8_000),
    });
    const { result: block } = await blockRes.json() as { result: { timestamp: string } | null };
    const blockTs = parseInt(block?.timestamp ?? "0", 16);
    const nowSec  = Math.floor(Date.now() / 1000);
    if (nowSec - blockTs > 600) {
      return { valid: false, error: "Transaction is older than 10 minutes — submit a fresh payment" };
    }

    // 3. Scan logs for USDC Transfer(from, to=PAYMENT_RECEIVER, amount≥fee)
    const TRANSFER_SIG = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const receiverTopic = ("0x000000000000000000000000" + PAYMENT_RECEIVER.slice(2)).toLowerCase();

    let totalAmount = 0;
    let payer: string | undefined;

    for (const log of receipt.logs ?? []) {
      if (
        log.address.toLowerCase() === ARC_USDC.toLowerCase() &&
        log.topics[0]?.toLowerCase() === TRANSFER_SIG &&
        log.topics[2]?.toLowerCase() === receiverTopic
      ) {
        totalAmount += parseInt(log.data || "0x0", 16);
        if (log.topics[1]) payer = ("0x" + log.topics[1].slice(26)).toLowerCase();
      }
    }

    if (totalAmount < QUERY_FEE_MICRO) {
      return {
        valid: false,
        error: `Payment too small: received ${totalAmount} micro-USDC, need ≥${QUERY_FEE_MICRO} ($${QUERY_FEE_USDC})`,
      };
    }

    recordSignature(txHash);
    return { valid: true, txHash, payer };

  } catch (err) {
    return { valid: false, error: `Arc RPC error: ${String(err)}` };
  }
}
