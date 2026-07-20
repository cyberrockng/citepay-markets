/**
 * One-shot: migrates off the compromised AGENT_PRIVATE_KEY wallet. That key has been in this
 * repo's public git history since commit 91af41f5 (2026-06-24) and must be treated as fully
 * compromised, even though it's testnet-only. Runs here because both the old and new private
 * keys are Sensitive in Vercel and never leave this runtime.
 *
 * Priority order matters: the old wallet is still the sponsor on the just-completed Shadow
 * Float canary line (0.05 USDC reserve), and closeSponsoredLine is sponsor-gated with no
 * timelock -- anyone holding the leaked key could redirect that reserve to themselves right
 * now. So: reclaim that reserve straight to the new address first, then sweep the remaining
 * USDC/ETH balance, in that order.
 *
 * Not a permanent surface -- remove immediately after migration completes.
 */
import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http, erc20Abi, parseAbi, parseEther, keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC_USDC, ARC_RPC } from "@/lib/x402";

export const config = { maxDuration: 90 };

const ARC_CHAIN_ID = 5_042_002;
const USDC_ADDRESS = (process.env.ARC_USDC_ADDRESS || ARC_USDC) as Address;
const SHADOW_FLOAT_ADDRESS = "0x20dcA96B0C487D94De885c726c956ffaF38b12C2" as Address;
const CANARY_AGENT = "0x236652EAd43fbb0948173fC4dDF23BC0971B274d" as Address;
const ETH_DUST_BUFFER = parseEther("0.002"); // leave a small margin so the final sweep tx never underfunds its own gas

const arcTestnet = {
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const;

const shadowFloatAbi = parseAbi([
  "function closeSponsoredLine(address agent, address recipient, bytes32 requestHash) returns (bytes32)",
  "function lineSponsors(address agent) view returns (address sponsor, uint256 reserveUSDC)",
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
      console.error(`[rotate-agent-key] ${label} attempt ${i}/${attempts} failed: ${String(err).slice(0, 200)}`);
      if (i < attempts) await sleep(delayMs);
    }
  }
  throw lastErr;
}

export async function POST(req: NextRequest) {
  const secret = process.env.ROTATE_AGENT_KEY_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "ROTATE_AGENT_KEY_SECRET not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.AGENT_PRIVATE_KEY || !process.env.AGENT_PRIVATE_KEY_NEW) {
    return NextResponse.json({ error: "required keys not configured" }, { status: 503 });
  }

  const oldAccount = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as Hex);
  const newAccount = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY_NEW as Hex);
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) });
  const oldWallet = createWalletClient({ account: oldAccount, chain: arcTestnet, transport: http(ARC_RPC) });

  const txHashes: Record<string, string> = {};

  try {
    // 1. Reclaim the sponsored reserve straight to the new address — the most time-sensitive
    //    step, since anyone with the leaked key could otherwise redirect it first.
    const sponsor = await withRetry("read line sponsor", () => publicClient.readContract({
      address: SHADOW_FLOAT_ADDRESS, abi: shadowFloatAbi, functionName: "lineSponsors", args: [CANARY_AGENT],
    }));
    let reserveUSDC = 0n;
    if (sponsor[0].toLowerCase() === oldAccount.address.toLowerCase() && sponsor[1] > 0n) {
      const line = await withRetry("read line debt", () => publicClient.readContract({
        address: SHADOW_FLOAT_ADDRESS, abi: shadowFloatAbi, functionName: "lines", args: [CANARY_AGENT],
      }));
      if (line[4] !== 0n) {
        return NextResponse.json({ error: `Line still has active debt (${line[4]}), refusing to close.` }, { status: 409 });
      }
      reserveUSDC = sponsor[1];
      const closeHash = await withRetry("close sponsored line", () => oldWallet.writeContract({
        address: SHADOW_FLOAT_ADDRESS, abi: shadowFloatAbi, functionName: "closeSponsoredLine",
        args: [CANARY_AGENT, newAccount.address, keccak256(toHex(`agent-key-rotation-close-${Date.now()}`))],
      }));
      await withRetry("wait close receipt", () => publicClient.waitForTransactionReceipt({ hash: closeHash, timeout: 30_000 }));
      txHashes.closeSponsoredLine = closeHash;
    } else {
      txHashes.closeSponsoredLine = "skipped: old wallet is not the current sponsor or reserve is already zero";
    }

    // 2. Sweep remaining USDC balance.
    const usdcBalance = await withRetry("read USDC balance", () => publicClient.readContract({
      address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [oldAccount.address],
    }));
    if (usdcBalance > 0n) {
      const usdcSweepHash = await withRetry("sweep USDC", () => oldWallet.writeContract({
        address: USDC_ADDRESS, abi: erc20Abi, functionName: "transfer", args: [newAccount.address, usdcBalance],
      }));
      await withRetry("wait USDC sweep receipt", () => publicClient.waitForTransactionReceipt({ hash: usdcSweepHash, timeout: 30_000 }));
      txHashes.sweepUsdc = usdcSweepHash;
      txHashes.sweptUsdcAmountMicro = usdcBalance.toString();
    }

    // 3. Sweep remaining ETH, leaving a small buffer for this transaction's own gas.
    const ethBalance = await withRetry("read ETH balance", () => publicClient.getBalance({ address: oldAccount.address }));
    if (ethBalance > ETH_DUST_BUFFER) {
      const sweepAmount = ethBalance - ETH_DUST_BUFFER;
      const ethSweepHash = await withRetry("sweep ETH", () => oldWallet.sendTransaction({
        to: newAccount.address, value: sweepAmount,
      }));
      await withRetry("wait ETH sweep receipt", () => publicClient.waitForTransactionReceipt({ hash: ethSweepHash, timeout: 30_000 }));
      txHashes.sweepEth = ethSweepHash;
      txHashes.sweptEthAmountWei = sweepAmount.toString();
    }

    // Final state, read fresh.
    const newUsdcBalance = await withRetry("read new USDC balance", () => publicClient.readContract({
      address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [newAccount.address],
    }));
    const newEthBalance = await withRetry("read new ETH balance", () => publicClient.getBalance({ address: newAccount.address }));

    return NextResponse.json({
      ok: true,
      oldAddress: oldAccount.address,
      newAddress: newAccount.address,
      reserveReclaimedMicro: reserveUSDC.toString(),
      txHashes,
      newAddressFinalUsdcMicro: newUsdcBalance.toString(),
      newAddressFinalEthWei: newEthBalance.toString(),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err), txHashesSoFar: txHashes }, { status: 500 });
  }
}
