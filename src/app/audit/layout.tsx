import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "On-Chain Audit — CitePay Markets",
  description: "Live on-chain verification of every citation payment. Reads Arc Testnet RPC directly — wallet balance, transaction count, USDC paid to creators. No database, no trust required.",
  openGraph: {
    title: "On-Chain Audit — CitePay Markets",
    description: "Verify every citation payment directly on Arc Testnet. SHA-256 evidence hashes, ArcScan-verifiable transactions, and purpose-coded receipts for every agent decision.",
    url: "https://citepay-markets.vercel.app/audit",
  },
};

export default function AuditLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
