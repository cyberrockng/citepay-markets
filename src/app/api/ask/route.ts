import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import Anthropic from "@anthropic-ai/sdk";
import { build402Response, verifyGatewayPayment, QUERY_FEE_MICRO } from "@/lib/x402";
import { runBuyerAgent, getAgentAddress } from "@/lib/agent";
import { buildEvidencePreimage, hashEvidence, sha256, parseUSDC } from "@/lib/evidence";
import { payCreator } from "@/lib/payments";
import { anchorPAY, checkAnchorReady, createMandateOnChain, closeMandateOnChain } from "@/lib/anchor";
import { resolvePolicy } from "@/lib/policy";
import { signReceiptHash } from "@/lib/signature";
import { agentEvents } from "@/lib/events";
import { redisIncrQuery, redisIncrDecision } from "@/lib/redis-stats";
import {
  getAllSources,
  insertQuery,
  updateQuery,
  insertReceipt,
  updateSourceStats,
  updateReceiptOnChain,
} from "@/lib/db";

let anchorChecked = false;

export const dynamic = "force-dynamic";

/**
 * POST /api/ask
 *
 * Step 1: No X-PAYMENT header → return 402 with x402 payment details.
 * Step 2: With X-PAYMENT header → verify payment, run agent, return answer + receipts.
 */
