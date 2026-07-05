import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem } from "viem";
import { ARC_RPC } from "@/lib/x402";

export const dynamic = "force-dynamic";

const DEFAULT_CONTRACT = "0x396cf1646EbAeF85ee8428C2d9239C46Ae956085" as const;
const configuredContract = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS?.trim();
const CONTRACT = (configuredContract || DEFAULT_CONTRACT) as `0x${string}`;
const EXPLORER = "https://testnet.arcscan.app";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const;

let cache: { data: OnChainStats; ts: number } | null = null;
const CACHE_TTL_MS = 60_000;

const FALLBACK_STATS: OnChainStats = {
  citationPaidEvents:     404,
  sourceRegisteredEvents: 10,
  uniqueAgents:           1,
  uniqueCreators:         11,
  contractAddress:        CONTRACT,
  explorerUrl:            `${EXPLORER}/address/${CONTRACT}`,
  lastUpdated:            new Date(0).toISOString(),
};

interface OnChainStats {
  citationPaidEvents: number;
  sourceRegisteredEvents: number;
  uniqueAgents: number;
  uniqueCreators: number;
  contractAddress: string;
  explorerUrl: string;
  lastUpdated: string;
}

const CITATION_PAID_EVENT = parseAbiItem(
  "event CitationPaid(uint256 indexed receiptId, uint256 indexed sourceId, address indexed agent, address creator, uint256 amount, bytes32 queryHash, bytes32 evidenceHash)"
);
const SOURCE_REGISTERED_EVENT = parseAbiItem(
  "event SourceRegistered(uint256 indexed sourceId, address indexed creator, address payoutWallet, bytes32 contentHash, uint256 price, uint256 bond)"
);

// Deploy block — contract was deployed before this block
const DEPLOY_BLOCK = 48_040_000n;
const CHUNK = 9_000n;

async function scanOnChainStats(): Promise<OnChainStats> {
  const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) });
  const latestBlock = await client.getBlockNumber();

  const agents = new Set<string>();
  // Map sourceId -> payoutWallet from SourceRegistered events
  const sourcePayoutWallets = new Map<string, string>();
  const citedPayoutWallets = new Set<string>();
  let citationCount = 0;
  let sourceCount = 0;

  // First pass: collect all SourceRegistered events to build sourceId -> payoutWallet map
  for (let from = DEPLOY_BLOCK; from <= latestBlock; from += CHUNK + 1n) {
    const to = from + CHUNK <= latestBlock ? from + CHUNK : latestBlock;
    const sources = await client.getLogs({ address: CONTRACT, event: SOURCE_REGISTERED_EVENT, fromBlock: from, toBlock: to });
    for (const log of sources) {
      sourceCount++;
      if (log.args.sourceId != null && log.args.payoutWallet) {
        sourcePayoutWallets.set(String(log.args.sourceId), log.args.payoutWallet.toLowerCase());
      }
    }
  }

  // Second pass: collect CitationPaid events, resolve creator via payoutWallet
  for (let from = DEPLOY_BLOCK; from <= latestBlock; from += CHUNK + 1n) {
    const to = from + CHUNK <= latestBlock ? from + CHUNK : latestBlock;
    const citations = await client.getLogs({ address: CONTRACT, event: CITATION_PAID_EVENT, fromBlock: from, toBlock: to });

    for (const log of citations) {
      citationCount++;
      if (log.args.agent) agents.add(log.args.agent.toLowerCase());
      // Resolve creator as the payoutWallet of the cited source, not the agent address.
      if (log.args.sourceId != null) {
        const payoutWallet = sourcePayoutWallets.get(String(log.args.sourceId));
        if (payoutWallet) citedPayoutWallets.add(payoutWallet);
      }
    }
  }

  return {
    citationPaidEvents:     citationCount,
    sourceRegisteredEvents: sourceCount,
    uniqueAgents:           agents.size,
    uniqueCreators:         citedPayoutWallets.size,
    contractAddress:        CONTRACT,
    explorerUrl:            `${EXPLORER}/address/${CONTRACT}`,
    lastUpdated:            new Date().toISOString(),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("RPC timeout")), ms)),
  ]);
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const data = await withTimeout(scanOnChainStats(), 3500);
    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({
      ...(cache?.data ?? FALLBACK_STATS),
      rpcStatus: "fallback",
      lastUpdated: new Date().toISOString(),
    });
  }
}
