/**
 * Circle App Kit integration.
 * Uses @circle-fin/adapter-circle-wallets + @circle-fin/unified-balance-kit
 * to query the DCW agent wallet's unified USDC balance across chains.
 * Server-side only — credentials never reach the browser.
 */

import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { createUnifiedBalanceKitContext, getBalances } from "@circle-fin/unified-balance-kit";
import { ARC_USDC } from "./x402";
import { createPublicClient, http, erc20Abi } from "viem";

const ARC_RPC = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const;

export function isAppKitEnabled() {
  return !!(
    process.env.CIRCLE_API_KEY &&
    process.env.CIRCLE_ENTITY_SECRET &&
    process.env.CIRCLE_WALLET_ID &&
    process.env.CIRCLE_WALLET_ADDRESS
  );
}

export async function getAgentUnifiedBalance() {
  if (!isAppKitEnabled()) return null;

  const apiKey = process.env.CIRCLE_API_KEY!;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET!;
  const walletId = process.env.CIRCLE_WALLET_ID!;
  const walletAddress = process.env.CIRCLE_WALLET_ADDRESS!;

  // App Kit: unified cross-chain USDC balance via Circle Gateway
  const adapter = createCircleWalletsAdapter({ apiKey, entitySecret });
  const context = createUnifiedBalanceKitContext();

  const [unifiedResult, onChainBalance] = await Promise.all([
    getBalances(context, {
      sources: { adapter, address: walletAddress, chains: ["Arc_Testnet"] },
      includePending: true,
    }).catch(() => null),
    // Direct on-chain ERC-20 balance for comparison
    createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) })
      .readContract({
        address: (process.env.ARC_USDC_ADDRESS || ARC_USDC) as `0x${string}`,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [walletAddress as `0x${string}`],
      })
      .catch(() => 0n),
  ]);

  return {
    walletId,
    walletAddress,
    blockchain: "Arc_Testnet",
    custodyType: "DEVELOPER" as const,
    poweredBy: "Circle App Kit — Unified Balance Kit + Circle Wallets Adapter",
    unifiedBalance: {
      confirmed: unifiedResult?.totalConfirmedBalance ?? "0.000000",
      pending: unifiedResult?.totalPendingBalance ?? "0.000000",
      token: "USDC",
      source: "Circle Gateway (batched, gas-free)",
    },
    onChainBalance: {
      amount: (Number(onChainBalance) / 1_000_000).toFixed(6),
      token: "USDC",
      source: "Direct ERC-20 on Arc Testnet",
    },
    sdks: [
      "@circle-fin/adapter-circle-wallets",
      "@circle-fin/unified-balance-kit",
      "@circle-fin/developer-controlled-wallets",
      "@circle-fin/x402-batching",
    ],
  };
}
