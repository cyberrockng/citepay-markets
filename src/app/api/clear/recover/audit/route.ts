/**
 * POST /api/clear/recover/audit — missed-citation recovery, audit only.
 *
 * Pastes an AI answer generated OUTSIDE CitePay and finds which claims should
 * have been cleared and paid. Compute-only: no settlement, no payment, no
 * on-chain call. Every candidate runs through the exact same
 * evaluateClaimClearance() used by the live demo (via matchAndEvaluateCandidate)
 * — no separate recovery logic, no relaxed standard for content CitePay
 * didn't generate.
 *
 * Rate-limited and input-capped: this is a free, Claude-calling endpoint on
 * arbitrary user text and is a cost-griefing vector if unprotected.
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { RecoveryReport } from "@/lib/clear/types";
import { auditMandate, matchAndEvaluateCandidate, type RecoveryCandidate } from "@/lib/clear/recover";
import { sha256 } from "@/lib/evidence";
import { getAllSources, insertRecoveryReport } from "@/lib/db";
import { createRateLimiter } from "@/lib/rate-limit";
import { CLAUDE_HAIKU_MODEL } from "@/lib/constants";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

const MAX_ANSWER_CHARS = 6_000;
const MAX_CANDIDATES = 6;

// Tightest tier in the app: this is a free Claude-calling endpoint on
// arbitrary pasted text, deliberately stricter than orchestrate's 15s/10.
const _checkRateLimit = createRateLimiter({ windowMs: 20_000, lifetimeCap: 8 });

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function extractCandidates(answer: string, sourceTitles: string[]): Promise<{ candidates: RecoveryCandidate[]; extractionFailed: boolean }> {
  const prompt = `You audit AI-generated answers for citation clearance. Given the answer text below, find up to ${MAX_CANDIDATES} distinct factual claims that appear to draw on an external source.

For each claim, extract:
- "claimText": a short paraphrase of the claim
- "quoteText": the EXACT text span copied character-for-character from the answer that supports this claim — do not paraphrase, do not summarize, copy verbatim
- "matchedSourceTitle": which of these registered CitePay sources (if any) this claim most likely draws from — pick the closest title or null if none plausibly match: ${sourceTitles.map((t) => `"${t}"`).join(", ")}
- "supportScore": 0-100, your confidence the quote genuinely supports the claim

Answer text:
"""
${answer}
"""

Return ONLY a JSON array like:
[{"claimText": "...", "quoteText": "...", "matchedSourceTitle": "..." or null, "supportScore": 85}]`;

  try {
    const msg = await anthropic.messages.create({
      model: CLAUDE_HAIKU_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (msg.content[0] as { text: string }).text.trim();
    const parsed = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || "[]") as RecoveryCandidate[];
    return { candidates: parsed.slice(0, MAX_CANDIDATES).filter((c) => c.claimText && c.quoteText), extractionFailed: false };
  } catch (err) {
    console.error("[recover/audit] extraction failed:", String(err).slice(0, 200));
    return { candidates: [], extractionFailed: true };
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = _checkRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: rl.reason }, { status: 429 });
  }

  let body: { answer?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const answer = (body.answer ?? "").trim();
  if (!answer) {
    return NextResponse.json({ error: "answer is required" }, { status: 400 });
  }
  if (answer.length > MAX_ANSWER_CHARS) {
    return NextResponse.json({ error: `answer exceeds ${MAX_ANSWER_CHARS} character limit` }, { status: 413 });
  }

  const sources = getAllSources();
  if (sources.length === 0) {
    return NextResponse.json({ error: "No registered sources to audit against." }, { status: 500 });
  }

  const answerHash = sha256(answer);
  const mandate = auditMandate();
  const { candidates, extractionFailed } = await extractCandidates(answer, sources.map((s) => s.title));
  if (extractionFailed) {
    return NextResponse.json({ error: "Could not analyze this answer right now. Try again in a moment." }, { status: 502 });
  }
  const findings = candidates.map((candidate) => matchAndEvaluateCandidate(candidate, sources, answerHash, mandate));

  const report: RecoveryReport = {
    id: uuidv4(),
    answerHash,
    inputAnswer: answer,
    findings,
    recoverableCount: findings.filter((f) => f.decision === "CLEARED").length,
    unsupportedCount: findings.filter((f) => f.decision === "UNSUPPORTED").length,
    unmatchedCount: findings.filter((f) => f.decision === "UNMATCHED").length,
    totalRecoverableMicro: findings.reduce((sum, f) => sum + f.wouldBeAmountDueMicro, 0),
    status: "audit_only",
    createdAt: new Date().toISOString(),
  };
  insertRecoveryReport(report);

  return NextResponse.json({ report, auditOnly: true });
}
