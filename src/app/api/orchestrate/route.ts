/**
 * POST /api/orchestrate — streaming multi-agent pipeline
 *
 * Emits newline-delimited JSON chunks as each step completes:
 *   { type: "trace", line: string }
 *   { type: "subquery_result", index: number, subQuery: SubQueryResult }
 *   { type: "final", finalAnswer: string, stats: Stats }
 *   { type: "error", error: string }
 */
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { GatewayClient } from "@circle-fin/x402-batching/client";

export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

async function synthesize(originalQuery: string, subResults: SubQueryResult[]): Promise<string> {
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
    return new Response(JSON.stringify({ type: "error", error: "Invalid JSON body" }) + "\n", { status: 400 });
  }

  const query = (body.query ?? "").trim();
  if (!query) {
    return new Response(JSON.stringify({ type: "error", error: "query is required" }) + "\n", { status: 400 });
  }

  const policy = body.policy ?? "balanced";
  const host = req.headers.get("host") ?? "citepay-markets.vercel.app";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const askUrl = `${proto}://${host}/api/ask`;

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const send = (chunk: object) => {
    writer.write(encoder.encode(JSON.stringify(chunk) + "\n")).catch(() => {});
  };

  (async () => {
    try {
      const orchestratorClient = new GatewayClient({ chain: "arcTestnet", privateKey: ORCHESTRATOR_KEY });

      send({ type: "trace", line: `[Orchestrator] Received query: "${query}"` });
      send({ type: "trace", line: `[Orchestrator] Checking Circle Gateway balance…` });

      const balances = await orchestratorClient.getBalances();
      if (balances.gateway.available < MIN_BALANCE_MICRO && AGENT_KEY) {
        try {
          const agentClient = new GatewayClient({ chain: "arcTestnet", privateKey: AGENT_KEY });
          await agentClient.depositFor("0.05", orchestratorClient.address);
          send({ type: "trace", line: `[Orchestrator] Auto-refilled Gateway balance from agent wallet` });
        } catch (e) {
          send({ type: "trace", line: `[Orchestrator] Auto-refill failed: ${(e as Error).message}` });
        }
      }

      send({ type: "trace", line: `[Orchestrator] Decomposing query into sub-questions…` });
      const subQueries = await decomposeQuery(query);
      send({ type: "trace", line: `[Orchestrator] Decomposed into ${subQueries.length} sub-queries: ${subQueries.map((q) => `"${q}"`).join(" | ")}` });
      send({ type: "trace", line: `[Orchestrator] Dispatching ${subQueries.length} researcher agents via Circle Gateway x402 → ${askUrl}` });

      // Run sub-agents in parallel, emit each result as it completes
      const subResults: SubQueryResult[] = new Array(subQueries.length);
      await Promise.all(
        subQueries.map(async (subQuery, index) => {
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

            const result: SubQueryResult = {
              subQuery,
              queryId: payResult.data.queryId,
              answer: payResult.data.answer,
              decisions: payResult.data.decisions,
              totalPaid: payResult.data.totalPaid,
              gatewayAmountMicro: payResult.amount.toString(),
              paidViaGateway: true,
            };
            subResults[index] = result;

            const paid = result.decisions.filter((d) => d.decision === "PAY");
            send({ type: "trace", line: `[Researcher Agent] "${subQuery.slice(0, 60)}" — paid $${(Number(result.gatewayAmountMicro) / 1e6).toFixed(3)} via Gateway → ${paid.length} citations ($${(result.totalPaid / 1e6).toFixed(4)} USDC to creators)` });
            send({ type: "subquery_result", index, subQuery: result });
          } catch (err) {
            const result: SubQueryResult = {
              subQuery,
              queryId: "",
              answer: `Sub-agent failed: ${(err as Error).message}`,
              decisions: [],
              totalPaid: 0,
              gatewayAmountMicro: "0",
              paidViaGateway: false,
            };
            subResults[index] = result;
            send({ type: "trace", line: `[Researcher Agent] "${subQuery.slice(0, 60)}" — FAILED: ${(err as Error).message.slice(0, 80)}` });
            send({ type: "subquery_result", index, subQuery: result });
          }
        })
      );

      send({ type: "trace", line: `[Orchestrator] All ${subResults.length} agents complete. Synthesizing…` });
      const finalAnswer = await synthesize(query, subResults);
      send({ type: "trace", line: `[Orchestrator] Synthesis complete.` });

      const allDecisions = subResults.flatMap((r) => r.decisions);
      const totalGatewayMicro = subResults.reduce((s, r) => s + Number(r.gatewayAmountMicro), 0);
      const totalCreatorMicro = subResults.reduce((s, r) => s + r.totalPaid, 0);

      send({
        type: "final",
        finalAnswer,
        subQueries: subResults,
        stats: {
          subQueriesDispatched: subQueries.length,
          totalGatewayFeeMicro: totalGatewayMicro,
          totalCreatorPaymentsMicro: totalCreatorMicro,
          citationsPurchased: allDecisions.filter((d) => d.decision === "PAY").length,
          orchestratorWallet: orchestratorClient.address,
        },
      });
    } catch (err) {
      send({ type: "error", error: String(err) });
    } finally {
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
      "X-Accel-Buffering": "no",
    },
  });
}
