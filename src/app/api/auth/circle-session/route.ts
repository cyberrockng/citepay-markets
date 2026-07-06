/**
 * POST /api/auth/circle-session
 * Creates a Circle Developer-Controlled Wallet on Arc Testnet, funds it with
 * 5 * QUERY_FEE_MICRO USDC (enough for 5 queries), and returns walletId + address.
 * No MetaMask or SIWE required — Circle is the wallet.
 *
 * Rate-limited: max 3 sessions per IP per hour (in-memory, resets on cold start).
 *
 * GET /api/auth/circle-session?address=0x…
 * Returns the live USDC balance of a session wallet address.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAddress, createPublicClient, http, erc20Abi } from "viem";
import { createAndFundSessionWallet, isCircleSessionEnabled } from "@/lib/circle-session";
import { QUERY_FEE_MICRO, ARC_USDC, ARC_RPC } from "@/lib/x402";

export const dynamic = "force-dynamic";

const SESSION_BUDGET = 5 * QUERY_FEE_MICRO; // $0.005 — 5 queries

// IP rate limit: max 3 sessions per IP per 60-min window
const ipWindows = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 3;
const WINDOW_MS  = 60 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipWindows.get(ip);
  if (!entry || now > entry.resetAt) {
    ipWindows.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function getIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function safeError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

const arcChain = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const;

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address || !isAddress(address)) {
    console.warn("[auth/circle-session] Invalid balance address");
    return safeError("Wallet address is invalid.", 400);
  }
  try {
    const client = createPublicClient({ chain: arcChain, transport: http(ARC_RPC) });
    const balance = await client.readContract({
      address: (process.env.ARC_USDC_ADDRESS || ARC_USDC) as `0x${string}`,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    });
    return NextResponse.json({
      address,
      balanceMicro: Number(balance),
      balanceUsdc: (Number(balance) / 1_000_000).toFixed(6),
      queriesRemaining: Math.floor(Number(balance) / QUERY_FEE_MICRO),
    });
  } catch (err) {
    console.error("[auth/circle-session] Balance lookup failed:", err);
    return safeError("Wallet balance could not be loaded.", 500);
  }
}

export async function POST(req: NextRequest) {
  if (!isCircleSessionEnabled()) {
    console.warn("[auth/circle-session] Circle session wallet env is not configured");
    return safeError("Circle wallet sessions are not available right now.", 503);
  }

  const ip = getIP(req);
  if (!checkRateLimit(ip)) {
    console.warn("[auth/circle-session] Rate limit for IP:", ip);
    return safeError("Circle wallet creation is temporarily limited. Try again later.", 429);
  }

  // Optional: still accept siweAddress for per-address dedup when MetaMask is connected
  let siweAddress: string | undefined;
  try {
    const body = await req.json();
    siweAddress = body?.siweAddress;
  } catch { /* no body — fine */ }

  try {
    const wallet = await createAndFundSessionWallet(SESSION_BUDGET);
    return NextResponse.json({
      walletId:   wallet.walletId,
      address:    wallet.address,
      budgetMicro: SESSION_BUDGET,
      queriesMax:  5,
      fundedBy:   "Circle DCW — agent wallet → session wallet",
      ...(siweAddress ? { siweAddress } : {}),
    });
  } catch (err) {
    console.error("[auth/circle-session] createAndFundSessionWallet failed:", err);
    return safeError("Circle wallet could not be created. Try again later.", 500);
  }
}
