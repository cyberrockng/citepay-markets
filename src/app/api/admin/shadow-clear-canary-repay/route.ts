/**
 * One-shot: repays the Shadow x CitePay bounded Clear canary's 0.001 USDC debt, per
 * SHADOW_CITEPAY_REPAY_REQUEST.md. Shadow specifically wants the controlled agent wallet
 * itself (0x236652EAd...274d) to be msg.sender on repay() — not the sponsor — so the same
 * identity that signed the spend also closes it.
 *
 * That wallet has never held funds (it was generated purely to sign the spend intent), so
 * this route first funds it from the sponsor wallet (AGENT_PRIVATE_KEY) with exactly the ETH
 * and USDC needed for one approve + one repay, nothing more, then has the agent wallet
 * (SHADOW_FLOAT_AGENT_PRIVATE_KEY) approve and repay.
 *
 * Both keys are Sensitive in Vercel and never leave this runtime. Does NOT call
 * settle_clearance, does NOT submit any spend, does NOT touch the line beyond this one repay.
 *
 * Not a permanent surface — remove after the repayment lands.
 */
import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http, erc20Abi, parseAbi, parseEther, keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC_USDC, ARC_RPC } from "@/lib/x402";

export const config = { maxDuration: 90 };

const ARC_CHAIN_ID = 5_042_002;
const USDC_ADDRESS = (process.env.ARC_USDC_ADDRESS || ARC_USDC) as Address;
const SHADOW_FLOAT_ADDRESS = "0x20dcA96B0C487D94De885c726c956ffaF38b12C2" as Address;
const EXPECTED_AGENT = "0x236652EAd43fbb0948173fC4dDF23BC0971B274d" as Address;
const REPAY_AMOUNT_MICRO = 1000n; // exactly the reported debt, per Shadow's request
const GAS_TOP_UP_ETH = parseEther("0.01"); // comfortably covers one approve + one repay

const arcTestnet = {
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const;

const shadowFloatAbi = parseAbi([
  "function repay(address agent, uint256 amountUSDC, bytes32 requestHash) returns (bytes32)",
  "function lines(address agent) view returns (address wallet, uint16 score, uint256 creditLimitUSDC, uint256 availableCreditUSDC, uint256 activeDebtUSDC, uint8 status, uint64 lastReview, bytes32 mandateId, uint64 day, uint256 spentTodayUSDC)",
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 5, delayMs = 4_000): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.error(`[shadow-clear-canary-repay] ${label} attempt ${i}/${attempts} failed: ${String(err).slice(0, 200)}`);
      if (i < attempts) await sleep(delayMs);
    }
  }
  throw lastErr;
}

export async function POST(req: NextRequest) {
  const secret = process.env.SHADOW_CANARY_REPAY_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "SHADOW_CANARY_REPAY_SECRET not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.AGENT_PRIVATE_KEY || !process.env.SHADOW_FLOAT_AGENT_PRIVATE_KEY) {
    return NextResponse.json({ error: "required keys not configured" }, { status: 503 });
  }

  const sponsorAccount = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as Hex);
  const agentAccount = privateKeyToAccount(process.env.SHADOW_FLOAT_AGENT_PRIVATE_KEY as Hex);
  if (agentAccount.address.toLowerCase() !== EXPECTED_AGENT.toLowerCase()) {
    return NextResponse.json({ error: `Agent key resolves to ${agentAccount.address}, expected ${EXPECTED_AGENT}. Refusing.` }, { status: 409 });
  }

  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) });
  const sponsorWallet = createWalletClient({ account: sponsorAccount, chain: arcTestnet, transport: http(ARC_RPC) });
  const agentWallet = createWalletClient({ account: agentAccount, chain: arcTestnet, transport: http(ARC_RPC) });

  const txHashes: Record<string, string> = {};

  try {
    // Guard: confirm the debt is actually what we expect before moving anything.
    const lineBefore = await withRetry("read line before", () => publicClient.readContract({
      address: SHADOW_FLOAT_ADDRESS, abi: shadowFloatAbi, functionName: "lines", args: [EXPECTED_AGENT],
    }));
    if (lineBefore[4] !== REPAY_AMOUNT_MICRO) {
      return NextResponse.json({ error: `Unexpected active debt: ${lineBefore[4]} micro, expected ${REPAY_AMOUNT_MICRO}. Not proceeding.` }, { status: 409 });
    }

    // 1. Fund the agent wallet — exactly what one approve + one repay needs, from the sponsor.
    const fundEthHash = await withRetry("fund agent ETH", () => sponsorWallet.sendTransaction({
      to: EXPECTED_AGENT, value: GAS_TOP_UP_ETH,
    }));
    await withRetry("wait fundEth receipt", () => publicClient.waitForTransactionReceipt({ hash: fundEthHash, timeout: 30_000 }));
    txHashes.fundAgentEth = fundEthHash;

    const fundUsdcHash = await withRetry("fund agent USDC", () => sponsorWallet.writeContract({
      address: USDC_ADDRESS, abi: erc20Abi, functionName: "transfer", args: [EXPECTED_AGENT, REPAY_AMOUNT_MICRO],
    }));
    await withRetry("wait fundUsdc receipt", () => publicClient.waitForTransactionReceipt({ hash: fundUsdcHash, timeout: 30_000 }));
    txHashes.fundAgentUsdc = fundUsdcHash;

    // 2. Agent approves and repays, as its own wallet — matching Shadow's explicit request
    //    that the controlled agent identity itself closes the debt, not the sponsor.
    const approveHash = await withRetry("agent approve", () => agentWallet.writeContract({
      address: USDC_ADDRESS, abi: erc20Abi, functionName: "approve", args: [SHADOW_FLOAT_ADDRESS, REPAY_AMOUNT_MICRO],
    }));
    await withRetry("wait approve receipt", () => publicClient.waitForTransactionReceipt({ hash: approveHash, timeout: 30_000 }));
    txHashes.agentApprove = approveHash;

    const requestHash = keccak256(toHex(`shadow-clear-canary-repay-${Date.now()}-${Math.random()}`));
    const repayHash = await withRetry("agent repay", () => agentWallet.writeContract({
      address: SHADOW_FLOAT_ADDRESS, abi: shadowFloatAbi, functionName: "repay",
      args: [EXPECTED_AGENT, REPAY_AMOUNT_MICRO, requestHash],
    }));
    await withRetry("wait repay receipt", () => publicClient.waitForTransactionReceipt({ hash: repayHash, timeout: 30_000 }));
    txHashes.repay = repayHash;

    // 3. Read back final state — no credentials, only public chain state.
    const lineAfter = await withRetry("read line after", () => publicClient.readContract({
      address: SHADOW_FLOAT_ADDRESS, abi: shadowFloatAbi, functionName: "lines", args: [EXPECTED_AGENT],
    }));

    return NextResponse.json({
      ok: true,
      agentAddress: EXPECTED_AGENT,
      txHashes,
      activeDebtUSDCMicroAfter: lineAfter[4].toString(),
      availableCreditUSDCMicroAfter: lineAfter[3].toString(),
      status: lineAfter[5],
    });
  } catch (err) {
    return NextResponse.json({ error: String(err), txHashesSoFar: txHashes }, { status: 500 });
  }
}
