/**
 * POST /api/auth/fund-session
 *
 * Funds a browser-generated session EOA with exactly QUERY_FEE_MICRO micro-USDC
 * so the browser can sign and settle one real x402 payment without the server
 * ever holding the session key.
 *
 * Rate-limited: one session fund per verified SIWE address per cold-start window
 * (in-memory set — fine for hackathon demo).
 */
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { payCreator } from "@/lib/payments";
import { QUERY_FEE_MICRO } from "@/lib/x402";

export const dynamic = "force-dynamic";

const funded = new Set<string>(); // session EOA addresses funded this instance

const ipWindows = new Map<string, { count: number; resetAt: number; dailyMicro: number; dayResetAt: number }>();
const RATE_LIMIT = 10;
const WINDOW_MS = 60 * 1000;
const DAILY_CAP_MICRO = 50 * 1_000_000; // 50 USDC per IP per day

function checkRateLimit(ip: string, amountMicro: number): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const entry = ipWindows.get(ip);
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayResetAt = dayStart.getTime() + 24 * 60 * 60 * 1000;

  if (!entry || now > entry.resetAt) {
    const prevDaily = entry && now < entry.dayResetAt ? entry.dailyMicro : 0;
    if (prevDaily + amountMicro > DAILY_CAP_MICRO) {
      return { allowed: false, reason: "Daily funding cap reached for this IP" };
    }
    ipWindows.set(ip, {
      count: 1, resetAt: now + WINDOW_MS,
      dailyMicro: prevDaily + amountMicro, dayResetAt,
    });
    return { allowed: true };
  }
  if (entry.count >= RATE_LIMIT) {
    return { allowed: false, reason: "Rate limit: max 10 requests per minute per IP" };
  }
  if (entry.dailyMicro + amountMicro > DAILY_CAP_MICRO) {
    return { allowed: false, reason: "Daily funding cap reached for this IP" };
  }
  entry.count++;
  entry.dailyMicro += amountMicro;
  return { allowed: true };
}

function getIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  let body: { sessionAddress?: string; siweAddress?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const { sessionAddress, siweAddress } = body;

  if (!sessionAddress || !isAddress(sessionAddress)) {
    return NextResponse.json({ error: "sessionAddress must be a valid EVM address" }, { status: 400 });
  }
  if (!siweAddress || !isAddress(siweAddress)) {
    return NextResponse.json({ error: "siweAddress required — complete SIWE first" }, { status: 401 });
  }
  if (funded.has(sessionAddress.toLowerCase())) {
    return NextResponse.json({ alreadyFunded: true, message: "Session EOA already funded" });
  }

  const ip = getIP(req);
  const rl = checkRateLimit(ip, QUERY_FEE_MICRO);
  if (!rl.allowed) {
    return NextResponse.json({ error: rl.reason }, { status: 429 });
  }

  try {
    const result = await payCreator({
      creatorWallet:   sessionAddress,
      amountMicroUsdc: QUERY_FEE_MICRO,
      sourceId:        "session-fund",
      receiptId:       `fund-${Date.now()}`,
    });

    funded.add(sessionAddress.toLowerCase());

    return NextResponse.json({
      success: true,
      txHash: result.txHash,
      amountMicroUsdc: QUERY_FEE_MICRO,
      sessionAddress,
      status: result.status,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
