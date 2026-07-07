"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTraction } from "@/hooks/use-traction";
import { BrandMark } from "@/components/brand-mark";

const CONTRACT_ADDRESS = "0x396cf1646EbAeF85ee8428C2d9239C46Ae956085";

const PRODUCT_CARDS = [
  { href: "/demo", title: "Demo", body: "Run the judge path: query, x402 payment, source scoring, receipts." },
  { href: "/market", title: "Market", body: "Browse registered creator sources and their payment policies." },
  { href: "/proof", title: "Proof Explorer", body: "Inspect receipts, hashes, creator payouts, and ArcScan links." },
  { href: "/traction", title: "Traction", body: "See live payment volume, decisions, and on-chain events." },
  { href: "/labs/agent-exchange", title: "Agent Exchange", body: "Watch source agents compete, earn, and build reputation." },
  { href: "/register", title: "Creator Onboarding", body: "Register content so agents can cite it and pay for it." },
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

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
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
      className="lift-link inline-flex h-12 items-center justify-center rounded-lg bg-[#34D399] px-6 text-sm font-semibold text-[#07110D] transition-colors hover:bg-[#6EE7B7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
    >
      {children}
    </Link>
  );
}

function GhostLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-12 items-center justify-center rounded-lg px-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
    >
      {children}
    </Link>
  );
}

