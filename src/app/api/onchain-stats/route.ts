import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem } from "viem";
import { ARC_RPC, ARC_USDC, PAYMENT_RECEIVER } from "@/lib/x402";

export const dynamic = "force-dynamic";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const;

// Cache so we don't hammer the RPC on every traction poll
let cache: { data: OnChainStats; ts: number } | null = null;
const CACHE_TTL_MS = 30_000;

interface OnChainStats {
  paidCitations: number;
  totalUSDCMicro: number;
  uniqueCreators: number;
  agentWallet: string;
  explorerUrl: string;
  lastUpdated: string;
}

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) });

    const logs = await client.getLogs({
      address: ARC_USDC as `0x${string}`,
      event: TRANSFER_EVENT,
      args: { from: PAYMENT_RECEIVER },
      fromBlock: 0n,
    });

    const recipients = new Set<string>();
    let totalMicro = 0n;

    for (const log of logs) {
      const to = (log.args as { to?: string }).to;
      const value = (log.args as { value?: bigint }).value ?? 0n;
      if (to) recipients.add(to.toLowerCase());
      totalMicro += value;
    }

    const data: OnChainStats = {
      paidCitations: logs.length,
      totalUSDCMicro: Number(totalMicro),
      uniqueCreators: recipients.size,
      agentWallet: PAYMENT_RECEIVER,
      explorerUrl: `https://testnet.arcscan.app/address/${PAYMENT_RECEIVER}`,
      lastUpdated: new Date().toISOString(),
    };

    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "RPC error", detail: String(err) },
      { status: 502 }
    );
  }
}
