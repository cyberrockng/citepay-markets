import { NextRequest, NextResponse } from "next/server";
import { GatewayClient } from "@circle-fin/x402-batching/client";

export const dynamic = "force-dynamic";

// Deterministic demo buyer wallet (testnet only, funded via agent depositFor)
const DEMO_BUYER_KEY: `0x${string}` =
  (process.env.DEMO_BUYER_KEY as `0x${string}`) ??
  "0x1111111111111111111111111111111111111111111111111111111111111111";

const AGENT_KEY  = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
const MIN_BALANCE_MICRO = 5_000n;   // 0.005 USDC — refill below this
const REFILL_AMOUNT     = "0.05";   // amount to deposit when low

/**
 * POST /api/demo-query
 *
 * Web-UI demo endpoint: uses a pre-funded demo buyer wallet to pay
 * /api/ask via real Circle Gateway, then proxies the result back.
 * No client-side wallet needed.
 */
export async function POST(req: NextRequest) {
  let body: { query?: string; budget?: number; policy?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const query = (body.query ?? "").trim();
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const buyerClient = new GatewayClient({ chain: "arcTestnet", privateKey: DEMO_BUYER_KEY });

  // Auto-refill if demo buyer balance is low
  const balances = await buyerClient.getBalances();
  if (balances.gateway.available < MIN_BALANCE_MICRO && AGENT_KEY) {
    try {
      const agentClient = new GatewayClient({ chain: "arcTestnet", privateKey: AGENT_KEY });
      await agentClient.depositFor(REFILL_AMOUNT, buyerClient.address);
    } catch (e) {
      console.error("[demo-query] auto-refill failed:", e);
    }
  }

  // Determine the absolute URL for /api/ask
  const host = req.headers.get("host") ?? "citepay-markets.vercel.app";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const askUrl = `${proto}://${host}/api/ask`;

  let payResult: Awaited<ReturnType<typeof buyerClient.pay<unknown>>>;
  try {
    payResult = await buyerClient.pay<unknown>(askUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        budget: body.budget ?? 0.05,
        policy:  body.policy ?? "balanced",
      }),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Demo payment failed", detail: (err as Error).message },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ...payResult.data as object,
    _demo: {
      paidViaGateway: true,
      amountMicro: payResult.amount.toString(),
      formattedAmount: payResult.formattedAmount,
      settleTx: payResult.transaction || null,
      buyerAddress: buyerClient.address,
    },
  });
}
