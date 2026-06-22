/**
 * POST /api/cctp/fund-creator
 *
 * Cross-chain creator payout via Circle CCTP v2.
 * Burns USDC on Arc Testnet and mints it on the creator's preferred destination
 * chain using Circle's Forwarder (gasless for the creator).
 *
 * Auth: Authorization: Bearer <REGISTER_API_KEY>
 *
 * Body:
 *   creatorWallet   string  — recipient EVM address
 *   amountMicroUsdc number  — amount in micro-USDC (1 USDC = 1_000_000)
 *   destChain       string? — destination chain (default: "Base_Sepolia")
 *   estimateOnly    bool?   — if true, returns fee estimate without sending
 *
 * GET /api/cctp/fund-creator
 *   Returns supported destination chains and CCTP metadata.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { cctpPayCreator, estimateCCTPFee, SUPPORTED_DEST_CHAINS, type SupportedDestChain } from "@/lib/cctp";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const key = req.headers.get("authorization")?.replace("Bearer ", "").trim();
  return !!key && key === process.env.REGISTER_API_KEY;
}

export async function GET() {
  return NextResponse.json({
    protocol: "Circle CCTP v2",
    sourceChain: "Arc_Testnet",
    supportedDestChains: SUPPORTED_DEST_CHAINS,
    forwarder: true,
    description:
      "Cross-chain creator payouts: burn USDC on Arc Testnet, mint on creator's preferred chain via Circle CCTP v2 + Forwarder",
    usage: {
      endpoint: "POST /api/cctp/fund-creator",
      auth: "Authorization: Bearer <REGISTER_API_KEY>",
      body: {
        creatorWallet: "0x… (recipient EVM address)",
        amountMicroUsdc: 1000,
        destChain: "Base_Sepolia",
        estimateOnly: false,
      },
    },
    circleSDK: "@circle-fin/unified-balance-kit — spend() + estimateSpend()",
    cctpDomain: { Arc_Testnet: 26, Base_Sepolia: 6, Ethereum_Sepolia: 0 },
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized — provide REGISTER_API_KEY as Bearer token" }, { status: 401 });
  }

  let body: {
    creatorWallet?: string;
    amountMicroUsdc?: number;
    destChain?: string;
    estimateOnly?: boolean;
  } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const { creatorWallet, amountMicroUsdc, estimateOnly = false } = body;
  const destChain = (body.destChain ?? "Base_Sepolia") as SupportedDestChain;

  if (!creatorWallet || !isAddress(creatorWallet)) {
    return NextResponse.json({ error: "creatorWallet must be a valid EVM address" }, { status: 400 });
  }
  if (!amountMicroUsdc || amountMicroUsdc < 1) {
    return NextResponse.json({ error: "amountMicroUsdc must be a positive integer" }, { status: 400 });
  }
  if (!SUPPORTED_DEST_CHAINS.includes(destChain)) {
    return NextResponse.json({
      error: `Unsupported destChain. Supported: ${SUPPORTED_DEST_CHAINS.join(", ")}`,
    }, { status: 400 });
  }
  if (destChain === "Arc_Testnet") {
    return NextResponse.json({
      error: "Same-chain: use POST /api/sources/register or direct USDC transfer instead of CCTP",
    }, { status: 400 });
  }

  try {
    if (estimateOnly) {
      const estimate = await estimateCCTPFee({ amountMicroUsdc, destChain });
      return NextResponse.json({ estimateOnly: true, ...estimate, destChain });
    }

    const result = await cctpPayCreator({ creatorWallet, amountMicroUsdc, destChain });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
