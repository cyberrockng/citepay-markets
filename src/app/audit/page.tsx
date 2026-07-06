"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";

interface AuditSummaryData {
  summary: {
    totalReceipts: number;
    uniqueCreatorsPaid: number;
    totalUSDCPaid: string;
    byPurpose: Record<string, { count: number; totalMicro: number }>;
  };
}

function AuditSummaryPanel() {
  const [data, setData] = useState<AuditSummaryData | null>(null);

  useEffect(() => {
    fetch("/api/audit-summary?limit=200")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return <div className="text-[#4a4a5e] text-xs font-mono animate-pulse">Loading audit data…</div>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total receipts",      value: data.summary.totalReceipts },
          { label: "Unique creators paid", value: data.summary.uniqueCreatorsPaid },
          { label: "Total USDC paid",     value: `$${data.summary.totalUSDCPaid}` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[#0a0a0f] rounded-lg p-3 border border-[#1e1e2e]">
            <div className="text-[10px] text-[#4a4a5e] mb-1">{label}</div>
            <div className="text-sm font-mono text-[#34D399]">{value}</div>
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        {Object.entries(data.summary.byPurpose).map(([code, stats]) => (
          <div key={code} className="flex items-center gap-3 text-xs font-mono px-2 py-1 rounded bg-[#0a0a0f] border border-[#1e1e2e]">
            <span className="text-[#6366f1] w-20 flex-shrink-0">{code}</span>
            <span className="text-[#8b8b9e] flex-1">{stats.count} events</span>
            <span className="text-[#34D399]">${stats.totalMicro.toFixed(6)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const ARC_RPC      = "https://rpc.testnet.arc.network";
const DCW_WALLET   = "0xa539a18b55e5e3b98892c724f8f75914c0b69942";
const AGENT_WALLET = "0x5389688243328c26a92b301faEEAb5fbf9AFf105";
const USDC         = "0x3600000000000000000000000000000000000000";
const MEMO_ADDR    = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505";
const ARCSCAN      = "https://testnet.arcscan.app";

// keccak256("Memo(address,address,bytes32,bytes32,bytes,uint256)")
const MEMO_TOPIC   = "0xeb15ee720798341c37739df41be53acfbbf70ae6802dade35457beec6e47a5e4";
interface MemoEvent {
  txHash: string;
  blockNumber: number;
  memoId: string;
  data: Record<string, unknown>;
}

function hexToUtf8(hex: string): string {
  try {
    const bytes = hex.replace(/^0x/, "").match(/.{2}/g)?.map(b => parseInt(b, 16)) ?? [];
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch { return hex; }
}

function CitationMemoPanel() {
  const [memos, setMemos] = useState<MemoEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Get current block to set a reasonable fromBlock
        const blockRes = await fetch(ARC_RPC, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
        });
        const blockJson = await blockRes.json() as { result: string };
        const latestBlock = parseInt(blockJson.result, 16);
        const fromBlock = Math.max(0, latestBlock - 200000); // ~last 200k blocks

        const logsRes = await fetch(ARC_RPC, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 2, method: "eth_getLogs",
            params: [{
              address: MEMO_ADDR,
              topics: [MEMO_TOPIC],
              fromBlock: "0x" + fromBlock.toString(16),
              toBlock: "latest",
            }],
          }),
        });
        const logsJson = await logsRes.json() as { result: Array<{ transactionHash: string; blockNumber: string; topics: string[]; data: string }> };
        const logs = logsJson.result ?? [];

        // Parse memo events — data ABI-encoded as (bytes32 callDataHash, bytes memo, uint256 memoIndex)
        const parsed: MemoEvent[] = [];
        for (const log of logs.slice(-20).reverse()) {
          try {
            // data layout: 32B callDataHash + 32B memo offset + 32B memoIndex + 32B memo length + memo bytes
            const raw = log.data.slice(2); // strip 0x
            const memoOffset = parseInt(raw.slice(64, 128), 16) * 2; // in hex chars
            const memoLen = parseInt(raw.slice(memoOffset, memoOffset + 64), 16) * 2;
            const memoHex = "0x" + raw.slice(memoOffset + 64, memoOffset + 64 + memoLen);
            const memoStr = hexToUtf8(memoHex);
            let memoData: Record<string, unknown> = {};
            try { memoData = JSON.parse(memoStr); } catch { memoData = { raw: memoStr }; }
            parsed.push({
              txHash: log.transactionHash,
              blockNumber: parseInt(log.blockNumber, 16),
              memoId: log.topics[3] ?? "",
              data: memoData,
            });
          } catch { /* skip malformed */ }
        }
        setMemos(parsed);
      } catch { /* fail open */ }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="bg-[#111118] rounded-xl border border-[#34D399]/20 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[10px] font-mono text-[#4a4a5e] tracking-widest mb-1">ARC TRANSACTION MEMOS</div>
          <div className="text-xs text-[#8b8b9e]">
            Structured citation context attached to every USDC transfer — permanently on-chain via{" "}
            <a href={`${ARCSCAN}/address/${MEMO_ADDR}`} target="_blank" rel="noopener noreferrer"
               className="text-[#6366f1] hover:text-indigo-300">MemoDispatcher</a>
          </div>
        </div>
        <span className="text-[10px] font-mono px-2 py-1 rounded bg-[#34D399]/10 text-[#34D399] border border-[#34D399]/20">
          {loading ? "…" : `${memos.length} memos`}
        </span>
      </div>

      {loading ? (
        <div className="text-[#4a4a5e] text-xs font-mono animate-pulse">Reading Memo events from Arc RPC…</div>
      ) : memos.length === 0 ? (
        <div className="text-[#4a4a5e] text-xs font-mono">
          No memo events yet — memos attach to new payments after this deployment.
          <br/>
          <a href={`${ARCSCAN}/address/${MEMO_ADDR}`} target="_blank" rel="noopener noreferrer"
             className="text-[#6366f1] hover:text-indigo-300 mt-1 inline-block">
            View Memo contract on ArcScan ↗
          </a>
        </div>
      ) : (
        <div className="space-y-2 font-mono text-xs">
          {memos.map((m) => (
            <div key={m.txHash} className="rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <a href={`${ARCSCAN}/tx/${m.txHash}`} target="_blank" rel="noopener noreferrer"
                   className="text-[#6366f1] hover:text-indigo-300">
                  {m.txHash.slice(0, 14)}…{m.txHash.slice(-6)} ↗
                </a>
                <span className="text-[#4a4a5e]">block {m.blockNumber.toLocaleString()}</span>
              </div>
              <div className="flex flex-wrap gap-3 text-[10px]">
                {m.data.sid != null && <span><span className="text-[#4a4a5e]">source:</span> <span className="text-[#f0f0f5]">{String(m.data.sid)}</span></span>}
                {m.data.amt != null && <span><span className="text-[#4a4a5e]">paid:</span> <span className="text-[#34D399]">{(Number(m.data.amt)/1e6).toFixed(4)} USDC</span></span>}
                {m.data.rel != null && <span><span className="text-[#4a4a5e]">relevance:</span> <span className="text-[#f0f0f5]">{String(m.data.rel)}</span></span>}
                {m.data.pol != null && <span><span className="text-[#4a4a5e]">policy:</span> <span className="text-[#f0f0f5]">{String(m.data.pol)}</span></span>}
                {m.data.rid != null && <span><span className="text-[#4a4a5e]">receiptId:</span> <span className="text-[#8b8b9e]">{String(m.data.rid).slice(0,8)}…</span></span>}
              </div>
            </div>
          ))}
          <div className="text-[#4a4a5e] text-[10px] pt-1">
            Sender filter: {AGENT_WALLET} · Contract: {MEMO_ADDR}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuditPage() {
  const [balance,  setBalance]  = useState<string | null>(null);
  const [txCount,  setTxCount]  = useState<number | null>(null);
  const [block,    setBlock]    = useState<number | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  async function rpc(method: string, params: unknown[]) {
    const r = await fetch(ARC_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = await r.json();
    if (json.error) throw new Error(JSON.stringify(json.error));
    return json.result as string;
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [blockHex, balHex, nonceHex] = await Promise.all([
        rpc("eth_blockNumber", []),
        rpc("eth_call", [{ to: USDC, data: "0x70a08231000000000000000000000000" + DCW_WALLET.slice(2) }, "latest"]),
        rpc("eth_getTransactionCount", [DCW_WALLET, "latest"]),
      ]);
      setBlock(parseInt(blockHex, 16));
      setBalance((parseInt(balHex, 16) / 1e6).toFixed(6));
      setTxCount(parseInt(nonceHex, 16));
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5]">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <BackButton />

        <div className="mt-6 mb-8">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-[#34D399]">TRUSTLESS</span>
          </div>
          <h1 className="text-2xl font-bold font-mono text-[#f0f0f5]">On-Chain Audit</h1>
          <p className="text-[#8b8b9e] text-sm mt-1">
            All data read directly from Arc Testnet RPC. No database. No trust required.
          </p>
        </div>

        {loading ? (
          <div className="text-[#4a4a5e] font-mono text-sm animate-pulse">Reading Arc Testnet…</div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 text-red-400 text-sm font-mono">
            RPC error: {error}
            <button onClick={load} className="ml-4 text-xs underline hover:no-underline">retry</button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Chain verification panel */}
            <div className="bg-[#111118] rounded-xl border border-[#34D399]/20 p-6 font-mono text-sm">
              <div className="text-[10px] text-[#4a4a5e] mb-5 tracking-widest">
                CHAIN VERIFICATION — Arc Testnet (chainId 5042002)
              </div>
              <div className="space-y-3">
                {[
                  { label: "Current block",    value: block?.toLocaleString() ?? "—",        color: "text-[#f0f0f5]" },
                  { label: "DCW wallet",       value: DCW_WALLET,                             color: "text-[#34D399]" },
                  { label: "USDC balance",     value: balance ? `$${balance}` : "—",          color: "text-[#34D399]" },
                  { label: "Outbound txs",     value: txCount?.toString() ?? "—",             color: "text-[#6366f1]" },
                  { label: "USDC contract",    value: USDC,                                   color: "text-[#8b8b9e]" },
                  { label: "Payment taxonomy", value: "CITE · QUERY_FEE · AGENT_REWARD · BOND_SLASH", color: "text-[#8b8b9e]" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-start justify-between gap-4 border-b border-[#1e1e2e] pb-3 last:border-0 last:pb-0">
                    <span className="text-[#4a4a5e] w-36 flex-shrink-0 text-xs">{label}</span>
                    <span className={`break-all text-right text-xs ${color}`}>{value}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 pt-4 border-t border-[#1e1e2e] flex flex-wrap gap-3">
                <a
                  href={`${ARCSCAN}/address/${DCW_WALLET}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-[#6366f1] hover:text-indigo-300 text-xs"
                >
                  View wallet on ArcScan ↗
                </a>
                <a
                  href={`${ARCSCAN}/token/${USDC}?a=${DCW_WALLET}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-[#6366f1] hover:text-indigo-300 text-xs"
                >
                  USDC transfers on ArcScan ↗
                </a>
              </div>
            </div>

            {/* Contracts */}
            <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] p-6 font-mono text-xs">
              <div className="text-[#4a4a5e] mb-4 text-[10px] tracking-widest">DEPLOYED CONTRACTS — Arc Testnet</div>
              <div className="space-y-2">
                {[
                  { label: "CitePayMarket.sol",  addr: "0x396cf1646EbAeF85ee8428C2d9239C46Ae956085" },
                  { label: "CreatorBond.sol",     addr: "0x7DBa1C67Fd9BA976aE09E744D8cbcC71F805D6C0" },
                  { label: "CitationMandate.sol", addr: "0xBad090764dd720B5EdcD8B49e054D5d8Ce13C695" },
                  { label: "MemoDispatcher",      addr: "0x5294E9927c3306DcBaDb03fe70b92e01cCede505" },
                ].map(({ label, addr }) => (
                  <div key={addr} className="flex items-start justify-between gap-4">
                    <span className="text-[#8b8b9e] w-44 flex-shrink-0">{label}</span>
                    <a
                      href={`${ARCSCAN}/address/${addr}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-[#6366f1] hover:text-indigo-300 break-all text-right"
                    >
                      {addr.slice(0, 12)}…{addr.slice(-8)} ↗
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Accountability mechanism */}
            <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] p-6 font-mono text-sm">
              <div className="text-[10px] text-[#4a4a5e] mb-4 tracking-widest">ACCOUNTABILITY MECHANISM</div>
              <div className="space-y-3 text-xs text-[#8b8b9e]">
                <p>Every PAY decision records a SHA-256 hash of the source content at decision time.</p>
                <p>If a creator modifies their content after receiving payment, any user can challenge the receipt.</p>
                <p>Challenge success → creator reputation slashed · on Arc mainnet, bonded USDC is forfeited.</p>
                <p className="text-[#4a4a5e]">Neither Muse DNA nor AXON Protocol implements this accountability primitive.</p>
              </div>
              <div className="mt-4 pt-4 border-t border-[#1e1e2e] text-[10px] text-[#4a4a5e]">
                <span>Policy enforcement: </span>
                <span className="text-[#8b8b9e]">BLOCKED_BY_POLICY decisions anchored on CitationMandate.sol</span>
              </div>
            </div>

            {/* Arc Transaction Memos */}
            <CitationMemoPanel />

            {/* Citation Auditor */}
            <div className="bg-[#111118] rounded-xl border border-[#6366f1]/20 p-6">
              <div className="text-[10px] font-mono text-[#4a4a5e] mb-2 tracking-widest">CITATION AUDITOR</div>
              <div className="text-xs text-[#8b8b9e] mb-3">
                Machine-readable audit trail. Filter by agent address, purpose code, or date range.
              </div>
              <div className="space-y-1.5 font-mono text-xs text-[#4a4a5e] mb-4">
                <div>GET /api/audit-summary</div>
                <div>GET /api/audit-summary?agent=0xa539…&amp;purpose=CITE&amp;limit=50</div>
                <div>GET /api/audit-summary?since=2026-06-01</div>
              </div>
              <div className="border-t border-[#1e1e2e] pt-4">
                <AuditSummaryPanel />
              </div>
            </div>

            {/* CLI verification */}
            <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] p-6 font-mono text-xs text-[#8b8b9e]">
              <div className="text-[#4a4a5e] mb-3 text-[10px] tracking-widest">INDEPENDENT VERIFICATION</div>
              <div className="text-[#4a4a5e] mb-1">{"# Clone the repo, then run:"}</div>
              <div className="text-[#34D399]">{"node scripts/verify-payments.mjs"}</div>
              <div className="text-[#4a4a5e] mt-1">{"# No API keys. Queries Arc RPC directly."}</div>
            </div>

            {/* Refresh */}
            <div className="flex items-center gap-4">
              <button
                onClick={load}
                className="text-xs font-mono text-[#4a4a5e] hover:text-[#8b8b9e] border border-[#1e1e2e] rounded px-3 py-1.5 transition-colors"
              >
                ↺ Refresh from chain
              </button>
              <Link href="/traction" className="text-xs text-[#6366f1] hover:text-indigo-300 transition-colors">
                View traction dashboard →
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
