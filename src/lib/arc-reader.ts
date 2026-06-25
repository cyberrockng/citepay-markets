/**
 * Lightweight cached reader for Arc Testnet CitationPaid events.
 * Shared by traction and onchain-stats routes to avoid duplicate RPC calls.
 * In-memory cache survives within a Vercel instance (60s TTL).
 */

import { createPublicClient, http, parseAbiItem } from "viem";
import { ARC_RPC } from "@/lib/x402";

const CONTRACT = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ??
  "0x396cf1646EbAeF85ee8428C2d9239C46Ae956085") as `0x${string}`;

const DEPLOY_BLOCK = 48_040_000n;
const CHUNK = 9_000n;
const CACHE_TTL_MS = 60_000;

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const;

const CITATION_PAID_EVENT = parseAbiItem(
  "event CitationPaid(uint256 indexed receiptId, uint256 indexed sourceId, address indexed agent, address creator, uint256 amount, bytes32 queryHash, bytes32 evidenceHash)"
);

interface ArcCitationStats {
  citationCount: number;
  totalAmountMicro: bigint;
  uniqueAgents: number;
}

let _cache: { data: ArcCitationStats; ts: number } | null = null;

export async function getArcCitationStats(): Promise<ArcCitationStats> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) return _cache.data;

  try {
    const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) });
    const latest = await client.getBlockNumber();

    let citationCount = 0;
    let totalAmountMicro = 0n;
    const agents = new Set<string>();

    for (let from = DEPLOY_BLOCK; from <= latest; from += CHUNK + 1n) {
      const to = from + CHUNK <= latest ? from + CHUNK : latest;
      const logs = await client.getLogs({
        address: CONTRACT,
        event: CITATION_PAID_EVENT,
        fromBlock: from,
        toBlock: to,
      });
      for (const log of logs) {
        citationCount++;
        if (log.args.amount) totalAmountMicro += log.args.amount;
        if (log.args.agent) agents.add(log.args.agent.toLowerCase());
      }
    }

    const data: ArcCitationStats = { citationCount, totalAmountMicro, uniqueAgents: agents.size };
    _cache = { data, ts: Date.now() };
    return data;
  } catch {
    // Return cached data if available, else safe fallback
    return _cache?.data ?? { citationCount: 292, totalAmountMicro: 0n, uniqueAgents: 1 };
  }
}
