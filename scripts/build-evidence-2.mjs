#!/usr/bin/env node
/**
 * Evidence Builder — Round 2
 * Fresh set of queries covering different angles.
 */

const BASE = "https://citepay-markets.vercel.app";

const QUERIES = [
  // DeFi + AI
  "How can decentralized finance principles be applied to AI knowledge markets?",
  "What is the role of smart contracts in enforcing AI citation payments?",
  "How do bonding curves work in creator economy protocols?",
  "What prevents double-spending in AI citation micropayment systems?",
  "How does EIP-3009 TransferWithAuthorization enable gasless USDC payments?",
  // Agent economics
  "What economic incentives make knowledge quality markets self-regulating?",
  "How do AI agents build reputation scores through payment history?",
  "What is agent-to-agent coordination in multi-agent research systems?",
  "How can agents earn passive income by registering knowledge as citable sources?",
  "What is the compounding effect in AI knowledge citation economies?",
  // Web3 AI
  "How does on-chain citation anchoring create permanent audit trails for AI?",
  "What are the key differences between x402 and payment channels for AI micropayments?",
  "How does Circle's payment infrastructure enable programmable stablecoin flows?",
  "What makes USDC the ideal stablecoin for AI agent micropayments?",
  "How do creator bonds align incentives between knowledge publishers and AI systems?",
  // Research & hackathon relevant
  "What is the economic model for a self-sustaining AI knowledge marketplace?",
  "How can AI orchestration frameworks reduce research costs through citation reuse?",
  "What are the advantages of transparent on-chain payment receipts for AI accountability?",
  "How do spend policies protect AI agent budgets in autonomous decision systems?",
  "What is the future of verifiable AI citations and knowledge provenance?",
  // Additional depth
  "How does SHA-256 hashing ensure content integrity in distributed knowledge systems?",
  "What is the role of price discovery in citation market efficiency?",
  "How do multi-agent systems parallelize research to improve answer quality?",
  "What mechanisms prevent Sybil attacks in reputation-based AI citation markets?",
  "How does real-time economic intelligence improve agent decision-making?",
];

const ORCHESTRATE_QUERIES = [
  "What is the complete technical architecture of a payments-native AI citation marketplace?",
  "How do autonomous AI agents build and maintain reputation in decentralized knowledge markets?",
  "Compare the economic models of different approaches to creator monetization in AI systems",
  "What are the security properties of on-chain citation verification vs traditional approaches?",
];

let totalCitations = 0;
let totalUSDC = 0;
let totalQueries = 0;
let errors = 0;

async function runDemoQuery(query, policy = "balanced") {
  try {
    const res = await fetch(`${BASE}/api/demo-query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, budget: 0.05, policy }),
    });
    if (!res.ok) { errors++; console.log(`    HTTP ${res.status}`); return null; }
    const d = await res.json();
    const paid = (d.decisions ?? []).filter(x => x.decision === "PAY").length;
    const usdc = (d.totalPaid ?? 0) / 1e6;
    totalCitations += paid;
    totalUSDC += usdc;
    totalQueries++;
    return { paid, usdc };
  } catch (e) {
    errors++;
    return null;
  }
}

async function runOrchestrate(query) {
  try {
    const res = await fetch(`${BASE}/api/orchestrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, policy: "balanced" }),
    });
    if (!res.body) return null;
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let stats = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          if (chunk.type === "final" && chunk.stats) stats = chunk.stats;
        } catch {}
      }
    }
    if (stats) {
      totalCitations += stats.citationsPurchased ?? 0;
      totalUSDC += (stats.totalCreatorPaymentsMicro ?? 0) / 1e6;
      totalQueries++;
    }
    return stats;
  } catch {
    errors++;
    return null;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log("═".repeat(60));
  console.log("  Evidence Builder — Round 2");
  console.log(`  ${QUERIES.length} demo + ${ORCHESTRATE_QUERIES.length} orchestrate queries`);
  console.log("═".repeat(60));
  console.log();

  // Phase 1: Balanced
  console.log(`[Phase A] ${QUERIES.length} balanced queries…\n`);
  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i];
    process.stdout.write(`  [${String(i+1).padStart(2)}/${QUERIES.length}] ${q.slice(0, 55)}… `);
    const r = await runDemoQuery(q, "balanced");
    if (r) console.log(`✓ ${r.paid} paid · $${r.usdc.toFixed(4)}`);
    else console.log("✗ failed");
    await sleep(2000);
  }

  // Phase 2: Aggressive (same queries, different policy)
  const AGG = QUERIES.slice(0, 12);
  console.log(`\n[Phase B] ${AGG.length} aggressive queries…\n`);
  for (let i = 0; i < AGG.length; i++) {
    process.stdout.write(`  [${i+1}/${AGG.length}] ${AGG[i].slice(0, 55)}… `);
    const r = await runDemoQuery(AGG[i], "aggressive");
    if (r) console.log(`✓ ${r.paid} paid · $${r.usdc.toFixed(4)}`);
    else console.log("✗ failed");
    await sleep(2000);
  }

  // Phase 3: Orchestrate
  console.log(`\n[Phase C] ${ORCHESTRATE_QUERIES.length} orchestration queries…\n`);
  for (let i = 0; i < ORCHESTRATE_QUERIES.length; i++) {
    const q = ORCHESTRATE_QUERIES[i];
    console.log(`  [${i+1}/${ORCHESTRATE_QUERIES.length}] ${q.slice(0, 70)}`);
    const s = await runOrchestrate(q);
    if (s) {
      console.log(`  ✓ ${s.citationsPurchased ?? 0} citations · ${s.agentToAgentCount ?? 0} agent rewards · $${((s.totalCreatorPaymentsMicro ?? 0)/1e6).toFixed(4)}\n`);
    } else {
      console.log(`  ✗ failed\n`);
    }
    await sleep(6000);
  }

  // Phase 4: Gap agent
  console.log("[Phase D] Triggering Knowledge Gap Agent…");
  try {
    const r = await fetch(`${BASE}/api/cron/gap-agent`, { signal: AbortSignal.timeout(30000) });
    const d = await r.json();
    console.log(`  ✓ ${JSON.stringify(d)}`);
  } catch (e) { console.log(`  ✗ ${e.message}`); }

  // Summary
  console.log("\n" + "═".repeat(60));
  console.log(`  Queries run     : ${totalQueries}`);
  console.log(`  Citations paid  : ${totalCitations}`);
  console.log(`  USDC to creators: $${totalUSDC.toFixed(4)}`);
  console.log(`  Errors          : ${errors}`);
  console.log(`  Traction        : https://citepay-markets.vercel.app/traction`);
  console.log("═".repeat(60));
}

main().catch(console.error);
