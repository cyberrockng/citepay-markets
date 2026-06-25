/**
 * CitePay Agent Commerce Network — core logic
 * Discovery, policy checks, hiring, and receipt creation for registered agents.
 * All payments from demo agents are labeled "simulated" — never presented as real.
 */

import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import {
  getAgentRegistry,
  getAgentRegistryById,
  registerAgent as dbRegisterAgent,
  updateAgentStats,
  saveAgentHireReceipt,
  type AgentRegistryRow,
  type AgentHireReceipt,
} from "@/lib/db";

export type { AgentRegistryRow, AgentHireReceipt };

// ── Policy thresholds per mode ────────────────────────────────────────────────

const POLICY_RULES: Record<string, { minTrust: number; maxPriceMicro: number; allowAggressive: boolean }> = {
  conservative: { minTrust: 75, maxPriceMicro: 2000, allowAggressive: false },
  balanced:     { minTrust: 50, maxPriceMicro: 5000, allowAggressive: true  },
  aggressive:   { minTrust: 20, maxPriceMicro: 9999, allowAggressive: true  },
};

// ── Specialty matching ────────────────────────────────────────────────────────

function specialtyScore(agentSpecialty: string, querySpecialty: string): number {
  const a = agentSpecialty.toLowerCase();
  const q = querySpecialty.toLowerCase();
  const qWords = q.split(/\s+/);
  let hits = 0;
  for (const w of qWords) {
    if (w.length > 3 && a.includes(w)) hits++;
  }
  return hits;
}

// ── Discovery ────────────────────────────────────────────────────────────────

export function discoverAgents(
  querySpecialty: string,
  budgetMicro: number,
  policyMode: string,
): AgentRegistryRow[] {
  const all = getAgentRegistry("active");
  const rules = POLICY_RULES[policyMode] ?? POLICY_RULES.balanced;

  return all.filter((a) => {
    if (a.priceMicro > budgetMicro) return false;
    if (!rules.allowAggressive && a.policyProfile === "aggressive") return false;
    return true;
  }).sort((a, b) => {
    // rank: specialty match > trust score > price efficiency
    const sa = specialtyScore(a.specialty, querySpecialty);
    const sb = specialtyScore(b.specialty, querySpecialty);
    if (sb !== sa) return sb - sa;
    if (b.trustScore !== a.trustScore) return b.trustScore - a.trustScore;
    return a.priceMicro - b.priceMicro;
  });
}

// ── Selection with policy enforcement ────────────────────────────────────────

export interface SelectionResult {
  selected: AgentRegistryRow[];
  warned:   AgentRegistryRow[];
  blocked:  { agent: AgentRegistryRow; reason: string }[];
}

export function selectAgents(
  candidates: AgentRegistryRow[],
  count: number,
  budgetPerAgentMicro: number,
  policyMode: string,
): SelectionResult {
  const rules = POLICY_RULES[policyMode] ?? POLICY_RULES.balanced;
  const selected: AgentRegistryRow[] = [];
  const warned:   AgentRegistryRow[] = [];
  const blocked:  { agent: AgentRegistryRow; reason: string }[] = [];

  for (const agent of candidates) {
    if (agent.priceMicro > budgetPerAgentMicro) {
      blocked.push({ agent, reason: `price_exceeds_budget (${agent.priceMicro} > ${budgetPerAgentMicro})` });
      continue;
    }
    if (agent.trustScore < rules.minTrust) {
      blocked.push({ agent, reason: `trust_score_below_threshold (${agent.trustScore} < ${rules.minTrust})` });
      continue;
    }
    if (!agent.wallet || agent.wallet === "0x0000000000000000000000000000000000000001") {
      blocked.push({ agent, reason: "no_valid_wallet_configured" });
      continue;
    }

    const isWarning = agent.trustScore < rules.minTrust + 15 || agent.policyViolations > 0;

    if (selected.length < count) {
      if (isWarning) warned.push(agent);
      selected.push(agent);
    } else {
      blocked.push({ agent, reason: "budget_count_limit_reached" });
    }
  }

  return { selected, warned, blocked };
}

// ── Demo response templates ───────────────────────────────────────────────────

function generateDemoResponse(agent: AgentRegistryRow, query: string): string {
  const spec = agent.specialty.toLowerCase();
  if (spec.includes("fact")) {
    return `Based on verified protocol documentation and research papers: ${query.slice(0, 80)} — The x402 protocol enables machine-native HTTP payments using USDC, allowing AI agents to transact autonomously. Key facts: (1) HTTP 402 is used as the payment gate, (2) Circle Gateway settles payments on Arc Testnet, (3) Every payment creates a tamper-proof receipt anchored on-chain. Sources: x402.org, Circle Developer Docs.`;
  }
  if (spec.includes("tech")) {
    return `From a technical documentation perspective: ${query.slice(0, 80)} — Implementation uses EIP-3009 for USDC transferWithAuthorization, enabling gasless micropayments. The smart contract stack: CitePayMarket.sol (citation anchoring), CreatorBond.sol (reputation staking), CitationMandate.sol (spend policy). Developers can integrate via the CitePay MCP server exposing cite_query, get_receipt, and check_policy tools.`;
  }
  if (spec.includes("market")) {
    return `Market analysis: ${query.slice(0, 80)} — The AI citation economy represents a $2B+ opportunity as LLM queries replace traditional search. Current metrics show 268+ paid citations on Arc Testnet with 10 unique creator wallets earning USDC. Adoption drivers: creator incentive alignment, fraud-proof receipts, policy-enforced spending. Risk: low testnet liquidity limits live volume demonstration.`;
  }
  return `Research response for: ${query.slice(0, 80)} — Analysis pending further verification. This agent specialty (${agent.specialty}) may not directly match the query domain. Confidence: low. Recommend fallback to primary agents.`;
}

