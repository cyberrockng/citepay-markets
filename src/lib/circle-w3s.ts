/**
 * Circle W3S (Web3 Services) signing facade.
 *
 * All contract writes on Arc Testnet go through Circle's Developer-Controlled
 * Wallet API — no local private key is ever used for signing.
 *
 * Architecture:
 *   anchor.ts / payments.ts
 *       └── circle-w3s.ts  (this file)  ← single signing surface
 *               └── @circle-fin/developer-controlled-wallets SDK
 *                       └── Circle MPC infrastructure (key never leaves Circle)
 *
 * When W3S is not configured (missing env vars), every function returns null /
 * false cleanly — callers fall back to the AGENT_PRIVATE_KEY path.
 */

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { createPublicClient, http, encodeFunctionData, parseAbi } from "viem";
import { ARC_RPC } from "./x402";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const;

// ─── Client singleton ─────────────────────────────────────────────────────────

let _client: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;

function getClient() {
  if (_client) return _client;
  const apiKey       = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret) return null;
  _client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  return _client;
}

// ─── Public helpers ───────────────────────────────────────────────────────────

export function isW3SEnabled(): boolean {
  return !!(process.env.CIRCLE_API_KEY && process.env.CIRCLE_ENTITY_SECRET && process.env.CIRCLE_WALLET_ID);
}

export function getW3SWalletId(): string | null {
  return process.env.CIRCLE_WALLET_ID ?? null;
}

export function getW3SAddress(): string {
  return process.env.CIRCLE_WALLET_ADDRESS ?? "";
}

// ─── Core: execute a contract call via W3S ────────────────────────────────────

export interface W3SExecResult {
  txHash: string;
  status: "confirmed" | "pending" | "failed";
}

/**
 * Submit a raw calldata transaction to a contract via Circle W3S.
 * Polls until the transaction reaches CONFIRMED/COMPLETE/FAILED (max 30 s).
 * Returns null if W3S is not configured.
 */
export async function executeContractW3S(
  contractAddress: string,
  calldata: `0x${string}`,
): Promise<W3SExecResult | null> {
  const client   = getClient();
  const walletId = getW3SWalletId();
  if (!client || !walletId) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = await (client as any).createContractExecutionTransaction({
      walletId,
      contractAddress,
      callData: calldata,
      fee: { type: "level", config: { feeLevel: "HIGH" } },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txData: any = resp?.data;
    const txId: string = txData?.id ?? txData?.transaction?.id ?? "";
    let txHash: string = txData?.txHash ?? txData?.transaction?.txHash ?? "";
    let state: string  = txData?.state ?? txData?.transaction?.state ?? "INITIATED";

    // Arc has sub-500 ms finality — poll up to 30 s for confirmation
    if (txId && !["CONFIRMED", "COMPLETE", "FAILED"].includes(state)) {
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const poll = await (client as any).getTransaction({ id: txId });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const t: any = poll?.data?.transaction ?? poll?.data;
          state   = t?.state   ?? state;
          txHash  = t?.txHash  ?? txHash;
          if (["CONFIRMED", "COMPLETE", "FAILED"].includes(state)) break;
        } catch { break; }
      }
    }

    const status = state === "FAILED" ? "failed"
                 : txHash              ? "confirmed"
                 : "pending";

    return { txHash: txHash || `w3s-pending-${txId}`, status };
  } catch (err) {
    console.error("[w3s] executeContractW3S failed:", String(err).slice(0, 200));
    return null;
  }
}

// ─── Typed helpers used by anchor.ts ─────────────────────────────────────────

const CITEPAY_ABI = parseAbi([
  "function payCitation(uint256 sourceId, bytes32 queryHash, bytes32 evidenceHash) returns (uint256 receiptId)",
  "function createMandate(bytes32 policyHash, uint256 maxPerCitation, uint256 sessionCap, uint256 minRelevanceScore, bool requireBonded) returns (uint256 mandateId)",
  "function closeMandate(uint256 mandateId)",
  "function checkAndRecord(uint256 mandateId, uint256 sourceId, bytes32 evidenceHash, uint256 amountMicro, uint256 relevanceScore, bool creatorBonded) returns (bool allowed, uint8 blockReason)",
]);

export async function w3sPayCitation(opts: {
  contract:    string;
  sourceId:    number;
  queryHash:   `0x${string}`;
  evidenceHash:`0x${string}`;
}): Promise<{ txHash: string; onChainReceiptId: number } | null> {
  const calldata = encodeFunctionData({
    abi: CITEPAY_ABI,
    functionName: "payCitation",
    args: [BigInt(opts.sourceId), opts.queryHash, opts.evidenceHash],
  });

  const result = await executeContractW3S(opts.contract, calldata);
  if (!result || result.status === "failed" || !result.txHash.startsWith("0x")) return null;

  // Parse CitationPaid event from the transaction receipt via Arc RPC
  let onChainReceiptId = 0;
  try {
    const pub = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) });
    const receipt = await pub.getTransactionReceipt({ hash: result.txHash as `0x${string}` });
    // CitationPaid(uint256 indexed receiptId, ...)
    // First indexed topic[1] is receiptId
    for (const log of receipt.logs) {
      if (log.topics[1]) {
        const id = Number(BigInt(log.topics[1]));
        if (id > 0) { onChainReceiptId = id; break; }
      }
    }
  } catch { /* non-fatal — receipt id stays 0 */ }

  return { txHash: result.txHash, onChainReceiptId };
}

export async function w3sCreateMandate(opts: {
  contract:        string;
  policyHash:      `0x${string}`;
  maxPerCitation:  number;
  sessionCap:      number;
  minRelevance:    number;
  requireBonded:   boolean;
}): Promise<{ txHash: string; mandateId: number } | null> {
  const calldata = encodeFunctionData({
    abi: CITEPAY_ABI,
    functionName: "createMandate",
    args: [
      opts.policyHash,
      BigInt(opts.maxPerCitation),
      BigInt(opts.sessionCap),
      BigInt(opts.minRelevance),
      opts.requireBonded,
    ],
  });
  const result = await executeContractW3S(opts.contract, calldata);
  if (!result || result.status === "failed") return null;

  let mandateId = 0;
  try {
    const pub = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) });
    const receipt = await pub.getTransactionReceipt({ hash: result.txHash as `0x${string}` });
    for (const log of receipt.logs) {
      if (log.topics[1]) { mandateId = Number(BigInt(log.topics[1])); break; }
    }
  } catch { /* non-fatal */ }

  return { txHash: result.txHash, mandateId };
}

export async function w3sCloseMandate(opts: {
  contract:   string;
  mandateId:  number;
}): Promise<boolean> {
  const calldata = encodeFunctionData({
    abi: CITEPAY_ABI,
    functionName: "closeMandate",
    args: [BigInt(opts.mandateId)],
  });
  const result = await executeContractW3S(opts.contract, calldata);
  return result?.status === "confirmed";
}

// ─── W3S status summary (for health / traction endpoints) ────────────────────

export function getW3SStatus() {
  return {
    enabled:       isW3SEnabled(),
    walletAddress: getW3SAddress(),
    walletId:      getW3SWalletId(),
    signingPath:   isW3SEnabled() ? "circle-w3s-mpc" : "agent-private-key",
    localKeyUsed:  !isW3SEnabled(),
  };
}
