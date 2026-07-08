"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";

const NAV_LINKS = [
  { href: "/demo", label: "Demo" },
  { href: "/clear/demo", label: "Clear" },
  { href: "/market", label: "Market" },
  { href: "/proof", label: "Proof" },
  { href: "/traction", label: "Traction" },
];

const FOOTER_GROUPS = [
  {
    title: "Product",
    links: [
      { href: "/demo", label: "Demo" },
      { href: "/clear/demo", label: "Clear" },
      { href: "/recover", label: "Recover" },
      { href: "/ask", label: "Ask" },
      { href: "/market", label: "Market" },
      { href: "/register", label: "Creators" },
    ],
  },
  {
    title: "Proof",
    links: [
      { href: "/proof", label: "Proof Explorer" },
      { href: "/traction", label: "Traction" },
      { href: "/audit", label: "Audit" },
      { href: "/proof", label: "Receipts" },
    ],
  },
  {
    title: "Labs",
    links: [
      { href: "/labs/agents", label: "Agents" },
      { href: "/labs/agent-exchange", label: "Agent Exchange" },
      { href: "/labs/orchestrate", label: "Orchestrate" },
      { href: "/labs/economy", label: "Economy" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/mcp", label: "MCP" },
      { href: "https://github.com/cyberrockng/citepay-markets", label: "GitHub", external: true },
      { href: "https://www.npmjs.com/package/citepay-mcp", label: "citepay-mcp", external: true },
    ],
  },
];

export function SiteNav() {
  const pathname = usePathname();
  const isClearSurface =
    pathname.startsWith("/clear") || pathname.startsWith("/clearance") || pathname.startsWith("/recover");
  const ctaHref = isClearSurface ? "/clear/demo" : "/demo";
  const ctaLabel = isClearSurface ? "Run Clear" : "Run Demo";

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[var(--bg)]/88 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex min-w-0 items-center gap-3" aria-label="CitePay Markets home">
          <BrandMark size={38} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-tight text-[var(--text-primary)]">
              CitePay Markets
            </span>
            <span className="hidden text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)] sm:block">
              Proof-of-paid-citation
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary navigation">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname.startsWith(link.href) ? "page" : undefined}
              className={`text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] ${
                pathname.startsWith(link.href)
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <Link
          href={ctaHref}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-[#34D399] px-4 text-sm font-semibold text-[#07110D] transition-colors hover:bg-[#6EE7B7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
        >
          {ctaLabel}
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[var(--bg)] pb-24 pt-12 sm:pb-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <Link href="/" className="inline-flex items-center gap-3">
              <BrandMark size={42} />
              <span>
                <span className="block text-base font-semibold text-[var(--text-primary)]">CitePay Markets</span>
                <span className="mt-1 block text-xs text-[var(--text-muted)]">AI citations with USDC receipts.</span>
              </span>
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-6 text-[var(--text-secondary)]">
              Agents pay creators for cited knowledge, then publish receipts anyone can verify on Arc.
            </p>
            <div className="mt-5 text-xs leading-6 text-[var(--text-muted)]">
              Contract:{" "}
              <a
                href="https://testnet.arcscan.app/address/0x396cf1646EbAeF85ee8428C2d9239C46Ae956085"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
              >
                0x396cf164...6085
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-5">
            {FOOTER_GROUPS.map((group) => (
              <div key={group.title}>
                <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  {group.title}
                </h2>
                <ul className="mt-4 space-y-3">
                  {group.links.map((link) => (
                    <li key={`${group.title}-${link.label}-${link.href}`}>
                      <Link
                        href={link.href}
                        target={link.external ? "_blank" : undefined}
                        rel={link.external ? "noopener noreferrer" : undefined}
                        className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
