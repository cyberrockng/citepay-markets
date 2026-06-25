/**
 * CitePay Agent Commerce Network — core logic
 * Discovery, policy checks, hiring, and receipt creation for registered agents.
 *
 * Payments: real USDC transfers on Arc Testnet via payCreator() (same path as creator payments).
 * Responses: real Claude Haiku calls per agent specialty. Falls back to template if no API key.
 * Payment mode reflects actual settlement: "confirmed" = on-chain USDC tx, "simulated" = fallback.
 */

import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import Anthropic from "@anthropic-ai/sdk";
import {
  getAgentRegistry,
  getAgentRegistryById,
  registerAgent as dbRegisterAgent,
  updateAgentStats,
  saveAgentHireReceipt,
  type AgentRegistryRow,
  type AgentHireReceipt,
} from "@/lib/db";
import { payCreator } from "@/lib/payments";
import { CLAUDE_HAIKU_MODEL } from "@/lib/constants";

export type { AgentRegistryRow, AgentHireReceipt };

// ── Anthropic client (shared, lazy) ──────────────────────────────────────────

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

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

// ── Agent response via Claude Haiku (real AI, per specialty) ─────────────────

const AGENT_SYSTEM_PROMPTS: Record<string, string> = {
  "factual research":
    "You are FactAgent, a precise factual research AI operating in the CitePay Agent Commerce Network. " +
    "Provide a concise, well-cited factual answer in 3-4 sentences. Focus on verifiable data, protocols, and primary sources. " +
    "Reference x402, Circle, USDC, or Arc Testnet where relevant.",
  "technical documentation":
    "You are TechAgent, a technical documentation specialist AI in the CitePay Agent Commerce Network. " +
    "Provide a clear technical explanation with implementation details in 3-4 sentences. " +
    "Cover smart contract patterns, EIP standards, or developer integration steps where relevant.",
  "market analysis economics":
    "You are MarketAgent, an economics and market analysis AI in the CitePay Agent Commerce Network. " +
    "Provide a concise market or economic analysis in 3-4 sentences. " +
    "Focus on adoption metrics, incentive structures, or economic implications.",
};

async function getAgentResponse(agent: AgentRegistryRow, query: string): Promise<string> {
  const anthropic = getAnthropic();
  if (anthropic) {
    try {
      const system = AGENT_SYSTEM_PROMPTS[agent.specialty] ??
        `You are ${agent.name}, an AI research agent specializing in ${agent.specialty} within the CitePay Agent Commerce Network. Answer the query in 3-4 sentences.`;
      const msg = await anthropic.messages.create({
        model: CLAUDE_HAIKU_MODEL,
        max_tokens: 280,
        system,
        messages: [{ role: "user", content: query }],
      });
      if (msg.content[0]?.type === "text") return msg.content[0].text;
    } catch (err) {
      console.error(`[agent-exchange] Claude Haiku error for ${agent.name}:`, String(err).slice(0, 120));
    }
  }
  // Fallback if no API key or Claude error
  return generateFallbackResponse(agent, query);
}

