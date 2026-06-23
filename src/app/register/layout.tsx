import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Register as Creator — CitePay Markets",
  description: "Get paid in USDC every time an AI agent cites your work. Register your content in CitePay Markets — no approval, no middleman. One form, instant activation.",
  openGraph: {
    title: "Register as Creator — CitePay Markets",
    description: "Earn USDC nanopayments each time an AI agent cites your articles, research, or content. Register once, earn forever on Arc Testnet.",
    url: "https://citepay-markets.vercel.app/register",
  },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
