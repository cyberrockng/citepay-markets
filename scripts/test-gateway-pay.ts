/**
 * Test real Circle Gateway payment → /api/ask
 * Usage: AGENT_PRIVATE_KEY=0x... npx ts-node --esm scripts/test-gateway-pay.ts
 */
import { GatewayClient } from "@circle-fin/x402-batching/client";

const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) throw new Error("Set AGENT_PRIVATE_KEY");

const API_URL = process.env.API_URL ?? "https://citepay-markets.vercel.app";
const QUERY   = process.argv[2] ?? "What is USDC and how does Arc blockchain settle payments?";

async function main() {
  console.log("Creating GatewayClient on arcTestnet...");
  const client = new GatewayClient({ chain: "arcTestnet", privateKey: PRIVATE_KEY });

  // 1. Check Gateway balance (returns { available: bigint, total: bigint, ... })
  let gwAvailable = 0n;
  try {
    const gwBal = await client.getGatewayBalance();
    gwAvailable = gwBal.available ?? 0n;
    console.log(`Gateway balance: ${Number(gwAvailable) / 1e6} USDC (available)`);
  } catch {
    console.log("Gateway balance: 0 USDC (never deposited)");
  }

  // 2. Deposit 0.05 USDC if below $0.005
  if (gwAvailable < 5_000n) {
    console.log("Depositing 0.05 USDC into Circle Gateway...");
    const dep = await client.deposit("0.05");
    console.log("  Approve tx:", dep.approvalTxHash ?? "(already approved)");
    console.log("  Deposit tx:", dep.depositTxHash);
  }

  // 3. Make real Gateway payment → our /api/ask endpoint
  console.log(`\nPaying ${API_URL}/api/ask with Circle Gateway...`);
  const resp = await client.pay(`${API_URL}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API returned ${resp.status}: ${text.slice(0, 300)}`);
  }

  const data = await resp.json() as { answer?: string; decisions?: Array<{ decision: string; source: string; amountPaid: number }> };
  console.log("\nAnswer:", data.answer?.slice(0, 200), "...");
  const paid = data.decisions?.filter(d => d.decision === "PAY") ?? [];
  console.log(`\nDecisions: ${data.decisions?.length} total, ${paid.length} PAY`);
  paid.forEach(d => console.log(`  +$${(d.amountPaid/1e6).toFixed(4)} → ${d.source.slice(0,40)}`));
}

main().catch(err => { console.error("FATAL:", err.message ?? err); process.exit(1); });