// ── Hire a single agent ───────────────────────────────────────────────────────

export interface AgentHireResult {
  receipt: AgentHireReceipt;
  response: string;
  qualityScore: number;
  success: boolean;
}

export async function hireAgent(
  agentId: string,
  query: string,
  queryId: string,
  budgetMicro: number,
): Promise<AgentHireResult> {
  const agent = getAgentRegistryById(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  const isDemo = agent.endpointUrl.includes("demo") || agent.endpointUrl.includes("internal");
  let response = "";
  let success = true;

  if (isDemo) {
    response = generateDemoResponse(agent, query);
  } else {
    try {
      const res = await fetch(agent.endpointUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, budgetMicro }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { response?: string; answer?: string };
      response = data.response ?? data.answer ?? "";
    } catch (err) {
      response = `Agent endpoint unreachable: ${String(err).slice(0, 100)}`;
      success = false;
    }
  }

  const qualityScore = success ? Math.min(100, Math.max(0,
    agent.trustScore * 0.5 +
    specialtyScore(agent.specialty, query) * 15 +
    Math.random() * 10
  )) : 0;

  const responseHash = createHash("sha256").update(response).digest("hex");
  const amountMicro  = success ? agent.priceMicro : 0;
  const paymentMode  = isDemo ? "simulated" : "testnet";

  const receipt: AgentHireReceipt = {
    id: uuidv4(),
    queryId,
    orchestratorId: "citepay-orchestrator",
    agentId: agent.id,
    agentName: agent.name,
    agentWallet: agent.wallet,
    subtask: query.slice(0, 200),
    amountMicro,
    paymentMode,
    txHash: isDemo ? null : null,
    responseHash,
    qualityScore: Math.round(qualityScore),
    policyStatus: "APPROVED",
    policyReason: null,
    downstreamReceiptIds: [],
    createdAt: new Date().toISOString(),
  };

  saveAgentHireReceipt(receipt);
  updateAgentStats(agent.id, {
    successfulTask: success,
    failedTask: !success,
    earnedMicro: amountMicro,
    qualityScore: Math.round(qualityScore),
  });

  return { receipt, response, qualityScore: Math.round(qualityScore), success };
}

// ── Full commerce demo run ────────────────────────────────────────────────────

export interface BlockedAgentInfo {
  agent: AgentRegistryRow;
  reason: string;
  policyStatus: "BLOCKED";
  receipt: AgentHireReceipt;
}

export interface AgentCommerceResult {
  queryId: string;
  query: string;
  policyMode: string;
  discovered: AgentRegistryRow[];
  selected: AgentRegistryRow[];
  warned: AgentRegistryRow[];
  blocked: BlockedAgentInfo[];
  hireResults: AgentHireResult[];
  finalAnswer: string;
  totalSpentMicro: number;
  agentHireReceiptIds: string[];
  generatedAt: string;
}

export async function runAgentCommerceDemo(
  query: string,
  totalBudgetMicro: number,
  agentCount: number,
  policyMode: string,
): Promise<AgentCommerceResult> {
  const queryId = uuidv4();
  const budgetPerAgent = Math.floor(totalBudgetMicro / Math.max(agentCount, 1));

  // 1. Discover candidates
  const discovered = discoverAgents(query, totalBudgetMicro, policyMode);

  // 2. Select / warn / block
  const { selected, warned, blocked: blockedAgents } = selectAgents(
    discovered, agentCount, budgetPerAgent, policyMode,
  );

  // 3. Create blocked receipts (for visibility)
  const blockedWithReceipts: BlockedAgentInfo[] = [];
  for (const b of blockedAgents) {
    const r: AgentHireReceipt = {
      id: uuidv4(),
      queryId,
      orchestratorId: "citepay-orchestrator",
      agentId: b.agent.id,
      agentName: b.agent.name,
      agentWallet: b.agent.wallet,
      subtask: query.slice(0, 200),
      amountMicro: 0,
      paymentMode: "simulated",
      txHash: null,
      responseHash: null,
      qualityScore: 0,
      policyStatus: "BLOCKED",
      policyReason: b.reason,
      downstreamReceiptIds: [],
      createdAt: new Date().toISOString(),
    };
    saveAgentHireReceipt(r);
    blockedWithReceipts.push({ agent: b.agent, reason: b.reason, policyStatus: "BLOCKED", receipt: r });
  }

  // 4. Hire selected agents (parallel)
  const hireResults = await Promise.all(
    selected.map((a) => hireAgent(a.id, query, queryId, budgetPerAgent)),
  );

  // 5. Synthesize final answer
  const contributions = hireResults
    .filter((r) => r.success)
    .map((r) => `[${r.receipt.agentName}]: ${r.response}`)
    .join("\n\n");

  const finalAnswer = contributions
    ? `Synthesized from ${hireResults.filter((r) => r.success).length} agent(s):\n\n${contributions.slice(0, 800)}`
    : "No agents produced usable responses for this query.";

  const totalSpentMicro = hireResults.reduce((s, r) => s + r.receipt.amountMicro, 0);

  return {
    queryId,
    query,
    policyMode,
    discovered,
    selected,
    warned,
    blocked: blockedWithReceipts,
    hireResults,
    finalAnswer,
    totalSpentMicro,
    agentHireReceiptIds: [
      ...hireResults.map((r) => r.receipt.id),
      ...blockedWithReceipts.map((b) => b.receipt.id),
    ],
    generatedAt: new Date().toISOString(),
  };
}

// Re-export registerAgent for API use
export { dbRegisterAgent as registerAgent };
