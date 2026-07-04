import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import Anthropic from "@anthropic-ai/sdk";
import { build402Response, verifyGatewayPayment, verifyDirectPayment, QUERY_FEE_MICRO, computeActualCharge } from "@/lib/x402";
import { isReplayed, recordSignature } from "@/lib/replay-guard";
import { validateAndConsume } from "@/lib/subscription";
import { runBuyerAgent, getAgentAddress, scoreContributionWeights } from "@/lib/agent";
import { buildEvidencePreimage, hashEvidence, sha256, parseUSDC } from "@/lib/evidence";
import { payCreator } from "@/lib/payments";
import { anchorPAY, anchorBLOCKED, checkAnchorReady, createMandateOnChain, closeMandateOnChain } from "@/lib/anchor";
import { resolvePolicy } from "@/lib/policy";
import { signReceiptHash } from "@/lib/signature";
import { agentEvents } from "@/lib/events";
import { redisIncrQuery, redisIncrDecision } from "@/lib/redis-stats";
import { runExternalOutreachAsync } from "@/lib/outreach";
import { waitUntil } from "@vercel/functions";
import {
  getAllSources,
  insertQuery,
  updateQuery,
  insertReceipt,
  updateSourceStats,
  updateReceiptOnChain,
} from "@/lib/db";
import { persistReceipt } from "@/lib/neon";

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

  // ── Step 1: Subscription pass fast-path (bypasses per-query x402) ────────
  const subToken = req.headers.get("X-Subscription-Token");
  let usedPass = false;
  let feesTxHash: string | null = null;

  if (subToken) {
    const result = validateAndConsume(subToken);
    if (!result.valid) {
      return NextResponse.json(
        { error: "Subscription pass invalid", detail: result.reason, queriesRemaining: 0 },
        { status: 402 }
      );
    }
    usedPass = true;
    // Attach remaining count to response headers so clients can track usage
    // (set after response is built below)
  }

  // ── Step 2: x402 payment gate (skipped when valid pass is used) ──────────
  if (!usedPass) {
    const hasGateway = req.headers.has("payment-signature");
    const hasLegacy  = req.headers.has("X-PAYMENT") || req.headers.has("x-payment");
    const hasDirect  = req.headers.has("X-Arc-Tx-Hash") || req.headers.has("x-arc-tx-hash");

    if (!hasGateway && !hasLegacy && !hasDirect) {
      return build402Response(req.url);
    }

    if (hasDirect) {
      // Direct Arc USDC transfer path — any EVM agent, no Circle Gateway required
      const { valid, txHash: verifiedTxHash, error: payError } = await verifyDirectPayment(req);
      if (!valid) {
        return NextResponse.json(
          { error: "Direct payment verification failed", detail: payError },
          { status: 402 }
        );
      }
      feesTxHash = verifiedTxHash ?? null;
    } else {
      // Circle Gateway path (primary)
      const rawSig = req.headers.get("payment-signature") ?? req.headers.get("X-PAYMENT") ?? req.headers.get("x-payment") ?? "";

      if (rawSig && await isReplayed(rawSig)) {
        return NextResponse.json(
          { error: "Replayed payment signature", detail: "This payment has already been used. Submit a new payment." },
          { status: 402 }
        );
      }

      const { valid, txHash: verifiedTxHash, error: payError } = await verifyGatewayPayment(req);
      if (!valid) {
        return NextResponse.json(
          { error: "Payment verification failed", detail: payError },
          { status: 402 }
        );
      }

      feesTxHash = verifiedTxHash ?? null;
      if (rawSig) await recordSignature(rawSig);
    }
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

  // ── Step 5.5: External citation outreach (kept alive via waitUntil) ──────────
  // Discover external URLs that would have been paid, log them, email creators.
  const _outreachClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  waitUntil(runExternalOutreachAsync(query, _outreachClient));

  // ── Step 6: Synthesise answer FIRST so contribution weights use real output ─
  const paidDecisionsForSynth = decisions.filter((d) => d.decision === "PAY");
  let answer = "No sources were paid for this query.";

  if (paidDecisionsForSynth.length > 0) {
    const citationContext = paidDecisionsForSynth
      .map((d) => {
        const body = d.source.fullContent
          ? d.source.fullContent.slice(0, 900)
          : d.excerptUsed;
        return `[${d.source.title}](${d.source.url}):\n${body}`;
      })
      .join("\n\n---\n\n");
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{
          role: "user",
          content: `Answer this question using ONLY the provided cited sources. Cite each source inline like [Source Title].

Question: ${query}

Sources:
${citationContext}

Provide a concise answer with inline citations.`,
        }],
      });
      answer = (resp.content[0] as { text: string }).text;
    } catch {
      answer = `Based on ${paidDecisionsForSynth.length} cited source(s): ${paidDecisionsForSynth.map((d) => d.source.title).join(", ")}.`;
    }

    // ── Step 6.5: VCS — count [Source Title] mentions in the answer ───────────
    // Objective inline citation counting: more mentions = larger budget share.
    scoreContributionWeights(answer, paidDecisionsForSynth);
  }

  // ── Step 7: Process each decision (now with final post-synthesis amounts) ──
  const receiptIds: string[] = [];
  let totalPaid = 0;
  let budgetRemaining = budgetMicro;
  const receiptsOut = [];
  // On-chain PAY anchoring is collected here and run in the background via waitUntil
  // (see after the loop) so blockchain writes don't block the response — the ~30s
  // wait was crashing mobile browsers. Citations still anchor; /proof reads them live.
  const anchorJobs: Array<() => Promise<void>> = [];
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
    let isConfirmedPay = false;
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
      isConfirmedPay = payment.status === "confirmed";
      if (isConfirmedPay) {
        totalPaid += amountToPayMicro;
      }
      budgetRemaining -= amountToPayMicro;
    }

    // Persist receipt FIRST — anchor update must come after insert
    const purposeCode = d.decision === "PAY"
      ? (isConfirmedPay ? "CITE" : "CITE_SIMULATED")
      : d.decision === "REFUSE" ? "REFUSE"
      : d.decision === "BLOCKED_BY_POLICY" ? "BLOCKED"
      : "SKIP";

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
      purposeCode,
      contributionWeight: d.contributionWeight ?? null,
    };

    insertReceipt(receipt);
    persistReceipt({
      id:                 receipt.id,
      sourceId:           String(receipt.sourceId),
      queryId:            receipt.queryId,
      agentAddress:       receipt.agentAddress,
      creatorWallet:      receipt.creatorWallet,
      decision:           receipt.decision,
      query:              receipt.query,
      queryHash:          receipt.queryHash,
      sourceTitle:        receipt.sourceTitle,
      sourceUrl:          receipt.sourceUrl,
      amountPaid:         receipt.amountPaid,
      evidenceHash:       receipt.evidenceHash,
      reason:             receipt.reason,
      txHash:             receipt.txHash,
      paymentStatus:      receipt.paymentStatus,
      policyProfile:      receipt.policyProfile ?? null,
      onChainReceiptId:   null,
      onChainTxHash:      null,
      purposeCode:        receipt.purposeCode ?? null,
      createdAt:          receipt.createdAt,
    });

    // Emit live feed event (best-effort — only reaches same serverless instance)
    agentEvents.emit("decision", {
      decision: d.decision,
      sourceTitle: d.source.title,
      amountPaid: d.decision === "PAY" ? (d.weightedAmount ?? d.source.price) : 0,
      evidenceHash,
      query,
      timestamp: new Date().toISOString(),
    });

    // Anchor BLOCKED_BY_POLICY decisions on CitationMandate — on-chain proof of policy enforcement
    if (d.decision === "BLOCKED_BY_POLICY" && mandateId) {
      void anchorBLOCKED({
        queryHash,
        evidenceHash,
        policyRule: d.policyRulesFailed?.[0] ?? "unknown",
        mandateId,
      });
    }

    // Collect PAY anchoring to run in the background (see waitUntil after the loop).
    // Only for confirmed payments. Capture per-iteration values for the closure.
    if (d.decision === "PAY" && isConfirmedPay && d.source.onChainId) {
      const onChainSourceId = d.source.onChainId;
      const amountMicro     = d.weightedAmount ?? d.source.price;
      const relevanceScore  = d.scores.relevance;
      const creatorBonded   = d.source.bonded;
      const anchorReceiptId = receiptId;
      const anchorEvidence  = evidenceHash;
      anchorJobs.push(async () => {
        const anchor = await anchorPAY({
          onChainSourceId,
          queryHash,
          evidenceHash:   anchorEvidence,
          mandateId:      mandateId ?? undefined,
          amountMicro,
          relevanceScore,
          creatorBonded,
        });
        if (anchor) {
          updateReceiptOnChain(anchorReceiptId, anchor.onChainReceiptId, anchor.txHash);
          console.log(`[anchor] PAY receipt ${anchorReceiptId} → on-chain #${anchor.onChainReceiptId} (${anchor.txHash})`);
        }
      });
    }
    updateSourceStats(d.source.id, d.decision, d.contributionWeight ?? undefined);
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
      // Inline receipt fields so clients (e.g. the /demo flow) don't need a second
      // /api/receipt fetch, which can 404 across serverless instances (ephemeral SQLite).
      sourceId:              d.source.id,
      sourceTitle:           d.source.title,
      evidencePreimage:      preimage,
      contentHashAtDecision: d.source.contentHash,
      receiptUrl: `/receipt/${receiptId}`,
      policyProfile:     d.policyProfile,
      policyRulesPassed: d.policyRulesPassed,
      policyRulesFailed: d.policyRulesFailed,
      policyReason:      d.policyReason,
      sufficiencyStop:   d.sufficiencyStop ?? false,
      purposeCode,
      // fetchWithBudget probe fields
      probePrice:    d.probePrice    ?? null,
      probePassed:   d.probePassed   ?? null,
      probeDecision: d.probeDecision ?? null,
    });
  }

  // Run all PAY anchors sequentially in the background (nonce-safe), then close the
  // mandate — kept alive by waitUntil so it completes after the response is sent.
  if (anchorJobs.length > 0 || mandateId) {
    waitUntil((async () => {
      for (const job of anchorJobs) {
        try { await job(); } catch (e) { console.error("[anchor] background PAY anchor failed", e); }
      }
      if (mandateId) { try { await closeMandateOnChain(mandateId); } catch (e) { console.error("[anchor] closeMandate failed", e); } }
    })());
  }

  // ── Step 8: Update query record ───────────────────────────────────────────
  updateQuery(queryId, { status: "completed", answer, receiptIds, totalPaid });

  const sourcesCharged = paidDecisionsForSynth.length;
  const actualChargeMicro = computeActualCharge(sourcesCharged);

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
    pricing: {
      scheme: "upto",
      sourcesCharged,
      actualChargeMicro,
      actualChargeUsdc: actualChargeMicro / 1_000_000,
      minChargeMicro: QUERY_FEE_MICRO,
      maxChargeMicro: 10_000,
    },
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
