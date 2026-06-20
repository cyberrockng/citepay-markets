/**
 * Creator payout module.
 * Priority order:
 *   1. Direct on-chain USDC transfer (AGENT_PRIVATE_KEY set)
 *   2. Circle Programmable Wallets API (CIRCLE_API_KEY set)
 *   3. Dev/demo: simulated tx hash
 */

import { ethers } from "ethers";

// Base Sepolia USDC contract
const USDC_ADDRESS = process.env.USDC_CONTRACT_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

const USDC_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

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

  // Option 1: Direct on-chain USDC transfer via agent wallet
  if (process.env.AGENT_PRIVATE_KEY) {
    try {
      const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
      const wallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider);
      const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet);

      // Check balance before sending
      const balance = await usdc.balanceOf(wallet.address);
      if (balance >= BigInt(amountMicroUsdc)) {
        const tx = await usdc.transfer(creatorWallet, BigInt(amountMicroUsdc));
        const receipt = await tx.wait();
        return {
          txHash: receipt.hash,
          amountMicroUsdc,
          recipient: creatorWallet,
          status: "confirmed",
        };
      }
      // Insufficient USDC balance — fall through to simulation
    } catch {
      // RPC or tx error — fall through to simulation
    }
  }

  // Option 2: Circle Programmable Wallets API
  if (process.env.CIRCLE_API_KEY && process.env.CIRCLE_WALLET_ID) {
    try {
      const res = await fetch("https://api.circle.com/v1/w3s/developer/transactions/transfer", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.CIRCLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletId: process.env.CIRCLE_WALLET_ID,
          tokenId: process.env.USDC_TOKEN_ID || "usdc",
          destinationAddress: creatorWallet,
          amounts: [String(amountMicroUsdc / 1_000_000)],
          idempotencyKey: `citepay-${receiptId}`,
          fee: { type: "levels", config: { feeLevel: "MEDIUM" } },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          txHash: data.data?.transaction?.txHash || `circle-${receiptId}`,
          amountMicroUsdc,
          recipient: creatorWallet,
          status: "confirmed",
        };
      }
    } catch {
      // Fall through to simulation
    }
  }

  // Option 3: Dev mode — deterministic simulated tx hash
  const { sha256 } = await import("./evidence");
  const txHash = `0x${sha256(`${creatorWallet}:${amountMicroUsdc}:${receiptId}:${sourceId}`)}`;

  return {
    txHash,
    amountMicroUsdc,
    recipient: creatorWallet,
    status: "simulated",
  };
}