function generateFallbackResponse(agent: AgentRegistryRow, query: string): string {
  const q = query.slice(0, 80);
  const spec = agent.specialty.toLowerCase();
  if (spec.includes("fact")) {
    return `[FactAgent fallback] ${q} — The x402 protocol enables machine-native HTTP payments using USDC on Arc Testnet. Every CitationPaid event is an immutable on-chain record. Source: x402.org, Circle Developer Docs.`;
  }
  if (spec.includes("tech")) {
    return `[TechAgent fallback] ${q} — Implementation uses EIP-3009 USDC transferWithAuthorization for gasless micropayments. Stack: CitePayMarket.sol (anchoring), CreatorBond.sol (staking), CitationMandate.sol (policy).`;
  }
  if (spec.includes("market")) {
    return `[MarketAgent fallback] ${q} — The AI citation economy shows 292+ paid events on Arc Testnet with 10 unique creator wallets earning USDC. Creator incentive alignment is the primary adoption driver.`;
  }
  return `[${agent.name} fallback] Research response for: ${q} — Confidence: moderate. Specialty: ${agent.specialty}.`;
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

  const receiptId = uuidv4();

  // ── Step 1: Get agent response (real Claude Haiku call) ───────────────────
  let response = "";
  let success = true;
  const isExternalEndpoint = !agent.endpointUrl.includes("demo") &&
                             !agent.endpointUrl.includes("internal") &&
                             agent.endpointUrl.startsWith("https://");

  if (isExternalEndpoint) {
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
      console.error(`[agent-exchange] External endpoint error for ${agent.name}:`, String(err).slice(0, 100));
      // Fall through to Claude Haiku
      response = await getAgentResponse(agent, query);
    }
  } else {
    // Demo/internal agent — use real Claude Haiku for actual research output
    response = await getAgentResponse(agent, query);
  }

  if (!response) {
    response = generateFallbackResponse(agent, query);
    success = false;
  }

  // ── Step 2: Real USDC payment via agent wallet on Arc Testnet ─────────────
  const amountMicro = success ? agent.priceMicro : 0;
  let txHash: string | null = null;
  let paymentMode: "confirmed" | "simulated" = "simulated";

  if (success && amountMicro > 0) {
    try {
      const payResult = await payCreator({
        creatorWallet: agent.wallet,
        amountMicroUsdc: amountMicro,
        sourceId: agent.id,
        receiptId,
        queryId,
        policy: agent.policyProfile,
      });
      txHash = payResult.txHash;
      paymentMode = payResult.status === "confirmed" ? "confirmed" : "simulated";
    } catch (err) {
      console.error(`[agent-exchange] Payment failed for ${agent.name}:`, String(err).slice(0, 120));
      // Keep simulated — don't fail the whole hire over a payment error
    }
  }

  // ── Step 3: Quality scoring ───────────────────────────────────────────────
  const qualityScore = success ? Math.min(100, Math.max(0,
    agent.trustScore * 0.5 +
    specialtyScore(agent.specialty, query) * 15 +
    (paymentMode === "confirmed" ? 5 : 0) +
    Math.random() * 5,
  )) : 0;

  const responseHash = createHash("sha256").update(response).digest("hex");

  // ── Step 4: Save receipt ──────────────────────────────────────────────────
  const receipt: AgentHireReceipt = {
    id: receiptId,
    queryId,
    orchestratorId: "citepay-orchestrator",
    agentId: agent.id,
    agentName: agent.name,
    agentWallet: agent.wallet,
    subtask: query.slice(0, 200),
    amountMicro,
    paymentMode,
    txHash,
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

  const discovered = discoverAgents(query, totalBudgetMicro, policyMode);
  const { selected, warned, blocked: blockedAgents } = selectAgents(
    discovered, agentCount, budgetPerAgent, policyMode,
  );

  // Blocked receipts (no payment — policy rejected them)
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

  // Hire selected agents — real payments + real Claude responses
  const hireResults = await Promise.all(
    selected.map((a) => hireAgent(a.id, query, queryId, budgetPerAgent)),
  );

  // Back-apply WARNING policyStatus for agents that passed but were warned
  const warnedIds = new Set(warned.map((w) => w.id));
  for (const result of hireResults) {
    if (warnedIds.has(result.receipt.agentId) && result.receipt.policyStatus === "APPROVED") {
      result.receipt.policyStatus = "WARNING";
      saveAgentHireReceipt(result.receipt);
    }
  }

  // Synthesize using each agent's real response
  const contributions = hireResults
    .filter((r) => r.success)
    .map((r) => `[${r.receipt.agentName}] ${r.response}`)
    .join("\n\n");

  const finalAnswer = contributions.length > 0
    ? `${contributions.slice(0, 1200)}`
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
