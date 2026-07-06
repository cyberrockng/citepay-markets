import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Multi-Agent Orchestration — CitePay Markets",
  description: "Watch multiple AI sub-agents decompose a query, search in parallel, pay creators in USDC, and synthesize a verified answer — with coordination rewards distributed on-chain.",
  openGraph: {
    title: "Multi-Agent Demo — CitePay Markets",
    description: "Orchestrator spawns sub-agents, each paying creators via Circle Gateway. Coordination rewards distributed proportionally. Every step anchored on Arc Testnet.",
    url: "https://citepay-markets.vercel.app/orchestrate",
  },
};

export default function OrchestrateLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
