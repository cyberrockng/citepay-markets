"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTraction } from "@/hooks/use-traction";

const CONTRACT_ADDRESS = "0x396cf1646EbAeF85ee8428C2d9239C46Ae956085";
const AGENT_WALLET = "0x5389688243328c26a92b301faEEAb5fbf9AFf105";

const PRODUCT_CARDS = [
  { href: "/demo", title: "Demo", body: "Run the judge path: query, x402 payment, source scoring, receipts." },
  { href: "/market", title: "Market", body: "Browse registered creator sources and their payment policies." },
  { href: "/proof", title: "Proof Explorer", body: "Inspect receipts, hashes, creator payouts, and ArcScan links." },
  { href: "/traction", title: "Traction", body: "See live payment volume, decisions, and on-chain events." },
  { href: "/agent-exchange", title: "Agent Exchange", body: "Watch source agents compete, earn, and build reputation." },
  { href: "/join", title: "Creator Join", body: "Register content so agents can cite it and pay for it." },
];

const PROCESS_STEPS = [
  {
    n: "01",
    title: "Agent pays via x402",
    body: "The agent hits an HTTP 402 challenge, then settles USDC on Arc through Circle's payment rail.",
  },
  {
    n: "02",
    title: "Sources are scored",
    body: "CitePay ranks creator sources by relevance, price, bond, and reputation before PAY or REFUSE decisions.",
  },
  {
    n: "03",
    title: "Receipts prove the work",
    body: "Every paid citation becomes an evidence hash and on-chain receipt that anyone can verify or challenge.",
  },
];

const BUILT_ON = ["Circle", "Arc", "x402", "Claude"];

function formatUSDC(value?: number | null) {
  if (typeof value !== "number") return "...";
  return `$${value.toFixed(4)}`;
}

function formatNumber(value?: number | null) {
  if (typeof value !== "number") return "...";
  return value.toLocaleString();
}

function shortAddress(address: string) {
  return `${address.slice(0, 10)}...${address.slice(-6)}`;
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="font-mono text-base font-semibold text-[var(--text-primary)]">{value}</div>
      <div className="mt-1 text-xs text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
      {children}
    </div>
  );
}

function PrimaryButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-12 items-center justify-center rounded-lg bg-[#34D399] px-6 text-sm font-semibold text-[#07110D] transition-colors hover:bg-[#6EE7B7]"
    >
      {children}
    </Link>
  );
}

function GhostLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-12 items-center justify-center rounded-lg px-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
    >
      {children}
    </Link>
  );
}

