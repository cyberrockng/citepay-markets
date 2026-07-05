import React from "react";
import Link from "next/link";

// ── Design tokens ─────────────────────────────────────────────────────────────
// bg: #0a0a0f  surface: #111118  border: #1e1e2e
// green: #34D399  indigo: #6366f1
// text-primary: #f0f0f5  text-secondary: #8b8b9e

// ── PageShell ─────────────────────────────────────────────────────────────────

export function PageShell({
  children,
  maxWidth = "max-w-4xl",
  className = "",
}: {
  children: React.ReactNode;
  maxWidth?: string;
  className?: string;
}) {
  return (
    <main className={`min-h-screen bg-[#0a0a0f] text-[#f0f0f5] overflow-x-hidden ${className}`}>
      <div className={`${maxWidth} mx-auto px-4 sm:px-6 py-10 pb-28 sm:pb-12`}>{children}</div>
    </main>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

export function SectionHeader({
  title,
  subtitle,
  className = "",
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={`mb-6 ${className}`}>
      <h2 className="text-xl font-semibold text-[#f0f0f5]">{title}</h2>
      {subtitle && <p className="text-[#8b8b9e] text-sm mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  accent = "text-[#6366f1]",
  sub,
}: {
  label: string;
  value: string | number;
  accent?: string;
  sub?: string;
}) {
  return (
    <div className="bg-[#111118] rounded-xl p-5 border border-[#1e1e2e]">
      <div className={`text-2xl font-bold font-mono ${accent}`}>{value}</div>
      <div className="text-[#8b8b9e] text-xs mt-1">{label}</div>
      {sub && <div className="text-[#4a4a5e] text-xs mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────

const BADGE_STYLES: Record<string, string> = {
  PAY:               "text-[#34D399] border-[#34D399]/30 bg-[#34D399]/10",
  REFUSE:            "text-red-400 border-red-800 bg-red-900/20",
  SKIP:              "text-[#8b8b9e] border-[#1e1e2e] bg-[#111118]",
  BLOCKED_BY_POLICY: "text-orange-400 border-orange-700 bg-orange-900/20",
  BONDED:            "text-yellow-400 border-yellow-700 bg-yellow-900/20",
  ACTIVE:            "text-[#34D399] border-[#34D399]/30 bg-[#34D399]/10",
  INACTIVE:          "text-[#4a4a5e] border-[#1e1e2e]",
  CHALLENGED:        "text-yellow-400 border-yellow-700 bg-yellow-900/20",
  ANCHORED:          "text-[#34D399] border-[#34D399]/30 bg-[#34D399]/10",
  PROOF:             "text-[#34D399] border-[#34D399]/30 bg-[#34D399]/10",
};

export function Badge({
  type,
  label,
  size = "sm",
}: {
  type: string;
  label?: string;
  size?: "xs" | "sm";
}) {
  const style = BADGE_STYLES[type.toUpperCase()] ?? "text-[#8b8b9e] border-[#1e1e2e]";
  const text = size === "xs" ? "text-xs" : "text-xs";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border font-mono font-semibold ${text} ${style}`}>
      {label ?? type}
    </span>
  );
}

// ── ProofPanel ────────────────────────────────────────────────────────────────

export function ProofPanel({
  label,
  hash,
  baseScanTx,
  baseScanTxLabel,
  valid,
}: {
  label: string;
  hash?: string | null;
  baseScanTx?: string | null;
  baseScanTxLabel?: string;
  valid?: boolean | null;
}) {
  return (
    <div className="bg-[#0a0a0f] rounded-lg p-4 border border-[#1e1e2e]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[#8b8b9e] text-xs">{label}</span>
        {valid !== undefined && valid !== null && (
          <span className={valid ? "text-[#34D399] text-xs" : "text-red-400 text-xs"}>
            {valid ? "✓ valid" : "✗ invalid"}
          </span>
        )}
      </div>
      {hash && (
        <div className="font-mono text-xs text-[#f0f0f5] break-all leading-relaxed">{hash}</div>
      )}
      {baseScanTx && (
        <a
          href={`https://testnet.arcscan.app/tx/${baseScanTx}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-2 font-mono text-xs text-[#6366f1] hover:text-indigo-300 break-all"
        >
          {baseScanTxLabel ?? baseScanTx.slice(0, 20) + "…"} ↗
        </a>
      )}
    </div>
  );
}

// ── ScoreBar ──────────────────────────────────────────────────────────────────

export function ScoreBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const accent = pct >= 70 ? "#34D399" : pct >= 40 ? "#6366f1" : "#4a4a5e";
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-[#8b8b9e] text-xs">{label}</span>
        <span className="font-mono text-xs text-[#f0f0f5]">
          {value}<span className="text-[#4a4a5e]">/{max}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[#1e1e2e] overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: accent }}
        />
      </div>
    </div>
  );
}

// ── TxLink ────────────────────────────────────────────────────────────────────

export function TxLink({
  hash,
  label,
}: {
  hash: string;
  label?: string;
}) {
  const display = label ?? (hash.length > 20 ? hash.slice(0, 10) + "…" + hash.slice(-6) : hash);
  return (
    <a
      href={`https://testnet.arcscan.app/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-xs text-[#6366f1] hover:text-indigo-300 break-all"
    >
      {display} ↗
    </a>
  );
}

// ── DataRow ───────────────────────────────────────────────────────────────────

export function DataRow({
  label,
  value,
  mono,
  link,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  link?: string;
  accent?: string;
}) {
  const textClass = mono ? "font-mono text-xs break-all" : "text-sm";
  const colorClass = accent ?? "text-[#f0f0f5]";
  return (
    <div>
      <div className="text-[#8b8b9e] text-xs mb-0.5">{label}</div>
      {link ? (
        <a
          href={link}
          target={link.startsWith("http") ? "_blank" : "_self"}
          rel="noopener noreferrer"
          className={`text-[#6366f1] hover:text-indigo-300 ${textClass}`}
        >
          {value}
        </a>
      ) : (
        <div className={`${textClass} ${colorClass}`}>{value}</div>
      )}
    </div>
  );
}

// ── BackLink ──────────────────────────────────────────────────────────────────

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-[#8b8b9e] hover:text-[#f0f0f5] text-sm transition-colors"
    >
      ← {label}
    </Link>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function Card({
  children,
  className = "",
  accent,
}: {
  children: React.ReactNode;
  className?: string;
  accent?: string;
}) {
  const border = accent ? `border-${accent}` : "border-[#1e1e2e]";
  return (
    <div className={`bg-[#111118] rounded-xl border ${border} ${className}`}>
      {children}
    </div>
  );
}

// ── DecisionBadge (color matches PAY/REFUSE/SKIP) ────────────────────────────

export function decisionStyle(decision: string): string {
  switch (decision) {
    case "PAY":               return "text-[#34D399] border-[#34D399]/30 bg-[#34D399]/10";
    case "REFUSE":            return "text-red-400 border-red-800 bg-red-900/20";
    case "BLOCKED_BY_POLICY": return "text-orange-400 border-orange-700 bg-orange-900/20";
    default:                  return "text-[#8b8b9e] border-[#1e1e2e] bg-[#111118]";
  }
}

export function decisionAccent(decision: string): string {
  switch (decision) {
    case "PAY":               return "#34D399";
    case "REFUSE":            return "#f87171";
    case "BLOCKED_BY_POLICY": return "#fb923c";
    default:                  return "#1e1e2e";
  }
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#1e1e2e]">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="divide-y divide-[#1e1e2e]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-6 py-4 flex gap-4">
            {Array.from({ length: cols }).map((__, j) => (
              <Skeleton key={j} className={`h-3 ${j === 0 ? "w-32" : "w-16"}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
