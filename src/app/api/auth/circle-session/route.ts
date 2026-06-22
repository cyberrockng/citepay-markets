/**
 * POST /api/auth/circle-session
 *
 * Creates a Circle Developer-Controlled Wallet on Arc Testnet and funds it with
 * QUERY_FEE_MICRO USDC so the browser can sign x402 payments without holding
 * a raw private key.
 *
 * Requires SIWE authentication (siweAddress in body).
 * Rate-limited: one active Circle session wallet per SIWE address per instance.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { createAndFundSessionWallet, isCircleSessionEnabled } from "@/lib/circle-session";

export const dynamic = "force-dynamic";

// In-memory map: siweAddress → { walletId, address } — one reuse per cold-start
const sessions = new Map<string, { walletId: string; address: string }>();

export async function POST(req: NextRequest) {
  if (!isCircleSessionEnabled()) {
    return NextResponse.json({ error: "Circle session wallets not configured on this instance" }, { status: 503 });
  }

  let body: { siweAddress?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const { siweAddress } = body;
  if (!siweAddress || !isAddress(siweAddress)) {
    return NextResponse.json({ error: "siweAddress required — complete SIWE first" }, { status: 401 });
  }

  const key = siweAddress.toLowerCase();

  // Reuse existing session wallet within this instance lifetime
  const existing = sessions.get(key);
  if (existing) {
    return NextResponse.json({ ...existing, reused: true });
  }

  try {
    const wallet = await createAndFundSessionWallet();
    sessions.set(key, wallet);
    return NextResponse.json({ ...wallet, reused: false });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