export default function LandingPage() {
  const { stats } = useTraction();

  const proofStats = useMemo(
    () => [
      { label: "Paid citations", value: formatNumber(stats?.paidCitations) },
      { label: "USDC routed", value: formatUSDC(stats?.totalUSDCRouted) },
      { label: "Creators paid", value: formatNumber(stats?.creatorsPaid) },
    ],
    [stats],
  );

  return (
    <main className="overflow-x-hidden bg-[var(--bg)] text-[var(--text-primary)]">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-28">
          <div className="flex min-w-0 flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              CitePay Markets
            </div>
            <h1 className="mt-7 max-w-3xl break-words text-4xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-6xl">
              AI agents pay for what they cite.
            </h1>
            <p className="mt-6 max-w-2xl break-words text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
              Every citation becomes a real USDC payment with a tamper-proof on-chain receipt, settled on Arc via Circle x402.
            </p>
            <div className="mt-9 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
              <PrimaryButton href="/demo">Run the live demo</PrimaryButton>
              <GhostLink href="/proof">See on-chain proof</GhostLink>
            </div>
            <div className="mt-8 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
              {proofStats.map((stat) => (
                <StatChip key={stat.label} label={stat.label} value={stat.value} />
              ))}
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-white/10 bg-[var(--surface)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
            <div className="rounded-lg border border-white/10 bg-[var(--surface-raised)] p-5">
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <SectionLabel>Live proof layer</SectionLabel>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">Citation payment receipts</h2>
                </div>
                <Link href="/traction" className="rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
                  View stats
                </Link>
              </div>
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-black/10 p-4">
                  <div className="text-sm text-[var(--text-muted)]">Paid citations</div>
                  <div className="mt-2 font-mono text-3xl font-semibold text-[var(--accent)]">
                    {formatNumber(stats?.paidCitations)}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/10 p-4">
                  <div className="text-sm text-[var(--text-muted)]">Sources registered</div>
                  <div className="mt-2 font-mono text-3xl font-semibold">
                    {formatNumber(stats?.sourcesRegistered)}
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-white/10 bg-black/10 p-4">
                <div className="flex min-w-0 items-center justify-between gap-4 text-sm">
                  <span className="text-[var(--text-muted)]">CitePayMarket.sol</span>
                  <a
                    href={`https://testnet.arcscan.app/address/${CONTRACT_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-right font-mono text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
                  >
                    {shortAddress(CONTRACT_ADDRESS)}
                  </a>
                </div>
                <div className="mt-3 flex min-w-0 items-center justify-between gap-4 text-sm">
                  <span className="text-[var(--text-muted)]">Agent wallet</span>
                  <span className="break-all text-right font-mono text-[var(--text-secondary)]">{shortAddress(AGENT_WALLET)}</span>
                </div>
                <div className="mt-3 flex min-w-0 items-center justify-between gap-4 text-sm">
                  <span className="text-[var(--text-muted)]">Last stats sync</span>
                  <span className="font-mono text-[var(--text-secondary)]">{stats ? "live" : "loading"}</span>
                </div>
              </div>
              <div className="mt-4 rounded-lg bg-[#34D399]/10 p-4 text-sm leading-7 text-[var(--text-secondary)]">
                Every number in this panel is the same traction payload used by the hero chips and proof strip.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-24 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
        <div className="p-2">
          <SectionLabel>The problem</SectionLabel>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">AI cites knowledge without permission, payment, or accountability.</h2>
          <p className="mt-5 text-base leading-8 text-[var(--text-secondary)]">
            Current agents can quote sources, summarize work, and route value away from creators without leaving a reliable payment or policy trail.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[var(--surface-raised)] p-7">
          <SectionLabel>The solution</SectionLabel>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">CitePay turns every citation into payment plus proof.</h2>
          <p className="mt-5 text-base leading-8 text-[var(--text-secondary)]">
            Agents pay in USDC, creators earn when selected, and the resulting receipt shows exactly what was cited, why it was paid, and where it settled.
          </p>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[var(--surface)]">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <SectionLabel>How it works</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">A citation market in three verifiable steps.</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PROCESS_STEPS.map((step) => (
              <div key={step.n} className="rounded-xl border border-white/10 bg-[var(--bg)] p-6">
                <div className="font-mono text-sm font-semibold text-[var(--accent)]">{step.n}</div>
                <h3 className="mt-6 text-xl font-semibold">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-white/10 bg-[var(--surface-raised)] p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <SectionLabel>Live proof strip</SectionLabel>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Real numbers from the running market.</h2>
              <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)]">
                These values are read from CitePay's traction API. If the data source is unavailable, the page shows a loading state instead of fabricated activity.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatChip label="Agent decisions" value={formatNumber(stats?.totalDecisions)} />
              <StatChip label="Refusals" value={formatNumber(stats?.refusals)} />
              <StatChip label="Skips" value={formatNumber(stats?.skips)} />
            </div>
          </div>
          <div className="mt-7">
            <Link href="/traction" className="text-sm font-semibold text-[var(--indigo)] transition-colors hover:text-indigo-300">
              Open the traction dashboard
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[var(--surface)]">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
            <div>
              <SectionLabel>Cross-network credibility</SectionLabel>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Two agent networks paying each other.</h2>
              <p className="mt-5 text-base leading-8 text-[var(--text-secondary)]">
                Tollgate paid CitePay as a cited creator, then CitePay paid Tollgate as an external reader through an x402-settled query. The same CitePay wallet earned and paid through agent-mediated citation settlement.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="https://testnet.arcscan.app/tx/0xcb617e0eda3bb4124abc41a06c2c313f42b8ea0aad2f90a6e7c4c73246a73629"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  Tollgate payout proof
                </a>
                <a
                  href="https://testnet.arcscan.app/tx/0xf2dabb1ce651330a389acd4d6cacee1a859dc4fc12f18459143dc0f60ee53540"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  Shadow sponsor proof
                </a>
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-[var(--bg)] p-6">
              <h3 className="text-xl font-semibold">Built on payment infrastructure judges can inspect.</h3>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {BUILT_ON.map((name) => (
                  <div key={name} className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4 text-center text-sm font-semibold text-[var(--text-secondary)]">
                    {name}
                  </div>
                ))}
              </div>
              <p className="mt-6 text-sm leading-7 text-[var(--text-secondary)]">
                CitePay also acts as a Shadow Float sponsor line participant, showing the same agent wallet can be a payer, provider, and capital sponsor across networks.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <SectionLabel>Explore the product</SectionLabel>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">The route map is part of the product story.</h2>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCT_CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-xl border border-white/10 bg-[var(--surface)] p-6 transition-colors hover:border-white/20 hover:bg-[var(--surface-raised)]"
            >
              <h3 className="text-xl font-semibold text-[var(--text-primary)]">{card.title}</h3>
              <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">{card.body}</p>
              <div className="mt-6 text-sm font-semibold text-[var(--indigo)] transition-colors group-hover:text-indigo-300">
                Open {card.title}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
