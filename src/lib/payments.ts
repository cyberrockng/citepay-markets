/**
 * Creator payout module — Arc Testnet.
 * Pays creators in USDC directly on-chain via the agent wallet.
 * Falls back to deterministic simulated hash when balance is zero.
 */

import {
  createWalletClient, createPublicClient, http, erc20Abi,
  encodeFunctionData, keccak256, toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC_USDC, ARC_RPC } from "./x402";

const USDC_ADDRESS = (process.env.ARC_USDC_ADDRESS || ARC_USDC) as `0x${string}`;

// Arc Transaction Memo precompile — attaches structured context to any contract call
const MEMO_ADDRESS = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505" as `0x${string}`;
const MEMO_ABI = [
  {
    type: "function", name: "memo", stateMutability: "nonpayable",
    inputs: [
      { name: "target",   type: "address" },
      { name: "data",     type: "bytes"   },
      { name: "memoId",   type: "bytes32" },
      { name: "memoData", type: "bytes"   },
    ],
    outputs: [],
  },
] as const;

// Minimal arc testnet chain def (viem/chains arcTestnet works too, this avoids the import)
const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const;

export interface PaymentResult {
  txHash: string;
  amountMicroUsdc: number;
  recipient: string;
  status: "confirmed" | "simulated";
  memoId?: string;
  failureReason?: string;
}

export async function payCreator(opts: {
  creatorWallet: string;
  amountMicroUsdc: number;
  sourceId: string;
  receiptId: string;
  queryId?: string;
  relevanceScore?: number;
  policy?: string;
}): Promise<PaymentResult> {
  const { creatorWallet, amountMicroUsdc, sourceId, receiptId, queryId, relevanceScore, policy } = opts;

  // Guard: skip real transfer for zero-amount calls
  if (amountMicroUsdc === 0) {
    return { txHash: `simulated-zero-${receiptId}`, amountMicroUsdc: 0, recipient: creatorWallet, status: "simulated" };
  }

  // Preferred path: Circle Developer-Controlled Wallet (MPC-secured, Circle-managed)
  // Only commit to this path if the transfer actually confirms — otherwise fall through
  // to the agent wallet path (which has $17+ USDC and produces real on-chain anchors).
  const { isDCWEnabled, payCreatorViaDCW } = await import("./circle-dcw");
  if (isDCWEnabled()) {
    try {
      const result = await payCreatorViaDCW({ creatorWallet, amountMicroUsdc, receiptId });
      if (result.status === "confirmed") {
        return { txHash: result.txHash, amountMicroUsdc, recipient: creatorWallet, status: "confirmed" };
      }
      // "pending" / "simulated" means DCW had insufficient balance or tx failed — fall through
      console.log(`[payCreator] DCW returned ${result.status}, falling through to agent wallet`);
    } catch {
      // Fall through to viem path
    }
  }

  // Fallback path: direct on-chain USDC transfer via agent wallet on Arc
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
        // Encode the USDC transfer calldata
        const transferData = encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [creatorWallet as `0x${string}`, BigInt(amountMicroUsdc)],
        });

        // Build structured citation memo — permanently on-chain, self-describing
        const memoPayload = JSON.stringify({
          app: "citepay-markets",
          v: 1,
          rid: receiptId,
          sid: sourceId,
          amt: amountMicroUsdc,
          ...(queryId        && { qid: queryId }),
          ...(relevanceScore && { rel: relevanceScore }),
          ...(policy         && { pol: policy }),
        });
        const memoId   = keccak256(toHex(receiptId));   // unique per citation, indexed
        const memoData = toHex(memoPayload);             // arbitrary JSON bytes

        // Submit via Arc Memo precompile — wraps the USDC transfer with structured context
        const hash = await walletClient.writeContract({
          address: MEMO_ADDRESS,
          abi: MEMO_ABI,
          functionName: "memo",
          args: [USDC_ADDRESS, transferData, memoId, memoData],
        });
        await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
        return { txHash: hash, amountMicroUsdc, recipient: creatorWallet, status: "confirmed", memoId };
      }
    } catch (err) {
      console.error("[payCreator] on-chain transfer failed, falling back to simulated:", err);
    }
  }

  // Fallback: deterministic simulated hash (dev / zero-balance / rpc failure)
  const { sha256 } = await import("./evidence");
  const txHash = `0x${sha256(`${creatorWallet}:${amountMicroUsdc}:${receiptId}:${sourceId}`)}`;
  return { txHash, amountMicroUsdc, recipient: creatorWallet, status: "simulated", failureReason: "insufficient_balance_or_rpc_error" };
}
