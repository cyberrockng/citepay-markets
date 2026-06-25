import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import Anthropic from "@anthropic-ai/sdk";
import { runBuyerAgent, getAgentAddress } from "@/lib/agent";
import { buildEvidencePreimage, hashEvidence, sha256, parseUSDC, formatUSDC } from "@/lib/evidence";
import { QUERY_FEE_MICRO } from "@/lib/x402";
import { payCreator } from "@/lib/payments";
import { anchorPAY } from "@/lib/anchor";
import { resolvePolicy } from "@/lib/policy";
import { signReceiptHash } from "@/lib/signature";
import { agentEvents } from "@/lib/events";
import {
  getAllSources,
  insertQuery,
  updateQuery,
  insertReceipt,
  updateSourceStats,
  updateReceiptOnChain,
} from "@/lib/db";

export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });


/**
 * POST /api/demo-query-stream
 *
 * Like /api/demo-query but returns a text/event-stream SSE response so the
 * /ask page can render the agent's reasoning trace in real time:
 *   init → scoring_start → scoring_complete → decision (×N) → weights
 *   → paying → paid → anchored → answer_generating → done
 *
 * Skips the Circle Gateway x402 fee (demo path) but still runs real on-chain
 * USDC payCreator() transfers to creators.
 */
export async function POST(req: NextRequest) {
  let body: { query?: string; budget?: number; policy?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const query = (body.query ?? "").trim();
  if (!query) {
    return new Response(`data: ${JSON.stringify({ type: "error", message: "query is required" })}\n\n`, {
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const policy      = resolvePolicy(body.policy);
  const budgetMicro = parseUSDC(Math.max(0.01, Math.min(1.0, body.budget ?? 0.05)));
  const queryId     = uuidv4();
  const queryHash   = sha256(query);
  const agentAddress = getAgentAddress();
  const sources     = getAllSources().filter((s) => s.active);
  const startMs     = Date.now();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const push = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ...event, elapsed: Date.now() - startMs })}\n\n`));
      };

      try {
        push({ type: "init", policy: policy.name, budget: budgetMicro, sourceCount: sources.length });
        push({ type: "payment_accepted", demo: true, amountMicro: QUERY_FEE_MICRO, formatted: formatUSDC(QUERY_FEE_MICRO), note: "Demo query processed (x402 gate active on /api/ask)" });
        push({ type: "scoring_start", total: sources.length, policy: policy.name });

        // Run buyer agent — emits per-decision events via onEvent callback
        const decisions = await runBuyerAgent(query, budgetMicro, sources, policy, (e) => push(e));

        // Emit contribution weights for PAY decisions
        const payDecisions = decisions.filter((d) => d.decision === "PAY");
        if (payDecisions.length > 0) {
          push({
            type: "weights",
            weights: payDecisions.map((d) => ({
              sourceTitle: d.source.title,
              weight: d.contributionWeight ?? 0,
              weightedAmount: d.weightedAmount ?? d.source.price,
            })),
          });
        }

        // Persist query record
        insertQuery({
          id: queryId, query, queryHash, budget: budgetMicro, agentAddress,
          queryFee: QUERY_FEE_MICRO, queryFeeTxHash: null,
          status: "paid", totalPaid: 0, receiptIds: [], answer: null,
          createdAt: new Date().toISOString(),
        });

        // Process each decision — pay, anchor, persist receipt
        const receiptIds: string[] = [];
        const receiptsOut = [];
        let totalPaid = 0;
        let budgetRemaining = budgetMicro;
        const stoppedEarly = decisions.some((d) => d.sufficiencyStop);

        for (const d of decisions) {
          const receiptId  = uuidv4();
          const amountToPayMicro = d.weightedAmount ?? d.source.price;
          let txHash: string | null = null;
          let paymentStatus: "confirmed" | "simulated" | null = null;

          const preimage = buildEvidencePreimage({
            query, queryHash,
            sourceUrl:    d.source.url,
            excerptUsed:  d.excerptUsed || "",
            decision:     d.decision,
            scores:       d.scores,
            budgetBefore: budgetRemaining,
            reason:       d.reason,
            price:        d.source.price,
            bonded:       d.source.bonded,
            reputation:   d.source.reputation,
            contributionWeight: d.contributionWeight,
            weightedAmount:     d.weightedAmount,
          });
          const evidenceHash     = hashEvidence(preimage);
          const agentSignature   = await signReceiptHash(evidenceHash);

          if (d.decision === "PAY") {
            push({ type: "paying", sourceTitle: d.source.title, amountMicroUsdc: amountToPayMicro, formatted: formatUSDC(amountToPayMicro) });

            const payment = await payCreator({
              creatorWallet: d.source.payoutWallet,
              amountMicroUsdc: amountToPayMicro,
              sourceId: d.source.id,
              receiptId,
            });
            txHash        = payment.txHash;
            paymentStatus = payment.status;
            totalPaid    += amountToPayMicro;
            budgetRemaining -= amountToPayMicro;

            push({ type: "paid", sourceTitle: d.source.title, txHash, status: payment.status, amountMicroUsdc: amountToPayMicro, formatted: formatUSDC(amountToPayMicro) });
          }

          insertReceipt({
            id: receiptId, sourceId: d.source.id, queryId, agentAddress,
            creatorWallet: d.source.payoutWallet,
            decision: d.decision, query, queryHash,
            sourceTitle: d.source.title, sourceUrl: d.source.url,
            amountPaid:  d.decision === "PAY" ? amountToPayMicro : 0,
            evidenceHash, evidencePreimage: preimage,
            contentHashAtDecision: d.source.contentHash,
            scores: d.scores, reason: d.reason, txHash, paymentStatus,
            policyProfile: d.policyProfile,
            policyRulesPassed: d.policyRulesPassed,
            policyRulesFailed: d.policyRulesFailed,
            policyReason: d.policyReason,
            agentSignature,
            budgetBefore: budgetRemaining + (d.decision === "PAY" ? amountToPayMicro : 0),
            budgetAfter:  budgetRemaining,
            challenged: false,
            createdAt: new Date().toISOString(),
          });

          agentEvents.emit("decision", {
            decision: d.decision, sourceTitle: d.source.title,
            amountPaid: d.decision === "PAY" ? amountToPayMicro : 0,
            evidenceHash, query, timestamp: new Date().toISOString(),
          });

          if (d.decision === "PAY" && d.source.onChainId) {
            push({ type: "anchoring", sourceTitle: d.source.title });
            const anchor = await anchorPAY({ onChainSourceId: d.source.onChainId, queryHash, evidenceHash });
            if (anchor) {
              updateReceiptOnChain(receiptId, anchor.onChainReceiptId, anchor.txHash);
              push({ type: "anchored", sourceTitle: d.source.title, onChainReceiptId: anchor.onChainReceiptId, anchorTxHash: anchor.txHash });
            }
          }

          updateSourceStats(d.source.id, d.decision);
          receiptIds.push(receiptId);
          receiptsOut.push({
            receiptId, decision: d.decision,
            source: d.source.title, url: d.source.url,
            scores: d.scores, reason: d.reason,
            amountPaid:         d.decision === "PAY" ? amountToPayMicro : 0,
            sourcePrice:        d.source.price,
            contributionWeight: d.contributionWeight ?? null,
            sourceBonded:       d.source.bonded,
            sourceOnChainId:    d.source.onChainId ?? null,
            txHash, evidenceHash,
            receiptUrl: `/receipt/${receiptId}`,
            policyProfile:      d.policyProfile,
            policyRulesPassed:  d.policyRulesPassed,
            policyRulesFailed:  d.policyRulesFailed,
            policyReason:       d.policyReason,
            sufficiencyStop:    d.sufficiencyStop ?? false,
          });
        }

        // Generate answer from cited sources
        push({ type: "answer_generating" });
        const cited = decisions.filter((d) => d.decision === "PAY");
        let answer = "No sources were paid for this query.";
        if (cited.length > 0) {
          const ctx = cited.map((d) => `[${d.source.title}](${d.source.url}): ${d.excerptUsed}`).join("\n");
          try {
            const resp = await anthropic.messages.create({
              model: "claude-haiku-4-5-20251001", max_tokens: 512,
              messages: [{ role: "user", content: `Answer this question using ONLY the provided cited sources. Cite each source inline like [Source Title].\n\nQuestion: ${query}\n\nSources:\n${ctx}\n\nProvide a concise answer with inline citations.` }],
            });
            answer = (resp.content[0] as { text: string }).text;
          } catch {
            answer = `Based on ${cited.length} cited source(s): ${cited.map((d) => d.source.title).join(", ")}.`;
          }
        }

        updateQuery(queryId, { status: "completed", answer, receiptIds, totalPaid });

        push({
          type: "done",
          queryId, query, queryHash, answer,
          decisions: receiptsOut, totalPaid,
          budgetUsed: budgetMicro - budgetRemaining,
          budgetRemaining, queryFee: QUERY_FEE_MICRO,
          receiptIds, queryUrl: `/api/query/${queryId}`,
          policyProfile: policy.name, stoppedEarly,
          _demo: { paidViaGateway: false, streamMode: true },
        });

      } catch (err) {
        push({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
