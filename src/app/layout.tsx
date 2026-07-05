import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { MobileNav } from "@/components/mobile-nav";
import { SiteFooter, SiteNav } from "@/components/site-chrome";
import { Providers } from "./providers";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CitePay Markets — Proof-of-Paid-Citation for AI Agents",
  description: "AI agents pay creators in USDC nanopayments when they cite their work. Every decision is a public, verifiable receipt settled on Arc via Circle Gateway.",
  metadataBase: new URL("https://citepay-markets.vercel.app"),
  openGraph: {
    title: "CitePay Markets — AI Agents That Pay Creators",
    description: "Agents enforce spend policies, pay creators in USDC via Circle Gateway on Arc, and publish tamper-evident Policy Receipts. Built for the Lepton Hackathon.",
    url: "https://citepay-markets.vercel.app",
    siteName: "CitePay Markets",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "CitePay Markets — AI agents pay for what they cite.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CitePay Markets — AI Agents That Pay Creators in USDC",
    description: "Multi-agent orchestrator + Circle Gateway nanopayments + on-chain receipts. Try the live demo → citepay-markets.vercel.app",
    creator: "@cyberrockng",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <SiteNav />
          {children}
          <SiteFooter />
        </Providers>
        <MobileNav />
        <Analytics />
      </body>
    </html>
  );
}
