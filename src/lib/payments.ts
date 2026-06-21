/**
 * Creator payout module — Arc Testnet.
 * Pays creators in USDC directly on-chain via the agent wallet.
 * Falls back to deterministic simulated hash when balance is zero.
 */

import { createWalletClient, createPublicClient, http, erc20Abi, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC_USDC, ARC_RPC } from "./x402";

const USDC_ADDRESS = (process.env.ARC_USDC_ADDRESS || ARC_USDC) as `0x${string}`;

// Minimal arc testnet chain def (viem/chains arcTestnet works too, this avoids the import)
const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const;

export interface PaymentResult {
  txHash: string;
  amountMicroUsdc: number;
  recipient: string;
  status: "confirmed" | "simulated";
}

export async function payCreator(opts: {
  creatorWallet: string;
  amountMicroUsdc: number;
  sourceId: string;
  receiptId: string;
}): Promise<PaymentResult> {
  const { creatorWallet, amountMicroUsdc, sourceId, receiptId } = opts;

  // Direct on-chain USDC transfer via agent wallet on Arc
  if (process.env.AGENT_PRIVATE_KEY) {
    try {
      const account = privateKeyToAccount(
        process.env.AGENT_PRIVATE_KEY as `0x${string}`
      );
      const publicClient = createPublicClient({
        chain: arcTestnet,
        transport: http(ARC_RPC),
      });
      const walletClient = createWalletClient({
        account,
        chain: arcTestnet,
        transport: http(ARC_RPC),
      });

      // Check USDC balance (ERC-20 uses 6 decimals on Arc)
      const balance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account.address],
      });

      if (balance >= BigInt(amountMicroUsdc)) {
        const hash = await walletClient.writeContract({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: "transfer",
          args: [creatorWallet as `0x${string}`, BigInt(amountMicroUsdc)],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        return { txHash: hash, amountMicroUsdc, recipient: creatorWallet, status: "confirmed" };
      }
    } catch {
      // RPC error or insufficient balance — fall through
    }
  }

  // Fallback: deterministic simulated hash (dev / zero-balance)
  const { sha256 } = await import("./evidence");
  const txHash = `0x${sha256(`${creatorWallet}:${amountMicroUsdc}:${receiptId}:${sourceId}`)}`;
  return { txHash, amountMicroUsdc, recipient: creatorWallet, status: "simulated" };
}
