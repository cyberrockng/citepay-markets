#!/usr/bin/env node
/**
 * CitePay Evidence Builder
 * Fires queries across demo-query, orchestrate, and sessions
 * to generate on-chain CitationPaid events before submission.
 */

const BASE = "https://citepay-markets.vercel.app";

const QUERIES = [
  // Protocol / x402
  "How does HTTP 402 Payment Required enable autonomous AI agent payments?",
  "Explain the x402 protocol flow for machine-native micropayments",
  "What is the difference between x402 and traditional payment APIs for AI agents?",
  "How does Circle Gateway implement the x402 payment standard?",
  // Arc / USDC
  "Why is Arc Testnet ideal for high-frequency USDC micropayments?",
  "How does USDC settlement on Arc Testnet work for creator payments?",
  "What makes Arc Testnet faster than Ethereum for AI agent transactions?",
  // Creator economy
  "How can content creators monetize AI citations in the new knowledge economy?",
  "What is the economic model behind AI agent citation markets?",
  "How do creator bonds prevent fraud in citation marketplaces?",
  // Multi-agent
  "How does multi-agent orchestration improve research quality and citation accuracy?",
  "What are the benefits of agent-to-agent economic coordination rewards?",
  "How can AI agents collaborate to answer complex research questions?",
  // Security / verification
  "How does SHA-256 content hashing verify citation integrity in AI systems?",
  "What is on-chain evidence anchoring and why does it matter for AI accountability?",
  "How do spend policies protect budgets in autonomous AI citation systems?",
  // Broader AI economy
  "What role does USDC play in enabling trustless creator compensation for AI?",
  "How do reputation scores and bonding mechanisms prevent Sybil attacks in citation markets?",
  "What is the future of AI agent payments and autonomous economic actors?",
  "How does knowledge compounding work in AI citation economies?",
];

const ORCHESTRATE_QUERIES = [
  "How do AI agents pay for knowledge on blockchain networks using stablecoins?",
  "What is the complete flow of a citation payment from AI query to creator payout?",
  "Compare different approaches to AI content monetization in Web3",
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
      body: JSON.stringify({ query, budget: 0.04, policy }),
    });
    if (!res.ok) { errors++; return null; }
    const d = await res.json();
    const paid = (d.decisions ?? []).filter(x => x.decision === "PAY").length;
    const usdc = (d.totalPaid ?? 0) / 1e6;
    totalCitations += paid;
    totalUSDC += usdc;
    totalQueries++;
    return { paid, usdc, queryId: d.queryId };
  } catch {
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

function fmt(n) { return n.toFixed(4); }

async function main() {
  console.log("═".repeat(60));
  console.log("  CitePay Evidence Builder");
  console.log(`  Target: ${BASE}`);
  console.log(`  Queries planned: ${QUERIES.length} demo + ${ORCHESTRATE_QUERIES.length} orchestrate`);
  console.log("═".repeat(60));
  console.log();

  // ── Phase 1: Demo queries (balanced policy) ──────────────────────
  console.log(`[Phase 1] Running ${QUERIES.length} demo queries (balanced)…\n`);
  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i];
    process.stdout.write(`  [${String(i+1).padStart(2)}/${QUERIES.length}] ${q.slice(0, 55)}… `);
    const r = await runDemoQuery(q, "balanced");
    if (r) {
      console.log(`✓ ${r.paid} paid · $${fmt(r.usdc)}`);
    } else {
      console.log("✗ failed");
    }
    await sleep(2500);
  }

  // ── Phase 2: Conservative policy (different decision pattern) ────
  const CONSERVATIVE = QUERIES.slice(0, 6);
  console.log(`\n[Phase 2] ${CONSERVATIVE.length} queries with conservative policy…\n`);
  for (let i = 0; i < CONSERVATIVE.length; i++) {
    const q = CONSERVATIVE[i];
    process.stdout.write(`  [${i+1}/${CONSERVATIVE.length}] ${q.slice(0, 55)}… `);
    const r = await runDemoQuery(q, "conservative");
    if (r) console.log(`✓ ${r.paid} paid · $${fmt(r.usdc)}`);
    else console.log("✗ failed");
    await sleep(2500);
  }

  // ── Phase 3: Aggressive policy ───────────────────────────────────
  const AGGRESSIVE = QUERIES.slice(10, 16);
  console.log(`\n[Phase 3] ${AGGRESSIVE.length} queries with aggressive policy…\n`);
  for (let i = 0; i < AGGRESSIVE.length; i++) {
    const q = AGGRESSIVE[i];
    process.stdout.write(`  [${i+1}/${AGGRESSIVE.length}] ${q.slice(0, 55)}… `);
    const r = await runDemoQuery(q, "aggressive");
    if (r) console.log(`✓ ${r.paid} paid · $${fmt(r.usdc)}`);
    else console.log("✗ failed");
    await sleep(2500);
  }

  // ── Phase 4: Orchestrate queries (multi-agent, generates lessons + knowledge) ──
  console.log(`\n[Phase 4] ${ORCHESTRATE_QUERIES.length} orchestration queries…\n`);
  for (let i = 0; i < ORCHESTRATE_QUERIES.length; i++) {
    const q = ORCHESTRATE_QUERIES[i];
    console.log(`  [${i+1}/${ORCHESTRATE_QUERIES.length}] ${q}`);
    const s = await runOrchestrate(q);
    if (s) {
      console.log(`  ✓ ${s.citationsPurchased} citations · $${fmt((s.totalCreatorPaymentsMicro??0)/1e6)} · ${s.agentToAgentCount} agent rewards\n`);
    } else {
      console.log(`  ✗ failed\n`);
    }
    await sleep(5000);
  }

  // ── Phase 5: Trigger gap agent ───────────────────────────────────
  console.log("[Phase 5] Triggering Knowledge Gap Agent…");
  try {
    const r = await fetch(`${BASE}/api/cron/gap-agent`);
    const d = await r.json();
    console.log(`  ✓ ${d.message ?? JSON.stringify(d)}`);
  } catch (e) { console.log(`  ✗ ${e.message}`); }

  // ── Summary ──────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("  Evidence Build Complete");
  console.log("─".repeat(60));
  console.log(`  Queries run     : ${totalQueries}`);
  console.log(`  Citations paid  : ${totalCitations}`);
  console.log(`  USDC to creators: $${fmt(totalUSDC)}`);
  console.log(`  Errors          : ${errors}`);
  console.log("─".repeat(60));
  console.log(`  On-chain audit  : https://testnet.arcscan.app/address/0x396cf1646EbAeF85ee8428C2d9239C46Ae956085`);
  console.log(`  Live traction   : ${BASE}/traction`);
  console.log("═".repeat(60));
}

main().catch(console.error);
