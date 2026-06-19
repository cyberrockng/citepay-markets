/**
 * Seed real creator sources into CitePay Markets.
 * Run: npx tsx scripts/seed-sources.ts
 */

const BASE_URL = process.env.CITEPAY_URL || "http://localhost:3000";

const SOURCES = [
  {
    title: "x402: HTTP-Native Payments for AI Agents",
    url: "https://x402.org",
    creatorName: "Coinbase Developer Platform",
    creatorHandle: "@coinbase",
    payoutWallet: "0x1234000000000000000000000000000000000001",
    price: 2000,   // 0.002 USDC
    bond: 10000,   // 0.01 USDC
    content: "x402 is an open protocol for machine-native payments using HTTP 402 Payment Required. It enables AI agents and automated systems to pay for resources autonomously using USDC on Base.",
  },
  {
    title: "Circle's Programmable Wallets: Powering Agentic Finance",
    url: "https://developers.circle.com/w3s/programmable-wallets",
    creatorName: "Circle Developer Docs",
    creatorHandle: "@circle",
    payoutWallet: "0x1234000000000000000000000000000000000002",
    price: 3000,   // 0.003 USDC
    bond: 10000,
    content: "Circle's Programmable Wallets enable developers to create and manage wallets at scale. USDC transfers on Base Sepolia are instant and near-zero cost, making them ideal for micro-payments between AI agents and content creators.",
  },
  {
    title: "Agentic AI: How Autonomous Agents Will Transform Commerce",
    url: "https://a16z.com/agentic-ai",
    creatorName: "Andreessen Horowitz",
    creatorHandle: "@a16z",
    payoutWallet: "0x1234000000000000000000000000000000000003",
    price: 4000,   // 0.004 USDC
    bond: 5000,
    content: "Agentic AI systems — autonomous agents that plan, act, and pay for resources — represent a fundamental shift in how software works. These agents need on-chain payment rails to operate at scale without human intervention.",
  },
  {
    title: "The Creator Economy in the Age of AI: Who Gets Paid?",
    url: "https://mirror.xyz/citepay/creator-economy-ai",
    creatorName: "Research by CitePay",
    creatorHandle: "@citepay",
    payoutWallet: "0x1234000000000000000000000000000000000004",
    price: 2000,
    bond: 0,
    content: "As large language models increasingly answer questions by drawing on creator content without attribution or compensation, a new payment layer is needed. CitePay Markets solves this by making citations accountable and paid.",
  },
  {
    title: "Base: The Onchain Platform for Everyone",
    url: "https://base.org",
    creatorName: "Base Documentation",
    creatorHandle: "@base",
    payoutWallet: "0x1234000000000000000000000000000000000005",
    price: 1500,   // 0.0015 USDC
    bond: 10000,
    content: "Base is a secure, low-cost, developer-friendly Ethereum L2. With near-zero gas fees and USDC native support, Base is the ideal chain for micro-payment applications like AI citation markets.",
  },
  {
    title: "Reputation Systems in Decentralized Marketplaces",
    url: "https://vitalik.eth.limo/general/2023/07/24/biometric.html",
    creatorName: "Vitalik Buterin",
    creatorHandle: "@vitalik",
    payoutWallet: "0x1234000000000000000000000000000000000006",
    price: 5000,   // 0.005 USDC
    bond: 20000,
    content: "Reputation in decentralized systems should be earned through verifiable on-chain actions, not assigned by central authorities. Source credibility bonds and pay/refuse ratios create objective, game-resistant reputation scores.",
  },
  {
    title: "HTTP 402 and the Future of Machine Payments",
    url: "https://docs.cdp.coinbase.com/x402/docs/welcome",
    creatorName: "Coinbase Developer Platform",
    creatorHandle: "@coinbase_dev",
    payoutWallet: "0x1234000000000000000000000000000000000007",
    price: 2500,
    bond: 10000,
    content: "HTTP 402 Payment Required has been dormant since the 1990s. x402 revives it as a machine-native payment protocol, enabling any HTTP endpoint to require payment before serving content — perfect for AI agent workflows.",
  },
  {
    title: "Content Integrity and Hash Verification in Web3",
    url: "https://ipfs.tech/blog/content-addressing",
    creatorName: "Protocol Labs",
    creatorHandle: "@protocollabs",
    payoutWallet: "0x1234000000000000000000000000000000000008",
    price: 2000,
    bond: 5000,
    content: "Content-addressed storage ensures that what you paid for is what you received. By storing a SHA-256 hash of content at payment time, CitePay Markets can objectively verify if a creator modified their source after receiving payment.",
  },
  {
    title: "USDC: The Dollar for the Internet",
    url: "https://www.circle.com/usdc",
    creatorName: "Circle",
    creatorHandle: "@circle",
    payoutWallet: "0x1234000000000000000000000000000000000009",
    price: 1000,   // 0.001 USDC
    bond: 10000,
    content: "USDC is a fully reserved, dollar-backed stablecoin that settles instantly on Base. Its programmatic accessibility makes it the default currency for AI agent payments, enabling autonomous financial transactions at internet scale.",
  },
  {
    title: "The Case for AI Agent Accountability: Evidence Logs and Receipts",
    url: "https://anthropic.com/research/model-cards",
    creatorName: "Anthropic",
    creatorHandle: "@anthropic",
    payoutWallet: "0x1234000000000000000000000000000000000010",
    price: 3000,
    bond: 15000,
    content: "AI agents that interact with the world on behalf of users must maintain auditable logs of their decisions. A public receipt for every payment, refusal, or skip creates accountability and enables objective dispute resolution.",
  },
];

async function main() {
  console.log(`Seeding ${SOURCES.length} sources to ${BASE_URL}...`);

  for (const source of SOURCES) {
    try {
      const res = await fetch(`${BASE_URL}/api/sources/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(source),
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`✓ Registered: ${source.title}`);
      } else {
        console.log(`✗ Failed: ${source.title} — ${data.error}`);
      }
    } catch (err) {
      console.log(`✗ Error: ${source.title} — ${err}`);
    }
  }

  console.log("\nDone. Visit http://localhost:3000/market to see sources.");
}

main();
