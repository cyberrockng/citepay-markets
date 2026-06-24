#!/usr/bin/env node
/**
 * Evidence Builder — Round 3
 * Fresh angles: governance, interop, real-world use cases, economic depth.
 */

const BASE = "https://citepay-markets.vercel.app";

const QUERIES_A = [
  // Governance & policy
  "How should AI citation markets handle disputed knowledge claims?",
  "What governance mechanisms ensure fairness in decentralized citation markets?",
  "How can AI agents enforce spend policies without human intervention?",
  "What role does community governance play in AI knowledge marketplaces?",
  "How do citation audits prevent manipulation in AI knowledge systems?",
  // Real-world applications
  "How can journalism and media benefit from AI-native micropayment systems?",
  "What industries stand to gain most from autonomous AI citation payments?",
  "How does CitePay enable AI systems to respect intellectual property rights?",
  "What is the value of verifiable receipts in AI research systems?",
  "How do micropayment rails change the economics of online content creation?",
  // Technical depth
  "What is the difference between optimistic and ZK-based payment verification?",
  "How does batch facilitation reduce gas costs for USDC micropayments?",
  "What are the trust assumptions in Circle's cross-chain USDC transfer protocol?",
  "How does EIP-712 typed structured data improve payment security in Web3?",
  "What is the role of nonces in preventing replay attacks on USDC transfers?",
  // AI agent architecture
  "How do sub-agents coordinate in a hierarchical multi-agent research system?",
  "What is the optimal citation budget allocation strategy for AI research agents?",
  "How can AI agents detect and avoid low-quality knowledge sources dynamically?",
  "What metrics best measure AI agent research quality and citation accuracy?",
  "How does context-aware citation improve multi-turn AI research sessions?",
  // Market design
  "How does price discrimination work in AI citation markets with tiered pricing?",
  "What is the Nash equilibrium for rational agents in a citation market?",
  "How do network effects create moats in AI knowledge marketplace platforms?",
  "What mechanisms prevent race conditions in simultaneous agent citation markets?",
  "How does citation velocity correlate with knowledge source quality over time?",
];

const QUERIES_B = [
  // Different angles for aggressive policy
  "Why are stablecoins superior to native tokens for AI agent payment rails?",
  "How does programmable money change the creator economy for AI content?",
  "What is the long-term revenue model for creators in an AI citation economy?",
  "How can AI citation receipts serve as proof-of-work for research verification?",
  "What prevents AI agents from gaming citation systems for financial gain?",
  "How do decentralized oracles help price knowledge in AI citation markets?",
  "What is the role of liquidity in sustaining a healthy citation marketplace?",
  "How does citation insurance protect creators from bad-faith AI agents?",
  "What is the impact of micropayment latency on AI agent decision quality?",
  "How do cross-chain citations work when knowledge sources span multiple networks?",
];

const ORCHESTRATE_QUERIES = [
  "What is the full economic and technical case for AI agents paying for knowledge with USDC?",
  "How does multi-agent orchestration with citation payments outperform single-agent research?",
  "Design an optimal spend policy for a research AI agent in a citation marketplace",
  "What evidence demonstrates that on-chain citation payments improve knowledge quality?",
  "How should a hackathon judge evaluate an AI citation payment marketplace?",
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
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) { errors++; return null; }
    const d = await res.json();
    const paid = (d.decisions ?? []).filter(x => x.decision === "PAY").length;
    const usdc = (d.totalPaid ?? 0) / 1e6;
    totalCitations += paid;
    totalUSDC += usdc;
    totalQueries++;
    return { paid, usdc };
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
      signal: AbortSignal.timeout(90000),
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
  console.log("  Evidence Builder — Round 3");
  console.log(`  ${QUERIES_A.length + QUERIES_B.length} demo + ${ORCHESTRATE_QUERIES.length} orchestrate`);
  console.log("═".repeat(60));
  console.log();

  console.log(`[Phase A] ${QUERIES_A.length} balanced queries…\n`);
  for (let i = 0; i < QUERIES_A.length; i++) {
    process.stdout.write(`  [${String(i+1).padStart(2)}/${QUERIES_A.length}] ${QUERIES_A[i].slice(0, 55)}… `);
    const r = await runDemoQuery(QUERIES_A[i], "balanced");
    if (r) console.log(`✓ ${r.paid} paid · $${r.usdc.toFixed(4)}`);
    else console.log("✗ failed");
    await sleep(2000);
  }

  console.log(`\n[Phase B] ${QUERIES_B.length} aggressive queries…\n`);
  for (let i = 0; i < QUERIES_B.length; i++) {
    process.stdout.write(`  [${String(i+1).padStart(2)}/${QUERIES_B.length}] ${QUERIES_B[i].slice(0, 55)}… `);
    const r = await runDemoQuery(QUERIES_B[i], "aggressive");
    if (r) console.log(`✓ ${r.paid} paid · $${r.usdc.toFixed(4)}`);
    else console.log("✗ failed");
    await sleep(2000);
  }

  console.log(`\n[Phase C] ${ORCHESTRATE_QUERIES.length} orchestration queries…\n`);
  for (let i = 0; i < ORCHESTRATE_QUERIES.length; i++) {
    console.log(`  [${i+1}/${ORCHESTRATE_QUERIES.length}] ${ORCHESTRATE_QUERIES[i].slice(0, 72)}`);
    const s = await runOrchestrate(ORCHESTRATE_QUERIES[i]);
    if (s) {
      console.log(`  ✓ ${s.citationsPurchased ?? 0} citations · ${s.agentToAgentCount ?? 0} agent rewards · $${((s.totalCreatorPaymentsMicro ?? 0)/1e6).toFixed(4)}\n`);
    } else {
      console.log(`  ✗ failed\n`);
    }
    await sleep(5000);
  }

  console.log("\n" + "═".repeat(60));
  console.log(`  Round 3 Complete`);
  console.log("─".repeat(60));
  console.log(`  Queries run     : ${totalQueries}`);
  console.log(`  Citations paid  : ${totalCitations}`);
  console.log(`  USDC to creators: $${totalUSDC.toFixed(4)}`);
  console.log(`  Errors          : ${errors}`);
  console.log(`  Traction        : ${BASE}/traction`);
  console.log("═".repeat(60));
}

main().catch(console.error);
