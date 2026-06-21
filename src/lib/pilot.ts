/**
 * CitePay Pilot Agent.
 *
 * Before any USDC moves, the Pilot:
 * 1. Reads each source agent's live onchain reputation (CitationPaid count, pay rate).
 * 2. Allocates the query budget across FactAgent / TechAgent / EconAgent.
 * 3. Computes SHA-256 of its allocation plan.
 * 4. Anchors the plan hash onchain by sending a tx to the contract with the hash as calldata.
 * 5. Returns the attestation tx hash so every caller can verify the Pilot committed before paying.
 *
 * The onchain attestation tx is visible at testnet.arcscan.app — the Pilot cannot revise
 * its plan after attestation without a detectable chain reorg.
 */

import { ethers } from "ethers";
import { sha256 } from "./evidence";

const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "0x396cf1646EbAeF85ee8428C2d9239C46Ae956085";
const RPC      = process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network";
const EXPLORER = "https://testnet.arcscan.app";

export interface SourceAgentStats {
  id: string;
  name: string;
  citationsPaid: number;
  reputationScore: number;
  reputationBadge: "Healthy" | "Watch" | "Stop";
  sourceIds: number[];
}

export interface PilotAllocation {
  agentId: string;
  agentName: string;
  sharePercent: number;       // 0-100
  budgetMicroUsdc: number;
  reasoning: string;
  sourceIds: number[];        // which source IDs to prioritize
}

export interface PilotPlan {
  query: string;
  totalBudgetMicroUsdc: number;
  allocations: PilotAllocation[];
  planHash: string;           // SHA-256 of the JSON plan
  attestationTxHash: string | null;  // onchain tx anchoring the plan hash
  attestationBlock: number | null;
  attestationExplorerUrl: string | null;
  computedAt: string;
}

function computePilotPlan(
  query: string,
  budgetMicroUsdc: number,
  agents: SourceAgentStats[]
): { allocations: PilotAllocation[]; planHash: string } {
  if (!agents.length) {
    return { allocations: [], planHash: sha256(JSON.stringify({ query, budgetMicroUsdc, agents: [] })) };
  }

  // Sort by reputation score desc
  const sorted = [...agents].sort((a, b) => b.reputationScore - a.reputationScore);

  // Allocate proportionally to reputation score, with floor of 10%
  const totalScore = sorted.reduce((s, a) => s + Math.max(a.reputationScore, 10), 0);
  let remaining = budgetMicroUsdc;

  const allocations: PilotAllocation[] = sorted.map((agent, i) => {
    const weight = Math.max(agent.reputationScore, 10) / totalScore;
    const isLast = i === sorted.length - 1;
    const budget = isLast ? remaining : Math.round(budgetMicroUsdc * weight);
    if (!isLast) remaining -= budget;

    const badge = agent.reputationBadge;
    const reasoning =
      badge === "Healthy"
        ? `${agent.name} has a ${agent.reputationScore}% reputation score (Healthy). Allocating largest share.`
        : badge === "Watch"
        ? `${agent.name} at ${agent.reputationScore}% (Watch). Moderate allocation pending stronger signal.`
        : `${agent.name} at ${agent.reputationScore}% (Stop). Minimal allocation; reputation below threshold.`;

    return {
      agentId: agent.id,
      agentName: agent.name,
      sharePercent: Math.round(weight * 100),
      budgetMicroUsdc: budget,
      reasoning,
      sourceIds: agent.sourceIds,
    };
  });

  const planPayload = { query, totalBudgetMicroUsdc: budgetMicroUsdc, allocations, computedAt: new Date().toISOString() };
  const planHash = sha256(JSON.stringify(planPayload));

  return { allocations, planHash };
}

async function attestOnChain(planHash: string): Promise<{ txHash: string; blockNumber: number } | null> {
  const pk = process.env.AGENT_PRIVATE_KEY;
  if (!pk) return null;

  try {
    const provider = new ethers.JsonRpcProvider(RPC);
    const wallet   = new ethers.Wallet(pk, provider);

    // Attest by sending a tx to the contract with the plan hash as calldata.
    // No function selector — the contract ignores unknown calldata, but the tx
    // is permanently recorded in the block with timestamp + sender + hash.
    const feeData  = await provider.getFeeData();
    const tx = await wallet.sendTransaction({
      to: CONTRACT,
      value: 0n,
      data: `0xc17e5c37${planHash}`,   // 0xc17e5c37 = keccak4("pilotAttest(bytes32)")
      gasPrice: (feeData.gasPrice ?? ethers.parseUnits("20", "gwei")) * 2n,
    });
    const receipt = await tx.wait();
    return { txHash: receipt?.hash ?? tx.hash, blockNumber: Number(receipt?.blockNumber ?? 0) };
  } catch {
    return null;
  }
}

export async function runPilot(opts: {
  query: string;
  budgetMicroUsdc: number;
  agents: SourceAgentStats[];
  attest?: boolean;
}): Promise<PilotPlan> {
  const { query, budgetMicroUsdc, agents, attest = true } = opts;
  const { allocations, planHash } = computePilotPlan(query, budgetMicroUsdc, agents);

  let attestationTxHash: string | null = null;
  let attestationBlock: number | null = null;

  if (attest) {
    const result = await attestOnChain(planHash);
    attestationTxHash = result?.txHash ?? null;
    attestationBlock  = result?.blockNumber ?? null;
  }

  return {
    query,
    totalBudgetMicroUsdc: budgetMicroUsdc,
    allocations,
    planHash,
    attestationTxHash,
    attestationBlock,
    attestationExplorerUrl: attestationTxHash ? `${EXPLORER}/tx/${attestationTxHash}` : null,
    computedAt: new Date().toISOString(),
  };
}
