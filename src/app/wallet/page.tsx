"use client";
import { useEffect, useState } from "react";
import { BackButton } from "@/components/back-button";

interface UnifiedBalance {
  confirmed: string;
  pending: string;
  token: string;
  source: string;
}

interface OnChainBalance {
  amount: string;
  token: string;
  source: string;
}

interface WalletData {
  walletId: string;
  walletAddress: string;
  blockchain: string;
  custodyType: string;
  poweredBy: string;
  unifiedBalance: UnifiedBalance;
  onChainBalance: OnChainBalance;
  sdks: string[];
}

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/app-kit/balance")
      .then((r) => r.json())
      .then((d) => {
        setWallet(d.wallet);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <BackButton />
          <div className="mt-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white text-sm font-bold">W</div>
            <h1 className="text-3xl font-bold">Agent Wallet</h1>
          </div>
          <p className="text-[#8b8b9e] mt-2 ml-11">
            Circle Developer-Controlled Wallet on Arc Testnet, managed via Circle App Kit
          </p>
        </div>

        {/* Circle SDK stack */}
        <div className="bg-[#111118] rounded-xl border border-blue-900/40 p-5 mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {[
              { label: "App Kit",           color: "bg-blue-900/30 border-blue-700/50 text-blue-300"     },
              { label: "Unified Balance",   color: "bg-cyan-900/30 border-cyan-700/50 text-cyan-300"     },
              { label: "DCW Adapter",       color: "bg-violet-900/30 border-violet-700/50 text-violet-300"},
              { label: "x402 Batching",     color: "bg-green-900/30 border-green-700/50 text-green-300"  },
            ].map(({ label, color }) => (
              <div key={label} className={`px-3 py-1 rounded-full border text-xs font-mono font-semibold ${color}`}>
                {label}
              </div>
            ))}
          </div>
          <div className="text-xs text-[#4a4a5e] font-mono mb-2">
            {"// Circle SDK stack — full coverage"}
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              "@circle-fin/adapter-circle-wallets",
              "@circle-fin/unified-balance-kit",
              "@circle-fin/developer-controlled-wallets",
              "@circle-fin/x402-batching",
              "@circle-fin/provider-gateway-v1",
              "@circle-fin/adapter-viem-v2",
            ].map((sdk) => (
              <span key={sdk} className="text-xs font-mono text-[#34D399] bg-[#34D399]/5 border border-[#34D399]/20 px-2 py-1 rounded">
                {sdk}
              </span>
            ))}
          </div>
        </div>

        {/* Creator registration CTA */}
        <div className="bg-[#111118] rounded-xl border border-violet-900/40 p-5 mb-6 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-violet-300 mb-1">Register as a Creator</div>
            <div className="text-xs text-[#8b8b9e]">Register your source on CitePayMarket.sol — get paid when agents cite your content</div>
          </div>
          <a href="/register" className="flex-shrink-0 bg-[#6366f1] hover:bg-indigo-500 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-all hover:scale-105 whitespace-nowrap">
            Register →
          </a>
        </div>

        {loading && (
          <div className="text-[#4a4a5e] font-mono text-sm animate-pulse">
            Loading wallet via Circle App Kit…
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 text-red-400 text-sm">{error}</div>
        )}

        {wallet && (
          <div className="space-y-5">
            {/* Wallet identity */}
            <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] p-6">
              <h2 className="font-semibold text-[#f0f0f5] mb-4">Wallet Identity</h2>
              <div className="space-y-3 font-mono text-sm">
                {[
                  { label: "Address", value: wallet.walletAddress, highlight: true },
                  { label: "Wallet ID", value: wallet.walletId },
                  { label: "Blockchain", value: wallet.blockchain },
                  { label: "Custody type", value: wallet.custodyType },
                ].map(({ label, value, highlight }) => (
                  <div key={label} className="flex items-start justify-between gap-4">
                    <span className="text-[#4a4a5e] w-28 flex-shrink-0">{label}</span>
                    <span className={`break-all text-right ${highlight ? "text-[#34D399]" : "text-[#8b8b9e]"}`}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Unified Balance (App Kit) */}
            <div className="bg-[#111118] rounded-xl border border-blue-900/30 p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="font-semibold text-[#f0f0f5]">Unified Balance</h2>
                <span className="text-xs text-blue-400 bg-blue-900/20 px-2 py-0.5 rounded-full">Circle App Kit</span>
              </div>
              <p className="text-xs text-[#4a4a5e] mb-4">
                Cross-chain USDC balance tracked by Circle Gateway. Funds deposited via x402 Gateway batching appear here instantly, gas-free.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#0a0a0f] rounded-lg p-4">
                  <div className="text-2xl font-bold font-mono text-blue-400">
                    ${wallet.unifiedBalance.confirmed}
                  </div>
                  <div className="text-xs text-[#8b8b9e] mt-1">Confirmed USDC</div>
                </div>
                <div className="bg-[#0a0a0f] rounded-lg p-4">
                  <div className="text-2xl font-bold font-mono text-cyan-400">
                    ${wallet.unifiedBalance.pending}
                  </div>
                  <div className="text-xs text-[#8b8b9e] mt-1">Pending USDC</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-[#4a4a5e] font-mono">
                Source: {wallet.unifiedBalance.source}
              </div>
            </div>

            {/* On-chain balance */}
            <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="font-semibold text-[#f0f0f5]">On-Chain Balance</h2>
                <span className="text-xs text-[#34D399] bg-[#34D399]/10 px-2 py-0.5 rounded-full">Arc Testnet</span>
              </div>
              <div className="text-3xl font-bold font-mono text-[#34D399]">
                ${wallet.onChainBalance.amount}
              </div>
              <div className="text-xs text-[#8b8b9e] mt-1">USDC — direct ERC-20 balance</div>
              <div className="mt-3 text-xs text-[#4a4a5e] font-mono">
                Source: {wallet.onChainBalance.source}
              </div>
              <div className="mt-4 p-3 bg-[#0a0a0f] rounded-lg text-xs font-mono text-[#8b8b9e]">
                <div className="text-[#4a4a5e] mb-1">{"// used for creator payouts via DCW"}</div>
                <div className="text-[#6366f1]">client.createContractExecutionTransaction({"{"}</div>
                <div className="pl-4">walletId: <span className="text-amber-400">&quot;{wallet.walletId.slice(0, 8)}…&quot;</span>,</div>
                <div className="pl-4">contractAddress: <span className="text-[#34D399]">&quot;USDC precompile&quot;</span>,</div>
                <div className="pl-4">callData: <span className="text-[#34D399]">&quot;transfer(creator, amount)&quot;</span>,</div>
                <div className="pl-4">fee: {"{ type: "}<span className="text-amber-400">&quot;level&quot;</span>, config: {"{ feeLevel: "}<span className="text-amber-400">&quot;HIGH&quot;</span> {"} }"}</div>
                <div className="text-[#6366f1]">{"});"}</div>
              </div>
            </div>

            {/* Payment flow */}
            <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] p-6">
              <h2 className="font-semibold text-[#f0f0f5] mb-4">Payment Flow</h2>
              <div className="space-y-3">
                {[
                  {
                    step: "1",
                    color: "bg-violet-900/30 border-violet-700/40 text-violet-300",
                    label: "Query fee",
                    desc: "User pays $0.001 via Circle Gateway (x402-batching) · Circle Programmable Wallet (DCW) signs EIP-3009",
                  },
                  {
                    step: "2",
                    color: "bg-blue-900/30 border-blue-700/40 text-blue-300",
                    label: "Agent evaluates",
                    desc: "Claude Haiku scores sources under Agent Spend Policy — CitationMandate.sol records CitationAllowed / CitationBlocked on Arc",
                  },
                  {
                    step: "3a",
                    color: "bg-[#34D399]/10 border-[#34D399]/30 text-[#34D399]",
                    label: "Creator payout — same chain",
                    desc: "DCW wallet signs ERC-20 transfer on Arc Testnet via Circle App Kit MPC",
                  },
                  {
                    step: "3b",
                    color: "bg-cyan-900/20 border-cyan-700/30 text-cyan-300",
                    label: "Creator payout — cross-chain (CCTP)",
                    desc: "POST /api/cctp/fund-creator: burn USDC on Arc → Circle CCTP v2 attestation → mint on Base / Ethereum / Arbitrum / Optimism via Circle Forwarder (gasless)",
                  },
                  {
                    step: "4",
                    color: "bg-amber-900/20 border-amber-700/30 text-amber-300",
                    label: "Receipt anchored",
                    desc: "Evidence hash + PAY decision written to CitePayMarket.sol on Arc Testnet",
                  },
                ].map(({ step, color, label, desc }) => (
                  <div key={step} className={`flex gap-3 p-3 rounded-lg border ${color.split(" ").slice(0, 2).join(" ")}`}>
                    <span className={`font-bold text-sm w-6 flex-shrink-0 ${color.split(" ")[2]}`}>{step}</span>
                    <div>
                      <div className={`text-sm font-medium ${color.split(" ")[2]}`}>{label}</div>
                      <div className="text-xs text-[#8b8b9e] mt-0.5">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CCTP cross-chain payout */}
            <div className="bg-[#111118] rounded-xl border border-cyan-900/40 p-6">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="font-semibold text-[#f0f0f5]">Cross-Chain Payouts</h2>
                <span className="text-xs text-cyan-400 bg-cyan-900/20 px-2 py-0.5 rounded-full">Circle CCTP v2</span>
              </div>
              <p className="text-xs text-[#8b8b9e] mb-4">
                Creators can receive citation payments on any Circle-supported chain — not just Arc Testnet.
                CitePay burns USDC on Arc and uses CCTP v2 + Circle Forwarder to mint on the creator&apos;s preferred chain, gasless.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {["Arc Testnet", "Base Sepolia", "Ethereum Sepolia", "Arbitrum Sepolia", "Optimism Sepolia", "Avalanche Fuji", "Polygon Amoy"].map((chain) => (
                  <div key={chain} className="text-[10px] font-mono text-cyan-400 bg-cyan-900/10 border border-cyan-800/30 rounded px-2 py-1 text-center">
                    {chain}
                  </div>
                ))}
              </div>
              <div className="bg-[#0a0a0f] rounded-lg p-3 text-xs font-mono text-[#8b8b9e]">
                <div className="text-[#4a4a5e] mb-1">{"// POST /api/cctp/fund-creator"}</div>
                <div className="text-cyan-400">{"{"}</div>
                <div className="pl-4">creatorWallet: <span className="text-[#34D399]">&quot;0xCreator…&quot;</span>,</div>
                <div className="pl-4">amountMicroUsdc: <span className="text-amber-400">5000</span>,</div>
                <div className="pl-4">destChain: <span className="text-[#34D399]">&quot;Base_Sepolia&quot;</span></div>
                <div className="text-cyan-400">{"}"}</div>
                <div className="text-[#4a4a5e] mt-2">{"// → burn on Arc · CCTP attestation · mint on Base (gasless)"}</div>
              </div>
              <div className="mt-3 text-[10px] text-[#4a4a5e] font-mono">
                SDK: @circle-fin/unified-balance-kit · spend() · estimateSpend() · CCTP domain 26 (Arc) → 6 (Base)
              </div>
            </div>

            <div className="text-xs text-[#4a4a5e] font-mono text-center">
              Wallet created via Circle Developer-Controlled Wallets API · MPC-secured by Circle
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
