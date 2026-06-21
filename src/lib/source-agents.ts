/**
 * Three competing source agents: FactAgent, TechAgent, EconAgent.
 * Each has its own onchain identity (wallet address + registered sources),
 * publishes "knowledge claims" autonomously, and earns USDC when cited.
 * Reputation is derived entirely from CitationPaid events on CitePayMarket.sol.
 */

export interface SourceAgent {
  id: "fact" | "tech" | "econ";
  name: string;
  handle: string;
  wallet: string;
  specialty: string;
  policyProfile: "conservative" | "balanced" | "aggressive";
  sourceIds: number[]; // onChainId values they publish
  color: string;
  badge: string;
  description: string;
}

export const SOURCE_AGENTS: SourceAgent[] = [
  {
    id: "fact",
    name: "FactAgent",
    handle: "@fact_agent",
    wallet: "0x3a0FfFE64537148b3766dA52D983058F98A4e3ce",
    specialty: "General knowledge, protocol docs, research papers",
    policyProfile: "conservative",
    sourceIds: [1, 4, 8, 10],
    color: "#00ff88",
    badge: "◈ FactAgent",
    description:
      "Publishes verified protocol documentation and research papers. Conservative pricing, high accuracy, strict evidence standards. Earns reputation through consistent PAY decisions from the veracity agent.",
  },
  {
    id: "tech",
    name: "TechAgent",
    handle: "@tech_agent",
    wallet: "0x72101E4882159f3e0B3c176951AcA7816A1710e2",
    specialty: "Infrastructure, smart contracts, developer tooling",
    policyProfile: "balanced",
    sourceIds: [2, 5, 7, 9],
    color: "#6366f1",
    badge: "⬡ TechAgent",
    description:
      "Specializes in Circle infrastructure, Arc Testnet tooling, and USDC payment primitives. Balanced pricing. Gets cited most on technical queries about wallets, x402, and contract interfaces.",
  },
  {
    id: "econ",
    name: "EconAgent",
    handle: "@econ_agent",
    wallet: "0xbe575CcebE08895e61c8E45652ff63E4a663d4D9",
    specialty: "Economics, markets, creator economy, AI incentives",
    policyProfile: "aggressive",
    sourceIds: [3, 6, 9, 10],
    color: "#f59e0b",
    badge: "◆ EconAgent",
    description:
      "Publishes high-signal economic analysis on the AI citation economy, creator compensation, and autonomous agent market design. Premium pricing, high bond, aggressive budget usage.",
  },
];

export const AGENT_QUERIES: Record<SourceAgent["id"], string[]> = {
  fact: [
    "How does x402 enable autonomous AI agent payments?",
    "What is on-chain evidence hashing and why does it matter?",
    "How does SHA-256 content addressing verify source integrity?",
    "What is the role of public receipts in AI decision accountability?",
    "How do bonded sources prevent citation fraud in AI systems?",
    "What cryptographic guarantees does CitePay provide for receipts?",
    "How does the HTTP 402 payment required status code work?",
    "What makes a source eligible for PAY vs REFUSE in CitePay?",
  ],
  tech: [
    "How does Circle Gateway batch USDC settlements on Arc Testnet?",
    "What is the Circle Developer-Controlled Wallet MPC architecture?",
    "How do Circle programmable wallets enable agent-to-agent payments?",
    "What is the Arc Testnet USDC precompile address?",
    "How does x402-batching differ from standard ERC-20 transfers?",
    "What is the CitePayMarket.sol contract interface for payCitation?",
    "How does the Circle Unified Balance Kit query cross-chain USDC?",
    "What is the EIP-3009 authorization signature format?",
  ],
  econ: [
    "What is the economic model behind the AI citation economy?",
    "How does reputation scoring work in decentralized citation markets?",
    "What role does USDC play in trustless creator compensation?",
    "How do Agent Spend Policies protect autonomous budgets from overspending?",
    "What are the incentive dynamics of bonded vs unbonded source creators?",
    "How does the creator economy change when AI agents are the payers?",
    "What is the game theory behind citation bonding mechanisms?",
    "How do multi-agent orchestration systems allocate research budgets?",
  ],
};

export function getAgentForSource(onChainId: number): SourceAgent | null {
  return SOURCE_AGENTS.find((a) => a.sourceIds.includes(onChainId)) ?? null;
}

export function getAgentById(id: string): SourceAgent | null {
  return SOURCE_AGENTS.find((a) => a.id === id) ?? null;
}
