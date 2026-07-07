import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { waitUntil } from "@vercel/functions";
import type { Source, ScoreBreakdown } from "@/types";
import type { ClaimClearance, ClearanceCertificate, ClearMandateConfig } from "@/lib/clear/types";
import { evaluateClaimClearance, buildCertificateHash, buildReceiptHash } from "@/lib/clear/evaluate";
import { hashClearObject } from "@/lib/clear/hash";
import { sourceText } from "@/lib/clear/source-text";
import { buildEvidencePreimage, hashEvidence, sha256 } from "@/lib/evidence";
import { getAllSources, insertClaimClearance, insertClearanceCertificate, insertClearMandateConfig, insertReceipt, updateSourceStats } from "@/lib/db";
import { payCreator } from "@/lib/payments";
import { getAgentAddress } from "@/lib/agent";
import { resolvePolicy } from "@/lib/policy";
import { createMandateOnChain, closeMandateOnChain } from "@/lib/anchor";
import { signReceiptHash } from "@/lib/signature";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cloneSource(source: Source, overrides: Partial<Source>): Source {
  return { ...source, ...overrides };
}

function firstSentence(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  const match = trimmed.match(/^.{40,220}?[.!?](\s|$)/);
  return (match?.[0] ?? trimmed.slice(0, 160)).trim();
}

