/**
 * Circle CCTP cross-chain creator payouts via Unified Balance Kit.
 *
 * Burns USDC on Arc Testnet and mints it on the creator's preferred destination
 * chain (Base Sepolia, Ethereum Sepolia, etc.) using Circle's Cross-Chain
 * Transfer Protocol v2 and the Circle Forwarder for gasless destination minting.
 *
 * Supported destination testnets:
 *   Arc_Testnet (same-chain fallback), Base_Sepolia, Arbitrum_Sepolia,
 *   Ethereum_Sepolia, Optimism_Sepolia, Avalanche_Fuji, Polygon_Amoy_Testnet
 */

import { createAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { spend, createUnifiedBalanceKitContext } from "@circle-fin/unified-balance-kit";

export type SupportedDestChain =
  | "Arc_Testnet"
  | "Base_Sepolia"
  | "Arbitrum_Sepolia"
  | "Ethereum_Sepolia"
  | "Optimism_Sepolia"
  | "Avalanche_Fuji"
  | "Polygon_Amoy_Testnet";

export const SUPPORTED_DEST_CHAINS: SupportedDestChain[] = [
  "Arc_Testnet",
  "Base_Sepolia",
  "Arbitrum_Sepolia",
  "Ethereum_Sepolia",
  "Optimism_Sepolia",
  "Avalanche_Fuji",
  "Polygon_Amoy_Testnet",
];

export interface CCTPTransferResult {
  success: boolean;
  burnTxHash?: string;
  steps?: Array<{ name: string; state: string; txHash?: string }>;
  amountUsdc: string;
  sourceChain: string;
  destChain: string;
  recipientAddress: string;
  error?: string;
}

/**
 * Transfer USDC from the CitePay agent wallet on Arc Testnet to a creator wallet
 * on a different chain using Circle CCTP v2 + Circle Forwarder (gasless for creator).
 */
export async function cctpPayCreator(opts: {
  creatorWallet: string;
  amountMicroUsdc: number;
  destChain?: SupportedDestChain;
}): Promise<CCTPTransferResult> {
  const { creatorWallet, amountMicroUsdc, destChain = "Base_Sepolia" } = opts;
  const privateKey = process.env.AGENT_PRIVATE_KEY;

  if (!privateKey) throw new Error("AGENT_PRIVATE_KEY not configured");

  const amountUsdc = (amountMicroUsdc / 1_000_000).toFixed(6);

  // Same-chain: skip CCTP, handled by regular payCreator
  if (destChain === "Arc_Testnet") {
    throw new Error("Same-chain transfers should use payCreator, not CCTP");
  }

  const adapter = createAdapterFromPrivateKey({ privateKey });
  const context = createUnifiedBalanceKitContext();

  const result = await spend(context, {
    from: {
      adapter,
      allocations: [{ amount: amountUsdc, chain: "Arc_Testnet" }],
    },
    to: {
      chain: destChain,
      recipientAddress: creatorWallet,
      useForwarder: true,
    },
    token: "USDC",
    amount: amountUsdc,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const steps = (result as any)?.steps as Array<{ name: string; state: string; txHash?: string }> | undefined;
  const burnStep = steps?.find((s) => s.name === "burn" || s.name === "transfer");

  return {
    success: true,
    burnTxHash: burnStep?.txHash,
    steps: steps?.map((s) => ({ name: s.name, state: s.state, txHash: s.txHash })),
    amountUsdc,
    sourceChain: "Arc_Testnet",
    destChain,
    recipientAddress: creatorWallet,
  };
}

/** Estimate CCTP fees for a cross-chain payout (no tx sent). */
export async function estimateCCTPFee(opts: {
  amountMicroUsdc: number;
  destChain?: SupportedDestChain;
}): Promise<{ fees: Array<{ type: string; amount: string }>; amountUsdc: string }> {
  const { amountMicroUsdc, destChain = "Base_Sepolia" } = opts;
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!privateKey) throw new Error("AGENT_PRIVATE_KEY not configured");

  const amountUsdc = (amountMicroUsdc / 1_000_000).toFixed(6);
  const { estimateSpend } = await import("@circle-fin/unified-balance-kit");
  const adapter = createAdapterFromPrivateKey({ privateKey });
  const context = createUnifiedBalanceKitContext();

  const est = await estimateSpend(context, {
    from: {
      adapter,
      allocations: [{ amount: amountUsdc, chain: "Arc_Testnet" }],
    },
    to: { chain: destChain, recipientAddress: "0x0000000000000000000000000000000000000001", useForwarder: true },
    token: "USDC",
    amount: amountUsdc,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fees = ((est as any)?.fees ?? []) as Array<{ type: string; amount: string; allocations?: unknown[] }>;
  return {
    fees: fees.map((f) => ({ type: f.type, amount: f.amount })),
    amountUsdc,
  };
}
