import { NextResponse } from "next/server";
import { createPublicClient, http, erc20Abi } from "viem";
import { ARC_USDC, ARC_RPC } from "@/lib/x402";

export const dynamic = "force-dynamic";

const USDC_ADDRESS = (process.env.ARC_USDC_ADDRESS || ARC_USDC) as `0x${string}`;
const AGENT_ADDRESS = "0x5389688243328c26a92b301faEEAb5fbf9AFf105" as const;

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const;

export async function GET() {
  try {
    const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) });
    const balance = await client.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [AGENT_ADDRESS],
    });
    return NextResponse.json({
      address: AGENT_ADDRESS,
      network: "Arc Testnet (5042002)",
      balanceMicroUsdc: Number(balance),
      balanceUsdc: Number(balance) / 1_000_000,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