export async function POST(req: NextRequest) {
  if (!anchorChecked) { anchorChecked = true; void checkAnchorReady(); }

  let body: { query?: string; budget?: number; policy?: string | Record<string, unknown>; category?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = (body.query || "").trim();
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const budgetUsdc = typeof body.budget === "number" ? body.budget : 0.05;
  const budgetMicro = parseUSDC(Math.max(0.01, Math.min(1.0, budgetUsdc)));
  const policy = resolvePolicy(body.policy as string | undefined);
  const category = typeof body.category === "string" ? body.category : undefined;

  // ── Step 1: Check for payment ─────────────────────────────────────────────
  const hasPayment =
    req.headers.has("payment-signature") ||
    req.headers.has("X-PAYMENT") ||
    req.headers.has("x-payment");
  if (!hasPayment) {
    return build402Response(req.url);
  }

  // ── Step 2: Verify payment via Circle Gateway (Arc testnet) ──────────────
  const { valid, txHash: feesTxHash, error: payError } = await verifyGatewayPayment(req);
  if (!valid) {
    return NextResponse.json(
      { error: "Payment verification failed", detail: payError },
      { status: 402 }
    );
  }

  // ── Step 3: Create query record ───────────────────────────────────────────
  const queryId = uuidv4();
  const queryHash = sha256(query);
  const agentAddress = getAgentAddress();

  const queryRecord = {
    id: queryId,
    query,
    queryHash,
    budget: budgetMicro,
    agentAddress,
    queryFee: QUERY_FEE_MICRO,
    queryFeeTxHash: feesTxHash || null,
    status: "paid" as const,
    totalPaid: 0,
    receiptIds: [],
    answer: null,
    createdAt: new Date().toISOString(),
  };
  insertQuery(queryRecord);
  void redisIncrQuery();

  // ── Step 4: Pre-register session mandate on-chain ────────────────────────
  // Runs concurrently with nothing else; fail-open (null = no mandate contract configured)
  const mandateId = await createMandateOnChain(policy);

  // ── Step 5: Run buyer agent ───────────────────────────────────────────────
  const sources = getAllSources(category).filter((s) => s.active);
  let decisions;
  try {
    decisions = await runBuyerAgent(query, budgetMicro, sources, policy);
  } catch (err) {
    updateQuery(queryId, { status: "failed" });
    return NextResponse.json({ error: "Agent error", detail: String(err) }, { status: 500 });
  }

  // ── Step 6: Process each decision ─────────────────────────────────────────
  const receiptIds: string[] = [];
  let totalPaid = 0;
  let budgetRemaining = budgetMicro;
  const receiptsOut = [];
  const stoppedEarly = decisions.some((d) => d.sufficiencyStop);

  for (const d of decisions) {
    const receiptId = uuidv4();
    let txHash: string | null = null;
    let paymentStatus: "confirmed" | "simulated" | null = null;

    // Build evidence
    const preimage = buildEvidencePreimage({
      query,
      queryHash,
      sourceUrl: d.source.url,
      excerptUsed: d.excerptUsed || "",
      decision: d.decision,
      scores: d.scores,
      budgetBefore: budgetRemaining,
      reason: d.reason,
      price: d.source.price,
      bonded: d.source.bonded,
      reputation: d.source.reputation,
      contributionWeight: d.contributionWeight,
      weightedAmount: d.weightedAmount,
    });
    const evidenceHash = hashEvidence(preimage);
    const agentSignature = await signReceiptHash(evidenceHash);

    // Pay creator if decision is PAY (not BLOCKED_BY_POLICY).
    // Use weighted amount: same total USDC out, redistributed by relevance contribution.
    if (d.decision === "PAY") {
      const amountToPayMicro = d.weightedAmount ?? d.source.price;
      const payment = await payCreator({
        creatorWallet: d.source.payoutWallet,
        amountMicroUsdc: amountToPayMicro,
        sourceId: d.source.id,
        receiptId,
      });
      txHash = payment.txHash;
      paymentStatus = payment.status;
      totalPaid += amountToPayMicro;
      budgetRemaining -= amountToPayMicro;
    }

    // Persist receipt FIRST — anchor update must come after insert
    const receipt = {
      id: receiptId,
      sourceId: d.source.id,
      queryId,
      agentAddress,
      creatorWallet: d.source.payoutWallet,
      decision: d.decision,
      query,
      queryHash,
      sourceTitle: d.source.title,
      sourceUrl: d.source.url,
      amountPaid: d.decision === "PAY" ? (d.weightedAmount ?? d.source.price) : 0,
      evidenceHash,
      evidencePreimage: preimage,
      contentHashAtDecision: d.source.contentHash,
      scores: d.scores,
      reason: d.reason,
      txHash,
      paymentStatus,
      policyProfile: d.policyProfile,
      policyRulesPassed: d.policyRulesPassed,
      policyRulesFailed: d.policyRulesFailed,
      policyReason: d.policyReason,
      agentSignature,
      budgetBefore: budgetRemaining + (d.decision === "PAY" ? (d.weightedAmount ?? d.source.price) : 0),
      budgetAfter: budgetRemaining,
      challenged: false,
      createdAt: new Date().toISOString(),
    };

    insertReceipt(receipt);

    // Emit live feed event (best-effort — only reaches same serverless instance)
    agentEvents.emit("decision", {
      decision: d.decision,
      sourceTitle: d.source.title,
      amountPaid: d.decision === "PAY" ? (d.weightedAmount ?? d.source.price) : 0,
      evidenceHash,
      query,
      timestamp: new Date().toISOString(),
    });

    // Anchor PAY decision on-chain after receipt row exists
    if (d.decision === "PAY" && d.source.onChainId) {
      const anchor = await anchorPAY({
        onChainSourceId: d.source.onChainId,
        queryHash,
        evidenceHash,
        // Mandate integration — records CitationAllowed/Blocked on CitationMandate.sol
        mandateId:      mandateId ?? undefined,
        amountMicro:    d.weightedAmount ?? d.source.price,
        relevanceScore: d.scores.relevance,
        creatorBonded:  d.source.bonded,
      });
      if (anchor) {
        updateReceiptOnChain(receiptId, anchor.onChainReceiptId, anchor.txHash);
        console.log(`[anchor] PAY receipt ${receiptId} → on-chain #${anchor.onChainReceiptId} (${anchor.txHash})`);
      }
    }
    updateSourceStats(d.source.id, d.decision);
    void redisIncrDecision(d.decision, d.decision === "PAY" ? (d.weightedAmount ?? d.source.price) : 0);
    receiptIds.push(receiptId);
    receiptsOut.push({
      receiptId,
      decision: d.decision,
      source: d.source.title,
      url: d.source.url,
      scores: d.scores,
      reason: d.reason,
      amountPaid: d.decision === "PAY" ? (d.weightedAmount ?? d.source.price) : 0,
      sourcePrice: d.source.price,
      contributionWeight: d.contributionWeight ?? null,
      sourceBonded: d.source.bonded,
      sourceOnChainId: d.source.onChainId ?? null,
      txHash,
      paymentStatus,
      evidenceHash,
      receiptUrl: `/receipt/${receiptId}`,
      policyProfile: d.policyProfile,
      policyRulesPassed: d.policyRulesPassed,
      policyRulesFailed: d.policyRulesFailed,
      policyReason: d.policyReason,
      sufficiencyStop: d.sufficiencyStop ?? false,
    });
  }

  // Close session mandate — records final tally (fire-and-forget, don't block response)
  if (mandateId) void closeMandateOnChain(mandateId);

  // ── Step 7: Generate answer ───────────────────────────────────────────────
  const paidSources = decisions.filter((d) => d.decision === "PAY");
  let answer = "No sources were paid for this query.";

  if (paidSources.length > 0) {
    const citationContext = paidSources
      .map((d) => `[${d.source.title}](${d.source.url}): ${d.excerptUsed}`)
      .join("\n");

    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `Answer this question using ONLY the provided cited sources. Cite each source inline like [Source Title].

Question: ${query}

Sources:
${citationContext}

Provide a concise answer with inline citations.`,
          },
        ],
      });
      answer = (resp.content[0] as { text: string }).text;
    } catch {
      answer = `Based on ${paidSources.length} cited source(s): ${paidSources.map((d) => d.source.title).join(", ")}.`;
    }
  }

  // ── Step 8: Update query record ───────────────────────────────────────────
  updateQuery(queryId, { status: "completed", answer, receiptIds, totalPaid });

  return NextResponse.json({
    queryId,
    query,
    queryHash,
    answer,
    decisions: receiptsOut,
    totalPaid,
    budgetUsed: budgetMicro - budgetRemaining,
    budgetRemaining,
    queryFee: QUERY_FEE_MICRO,
    queryFeeTxHash: feesTxHash,
    receiptIds,
    queryUrl: `/api/query/${queryId}`,
    policyProfile: policy.name,
    stoppedEarly,
    mandateId: mandateId ?? null,
  });
}

/** GET /api/ask — usage info */
export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/ask",
    description: "x402 pay-to-query. Returns 402 without X-PAYMENT header.",
    queryFee: `${QUERY_FEE_MICRO / 1_000_000} USDC`,
    body: { query: "string (required)", budget: "number in USDC (default 0.05)" },
  });
}
