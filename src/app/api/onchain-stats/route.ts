import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem } from "viem";
import { ARC_RPC } from "@/lib/x402";

export const dynamic = "force-dynamic";

const CONTRACT = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "0x396cf1646EbAeF85ee8428C2d9239C46Ae956085") as `0x${string}`;
const EXPLORER = "https://testnet.arcscan.app";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const;

let cache: { data: OnChainStats; ts: number } | null = null;
const CACHE_TTL_MS = 60_000;

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

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) });
    const latestBlock = await client.getBlockNumber();

    const agents = new Set<string>();
    const creators = new Set<string>();
    let citationCount = 0;
    let sourceCount = 0;

    for (let from = DEPLOY_BLOCK; from <= latestBlock; from += CHUNK + 1n) {
      const to = from + CHUNK <= latestBlock ? from + CHUNK : latestBlock;

      const [citations, sources] = await Promise.all([
        client.getLogs({ address: CONTRACT, event: CITATION_PAID_EVENT, fromBlock: from, toBlock: to }),
        client.getLogs({ address: CONTRACT, event: SOURCE_REGISTERED_EVENT, fromBlock: from, toBlock: to }),
      ]);

      for (const log of citations) {
        citationCount++;
        if (log.args.agent) agents.add(log.args.agent.toLowerCase());
        if (log.args.creator) creators.add(log.args.creator.toLowerCase());
      }
      sourceCount += sources.length;
    }

    const data: OnChainStats = {
      citationPaidEvents: citationCount,
      sourceRegisteredEvents: sourceCount,
      uniqueAgents: agents.size,
      uniqueCreators: creators.size,
      contractAddress: CONTRACT,
      explorerUrl: `${EXPLORER}/address/${CONTRACT}`,
      lastUpdated: new Date().toISOString(),
    };

    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "RPC error", detail: String(err) }, { status: 502 });
  }
}
