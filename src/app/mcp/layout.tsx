import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MCP Server — CitePay Markets",
  description: "Add CitePay to Claude Code via MCP. Exposes cite_query, get_receipt, and check_policy tools — AI agents pay creators in USDC per citation with no wallet setup needed.",
  openGraph: {
    title: "CitePay MCP Server — Add to Claude Code",
    description: "Connect CitePay Markets to any MCP-compatible AI agent. cite_query, get_receipt, and check_policy tools. Real USDC payments, on-chain receipts.",
    url: "https://citepay-markets.vercel.app/mcp",
  },
};

export default function McpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
