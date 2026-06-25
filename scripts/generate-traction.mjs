#!/usr/bin/env node
/**
 * CitePay Traction Generator
 * Fires real demo queries against the live app to build genuine on-chain citation volume.
 * Each query → 3-5 CitationPaid events on Arc Testnet (permanent, verifiable).
 *
 * Usage:
 *   node scripts/generate-traction.mjs              # 30 queries (default)
 *   node scripts/generate-traction.mjs 50           # custom count
 *   node scripts/generate-traction.mjs 20 local     # target localhost:3000
 */

const BASE_URL = process.argv[3] === "local"
  ? "http://localhost:3000"
  : "https://citepay-markets.vercel.app";

const TOTAL = parseInt(process.argv[2] ?? "30", 10);
const DELAY_MS = 4000; // 4s between queries to avoid rate limiting

// Diverse questions spanning all 10 source categories
const QUESTIONS = [
  // x402 / Protocol
  "What is HTTP 402 Payment Required and how does it work for AI agents?",
  "How do AI agents pay for API access using x402 protocol?",
  "Explain the x402 payment flow for machine-native HTTP transactions.",
  "What is the difference between x402 and traditional API keys for AI payments?",
  "How does x402 enable autonomous AI agents to pay for resources?",
  // Circle / Infrastructure
  "How do Circle programmable wallets enable AI agent payments in USDC?",
  "What is Circle Gateway and how does it settle USDC payments instantly?",
  "How can developers use Circle DCW to build autonomous payment agents?",
  "Explain how Circle Developer Controlled Wallets work for AI applications.",
  "What infrastructure does an AI agent need to send USDC micropayments?",
  // Creator Economy / Research
  "How can AI agents compensate content creators for using their work?",
  "What is a citation micropayment and why does it matter for the creator economy?",
  "How do knowledge markets enable AI agents to pay for information?",
  "What economic models exist for compensating creators in AI-powered search?",
  "How does verifiable citation attribution work in AI content systems?",
  // Arc Testnet / Chain
  "What makes Arc Testnet suitable for AI agent micropayments?",
  "How does USDC settle on Arc Testnet and what are the fees?",
  "Why is Arc Testnet preferred over Ethereum mainnet for AI citation payments?",
  "What is the latency of USDC transfers on Arc Testnet?",
  "How do AI agents verify on-chain payment receipts on Arc Testnet?",
  // On-chain proof / Audit
  "How does SHA-256 content hashing ensure citation integrity?",
  "What is an on-chain citation receipt and how is it verified?",
  "How can you prove an AI agent paid a creator for cited content?",
  "What data is stored in a CitationPaid blockchain event?",
  "How does on-chain evidence hashing prevent citation fraud?",
  // Policy / Governance
  "What is an AI agent spend policy and why is it important for citation markets?",
  "How do relevance scores determine which sources an AI agent pays for?",
  "What criteria should an AI agent use to decide whether to cite a source?",
  "How does bonded source staking improve citation quality in AI markets?",
  "What is the role of reputation scoring in AI citation economics?",
  // MCP / Agentic
  "How does the Model Context Protocol enable Claude to pay for citations?",
  "What tools does CitePay expose via MCP for AI agent integration?",
  "How can a Claude agent use cite_query to pay creators automatically?",
  "What is agent-to-agent payment and how does it work in citation markets?",
  "How do multi-agent orchestration systems share citation costs?",
  // USDC / Stablecoins
  "Why is USDC the best currency for AI agent micropayments?",
  "How do stablecoin micropayments enable sustainable creator economies?",
  "What role does USDC play in automated AI citation markets?",
  "How does a stablecoin-native payment layer benefit AI developers?",
  "What are the advantages of USDC over ETH for AI citation payments?",
  // Content integrity
  "How does content hash verification protect creators from AI misuse?",
  "What happens when a creator modifies their content after receiving a citation payment?",
  "How do challenge mechanisms work in AI citation marketplaces?",
  "What is the bond-slash mechanism in creator accountability systems?",
  "How does content integrity proof benefit AI agents consuming knowledge?",
  // General AI / Agents
  "How are autonomous AI agents changing the economics of information access?",
  "What payment infrastructure does an AI startup need to pay for data access?",
  "How can developers build AI agents that pay for every piece of knowledge they use?",
  "What is the future of AI agent economics in a decentralized knowledge market?",
  "How do AI citation markets create aligned incentives between agents and creators?",
];

let totalQueries = 0;
let totalPaid = 0;
let totalUSDC = 0;
let errors = 0;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runQuery(question, index) {
  try {
    const res = await fetch(`${BASE_URL}/api/demo-query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: question }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      process.stdout.write(`✗ HTTP ${res.status} — ${text.slice(0, 60)}\n`);
      errors++;
      return;
    }

    const data = await res.json();
    const decisions = data.decisions ?? [];
    const paid = decisions.filter(d => d.decision === "PAY");
    const usdc = paid.reduce((s, d) => s + (d.amountPaid ?? 0), 0);

    totalQueries++;
    totalPaid += paid.length;
    totalUSDC += usdc;

    const usdcDisplay = usdc > 0 ? `$${usdc.toFixed(4)} USDC` : "no USDC";
    process.stdout.write(`✓ ${paid.length} paid · ${usdcDisplay} · "${question.slice(0, 40)}…"\n`);
  } catch (err) {
    process.stdout.write(`✗ ${String(err).slice(0, 60)}\n`);
    errors++;
  }
}

async function main() {
  console.log("═".repeat(70));
  console.log(`  CitePay Traction Generator`);
  console.log(`  Target : ${BASE_URL}`);
  console.log(`  Queries: ${TOTAL}`);
  console.log(`  Each query → 3-5 CitationPaid events on Arc Testnet`);
  console.log("═".repeat(70));
  console.log();

  // Shuffle and pick TOTAL questions (repeat if needed)
  const shuffled = [...QUESTIONS].sort(() => Math.random() - 0.5);
  const selected = [];
  while (selected.length < TOTAL) {
    selected.push(...shuffled.slice(0, Math.min(shuffled.length, TOTAL - selected.length)));
  }

  for (let i = 0; i < selected.length; i++) {
    process.stdout.write(`  [${String(i + 1).padStart(2)}/${selected.length}] `);
    await runQuery(selected[i], i);
    if (i < selected.length - 1) await sleep(DELAY_MS);
  }

  console.log("\n" + "═".repeat(70));
  console.log("  Traction Summary");
  console.log("─".repeat(70));
  console.log(`  Queries completed    : ${totalQueries}`);
  console.log(`  Citations paid       : ${totalPaid}`);
  console.log(`  USDC routed          : $${totalUSDC.toFixed(4)}`);
  console.log(`  Errors               : ${errors}`);
  console.log("─".repeat(70));
  console.log(`  Verify on-chain: https://testnet.arcscan.app/address/0x396cf1646EbAeF85ee8428C2d9239C46Ae956085`);
  console.log(`  Live proof     : ${BASE_URL}/proof`);
  console.log(`  Traction       : ${BASE_URL}/traction`);
  console.log("═".repeat(70));
}

main().catch(console.error);
