/**
 * POST /api/orchestrate
 *
 * Multi-agent pipeline:
 *   [Orchestrator] decomposes query → [Researcher Agents] via x402 → [Synthesizer]
 *
 * Each sub-query is a real Circle Gateway payment from the orchestrator wallet
 * to the researcher endpoint (/api/ask). This creates agent-to-agent x402 payments.
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { GatewayClient } from "@circle-fin/x402-batching/client";

export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Orchestrator uses the same demo buyer wallet (testnet only)
const ORCHESTRATOR_KEY: `0x${string}` =
  (process.env.DEMO_BUYER_KEY as `0x${string}`) ??
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const AGENT_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
const MIN_BALANCE_MICRO = 5_000n;

interface SubQueryResult {
  subQuery: string;
  queryId: string;
  answer: string;
  decisions: Array<{
    decision: string;
    source: string;
    url: string;
    amountPaid: number;
    scores: { relevance: number; total: number };
    receiptUrl: string;
    txHash: string | null;
  }>;
  totalPaid: number;
  gatewayAmountMicro: string;
  paidViaGateway: boolean;
}

async function decomposeQuery(query: string): Promise<string[]> {
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [{
      role: "user",
      content: `You are an orchestrator agent. Decompose this research query into 2-3 focused sub-questions that together cover the topic completely. Each sub-question should target a different aspect.

Query: "${query}"

Return ONLY a JSON array of strings, no explanation. Example: ["What is X?", "How does Y work?", "What are the use cases of Z?"]`,
    }],
  });

  const text = (msg.content[0] as { text: string }).text.trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [query];
  try {
    const parsed = JSON.parse(match[0]) as string[];
    return parsed.slice(0, 3).filter((q) => typeof q === "string" && q.length > 5);
  } catch {
    return [query];
  }
}

async function synthesize(
  originalQuery: string,
  subResults: SubQueryResult[]
): Promise<string> {
  const context = subResults
    .filter((r) => r.decisions.some((d) => d.decision === "PAY"))
    .map((r) => {
      const paidSources = r.decisions.filter((d) => d.decision === "PAY");
      return `Sub-query: "${r.subQuery}"\nAnswer: ${r.answer}\nCitations: ${paidSources.map((d) => `[${d.source}]`).join(", ")}`;
    })
    .join("\n\n");

  if (!context) {
    return "The research agents could not find sufficiently relevant paid sources to answer this query comprehensively.";
  }

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: `You are a synthesis agent. Combine the findings from multiple research sub-agents into one comprehensive answer.

Original question: "${originalQuery}"

Sub-agent findings:
${context}

Write a concise, well-structured answer that synthesizes all the above. Reference sources inline like [Source Name].`,
    }],
  });

  return (msg.content[0] as { text: string }).text;
}

export async function POST(req: NextRequest) {
  let body: { query?: string; policy?: string } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = (body.query ?? "").trim();
  if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });

  const policy = body.policy ?? "balanced";

  // 1. Check/refill orchestrator Gateway balance
  const orchestratorClient = new GatewayClient({ chain: "arcTestnet", privateKey: ORCHESTRATOR_KEY });
  const balances = await orchestratorClient.getBalances();

  if (balances.gateway.available < MIN_BALANCE_MICRO && AGENT_KEY) {
    try {
      const agentClient = new GatewayClient({ chain: "arcTestnet", privateKey: AGENT_KEY });
      await agentClient.depositFor("0.05", orchestratorClient.address);
    } catch (e) {
      console.error("[orchestrate] auto-refill failed:", e);
    }
  }

  // 2. Decompose query into sub-questions
  const agentTrace: string[] = [];
  agentTrace.push(`[Orchestrator] Received query: "${query}"`);

  const subQueries = await decomposeQuery(query);
  agentTrace.push(`[Orchestrator] Decomposed into ${subQueries.length} sub-queries: ${subQueries.map((q) => `"${q}"`).join(" | ")}`);

  // 3. Dispatch sub-queries to researcher agent in parallel (each pays via x402)
  const host = req.headers.get("host") ?? "citepay-markets.vercel.app";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const askUrl = `${proto}://${host}/api/ask`;

  agentTrace.push(`[Orchestrator] Dispatching ${subQueries.length} researcher agents via Circle Gateway x402 payments → ${askUrl}`);

  const subResults = await Promise.all(
    subQueries.map(async (subQuery): Promise<SubQueryResult> => {
      try {
        const payResult = await orchestratorClient.pay<{
          queryId: string;
          answer: string;
          decisions: SubQueryResult["decisions"];
          totalPaid: number;
        }>(askUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: subQuery, budget: 0.05, policy }),
        });

        return {
          subQuery,
          queryId: payResult.data.queryId,
          answer: payResult.data.answer,
          decisions: payResult.data.decisions,
          totalPaid: payResult.data.totalPaid,
          gatewayAmountMicro: payResult.amount.toString(),
          paidViaGateway: true,
        };
      } catch (err) {
        return {
          subQuery,
          queryId: "",
          answer: `Sub-agent failed: ${(err as Error).message}`,
          decisions: [],
          totalPaid: 0,
          gatewayAmountMicro: "0",
          paidViaGateway: false,
        };
      }
    })
  );

  // Build trace entries from results
  for (const r of subResults) {
    const paid = r.decisions.filter((d) => d.decision === "PAY");
    if (r.paidViaGateway) {
      agentTrace.push(
        `[Researcher Agent] "${r.subQuery.slice(0, 60)}" — paid $${(Number(r.gatewayAmountMicro) / 1e6).toFixed(3)} query fee via Circle Gateway → ${paid.length} citations purchased ($${(r.totalPaid / 1e6).toFixed(4)} USDC to creators)`
      );
    } else {
      agentTrace.push(`[Researcher Agent] "${r.subQuery.slice(0, 60)}" — FAILED: ${r.answer.slice(0, 80)}`);
    }
  }

  // 4. Synthesize
  agentTrace.push(`[Orchestrator] Synthesizing results from ${subResults.length} researcher agents…`);
  const finalAnswer = await synthesize(query, subResults);
  agentTrace.push(`[Orchestrator] Synthesis complete. Final answer generated.`);

  // Aggregate stats
  const allDecisions = subResults.flatMap((r) => r.decisions);
  const totalGatewayMicro = subResults.reduce((s, r) => s + Number(r.gatewayAmountMicro), 0);
  const totalCreatorMicro = subResults.reduce((s, r) => s + r.totalPaid, 0);

  return NextResponse.json({
    query,
    finalAnswer,
    subQueries: subResults.map((r) => ({
      subQuery: r.subQuery,
      queryId: r.queryId,
      answer: r.answer,
      decisions: r.decisions,
      totalPaid: r.totalPaid,
      gatewayAmountMicro: r.gatewayAmountMicro,
      paidViaGateway: r.paidViaGateway,
    })),
    agentTrace,
    stats: {
      subQueriesDispatched: subQueries.length,
      totalGatewayFeeMicro: totalGatewayMicro,
      totalCreatorPaymentsMicro: totalCreatorMicro,
      citationsPurchased: allDecisions.filter((d) => d.decision === "PAY").length,
      orchestratorWallet: orchestratorClient.address,
    },
  });
}
