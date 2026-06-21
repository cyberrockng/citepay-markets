#!/usr/bin/env npx ts-node --esm
/**
 * CCTP v2 bridge: Base Sepolia → Arc Testnet
 * Uses Circle's Orbit forwarder (depositForBurnWithHook) so no gas needed on Arc.
 *
 * Usage:
 *   AGENT_PRIVATE_KEY=0x... npx ts-node --esm scripts/bridge-to-arc.ts [amount_usdc]
 *   Default amount: 2 USDC
 */

import { createPublicClient, createWalletClient, http, parseUnits, encodeFunctionData, padHex, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// ── Constants ────────────────────────────────────────────────────────────────
const BASE_SEP_RPC = "https://sepolia.base.org";
const IRIS_SANDBOX = "https://iris-api-sandbox.circle.com";

const BASE_SEP_USDC   = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`;
const TOKEN_MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as `0x${string}`;

const ARC_DOMAIN       = 26;
const MIN_FINALITY     = 1000;          // FAST tier
const MAX_FEE_MICRO    = 20_000n;       // 0.02 USDC safety margin (high fee ≈ 15906)
const ZERO_BYTES32     = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

// Circle Orbit forwarder hook data (32-byte magic: "cctp-forward" + version 0 + payload length 0)
function buildForwardingHookData(): `0x${string}` {
  const buf = new Uint8Array(32);
  const magic = new TextEncoder().encode("cctp-forward");
  buf.set(magic, 0);
  const view = new DataView(buf.buffer);
  view.setUint32(24, 0, false); // version
  view.setUint32(28, 0, false); // payloadLength
  return ("0x" + Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}

// Convert EVM address to CCTP bytes32 mintRecipient (left-pad with 12 zero bytes)
function addressToBytes32(addr: string): `0x${string}` {
  return padHex(getAddress(addr) as `0x${string}`, { size: 32, dir: "left" });
}

// ── ABIs ─────────────────────────────────────────────────────────────────────
const ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "allowance", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }] },
  { name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }] },
] as const;

const TOKEN_MESSENGER_ABI = [
  {
    name: "depositForBurnWithHook",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount",               type: "uint256" },
      { name: "destinationDomain",    type: "uint32"  },
      { name: "mintRecipient",        type: "bytes32" },
      { name: "burnToken",            type: "address" },
      { name: "destinationCaller",    type: "bytes32" },
      { name: "maxFee",               type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32"  },
      { name: "hookData",             type: "bytes"   },
    ],
    outputs: [],
  },
] as const;

// ── Iris polling ─────────────────────────────────────────────────────────────
async function pollForForwardTx(burnTxHash: string, maxWaitMs = 300_000): Promise<string> {
  const url = `${IRIS_SANDBOX}/v2/messages/6?transactionHash=${burnTxHash}`;
  const deadline = Date.now() + maxWaitMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json() as { messages?: Array<{ status: string; forwardTxHash?: string; attestation?: string }> };
        const msg = data.messages?.[0];
        if (msg) {
          console.log(`[poll #${attempt}] status=${msg.status} forwardTxHash=${msg.forwardTxHash ?? "pending"}`);
          if (msg.forwardTxHash && msg.forwardTxHash.trim().length > 0) {
            return msg.forwardTxHash;
          }
          if (msg.status === "complete" && !msg.forwardTxHash) {
            // Attestation ready but forwarder hasn't picked it up yet
          }
        } else {
          console.log(`[poll #${attempt}] no messages yet`);
        }
      }
    } catch (e) {
      console.log(`[poll #${attempt}] fetch error: ${String(e)}`);
    }
    await new Promise(r => setTimeout(r, 8_000));
  }
  throw new Error("Timed out waiting for Circle forwarder to mint on Arc");
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const pk = process.env.AGENT_PRIVATE_KEY;
  if (!pk) throw new Error("Set AGENT_PRIVATE_KEY env var");

  const amountUSDC = parseFloat(process.argv[2] ?? "2");
  const amountMicro = parseUnits(amountUSDC.toString(), 6); // USDC has 6 decimals

  const account = privateKeyToAccount(pk as `0x${string}`);
  console.log(`\nWallet: ${account.address}`);
  console.log(`Bridging ${amountUSDC} USDC from Base Sepolia (domain 6) → Arc Testnet (domain ${ARC_DOMAIN})`);

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(BASE_SEP_RPC) });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(BASE_SEP_RPC) });

  // 1. Check balance
  const balance = await publicClient.readContract({
    address: BASE_SEP_USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address],
  });
  console.log(`\nBase Sepolia USDC balance: ${Number(balance) / 1e6} USDC`);
  if (balance < amountMicro + MAX_FEE_MICRO) {
    throw new Error(`Insufficient balance: have ${Number(balance)/1e6}, need ${Number(amountMicro + MAX_FEE_MICRO)/1e6}`);
  }

  // 2. Approve TokenMessenger
  const allowance = await publicClient.readContract({
    address: BASE_SEP_USDC, abi: ERC20_ABI, functionName: "allowance",
    args: [account.address, TOKEN_MESSENGER],
  });
  const totalNeeded = amountMicro + MAX_FEE_MICRO;
  if (allowance < totalNeeded) {
    console.log(`\nApproving ${Number(totalNeeded) / 1e6} USDC to TokenMessenger...`);
    const approveTx = await walletClient.writeContract({
      address: BASE_SEP_USDC, abi: ERC20_ABI, functionName: "approve",
      args: [TOKEN_MESSENGER, totalNeeded],
    });
    console.log(`  Approve tx: ${approveTx}`);
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    console.log("  Approved.");
  } else {
    console.log(`\nAllowance already sufficient (${Number(allowance)/1e6} USDC). Skipping approve.`);
  }

  // 3. depositForBurnWithHook (includes Circle Orbit forwarder signal)
  const mintRecipient = addressToBytes32(account.address);
  const hookData = buildForwardingHookData();

  console.log(`\nCalling depositForBurnWithHook...`);
  console.log(`  amount:        ${amountMicro} (${amountUSDC} USDC)`);
  console.log(`  dest domain:   ${ARC_DOMAIN}`);
  console.log(`  mintRecipient: ${mintRecipient}`);
  console.log(`  maxFee:        ${MAX_FEE_MICRO} (${Number(MAX_FEE_MICRO)/1e6} USDC)`);
  console.log(`  finality:      ${MIN_FINALITY} (FAST)`);
  console.log(`  hookData:      ${hookData}`);

  const burnTx = await walletClient.writeContract({
    address: TOKEN_MESSENGER,
    abi: TOKEN_MESSENGER_ABI,
    functionName: "depositForBurnWithHook",
    args: [amountMicro, ARC_DOMAIN, mintRecipient, BASE_SEP_USDC, ZERO_BYTES32, MAX_FEE_MICRO, MIN_FINALITY, hookData],
  });
  console.log(`\nBurn tx: ${burnTx}`);
  console.log("Waiting for burn confirmation...");
  await publicClient.waitForTransactionReceipt({ hash: burnTx });
  console.log("Burn confirmed.");

  // 4. Poll Iris for Circle's Orbit relayer to mint on Arc
  console.log(`\nPolling Circle Iris API for forwarder mint on Arc...`);
  console.log("(This typically takes 20-60 seconds)\n");
  const forwardTxHash = await pollForForwardTx(burnTx);

  console.log(`\n✓ Bridge complete!`);
  console.log(`  Burn tx (Base Sepolia): https://sepolia.basescan.org/tx/${burnTx}`);
  console.log(`  Mint tx (Arc Testnet):  https://testnet.arcscan.app/tx/${forwardTxHash}`);
  console.log(`\nAgent wallet ${account.address} now has ${amountUSDC} USDC on Arc Testnet.`);
}

main().catch(err => { console.error("\nFATAL:", err.message ?? err); process.exit(1); });
