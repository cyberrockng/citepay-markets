import { NextRequest, NextResponse } from "next/server";
import { sha256 } from "./evidence";

export const QUERY_FEE_USDC = 0.01; // $0.01 USDC to run a query
export const QUERY_FEE_MICRO = Math.round(QUERY_FEE_USDC * 1_000_000); // 10000 micro-USDC
export const PAYMENT_RECEIVER = process.env.AGENT_WALLET_ADDRESS || "0x5389688243328c26a92b301faEEAb5fbf9AFf105";
export const CHAIN_ID = 84532; // Base Sepolia

export interface X402PaymentHeader {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  outputSchema: null;
  extra: { name: string; version: string };
}

/**
 * Build the WWW-Authenticate header for x402 protocol.
 * Returns a 402 response with payment details.
 */
export function build402Response(resource: string): NextResponse {
  const paymentDetails: X402PaymentHeader = {
    scheme: "exact",
    network: `eip155:${CHAIN_ID}`,
    maxAmountRequired: String(QUERY_FEE_MICRO),
    resource,
    description: "Pay to run a CitePay query. The agent will search creator sources and pay citations on your behalf.",
    mimeType: "application/json",
    payTo: PAYMENT_RECEIVER,
    maxTimeoutSeconds: 300,
    asset: `eip155:${CHAIN_ID}/erc20:${process.env.USDC_CONTRACT_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e"}`,
    outputSchema: null,
    extra: { name: "CitePay Markets", version: "1.0" },
  };

  return new NextResponse(
    JSON.stringify({
      error: "Payment Required",
      message: "POST /api/ask requires a small USDC query fee via x402.",
      x402: paymentDetails,
    }),
    {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "X-Payment-Required": "true",
        "WWW-Authenticate": `x402 ${JSON.stringify(paymentDetails)}`,
      },
    }
  );
}

/**
 * Verify an x402 payment header from the request.
 * In production this calls Circle's payment verification API.
 * Returns { valid, txHash } or { valid: false, error }.
 */
export async function verifyX402Payment(req: NextRequest): Promise<{
  valid: boolean;
  txHash?: string;
  error?: string;
}> {
  const paymentHeader = req.headers.get("X-PAYMENT") || req.headers.get("x-payment");

  if (!paymentHeader) {
    return { valid: false, error: "Missing X-PAYMENT header" };
  }

  // Development mode: accept any non-empty payment header
  if (process.env.NODE_ENV === "development" || process.env.X402_DEV_MODE === "true") {
    const fakeTxHash = `0x${sha256(paymentHeader + Date.now()).substring(0, 64)}`;
    return { valid: true, txHash: fakeTxHash };
  }

  try {
    const payment = JSON.parse(paymentHeader);

    // Production: verify via Circle API
    if (process.env.CIRCLE_API_KEY) {
      const verifyRes = await fetch("https://api.circle.com/v1/w3s/payments/verify", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.CIRCLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment,
          expectedAmount: String(QUERY_FEE_MICRO),
          expectedRecipient: PAYMENT_RECEIVER,
          chainId: CHAIN_ID,
        }),
      });

      if (verifyRes.ok) {
        const data = await verifyRes.json();
        return { valid: true, txHash: data.txHash || payment.transaction?.hash };
      }
      return { valid: false, error: "Circle verification failed" };
    }

    // No Circle key: accept payment structure at face value (demo mode)
    return { valid: true, txHash: payment.transaction?.hash || `demo-${Date.now()}` };
  } catch (err) {
    return { valid: false, error: String(err) };
  }
}