function CitationReceiptCard({ stats }: { stats: ReturnType<typeof useTraction>["stats"] }) {
  return (
    <div className="premium-card relative overflow-hidden rounded-2xl p-4 sm:p-5">
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      <div className="rounded-xl border border-white/10 bg-[#0B0D12]/72 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark size={38} />
            <div className="min-w-0">
              <SectionLabel>Citation receipt</SectionLabel>
              <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">Verified creator payout</div>
            </div>
          </div>
          <div className="rounded-full border border-[#34D399]/30 bg-[#34D399]/10 px-3 py-1 text-xs font-semibold text-[#34D399]">
            verified
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
            <div className="text-xs text-[var(--text-muted)]">Amount paid</div>
            <div className="mt-2 font-mono text-3xl font-semibold text-[#34D399]">
              {formatUSDC(stats?.avgPaymentPerCitation)}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
            <div className="text-xs text-[var(--text-muted)]">Paid citations</div>
            <div className="mt-2 font-mono text-3xl font-semibold">
              {formatNumber(stats?.paidCitations)}
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-3 rounded-lg border border-white/10 bg-black/20 p-4 text-sm">
          <div className="flex min-w-0 justify-between gap-4">
            <span className="text-[var(--text-muted)]">Query hash</span>
            <span className="truncate font-mono text-[var(--text-secondary)]">0x9f42...c1a8</span>
          </div>
          <div className="flex min-w-0 justify-between gap-4">
            <span className="text-[var(--text-muted)]">Evidence hash</span>
            <span className="truncate font-mono text-[var(--text-secondary)]">0x71b3...e904</span>
          </div>
          <div className="flex min-w-0 justify-between gap-4">
            <span className="text-[var(--text-muted)]">Settlement</span>
            <a
              href={`https://testnet.arcscan.app/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate font-mono text-[#6366F1] transition-colors hover:text-indigo-300"
            >
              ArcScan ↗
            </a>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-4 rounded-lg bg-[#34D399]/10 p-4">
          <span className="text-sm text-[var(--text-secondary)]">Same live traction payload powers every number.</span>
          <span className="flex h-2 w-2 shrink-0 rounded-full bg-[#34D399] pulse-dot" />
        </div>
      </div>
    </div>
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
        <div className="hero-mesh absolute inset-0" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-32">
          <div className="flex min-w-0 flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              CitePay Markets
            </div>
            <h1 className="balance-text mt-7 max-w-3xl break-words text-5xl font-semibold leading-[0.95] tracking-[-0.035em] text-[var(--text-primary)] sm:text-7xl">
              AI agents pay for what they cite.
            </h1>
            <p className="pretty-text mt-6 max-w-2xl break-words text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
              Every citation becomes a real USDC payment with a tamper-evident on-chain receipt, settled on Arc via Circle x402.
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

          <div className="min-w-0 lg:translate-y-4">
            <CitationReceiptCard stats={stats} />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-24 sm:px-6 md:py-32 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
        <div className="p-2">
          <SectionLabel>The problem</SectionLabel>
          <h2 className="balance-text mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">AI cites knowledge without permission, payment, or accountability.</h2>
          <p className="pretty-text mt-5 text-base leading-8 text-[var(--text-secondary)]">
            Current agents can quote sources, summarize work, and route value away from creators without leaving a reliable payment or policy trail.
          </p>
        </div>
        <div className="premium-card rounded-2xl p-7">
          <SectionLabel>The solution</SectionLabel>
          <h2 className="balance-text mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">CitePay turns every citation into payment plus proof.</h2>
          <p className="pretty-text mt-5 text-base leading-8 text-[var(--text-secondary)]">
            Agents pay in USDC, creators earn when selected, and the resulting receipt shows exactly what was cited, why it was paid, and where it settled.
          </p>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[var(--surface)]">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32 lg:px-8">
          <div className="max-w-2xl">
            <SectionLabel>How it works</SectionLabel>
            <h2 className="balance-text mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">A citation market in three verifiable steps.</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-6">
            {PROCESS_STEPS.map((step) => (
              <div
                key={step.n}
                className={`lift-link rounded-2xl border border-white/10 bg-[var(--bg)] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${
                  step.n === "01" ? "md:col-span-3 md:row-span-2" : "md:col-span-3"
                }`}
              >
                <div className="font-mono text-sm font-semibold text-[var(--accent)]">{step.n}</div>
                <h3 className="mt-6 text-xl font-semibold md:text-2xl">{step.title}</h3>
                <p className="pretty-text mt-3 text-sm leading-7 text-[var(--text-secondary)]">{step.body}</p>
                {step.n === "01" && (
                  <div className="mt-8 rounded-xl border border-[#34D399]/20 bg-[#34D399]/5 p-4 font-mono text-xs text-[#34D399]">
                    HTTP 402 → Circle Gateway → Arc settlement
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32 lg:px-8">
        <div className="premium-card rounded-2xl p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <SectionLabel>Live proof strip</SectionLabel>
              <h2 className="balance-text mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Real numbers from the running market.</h2>
              <p className="pretty-text mt-4 text-sm leading-7 text-[var(--text-secondary)]">
                These values are read from CitePay&apos;s traction API. If the data source is unavailable, the page shows a loading state instead of fabricated activity.
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
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
            <div>
              <SectionLabel>Cross-network credibility</SectionLabel>
              <h2 className="balance-text mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Two agent networks paying each other.</h2>
              <p className="pretty-text mt-5 text-base leading-8 text-[var(--text-secondary)]">
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
            <div className="premium-card rounded-2xl p-6">
              <h3 className="text-xl font-semibold">USDC moves both directions.</h3>
              <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
                  <div className="text-sm font-semibold">CitePay</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">citation market</div>
                </div>
                <div className="flex flex-col items-center gap-3 text-[#34D399]">
                  <span className="font-mono text-xs">USDC</span>
                  <span className="h-px w-12 bg-gradient-to-r from-[#34D399] to-[#6366F1]" />
                  <span className="font-mono text-xs">x402</span>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
                  <div className="text-sm font-semibold">Tollgate</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">paid source</div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-[#34D399]/10 p-3 text-xs leading-5 text-[var(--text-secondary)]">Tollgate paid CitePay for research.</div>
                <div className="rounded-lg bg-[#6366F1]/10 p-3 text-xs leading-5 text-[var(--text-secondary)]">CitePay paid Tollgate as a source.</div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {BUILT_ON.map((name) => (
                  <div key={name} className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4 text-center text-sm font-semibold text-[var(--text-secondary)]">
                    {name}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32 lg:px-8">
        <div className="max-w-2xl">
          <SectionLabel>Explore the product</SectionLabel>
          <h2 className="balance-text mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">The route map is part of the product story.</h2>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCT_CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="lift-link group rounded-2xl border border-white/10 bg-[var(--surface)] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-white/20 hover:bg-[var(--surface-raised)]"
            >
              <h3 className="text-xl font-semibold text-[var(--text-primary)]">{card.title}</h3>
              <p className="pretty-text mt-3 text-sm leading-7 text-[var(--text-secondary)]">{card.body}</p>
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
