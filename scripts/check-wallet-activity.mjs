#!/usr/bin/env node
// Read-only check: native + USDC balance and recent USDC Transfer events for a wallet on Arc Testnet.
import { createPublicClient, http, parseAbi, formatUnits } from "viem";

const ARC_RPC = "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;
const USDC = "0x3600000000000000000000000000000000000000";
const WALLET = process.argv[2] || "0x5389688243328c26a92b301faEEAb5fbf9AFf105";

const arcTestnet = {
  id: CHAIN_ID,
  name: "Arc Testnet",
  network: "arc-testnet",
  nativeCurrency: { name: "ARC", symbol: "ARC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
};

const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC, { retryCount: 5, retryDelay: 1500 }) });

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

const decimals = 6; // USDC — known constant, avoids an extra RPC call

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const nativeBal = await client.getBalance({ address: WALLET });
await sleep(400);
const usdcBal = await client.readContract({ address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [WALLET] });
await sleep(400);
const latestBlock = await client.getBlockNumber();

console.log(`Wallet: ${WALLET}`);
console.log(`Latest block: ${latestBlock}`);
console.log(`Native ARC balance: ${formatUnits(nativeBal, 18)}`);
console.log(`USDC balance: ${formatUnits(usdcBal, decimals)}`);

// Scan recent block range for outgoing USDC transfers from this wallet (chunked, RPC limits apply).
const CHUNK = 2000n;
const LOOKBACK_BLOCKS = BigInt(process.argv[3] || 20000);
const fromBlock = latestBlock > LOOKBACK_BLOCKS ? latestBlock - LOOKBACK_BLOCKS : 0n;

console.log(`\nScanning outgoing USDC Transfer events from block ${fromBlock} to ${latestBlock}...`);

let start = fromBlock;
const outgoing = [];
let failedChunks = 0;
let okChunks = 0;
while (start <= latestBlock) {
  const end = start + CHUNK > latestBlock ? latestBlock : start + CHUNK;
  let attempt = 0;
  let done = false;
  while (attempt < 4 && !done) {
    try {
      const logs = await client.getLogs({
        address: USDC,
        event: ERC20_ABI[1],
        args: { from: WALLET },
        fromBlock: start,
        toBlock: end,
      });
      outgoing.push(...logs);
      okChunks++;
      done = true;
    } catch {
      attempt++;
      await sleep(1500 * attempt);
    }
  }
  if (!done) {
    failedChunks++;
    console.log(`  chunk ${start}-${end} FAILED after retries — NOT scanned, do not treat as clean`);
  }
  start = end + 1n;
  await sleep(600);
}

console.log(`\nScan coverage: ${okChunks} chunk(s) succeeded, ${failedChunks} chunk(s) failed after retries.`);
if (failedChunks > 0) {
  console.log(`WARNING: scan is INCOMPLETE — ${failedChunks} chunk(s) could not be verified. Do not treat the count below as exhaustive.`);
}
console.log(`Found ${outgoing.length} outgoing USDC transfer(s) in the successfully-scanned portion:`);
for (const log of outgoing) {
  await sleep(300);
  const block = await client.getBlock({ blockNumber: log.blockNumber });
  const date = new Date(Number(block.timestamp) * 1000).toISOString();
  console.log(`  ${date}  block ${log.blockNumber}  to=${log.args.to}  value=${formatUnits(log.args.value, decimals)} USDC  tx=${log.transactionHash}`);
}
