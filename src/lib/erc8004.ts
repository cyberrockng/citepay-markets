/**
 * ERC-8004 Agent Identity — on-chain verifiable agent registration.
 *
 * On Arc Testnet, we emit an agent identity record via the Arc Memo precompile.
 * This creates a permanent, queryable on-chain record for each registered agent:
 *   - agentId, name, specialty, trustScore, wallet — all anchored to a unique memoId
 *   - ArcScan-verifiable: https://testnet.arcscan.app/tx/<txHash>
 *
 * When a dedicated ERC-8004 registry contract is deployed on Arc, this function
 * can be swapped to call it directly — the interface stays the same.
 */

import { createWalletClient, createPublicClient, http, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC_RPC } from "./x402";

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

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const;

export interface AgentIdentityMetadata {
  agentId: string;
  name: string;
  handle: string;
  specialty: string;
  wallet: string;
  trustScore: number;
  registeredAt: string;
}

/**
 * Mints an on-chain agent identity record via Arc Memo precompile.
 * Returns the transaction hash, or null if AGENT_PRIVATE_KEY is not set.
 */
export async function mintAgentIdentity(meta: AgentIdentityMetadata): Promise<string | null> {
  if (!process.env.AGENT_PRIVATE_KEY) return null;

  try {
    const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);
    const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(ARC_RPC) });
    const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) });

    // Unique identity key: keccak256 of agentId — stable across updates
    const memoId = keccak256(toHex(`erc8004:agent:${meta.agentId}`));
    const memoData = toHex(JSON.stringify({
      standard: "ERC-8004",
      v: 1,
      agentId: meta.agentId,
      name: meta.name,
      handle: meta.handle,
      specialty: meta.specialty,
      wallet: meta.wallet,
      trustScore: meta.trustScore,
      registeredAt: meta.registeredAt,
      network: "arc-testnet",
    }));

    // Target is the agent's own wallet — memo self-attests the identity
    const hash = await walletClient.writeContract({
      address: MEMO_ADDRESS,
      abi: MEMO_ABI,
      functionName: "memo",
      args: [meta.wallet as `0x${string}`, "0x" as `0x${string}`, memoId, memoData],
    });

    await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
    return hash;
  } catch (err) {
    console.error(`[erc8004] Failed to mint identity for ${meta.agentId}:`, String(err).slice(0, 120));
    return null;
  }
}

/** Returns ArcScan URL for a given identity txHash. */
export function identityExplorerUrl(txHash: string): string {
  return `https://testnet.arcscan.app/tx/${txHash}`;
}
