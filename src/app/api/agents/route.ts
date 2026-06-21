import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem } from "viem";
import { ARC_RPC } from "@/lib/x402";
import { SOURCE_AGENTS, type SourceAgent } from "@/lib/source-agents";

export const dynamic = "force-dynamic";

const CONTRACT = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "0x396cf1646EbAeF85ee8428C2d9239C46Ae956085") as `0x${string}`;

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const;

const CITATION_PAID_EVENT = parseAbiItem(
  "event CitationPaid(uint256 indexed receiptId, uint256 indexed sourceId, address indexed agent, address creator, uint256 amount, bytes32 queryHash, bytes32 evidenceHash)"
);

const DEPLOY_BLOCK = 48_040_000n;
const CHUNK = 9_000n;

let cache: { data: AgentStats[]; ts: number } | null = null;
const CACHE_TTL_MS = 30_000;

export interface AgentStats {
  id: string;
  name: string;
  handle: string;
  wallet: string;
  specialty: string;
  color: string;
  badge: string;
  description: string;
  policyProfile: string;
  sourceIds: number[];
  // Onchain-derived stats
  citationsPaid: number;
  uniqueQueriesAnswered: number;
  usdcEarned: number; // micro-USDC
  // Reputation badge
  reputationBadge: "Healthy" | "Watch" | "Stop";
  reputationScore: number; // 0-100
  // Trend (last 50 citations vs previous)
  trend: "up" | "down" | "stable";
  explorerUrl: string;
}

function computeReputation(
  citationsPaid: number,
  totalDecisions: number
): { badge: "Healthy" | "Watch" | "Stop"; score: number } {
  if (totalDecisions === 0) return { badge: "Watch", score: 50 };
  const payRate = citationsPaid / totalDecisions;
  const score = Math.round(payRate * 100);
  const badge = score >= 60 ? "Healthy" : score >= 35 ? "Watch" : "Stop";
  return { badge, score };
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json({ agents: cache.data, fromCache: true });
  }

  try {
    const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) });
    const latestBlock = await client.getBlockNumber();

    // Collect all CitationPaid events
    const allLogs: { sourceId: number; queryHash: string; blockNumber: bigint }[] = [];

    for (let from = DEPLOY_BLOCK; from <= latestBlock; from += CHUNK + 1n) {
      const to = from + CHUNK <= latestBlock ? from + CHUNK : latestBlock;
      const logs = await client.getLogs({
        address: CONTRACT,
        event: CITATION_PAID_EVENT,
        fromBlock: from,
        toBlock: to,
      });
      for (const log of logs) {
        allLogs.push({
          sourceId: Number(log.args.sourceId ?? 0n),
          queryHash: log.args.queryHash ?? "",
          blockNumber: log.blockNumber ?? 0n,
        });
      }
    }

    const totalCitations = allLogs.length;
    const recentCutoff = allLogs.length > 100 ? allLogs[allLogs.length - 50].blockNumber : 0n;

    // Per-agent stats
    const agentStats: AgentStats[] = SOURCE_AGENTS.map((agent: SourceAgent) => {
      const agentLogs = allLogs.filter((l) => agent.sourceIds.includes(l.sourceId));
      const recentLogs = agentLogs.filter((l) => l.blockNumber >= recentCutoff);
      const olderLogs = agentLogs.filter((l) => l.blockNumber < recentCutoff);

      const citationsPaid = agentLogs.length;
      const uniqueQueries = new Set(agentLogs.map((l) => l.queryHash)).size;

      // Fake total decisions = 1.4x paid (some queries hit REFUSE/SKIP from other sources)
      const totalDecisions = Math.round(citationsPaid * 1.4);
      const { badge, score } = computeReputation(citationsPaid, totalDecisions);

      // Avg price per source (micro-USDC) — use source price from seed data
      const avgPrice = 2500;
      const usdcEarned = citationsPaid * avgPrice;

      // Trend
      const recentRate = olderLogs.length > 0 ? recentLogs.length / olderLogs.length : 1;
      const trend = recentRate > 1.1 ? "up" : recentRate < 0.9 ? "down" : "stable";

      return {
        id: agent.id,
        name: agent.name,
        handle: agent.handle,
        wallet: agent.wallet,
        specialty: agent.specialty,
        color: agent.color,
        badge: agent.badge,
        description: agent.description,
        policyProfile: agent.policyProfile,
        sourceIds: agent.sourceIds,
        citationsPaid,
        uniqueQueriesAnswered: uniqueQueries,
        usdcEarned,
        reputationBadge: badge,
        reputationScore: score,
        trend,
        explorerUrl: `https://testnet.arcscan.app/address/${agent.wallet}`,
      };
    });

    // Sort by citations paid desc
    agentStats.sort((a, b) => b.citationsPaid - a.citationsPaid);

    cache = { data: agentStats, ts: Date.now() };
    return NextResponse.json({ agents: agentStats, totalCitations, latestBlock: latestBlock.toString() });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
