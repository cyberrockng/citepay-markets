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

    // Arc RPC caps eth_getLogs at 10,000 blocks per request — scan in chunks.
    // Agent wallet first got USDC on Jun 21 2026 (block ~48,010,000 on Arc testnet).
    const latestBlock = await client.getBlockNumber();
    const START_BLOCK = 48_000_000n; // safe start before first bridge
    const CHUNK = 9_000n;
    const logs: Awaited<ReturnType<typeof client.getLogs>> = [];

    for (let from = START_BLOCK; from <= latestBlock; from += CHUNK + 1n) {
      const to = from + CHUNK < latestBlock ? from + CHUNK : latestBlock;
      const chunk = await client.getLogs({
        address: ARC_USDC as `0x${string}`,
        event: TRANSFER_EVENT,
        args: { from: PAYMENT_RECEIVER },
        fromBlock: from,
        toBlock: to,
      });
      logs.push(...chunk);
    }

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
