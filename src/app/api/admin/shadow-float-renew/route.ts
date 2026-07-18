/**
 * One-shot admin operation: replaces the Shadow Float V2 sponsored line whose agent-side
 * private key (0xdfDEA2015f0b176e89a79cb8b4D5ef22bE6e044f) is permanently lost with a fresh
 * sponsored line under a new agent identity we actually control.
 *
 * Sponsor stays the existing wallet (AGENT_PRIVATE_KEY, 0x5389...f105) — it already holds the
 * sponsor role on the old line, so closing/reopening under it needs no new secret for that part.
 * The agent role needs a genuinely different address than the sponsor's own: 0x5389...f105
 * already holds an unrelated, separate sponsored line (Shadow's operator wallet is its sponsor,
 * expired 2026-07-03) occupying that address's one-line-per-agent slot on this contract, so
 * self-sponsoring under the same address is blocked. SHADOW_FLOAT_AGENT_PRIVATE_KEY is a freshly
 * generated keypair used only to sign the FloatSpendIntent — it never submits a transaction or
 * pays gas; the sponsor wallet does all of that.
 *
 * Reclaims the old line's 0.05 USDC reserve (sponsor-only, no agent signature required), opens
 * a new line for the new agent with it, runs one real signed-intent spend + repay cycle, and
 * reports the resulting on-chain state.
 *
 * Intentionally not a permanent surface — remove this route once the renewal has run once and
 * been confirmed. Protected so it can't be triggered by anyone who finds the URL first.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  createWalletClient, createPublicClient, http, erc20Abi, keccak256, toHex,
  parseAbi, type Address, type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC_USDC, ARC_RPC } from "@/lib/x402";

export const config = { maxDuration: 180 };

const ARC_CHAIN_ID = 5_042_002;
const USDC_ADDRESS = (process.env.ARC_USDC_ADDRESS || ARC_USDC) as Address;
const SHADOW_FLOAT_ADDRESS = "0x20dcA96B0C487D94De885c726c956ffaF38b12C2" as Address;
const OLD_AGENT = "0xdfDEA2015f0b176e89a79cb8b4D5ef22bE6e044f" as Address; // lost key
const SPEND_AMOUNT_MICRO = 5_000n; // 0.005 USDC — small, well inside any limit we set below
const MAX_PER_REQUEST_MICRO = 10_000n;
const DAILY_LIMIT_MICRO = 10_000n;
const LINE_EXPIRY_SECONDS = 90n * 24n * 60n * 60n; // 90 days

const arcTestnet = {
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const;

const shadowFloatAbi = parseAbi([
  "function openSponsoredLine(address agent, uint256 reserveUSDC, bytes32 mandateId, uint64 lineExpiry, address provider, bytes32 endpointHash, uint256 maxPerRequestUSDC, uint256 dailyLimitUSDC, uint64 providerExpiry) returns (bytes32)",
  "function closeSponsoredLine(address agent, address recipient, bytes32 requestHash) returns (bytes32)",
  "function repay(address agent, uint256 amountUSDC, bytes32 requestHash) returns (bytes32)",
  "function requestSignedSpend((address agent,address provider,bytes32 endpointHash,uint256 amountUSDC,uint256 maxDebtUSDC,uint256 nonce,uint256 expiry,address executor,string reason) intent, bytes signature) returns (bytes32, bool, uint8)",
  "function lines(address agent) view returns (address wallet, uint16 score, uint256 creditLimitUSDC, uint256 availableCreditUSDC, uint256 activeDebtUSDC, uint8 status, uint64 lastReview, bytes32 mandateId, uint64 day, uint256 spentTodayUSDC)",
  "function lineSponsors(address agent) view returns (address sponsor, uint256 reserveUSDC)",
  "function lineExpiries(address agent) view returns (uint64)",
]);

const intentTypes = {
  FloatSpendIntent: [
    { name: "agent", type: "address" },
    { name: "provider", type: "address" },
    { name: "endpointHash", type: "bytes32" },
    { name: "amountUSDC", type: "uint256" },
    { name: "maxDebtUSDC", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "executor", type: "address" },
    { name: "reason", type: "string" },
  ],
} as const;

function freshHash(label: string): Hex {
  return keccak256(toHex(`${label}-${Date.now()}-${Math.random()}`));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Arc testnet's public RPC rate-limits aggressively enough that back-to-back calls from one
// function invocation trip it (seen directly: two readContract calls a beat apart both hit
// "request limit reached") — and waitForTransactionReceipt polls internally, so it can hit the
// same limit mid-wait with no way to insert a gap from the outside. Wrapping every RPC-touching
// call in a retry lets a transient rate-limit error resolve itself instead of failing the whole
// (multi-transaction, partially irreversible) sequence.
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 6, delayMs = 4_000): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.error(`[shadow-float-renew] ${label} attempt ${i}/${attempts} failed: ${String(err).slice(0, 200)}`);
      if (i < attempts) await sleep(delayMs);
    }
  }
  throw lastErr;
}

export async function POST(req: NextRequest) {
  const secret = process.env.SHADOW_FLOAT_RENEW_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "SHADOW_FLOAT_RENEW_SECRET not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.AGENT_PRIVATE_KEY) {
    return NextResponse.json({ error: "AGENT_PRIVATE_KEY not configured" }, { status: 503 });
  }
  if (!process.env.SHADOW_FLOAT_AGENT_PRIVATE_KEY) {
    return NextResponse.json({ error: "SHADOW_FLOAT_AGENT_PRIVATE_KEY not configured" }, { status: 503 });
  }

  const sponsorAccount = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as Hex);
  const agentAccount = privateKeyToAccount(process.env.SHADOW_FLOAT_AGENT_PRIVATE_KEY as Hex);
  const sponsor = sponsorAccount.address;
  const agent = agentAccount.address;
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) });
  const walletClient = createWalletClient({ account: sponsorAccount, chain: arcTestnet, transport: http(ARC_RPC) });

  const txHashes: Record<string, string> = {};

  try {
    // Guard: don't attempt this twice — a line already existing for the new agent means either
    // a prior run succeeded or something else opened one; either way, don't blindly re-run.
    const existingAgentLine = await withRetry("read existingAgentLine", () => publicClient.readContract({
      address: SHADOW_FLOAT_ADDRESS, abi: shadowFloatAbi, functionName: "lines", args: [agent],
    }));
    if (existingAgentLine[0] !== "0x0000000000000000000000000000000000000000") {
      return NextResponse.json({ error: "A line already exists for the new agent address. Not re-running.", existingLine: serializeLine(existingAgentLine) }, { status: 409 });
    }

    // 1. Reclaim the old line's reserve — sponsor-only, needs no agent signature.
    const oldSponsor = await withRetry("read oldSponsor", () => publicClient.readContract({
      address: SHADOW_FLOAT_ADDRESS, abi: shadowFloatAbi, functionName: "lineSponsors", args: [OLD_AGENT],
    }));
    if (oldSponsor[0].toLowerCase() !== sponsor.toLowerCase()) {
      return NextResponse.json({ error: `Old line sponsor mismatch: expected ${sponsor}, found ${oldSponsor[0]}` }, { status: 409 });
    }
    const reserveUSDC = oldSponsor[1];
    const closeHash = await withRetry("write closeSponsoredLine", () => walletClient.writeContract({
      address: SHADOW_FLOAT_ADDRESS, abi: shadowFloatAbi, functionName: "closeSponsoredLine",
      args: [OLD_AGENT, sponsor, freshHash("close")],
    }));
    await withRetry("wait closeOldLine receipt", () => publicClient.waitForTransactionReceipt({ hash: closeHash, timeout: 30_000 }));
    txHashes.closeOldLine = closeHash;

    // 2. Approve + open a fresh line for the new agent, using the reclaimed reserve.
    const approve1Hash = await withRetry("write approve (open)", () => walletClient.writeContract({
      address: USDC_ADDRESS, abi: erc20Abi, functionName: "approve", args: [SHADOW_FLOAT_ADDRESS, reserveUSDC],
    }));
    await withRetry("wait approveForOpen receipt", () => publicClient.waitForTransactionReceipt({ hash: approve1Hash, timeout: 30_000 }));
    txHashes.approveForOpen = approve1Hash;

    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    const lineExpiry = nowSec + LINE_EXPIRY_SECONDS;
    const endpointHash = keccak256(toHex("citepay:shadow-float-renewal"));
    const mandateId = freshHash("mandate");

    const openHash = await withRetry("write openSponsoredLine", () => walletClient.writeContract({
      address: SHADOW_FLOAT_ADDRESS, abi: shadowFloatAbi, functionName: "openSponsoredLine",
      args: [agent, reserveUSDC, mandateId, lineExpiry, sponsor, endpointHash, MAX_PER_REQUEST_MICRO, DAILY_LIMIT_MICRO, lineExpiry],
    }));
    await withRetry("wait openNewLine receipt", () => publicClient.waitForTransactionReceipt({ hash: openHash, timeout: 30_000 }));
    txHashes.openNewLine = openHash;

    // 3. Sign (as the new agent) and submit (as the sponsor) one real FloatSpendIntent —
    //    sponsored lines force this path (requestSpend reverts with SignedIntentRequired
    //    whenever a sponsor is set). Provider is the sponsor's own address so the whole loop
    //    stays self-contained: funds move contract -> sponsor on spend, sponsor -> contract on
    //    repay, no third party involved.
    const intent = {
      agent,
      provider: sponsor,
      endpointHash,
      amountUSDC: SPEND_AMOUNT_MICRO,
      // feeBps is 0 right now (confirmed read before writing this), but maxDebtUSDC must cover
      // amountUSDC + fee or _consumeSignedIntent reverts with FeeExceedsIntent — 10% headroom
      // costs nothing here and doesn't depend on feeBps staying exactly 0 during execution.
      maxDebtUSDC: (SPEND_AMOUNT_MICRO * 110n) / 100n,
      nonce: BigInt(Date.now()),
      expiry: nowSec + 3600n,
      executor: sponsor,
      reason: "Shadow Float line renewal canary — sponsor-submitted, agent-signed spend/repay proof",
    };
    const domain = { name: "ShadowFloat", version: "1", chainId: ARC_CHAIN_ID, verifyingContract: SHADOW_FLOAT_ADDRESS } as const;
    const signature = await agentAccount.signTypedData({ domain, types: intentTypes, primaryType: "FloatSpendIntent", message: intent });

    const spendHash = await withRetry("write requestSignedSpend", () => walletClient.writeContract({
      address: SHADOW_FLOAT_ADDRESS, abi: shadowFloatAbi, functionName: "requestSignedSpend",
      args: [intent, signature],
    }));
    await withRetry("wait signedSpend receipt", () => publicClient.waitForTransactionReceipt({ hash: spendHash, timeout: 30_000 }));
    txHashes.signedSpend = spendHash;

    // 4. Approve + repay in full, immediately — this is a canary, not a real draw. repay() is
    //    permissionless, so the sponsor wallet can call it directly without the agent's key.
    const approve2Hash = await withRetry("write approve (repay)", () => walletClient.writeContract({
      address: USDC_ADDRESS, abi: erc20Abi, functionName: "approve", args: [SHADOW_FLOAT_ADDRESS, SPEND_AMOUNT_MICRO],
    }));
    await withRetry("wait approveForRepay receipt", () => publicClient.waitForTransactionReceipt({ hash: approve2Hash, timeout: 30_000 }));
    txHashes.approveForRepay = approve2Hash;

    const repayHash = await withRetry("write repay", () => walletClient.writeContract({
      address: SHADOW_FLOAT_ADDRESS, abi: shadowFloatAbi, functionName: "repay",
      args: [agent, SPEND_AMOUNT_MICRO, freshHash("repay")],
    }));
    await withRetry("wait repay receipt", () => publicClient.waitForTransactionReceipt({ hash: repayHash, timeout: 30_000 }));
    txHashes.repay = repayHash;

    // 5. Read back final state for the canary report — no credentials, only public chain state.
    const finalLine = await withRetry("read finalLine", () => publicClient.readContract({
      address: SHADOW_FLOAT_ADDRESS, abi: shadowFloatAbi, functionName: "lines", args: [agent],
    }));
    const finalSponsor = await withRetry("read finalSponsor", () => publicClient.readContract({
      address: SHADOW_FLOAT_ADDRESS, abi: shadowFloatAbi, functionName: "lineSponsors", args: [agent],
    }));
    const finalExpiry = await withRetry("read finalExpiry", () => publicClient.readContract({
      address: SHADOW_FLOAT_ADDRESS, abi: shadowFloatAbi, functionName: "lineExpiries", args: [agent],
    }));

    return NextResponse.json({
      ok: true,
      sponsorAddress: sponsor,
      agentAddress: agent,
      shadowFloatAddress: SHADOW_FLOAT_ADDRESS,
      txHashes,
      newExpiry: finalExpiry.toString(),
      newExpiryIso: new Date(Number(finalExpiry) * 1000).toISOString(),
      reserveUSDCMicro: finalSponsor[1].toString(),
      line: serializeLine(finalLine),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err), txHashesSoFar: txHashes }, { status: 500 });
  }
}

function serializeLine(line: readonly [Address, number, bigint, bigint, bigint, number, bigint, Hex, bigint, bigint]) {
  return {
    wallet: line[0],
    score: line[1],
    creditLimitUSDCMicro: line[2].toString(),
    availableCreditUSDCMicro: line[3].toString(),
    activeDebtUSDCMicro: line[4].toString(),
    status: line[5],
    lastReview: line[6].toString(),
    mandateId: line[7],
  };
}
