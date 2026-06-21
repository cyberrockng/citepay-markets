/**
 * Test real Circle Gateway payment → /api/ask
 * Uses a separate buyer wallet to avoid self_transfer rejection.
 *
 * Usage: AGENT_PRIVATE_KEY=0x... npx ts-node --esm scripts/test-gateway-pay.ts
 */
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { privateKeyToAccount } from "viem/accounts";

const AGENT_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
if (!AGENT_KEY) throw new Error("Set AGENT_PRIVATE_KEY");

// Deterministic test buyer (separate from agent/seller so self_transfer is not triggered)
const BUYER_KEY: `0x${string}` = "0x1111111111111111111111111111111111111111111111111111111111111111";
const BUYER_ADDR = privateKeyToAccount(BUYER_KEY).address;

const API_URL = process.env.API_URL ?? "https://citepay-markets.vercel.app";
const QUERY   = process.argv[2] ?? "What is USDC and how does Arc blockchain settle payments?";

async function main() {
  const agentClient = new GatewayClient({ chain: "arcTestnet", privateKey: AGENT_KEY });
  const buyerClient = new GatewayClient({ chain: "arcTestnet", privateKey: BUYER_KEY });

  console.log(`Agent/seller: ${agentClient.address}`);
  console.log(`Buyer:        ${BUYER_ADDR}`);

  // 1. Check buyer's Gateway balance; if low, agent deposits FOR buyer
  const buyerBalances = await buyerClient.getBalances();
  const buyerGw = buyerBalances.gateway.available;
  console.log(`\nBuyer Gateway balance: ${Number(buyerGw) / 1e6} USDC`);

  if (buyerGw < 5_000n) {
    console.log("Depositing 0.05 USDC into Gateway for buyer (funded by agent wallet)...");
    const dep = await agentClient.depositFor("0.05", BUYER_ADDR);
    console.log("  Deposit tx:", dep.depositTxHash);

    // Re-check balance
    await new Promise(r => setTimeout(r, 3000));
    const updated = await buyerClient.getBalances();
    console.log(`  Buyer Gateway balance now: ${Number(updated.gateway.available) / 1e6} USDC`);
  }

  // 2. Buyer pays → our /api/ask endpoint
  console.log(`\nBuyer paying ${API_URL}/api/ask...`);

  let result: { data: unknown; amount: bigint; transaction: string };
  try {
    result = await buyerClient.pay<{ answer?: string; decisions?: unknown[] }>(`${API_URL}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY }),
    });
  } catch (err: unknown) {
    console.error("Payment failed:", (err as Error).message);
    process.exit(1);
  }

  const data = result.data as { answer?: string; decisions?: Array<{ decision: string; source: string; amountPaid: number }> };
  console.log("\nAnswer:", String(data.answer ?? "").slice(0, 200), "...");
  console.log(`Paid: $${Number(result.amount) / 1e6} USDC | tx: ${result.transaction}`);
  const paid = (data.decisions ?? []).filter(d => d.decision === "PAY");
  console.log(`Decisions: ${data.decisions?.length} total, ${paid.length} PAY`);
  paid.forEach(d => console.log(`  +$${(d.amountPaid / 1e6).toFixed(4)} → ${d.source.slice(0, 40)}`));
}

main().catch(err => { console.error("FATAL:", (err as Error).message ?? err); process.exit(1); });