async function createPaidReceipt(opts: {
  source: Source;
  queryId: string;
  query: string;
  answerHash: string;
  claim: ClaimClearance;
  budgetBefore: number;
}): Promise<{ receiptId: string; txHash: string | null; paymentStatus: "confirmed" | "simulated" | null; amountPaid: number }> {
  const receiptId = uuidv4();
  const queryHash = sha256(opts.query);
  const scores: ScoreBreakdown = {
    relevance: opts.claim.supportScore,
    price: 90,
    bond: opts.source.bonded ? 20 : 0,
    reputation: Math.max(0, Math.min(30, opts.source.reputation * 3 + 15)),
    total: Math.min(100, Math.round(opts.claim.supportScore * 0.75 + 20)),
  };
  const preimage = buildEvidencePreimage({
    query: opts.query,
    queryHash,
    sourceUrl: opts.source.url,
    excerptUsed: opts.claim.quoteText,
    decision: "PAY",
    scores,
    budgetBefore: opts.budgetBefore,
    reason: "Claim cleared: exact quote, license, support, price, and budget checks passed before payment.",
    price: opts.claim.amountDueMicro,
    bonded: opts.source.bonded,
    reputation: opts.source.reputation,
    contributionWeight: 1,
    weightedAmount: opts.claim.amountDueMicro,
  });
  const evidenceHash = hashEvidence(preimage);
  const agentSignature = await signReceiptHash(evidenceHash);
  const payment = await payCreator({
    creatorWallet: opts.source.payoutWallet,
    amountMicroUsdc: opts.claim.amountDueMicro,
    sourceId: opts.source.id,
    receiptId,
  });

  insertReceipt({
    id: receiptId,
    sourceId: opts.source.id,
    queryId: opts.queryId,
    agentAddress: getAgentAddress(),
    creatorWallet: opts.source.payoutWallet,
    decision: "PAY",
    query: opts.query,
    queryHash,
    sourceTitle: opts.source.title,
    sourceUrl: opts.source.url,
    amountPaid: opts.claim.amountDueMicro,
    evidenceHash,
    evidencePreimage: preimage,
    contentHashAtDecision: opts.source.contentHash,
    scores,
    reason: "Claim cleared before payment.",
    txHash: payment.txHash,
    paymentStatus: payment.status,
    policyProfile: "Clear Demo",
    policyRulesPassed: ["license_allowed", "quote_verified", "support_score", "price_and_budget"],
    policyRulesFailed: [],
    policyReason: null,
    agentSignature,
    budgetBefore: opts.budgetBefore,
    budgetAfter: opts.budgetBefore - opts.claim.amountDueMicro,
    challenged: false,
    createdAt: new Date().toISOString(),
    purposeCode: payment.status === "confirmed" ? "CITE" : "CITE_SIMULATED",
    contributionWeight: 1,
  });
  updateSourceStats(opts.source.id, "PAY", 1);

  return {
    receiptId,
    txHash: payment.txHash,
    paymentStatus: payment.status,
    amountPaid: opts.claim.amountDueMicro,
  };
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!ip) return NextResponse.json({ error: "Missing request identity" }, { status: 400 });

  const policy = resolvePolicy("balanced");
  const baseSource = getAllSources()[0];
  if (!baseSource) {
    return NextResponse.json({ error: "No sources available. Seed sources first." }, { status: 500 });
  }

  const clearText = sourceText(baseSource);
  const quote = firstSentence(clearText);
  const agentWallet = getAgentAddress();
  const mandateConfigId = uuidv4();
  const queryId = uuidv4();
  const query = "Explain how x402 enables cleared AI citation payments on Arc.";
  const answer = `x402-style payment flows let an agent pay only after a source has cleared policy checks. CitePay Clear adds quote, license, and budget gates before payment: "${quote}"`;
  const answerHash = sha256(answer);
  const now = new Date().toISOString();
  const onChainMandateId = await createMandateOnChain(policy);

  const mandateBase = {
    mandateConfigId,
    onChainMandateId,
    operatorWallet: agentWallet,
    agentWallet,
    policyName: policy.name,
    budgetCapMicro: 12_000,
    maxPricePerCitationMicro: policy.maxPricePerCitation || 10_000,
    maxPricePerClaimMicro: 5_000,
    allowedSourceTypes: ["article"],
    blockedDomains: null,
    blockedWallets: null,
    requiredLicenseClass: "clear-demo",
    requirePublisherVerified: false,
    requireQuoteSpan: true,
    minSupportScore: 75,
    challengeWindowSeconds: 86_400,
    expiresAt: null,
    operatorSignature: null,
    createdAt: now,
  };
  const mandate: ClearMandateConfig = {
    ...mandateBase,
    mandateHash: hashClearObject(mandateBase),
  };
  insertClearMandateConfig(mandate);

  const clearedSource = cloneSource(baseSource, {
    assetType: "article",
    licenseClass: "clear-demo",
    verificationStatus: "verified",
    price: Math.min(baseSource.price || 2_000, 3_000),
  });
  const wrongLicenseSource = cloneSource(baseSource, {
    id: `${baseSource.id}-license-demo`,
    title: `${baseSource.title} — restricted license`,
    licenseClass: "read-only",
    assetType: "article",
    verificationStatus: "verified",
    price: 2_000,
  });
  const unsupportedSource = cloneSource(baseSource, {
    id: `${baseSource.id}-unsupported-demo`,
    title: `${baseSource.title} — unsupported quote`,
    licenseClass: "clear-demo",
    assetType: "article",
    verificationStatus: "verified",
    price: 2_000,
  });
  const overCapSource = cloneSource(baseSource, {
    id: `${baseSource.id}-overcap-demo`,
    title: `${baseSource.title} — premium source`,
    licenseClass: "clear-demo",
    assetType: "article",
    verificationStatus: "verified",
    price: 9_000,
  });

  const cases = [
    {
      label: "Unsupported quote",
      source: unsupportedSource,
      claimText: "The AI wants to cite a source, but the exact quote is absent.",
      quoteText: "This quote is attractive but does not exist in the source.",
      sourceFullText: clearText,
      supportScore: 96,
    },
    {
      label: "Blocked license",
      source: wrongLicenseSource,
      claimText: "The source is relevant but its license is not allowed by the mandate.",
      quoteText: quote,
      sourceFullText: clearText,
      supportScore: 91,
    },
    {
      label: "Over cap",
      source: overCapSource,
      claimText: "The source is valid but too expensive under the mandate.",
      quoteText: quote,
      sourceFullText: clearText,
      supportScore: 90,
    },
    {
      label: "Cleared + paid",
      source: clearedSource,
      claimText: "The claim is supported by an exact quoted source span and can be paid.",
      quoteText: quote,
      sourceFullText: clearText,
      supportScore: 92,
    },
  ];

  let spent = 0;
  const clearances: ClaimClearance[] = [];
  const events: Array<{ label: string; status: "done" | "blocked"; detail: string; clearanceId?: string }> = [
    { label: "Mandate loaded", status: "done", detail: "Balanced policy extended with claim-level license, quote, and cap rules." },
  ];

  for (const demoCase of cases) {
    let clearance = evaluateClaimClearance({
      clearanceId: uuidv4(),
      mandate,
      source: demoCase.source,
      answerHash,
      claimText: demoCase.claimText,
      quoteText: demoCase.quoteText,
      sourceFullText: demoCase.sourceFullText,
      supportScore: demoCase.supportScore,
      sessionSpentMicro: spent,
      nowIso: now,
    });

    if (clearance.decision === "CLEARED") {
      const payment = await createPaidReceipt({
        source: demoCase.source,
        queryId,
        query,
        answerHash,
        claim: clearance,
        budgetBefore: mandate.budgetCapMicro - spent,
      });
      spent += payment.amountPaid;
      const updatedWithoutHash = {
        ...clearance,
        amountPaidMicro: payment.amountPaid,
        underlyingCitationReceiptId: payment.receiptId,
      };
      clearance = { ...updatedWithoutHash, receiptHash: buildReceiptHash(updatedWithoutHash) };
      events.push({
        label: demoCase.label,
        status: "done",
        detail: `Payment executed after clearance checks (${payment.paymentStatus ?? "unknown"}).`,
        clearanceId: clearance.clearanceId,
      });
    } else {
      events.push({
        label: demoCase.label,
        status: "blocked",
        detail: `${clearance.decision}: payment did not execute.`,
        clearanceId: clearance.clearanceId,
      });
    }

    insertClaimClearance(clearance);
    clearances.push(clearance);
  }

  const certificateId = uuidv4();
  const clearedCount = clearances.filter((c) => c.decision === "CLEARED").length;
  const unsupportedCount = clearances.filter((c) => c.decision === "UNSUPPORTED").length;
  const blockedCount = clearances.length - clearedCount - unsupportedCount;
  const certificateHash = buildCertificateHash({
    answerHash,
    mandateConfigId,
    claimClearanceIds: clearances.map((c) => c.clearanceId),
    clearedCount,
    blockedCount,
    unsupportedCount,
    totalPaidMicro: spent,
  });
  const certificate: ClearanceCertificate = {
    certificateId,
    answerHash,
    mandateConfigId,
    onChainMandateId,
    claimClearanceIds: clearances.map((c) => c.clearanceId),
    clearedCount,
    blockedCount,
    unsupportedCount,
    totalPaidMicro: spent,
    certificateHash,
    createdAt: new Date().toISOString(),
  };
  insertClearanceCertificate(certificate);
  events.push({
    label: "Clearance Certificate issued",
    status: "done",
    detail: `${clearedCount} cleared, ${blockedCount} blocked, ${unsupportedCount} unsupported.`,
  });

  if (onChainMandateId) {
    waitUntil(closeMandateOnChain(onChainMandateId));
  }

  return NextResponse.json({
    mandate,
    answer,
    answerHash,
    certificate,
    clearances,
    events,
    primaryClearanceUrl: `/clearance/${clearances.find((c) => c.decision === "CLEARED")?.clearanceId ?? clearances[0]?.clearanceId}`,
  });
}
