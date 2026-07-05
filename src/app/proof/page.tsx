"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";

interface OnChainEvent {
  receiptId: number;
  sourceId: number;
  agent: string;
  creator: string;
  amountMicro: number;
  amountUSDC: number;
  queryHash: string;
  txHash: string;
  blockNumber: number;
  arcScanUrl: string;
}

interface OnChainProofResponse {
  events: OnChainEvent[];
  totalEvents: number;
  totalUSDC: number;
  contractAddress: string;
  contractExplorerUrl: string;
  generatedAt: string;
  error?: string;
}

function short(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-lg bg-[#111118] border border-[#1e1e2e] animate-pulse">
      <div className="w-8 h-3 bg-[#1e1e2e] rounded" />
      <div className="w-24 h-3 bg-[#1e1e2e] rounded" />
      <div className="flex-1 w-32 h-3 bg-[#1e1e2e] rounded" />
      <div className="w-16 h-3 bg-[#1e1e2e] rounded" />
      <div className="w-16 h-3 bg-[#1e1e2e] rounded" />
    </div>
  );
}

export default function ProofPage() {
  const [data, setData]       = useState<OnChainProofResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/onchain-proof")
      .then((r) => r.json())
      .then((d: OnChainProofResponse) => {
        setData(d);
        if (d.error) setError(d.error);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const CONTRACT = "0x396cf1646EbAeF85ee8428C2d9239C46Ae956085";

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5] pb-20 overflow-x-hidden">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-10">
        <BackButton />

        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111118] border border-[#34D399]/20 text-[#8b8b9e] text-xs font-mono mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] inline-block animate-pulse" />
            Arc Testnet · Live from blockchain
          </div>
          <h1 className="text-3xl font-bold text-[#f0f0f5] mb-2">On-Chain Citation Proof</h1>
          <p className="text-[#8b8b9e] text-sm max-w-2xl leading-relaxed">
            Every <code className="text-[#34D399] bg-[#111118] px-1.5 py-0.5 rounded text-xs">CitationPaid</code> event
            emitted by <code className="text-[#f0f0f5] text-xs">CitePayMarket.sol</code> on Arc Testnet.
            This data is read directly from the blockchain — no backend database required.
          </p>
        </div>

        {/* Verify yourself */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 mb-6 font-mono text-xs">
          <div className="text-[#4a4a5e] text-[10px] tracking-widest mb-3">VERIFY YOURSELF</div>
          <div className="space-y-1.5">
            <div className="flex gap-3">
              <span className="text-[#4a4a5e] w-20 shrink-0">Contract</span>
              <a href={`https://testnet.arcscan.app/address/${CONTRACT}`} target="_blank" rel="noopener noreferrer"
                 className="text-[#34D399] hover:underline break-all">{CONTRACT}</a>
            </div>
            <div className="flex gap-3">
              <span className="text-[#4a4a5e] w-20 shrink-0">Network</span>
              <span className="text-[#f0f0f5]">Arc Testnet (chainId: 5042002)</span>
            </div>
            <div className="flex gap-3">
              <span className="text-[#4a4a5e] w-20 shrink-0">RPC</span>
              <span className="text-[#f0f0f5]">https://rpc.testnet.arc.network</span>
            </div>
            <div className="flex gap-3">
              <span className="text-[#4a4a5e] w-20 shrink-0">Event</span>
              <span className="text-[#6366f1]">CitationPaid(receiptId, sourceId, agent, creator, amount, queryHash, evidenceHash)</span>
            </div>
          </div>
        </div>

        {/* Summary bar */}
        {data && !loading && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-[#111118] border border-[#34D399]/20 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold font-mono text-[#34D399]">{data.totalEvents.toLocaleString()}</div>
              <div className="text-xs text-[#8b8b9e] mt-1">CitationPaid Events</div>
            </div>
            <div className="bg-[#111118] border border-[#34D399]/20 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold font-mono text-[#34D399]">${data.totalUSDC.toFixed(4)}</div>
              <div className="text-xs text-[#8b8b9e] mt-1">Total USDC (on-chain)</div>
            </div>
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 text-center">
              <a href={data.contractExplorerUrl} target="_blank" rel="noopener noreferrer"
                 className="text-xs font-mono text-[#6366f1] hover:text-indigo-300 break-all">
                View contract on ArcScan ↗
              </a>
              <div className="text-xs text-[#4a4a5e] mt-1">{short(data.contractAddress)}</div>
            </div>
          </div>
        )}

        {/* Events table */}
        <div className="space-y-2">
          {/* Header row */}
          <div className="hidden sm:grid grid-cols-[60px_1fr_1fr_100px_80px] gap-4 px-4 py-2 text-[10px] font-mono text-[#4a4a5e] tracking-widest">
            <span>#</span>
            <span>CREATOR WALLET</span>
            <span>ARCSCAN TX</span>
            <span>AMOUNT USDC</span>
            <span>SOURCE ID</span>
          </div>

          {loading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

          {!loading && error && !data?.events?.length && (
            <div className="flex items-center justify-center py-16 text-[#4a4a5e] text-sm font-mono">
              Could not reach Arc Testnet RPC — try again shortly
            </div>
          )}

          {!loading && data?.events?.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="text-[#4a4a5e] text-sm mb-2">No CitationPaid events found in last 10,000 blocks</div>
              <Link href="/ask" className="text-[#6366f1] hover:text-indigo-300 text-xs transition-colors">
                Run a query to generate the first citation →
              </Link>
            </div>
          )}

          {!loading && data?.events?.map((e) => (
            <div key={`${e.receiptId}-${e.txHash}`}
                 className="grid grid-cols-[60px_1fr] sm:grid-cols-[60px_1fr_1fr_100px_80px] gap-4 items-center px-4 py-3 rounded-lg bg-[#111118] border border-[#1e1e2e] hover:border-[#34D399]/20 transition-colors font-mono text-xs">
              <span className="text-[#4a4a5e]">#{e.receiptId}</span>
              <span className="text-[#8b8b9e] truncate">
                {short(e.creator)}
              </span>
              <a href={e.arcScanUrl} target="_blank" rel="noopener noreferrer"
                 className="text-[#6366f1] hover:text-indigo-300 truncate hidden sm:block">
                {short(e.txHash)} ↗
              </a>
              <span className="text-[#34D399] font-bold">${e.amountUSDC.toFixed(4)}</span>
              <span className="text-[#4a4a5e] hidden sm:block">{e.sourceId}</span>
            </div>
          ))}
        </div>

        {data && !loading && (
          <div className="mt-6 text-center text-xs font-mono text-[#4a4a5e]">
            Showing {data.events.length} events from last 10,000 blocks · Updated {new Date(data.generatedAt).toLocaleTimeString()}
          </div>
        )}
      </div>
    </main>
  );
}
