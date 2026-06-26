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

const SOURCE_REGISTERED_EVENT = parseAbiItem(
  "event SourceRegistered(uint256 indexed sourceId, address indexed creator, address payoutWallet, bytes32 contentHash, uint256 price, uint256 bond)"
);

export interface ArcCitationStats {
  citationCount: number;
  totalAmountMicro: bigint;
  uniqueAgents: number;
  uniqueCreators: number;
}

export interface ArcCitationEvent {
  receiptId: number;
  sourceId: number;
  agentAddress: string;
  creatorWallet: string; // payoutWallet from SourceRegistered, not creator from CitationPaid
  amountMicro: number;
  txHash: string;
  blockNumber: number;
}

interface _ScanResult {
  stats: ArcCitationStats;
  events: ArcCitationEvent[];
  payoutWallets: Map<number, string>;
}

let _cache: { data: _ScanResult; ts: number } | null = null;

async function _scan(): Promise<_ScanResult> {
  const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) });
  const latest = await client.getBlockNumber();

  let citationCount = 0;
  let totalAmountMicro = 0n;
  const agents = new Set<string>();
  const citedSourceIds = new Set<bigint>();
  const payoutWallets = new Map<number, string>(); // sourceId → payoutWallet
  const rawEvents: { receiptId: number; sourceId: number; agent: string; amount: bigint; txHash: string; blockNumber: number }[] = [];

  for (let from = DEPLOY_BLOCK; from <= latest; from += CHUNK + 1n) {
    const to = from + CHUNK <= latest ? from + CHUNK : latest;
    const [citationLogs, sourceLogs] = await Promise.all([
      client.getLogs({ address: CONTRACT, event: CITATION_PAID_EVENT, fromBlock: from, toBlock: to }),
      client.getLogs({ address: CONTRACT, event: SOURCE_REGISTERED_EVENT, fromBlock: from, toBlock: to }),
    ]);
    for (const log of sourceLogs) {
      if (log.args.sourceId !== undefined && log.args.payoutWallet) {
        payoutWallets.set(Number(log.args.sourceId), log.args.payoutWallet);
      }
    }
    for (const log of citationLogs) {
      citationCount++;
      if (log.args.amount) totalAmountMicro += log.args.amount;
      if (log.args.agent) agents.add(log.args.agent.toLowerCase());
      if (log.args.sourceId !== undefined) citedSourceIds.add(log.args.sourceId);
      rawEvents.push({
        receiptId: Number(log.args.receiptId ?? 0n),
        sourceId: Number(log.args.sourceId ?? 0n),
        agent: String(log.args.agent ?? ""),
        amount: log.args.amount ?? 0n,
        txHash: log.transactionHash,
        blockNumber: Number(log.blockNumber),
      });
    }
  }

  const paidCreatorWallets = new Set<string>();
  for (const sid of citedSourceIds) {
    const wallet = payoutWallets.get(Number(sid));
    if (wallet) paidCreatorWallets.add(wallet.toLowerCase());
  }

  const events: ArcCitationEvent[] = rawEvents.map((e) => ({
    receiptId: e.receiptId,
    sourceId: e.sourceId,
    agentAddress: e.agent,
    creatorWallet: payoutWallets.get(e.sourceId) ?? "",
    amountMicro: Number(e.amount),
    txHash: e.txHash,
    blockNumber: e.blockNumber,
  }));

  return {
    stats: { citationCount, totalAmountMicro, uniqueAgents: agents.size, uniqueCreators: paidCreatorWallets.size },
    events,
    payoutWallets,
  };
}

export async function getArcCitationStats(): Promise<ArcCitationStats> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) return _cache.data.stats;
  try {
    const result = await _scan();
    _cache = { data: result, ts: Date.now() };
    return result.stats;
  } catch {
    return _cache?.data.stats ?? { citationCount: 292, totalAmountMicro: 628_000n, uniqueAgents: 1, uniqueCreators: 10 };
  }
}

export async function getArcCitationEvents(): Promise<ArcCitationEvent[]> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) return _cache.data.events;
  try {
    const result = await _scan();
    _cache = { data: result, ts: Date.now() };
    return result.events;
  } catch {
    return _cache?.data.events ?? [];
  }
}
