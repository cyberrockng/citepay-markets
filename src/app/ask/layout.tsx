import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Run a Query — CitePay Markets",
  description: "Submit a research query. CitePay's agent evaluates sources, pays creators in USDC via Circle Gateway, and returns a structured answer with a public Policy Receipt for every decision.",
  openGraph: {
    title: "Run a Query — CitePay Markets",
    description: "AI agent evaluates sources, pays creators in USDC, and returns verified citations with on-chain receipts on Arc Testnet.",
    url: "https://citepay-markets.vercel.app/ask",
  },
};

export default function AskLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
