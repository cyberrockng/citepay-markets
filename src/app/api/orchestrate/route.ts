/**
 * POST /api/orchestrate — streaming multi-agent pipeline
 *
 * Emits newline-delimited JSON chunks as each step completes:
 *   { type: "trace", line: string }
 *   { type: "subquery_result", index: number, subQuery: SubQueryResult }
 *   { type: "final", finalAnswer: string, stats: Stats }
 *   { type: "error", error: string }
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { createRateLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// 1 orchestration per 15s per IP, max 10 per instance lifetime
const _checkRateLimit = createRateLimiter({ windowMs: 15_000, lifetimeCap: 10 });

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
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = _checkRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: rl.reason }, { status: 429 });
  }

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
  const agentsUrl = `${proto}://${host}/api/agents`;

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const send = (chunk: object) => {
    writer.write(encoder.encode(JSON.stringify(chunk) + "\n")).catch(() => {});
  };

  (async () => {
    try {
      const { runPilot } = await import("@/lib/pilot");
      const orchestratorClient = new GatewayClient({ chain: "arcTestnet", privateKey: ORCHESTRATOR_KEY });

      send({ type: "trace", line: `[Orchestrator] Received query: "${query}"` });

      // ── Pilot: read agent reputations and attest allocation plan ─────────────
      send({ type: "trace", line: `[Pilot] Reading source agent reputations from Arc Testnet…` });
      let pilotPlan = null;
      try {
        const agentResp = await fetch(agentsUrl, { headers: { "Cache-Control": "no-cache" } });
        const agentData = await agentResp.json() as { agents?: { id: string; name: string; citationsPaid: number; reputationScore: number; reputationBadge: "Healthy" | "Watch" | "Stop"; sourceIds: number[] }[] };
        const agentStats = (agentData.agents ?? []).map((a) => ({
          id: a.id, name: a.name, citationsPaid: a.citationsPaid,
          reputationScore: a.reputationScore, reputationBadge: a.reputationBadge, sourceIds: a.sourceIds,
        }));

        send({ type: "trace", line: `[Pilot] Agents: ${agentStats.map((a) => `${a.name}(${a.reputationBadge} ${a.reputationScore}%)`).join(" | ")}` });
        send({ type: "trace", line: `[Pilot] Computing budget allocation and attesting plan hash onchain…` });

        pilotPlan = await runPilot({ query, budgetMicroUsdc: 150_000, agents: agentStats, attest: true });

        send({ type: "trace", line: `[Pilot] Plan hash: 0x${pilotPlan.planHash.slice(0, 16)}… anchored at ${pilotPlan.attestationTxHash ? `tx ${pilotPlan.attestationTxHash.slice(0, 10)}…` : "(simulated)"}` });
        send({ type: "trace", line: `[Pilot] Allocation: ${pilotPlan.allocations.map((a) => `${a.agentName} ${a.sharePercent}%`).join(" | ")}` });
        send({ type: "pilot_plan", plan: pilotPlan });
      } catch (e) {
        send({ type: "trace", line: `[Pilot] Reputation read failed (${(e as Error).message?.slice(0, 60) ?? "unknown"}), proceeding without attestation` });
      }

      // ── Agent Commerce Registry: discover registered agents ───────────────────
      try {
        const { getAgentRegistry } = await import("@/lib/db");
        const registeredAgents = getAgentRegistry("active");
        if (registeredAgents.length > 0) {
          send({ type: "trace", line: `[AgentExchange] ${registeredAgents.length} registered agents available: ${registeredAgents.map((a) => `${a.name}(trust:${a.trustScore}%)`).join(" | ")}` });
          send({ type: "registered_agents", agents: registeredAgents.map((a) => ({ id: a.id, name: a.name, specialty: a.specialty, trustScore: a.trustScore, priceMicro: a.priceMicro })) });
        }
      } catch { /* non-fatal */ }

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

      // ── Auto-register synthesized answer as citable knowledge source ──────────
      let knowledgeSourceId: string | null = null;
      try {
        const { autoRegisterKnowledge } = await import("@/lib/db");
        knowledgeSourceId = autoRegisterKnowledge({
          answer: finalAnswer,
          query,
          queryId: subResults[0]?.queryId || `orch-${Date.now()}`,
          agentWallet: "0x5389688243328c26a92b301faEEAb5fbf9AFf105",
          host,
        });
        send({ type: "trace", line: `[Orchestrator] Synthesized answer auto-registered → /labs/knowledge/${knowledgeSourceId}` });
        send({ type: "knowledge_registered", knowledgeSourceId, knowledgeUrl: `${proto}://${host}/labs/knowledge/${knowledgeSourceId}` });
      } catch (e) {
        send({ type: "trace", line: `[Orchestrator] Knowledge auto-registration skipped: ${String(e).slice(0, 60)}` });
      }

      // ── Agent-to-agent coordination rewards ────────────────────────────────
      // Orchestrator evaluates each sub-agent's contribution and releases USDC rewards
      type AgentReward = { agentIndex: number; subQuery: string; agentAddress: string; rewardMicro: number; txHash: string | null; contributionScore: number };
      const subAgentRewards: AgentReward[] = [];

      // Use registered agent wallets for coordination rewards — not project-owned wallets.
      const { getAgentRegistry } = await import("@/lib/db");
      const registeredAgents = getAgentRegistry("active");
      const SUB_AGENT_ADDRESSES = registeredAgents
        .filter(a => a.wallet && a.wallet !== "0x0000000000000000000000000000000000000001")
        .map(a => a.wallet)
        .slice(0, 3);

      if (AGENT_KEY) {
        const totalCitations = subResults.reduce((s, r) => s + r.decisions.filter((d) => d.decision === "PAY").length, 0);

        for (let i = 0; i < subResults.length; i++) {
          const r = subResults[i];
          if (!r.paidViaGateway) continue;

          const citations = r.decisions.filter((d) => d.decision === "PAY").length;
          const avgRelevance = r.decisions.length > 0
            ? r.decisions.reduce((s, d) => s + (d.scores?.relevance ?? 0), 0) / r.decisions.length
            : 0;

          const contributionScore = totalCitations > 0
            ? Math.round((citations / totalCitations) * 60 + (avgRelevance / 100) * 40)
            : Math.round(avgRelevance * 0.4);

          if (contributionScore < 15) continue;

          const rewardMicro = Math.max(200, Math.round(contributionScore * 5));
          const agentAddress = SUB_AGENT_ADDRESSES[i % SUB_AGENT_ADDRESSES.length];

          try {
            send({ type: "trace", line: `[Orchestrator] Releasing coordination reward → Sub-Agent ${i + 1} (score: ${contributionScore}/100 · $${(rewardMicro / 1e6).toFixed(4)} USDC)` });
            const { payCreator } = await import("@/lib/payments");
            const payment = await payCreator({
              creatorWallet: agentAddress,
              amountMicroUsdc: rewardMicro,
              sourceId: `sub-agent-${i}`,
              receiptId: `agent-reward-${Date.now()}-${i}`,
            });
            subAgentRewards.push({ agentIndex: i, subQuery: r.subQuery, agentAddress, rewardMicro, txHash: payment.txHash, contributionScore });
            send({ type: "trace", line: `[Orchestrator] Sub-Agent ${i + 1} reward confirmed — ${payment.txHash?.slice(0, 20) ?? "pending"}… (${payment.status})` });
          } catch (e) {
            send({ type: "trace", line: `[Orchestrator] Sub-Agent ${i + 1} reward failed (non-fatal): ${String(e).slice(0, 60)}` });
            subAgentRewards.push({ agentIndex: i, subQuery: r.subQuery, agentAddress, rewardMicro, txHash: null, contributionScore });
          }
        }
      }

      const allDecisions = subResults.flatMap((r) => r.decisions);
      const totalGatewayMicro = subResults.reduce((s, r) => s + Number(r.gatewayAmountMicro), 0);
      const totalCreatorMicro = subResults.reduce((s, r) => s + r.totalPaid, 0);

      // ── Agent Self-Assessment (Build 5) ────────────────────────────────────
      let lessonId: string | null = null;
      let lessonText: string | null = null;
      try {
        const paidDecisions = allDecisions.filter((d) => d.decision === "PAY");
        const refusedDecisions = allDecisions.filter((d) => d.decision === "REFUSE");
        const topSources = paidDecisions.slice(0, 3).map((d) => d.source).join(", ");
        const weakSources = refusedDecisions.slice(0, 3).map((d) => d.source).join(", ");

        const lessonMsg = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 250,
          messages: [{
            role: "user",
            content: `You are an AI agent reflecting on your research performance. Write a brief self-assessment.

Query: "${query}"
Citations paid (good sources): ${paidDecisions.length} — ${topSources || "none"}
Refused (weak sources): ${refusedDecisions.length} — ${weakSources || "none"}
Total USDC paid: $${(totalCreatorMicro / 1e6).toFixed(4)}

Write a 2-3 sentence self-assessment as JSON:
{
  "lesson": "what you learned / what worked / what was missing",
  "gap": "specific knowledge gap identified, or null",
  "adjustment": "one thing to do differently next time, or null"
}`,
          }],
        });

        const lt = (lessonMsg.content[0] as { text: string }).text;
        const lm = lt.match(/\{[\s\S]*\}/);
        if (lm) {
          const lp = JSON.parse(lm[0]) as { lesson?: string; gap?: string; adjustment?: string };
          lessonText = lp.lesson ?? null;
          const { insertAgentLesson, createBounty } = await import("@/lib/db");
          lessonId = insertAgentLesson({
            orchestrationQuery: query,
            lesson: lp.lesson ?? "",
            gapIdentified: lp.gap ?? undefined,
            topSources: topSources || undefined,
            weakSources: weakSources || undefined,
            scoreAdjustments: lp.adjustment ?? undefined,
          });
          send({ type: "lesson", lessonId, lesson: lp.lesson, gap: lp.gap, adjustment: lp.adjustment });

          // ── Auto-Bounty: gap identified → post open bounty for creators ───
          if (lp.gap && lp.gap.toLowerCase() !== "null" && lp.gap.trim().length > 10) {
            try {
              const bountyTitle = `Knowledge Gap: ${lp.gap.slice(0, 80)}`;
              const bountyDesc  = `The CitePay agent identified this knowledge gap while researching: "${query}". ` +
                `Submit a high-quality source that directly answers this gap. ` +
                `The best submission wins $0.01 USDC paid immediately on Arc Testnet.`;
              const deadline = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
              const autoBounty = createBounty({
                title:       bountyTitle,
                query:       lp.gap,
                description: bountyDesc,
                budgetMicro: 10_000,   // $0.01 USDC prize
                deadline,
                agentAddress: orchestratorClient.address,
                autoPosted:   true,
                gapCategory:  query.slice(0, 60),
              });
              send({ type: "auto_bounty", bountyId: autoBounty.id, gap: lp.gap, budgetMicro: 10_000 });
            } catch { /* non-fatal — lesson saved even if bounty post fails */ }
          }
        }
      } catch { /* non-fatal */ }

      send({
        type: "final",
        finalAnswer,
        knowledgeSourceId,
        lessonId,
        lessonText,
        subQueries: subResults,
        agentToAgentPayments: subAgentRewards,
        pilotPlan,
        stats: {
          subQueriesDispatched: subQueries.length,
          totalGatewayFeeMicro: totalGatewayMicro,
          totalCreatorPaymentsMicro: totalCreatorMicro,
          citationsPurchased: allDecisions.filter((d) => d.decision === "PAY").length,
          orchestratorWallet: orchestratorClient.address,
          pilotAttestationTx: pilotPlan?.attestationTxHash ?? null,
          agentToAgentCount: subAgentRewards.length,
          agentCoordinationRewardsMicro: subAgentRewards.reduce((s, r) => s + r.rewardMicro, 0),
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
