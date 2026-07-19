import { NextResponse } from "next/server";
import type { Receipt } from "@/types";
import type { ClaimClearance } from "@/lib/clear/types";
import { getClaimClearanceById, getReceiptById } from "@/lib/db";
import { getNeonClaimClearanceById, getNeonReceiptById } from "@/lib/neon";
import { clearBadgeRateLimiter, getClientIp } from "@/lib/clear/rate-limiters";

export const dynamic = "force-dynamic";

export type ClearBadgeStatus = "cleared" | "paid" | "not_cleared" | "not_found";

export interface ClearBadgeState {
  status: ClearBadgeStatus;
  text: string;
  color: string;
}

const BADGE_HEADERS = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "Cache-Control": "public, max-age=300",
};

export function badgeState(clearance: ClaimClearance | null, receipt: Receipt | null): ClearBadgeState {
  if (!clearance) {
    return { status: "not_found", text: "Not found", color: "#6b7280" };
  }

  if (clearance.decision !== "CLEARED") {
    return { status: "not_cleared", text: `Not cleared: ${clearance.decision}`, color: "#b91c1c" };
  }

  const hasConfirmedPayment = clearance.amountPaidMicro > 0
    && Boolean(clearance.underlyingCitationReceiptId)
    && receipt?.paymentStatus === "confirmed"
    && Boolean(receipt.txHash);

  if (hasConfirmedPayment) {
    return { status: "paid", text: "Cleared Paid", color: "#15803d" };
  }

  return { status: "cleared", text: "Cleared", color: "#0f766e" };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function textWidth(text: string): number {
  return Math.ceil(text.length * 6.8) + 22;
}

function renderBadge(state: ClearBadgeState): string {
  const leftText = "CitePay";
  const rightText = state.text;
  const leftWidth = 62;
  const rightWidth = Math.max(70, textWidth(rightText));
  const width = leftWidth + rightWidth;
  const rightX = leftWidth + Math.floor(rightWidth / 2);
  const label = escapeXml(`${leftText}: ${rightText}`);

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}" width="${width}" height="20" viewBox="0 0 ${width} 20">
  <title>${label}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".16"/>
    <stop offset="1" stop-color="#000" stop-opacity=".08"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${width}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftWidth}" height="20" fill="#111827"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${state.color}"/>
    <rect width="${width}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,sans-serif" font-size="11">
    <text x="31" y="15" fill="#010101" fill-opacity=".3">${escapeXml(leftText)}</text>
    <text x="31" y="14">${escapeXml(leftText)}</text>
    <text x="${rightX}" y="15" fill="#010101" fill-opacity=".3">${escapeXml(rightText)}</text>
    <text x="${rightX}" y="14">${escapeXml(rightText)}</text>
  </g>
</svg>`;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rl = await clearBadgeRateLimiter(getClientIp(req));
  if (!rl.allowed) {
    const res = NextResponse.json({ error: rl.reason }, { status: 429 });
    if (rl.retryAfterMs) res.headers.set("Retry-After", String(Math.ceil(rl.retryAfterMs / 1000)));
    return res;
  }

  const { id } = await params;
  const clearance = getClaimClearanceById(id) ?? await getNeonClaimClearanceById(id);
  const receipt = clearance?.underlyingCitationReceiptId
    ? getReceiptById(clearance.underlyingCitationReceiptId) ?? await getNeonReceiptById(clearance.underlyingCitationReceiptId)
    : null;

  return new NextResponse(renderBadge(badgeState(clearance, receipt)), {
    status: 200,
    headers: BADGE_HEADERS,
  });
}
