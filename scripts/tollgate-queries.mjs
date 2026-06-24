#!/usr/bin/env node
/**
 * Tollgate Cross-Project Citation Builder
 * Sends targeted queries to Tollgate's agent which pays CitePay sources
 * from Tollgate's own wallet — independent on-chain evidence.
 */

const TOLLGATE = "https://tollgate.gudman.xyz/api/query";
const CITEPAY_WALLET = "0x5389688243328c26a92b301faEEAb5fbf9AFf105";

// Queries crafted to trigger specific CitePay sources
const QUESTIONS = [
  // → CitePay main + MCP + Audit
  "How do AI agents pay creators per citation using USDC on Arc Testnet?",
  "What is the best way for an AI agent to cite knowledge sources and pay for them in USDC?",
  "How does Circle Gateway x402 enable AI citation payments on Arc Testnet?",
  "What tools exist for AI agents to pay creators automatically per knowledge citation?",
  "How can an AI agent verify that a citation payment was made and recorded on-chain?",

  // → CitePay Policy Builder
  "How should an AI agent configure its spend policy for citation markets?",
  "What parameters control how an AI agent decides to pay or refuse a knowledge source?",
  "How do spend policies protect AI agent budgets in autonomous citation systems?",
  "What is the best way to define citation budget limits for an autonomous AI agent?",
  "How can an AI agent enforce conservative vs aggressive citation spend policies?",

  // → CitePay Research Sessions
  "How do multi-turn AI research sessions accumulate citation receipts over time?",
  "What is context-aware citation in AI research and how does it improve answers?",
  "How can AI agents maintain research context across multiple follow-up questions?",
  "What does a shareable research session with paid citation receipts look like?",

  // → CitePay Intelligence Dashboard
  "How can developers monitor USDC flows in a live AI citation economy?",
  "What analytics help understand knowledge demand across AI citation markets?",
  "How do you measure compounding effects in an AI knowledge citation marketplace?",
  "What real-time metrics matter most for an AI citation economy dashboard?",

  // → CitePay Bounties + Gap Agent
  "How do knowledge bounties work in AI citation marketplaces?",
  "What is the best mechanism for crowdsourcing AI knowledge gap resolution?",
  "How can an autonomous agent identify knowledge gaps and post USDC bounties?",
  "What makes a self-improving AI citation market and how does it work?",

  // → CitePay Auction
  "How does real-time price discovery work in an AI knowledge citation market?",
  "What is the role of live source auctions in AI citation economics?",

  // → On-chain audit + general
  "How do you verify on-chain that AI citation payments were made correctly?",
  "What is the MCP protocol and how do AI agents use it to pay for citations?",
  "How does SHA-256 evidence hashing ensure citation integrity in AI systems?",
  "What is the economic model behind AI agents paying creators in micropayments?",
];

let totalCitepayPaid = 0;
let totalCitepayHits = 0;
let totalQueries = 0;
let errors = 0;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function queryTollgate(question) {
  try {
    const res = await fetch(TOLLGATE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) { errors++; return null; }
    const d = await res.json();
    const q = d.query ?? d;
    const citations = q.citations ?? [];
    const txs = d.transactions ?? [];

    const citepayHits = citations.filter(c => c.wallet === CITEPAY_WALLET);
    const citepayPaid = citepayHits.reduce((s, c) => s + (c.amountAtomicUsdc ?? 0), 0);

    totalQueries++;
    totalCitepayHits += citepayHits.length;
    totalCitepayPaid += citepayPaid;

    return { citations: citations.length, citepayHits: citepayHits.length, citepayPaid, titles: citepayHits.map(c => c.title) };
  } catch (e) {
    errors++;
    return null;
  }
}

async function main() {
  console.log("═".repeat(65));
  console.log("  Tollgate Cross-Project Citation Builder");
  console.log(`  ${QUESTIONS.length} targeted queries → CitePay citations`);
  console.log("═".repeat(65));
  console.log();

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    process.stdout.write(`  [${String(i+1).padStart(2)}/${QUESTIONS.length}] ${q.slice(0, 52)}… `);
    const r = await queryTollgate(q);
    if (r) {
      if (r.citepayHits > 0) {
        console.log(`✓ ${r.citepayHits} CitePay cited · ${r.citepayPaid}µ · ${r.titles.map(t => t.split('—')[0].trim().slice(0,20)).join(', ')}`);
      } else {
        console.log(`· ${r.citations} total citations (CitePay not selected)`);
      }
    } else {
      console.log("✗ failed");
    }
    await sleep(3000);
  }

  console.log("\n" + "═".repeat(65));
  console.log("  Cross-Project Citation Summary");
  console.log("─".repeat(65));
  console.log(`  Queries sent         : ${totalQueries}`);
  console.log(`  CitePay cited        : ${totalCitepayHits} times`);
  console.log(`  USDC paid to CitePay : ${totalCitepayPaid} µUSDC = $${(totalCitepayPaid/1e6).toFixed(4)}`);
  console.log(`  Errors               : ${errors}`);
  console.log("─".repeat(65));
  console.log(`  Verify on Arc: https://testnet.arcscan.app/address/${CITEPAY_WALLET}`);
  console.log(`  Tollgate payer: 0x4164F5B52ecc6F847f03071A287b0B59954cbcEe`);
  console.log("═".repeat(65));
}

main().catch(console.error);
