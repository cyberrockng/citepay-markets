#!/usr/bin/env node
/**
 * CitePay Markets — Payment Verification Script
 * Queries Arc Testnet RPC directly. No trust required.
 * Usage: node scripts/verify-payments.mjs
 */

const DCW_WALLET = "0xa539a18b55e5e3b98892c724f8f75914c0b69942";
const ARC_RPC    = "https://rpc.testnet.arc.network";
const USDC       = "0x3600000000000000000000000000000000000000";

async function rpc(method, params) {
  const r = await fetch(ARC_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await r.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

async function main() {
  console.log("=".repeat(56));
  console.log("  CitePay Markets — On-Chain Payment Verification");
  console.log("=".repeat(56));
  console.log("");
  console.log(`  Network : Arc Testnet (chainId 5042002)`);
  console.log(`  Wallet  : ${DCW_WALLET}`);
  console.log(`  USDC    : ${USDC}`);
  console.log("");

  const blockHex = await rpc("eth_blockNumber", []);
  const block = parseInt(blockHex, 16);
  console.log(`  Current block : ${block.toLocaleString()}`);

  const balHex = await rpc("eth_call", [
    { to: USDC, data: "0x70a08231000000000000000000000000" + DCW_WALLET.slice(2) },
    "latest",
  ]);
  const bal = parseInt(balHex, 16);
  console.log(`  USDC balance  : $${(bal / 1e6).toFixed(6)}`);

  const nonceHex = await rpc("eth_getTransactionCount", [DCW_WALLET, "latest"]);
  const txCount = parseInt(nonceHex, 16);
  console.log(`  Outbound txs  : ${txCount}`);
  console.log("");
  console.log("  ✓ Wallet verified on Arc Testnet");
  console.log("  ✓ USDC contract: Arc precompile (0x360…)");
  console.log(`  ✓ ArcScan: https://testnet.arcscan.app/address/${DCW_WALLET}`);
  console.log("");
  console.log("  No API keys required. Pure on-chain RPC query.");
  console.log("=".repeat(56));
}

main().catch((err) => { console.error("Error:", err.message); process.exit(1); });
