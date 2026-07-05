"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/",         label: "Home",   icon: "CP" },
  { href: "/demo",     label: "Demo",   icon: "D" },
  { href: "/market",   label: "Market", icon: "M" },
  { href: "/proof",    label: "Proof",  icon: "P" },
  { href: "/traction", label: "Stats",  icon: "T" },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[var(--bg)]/95 backdrop-blur-md">
      <div className="flex">
        {NAV.map(({ href, label, icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex-1 flex flex-col items-center gap-0.5 py-3 text-[10px] font-medium tracking-wide transition-colors ${
                active ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              <span className={`flex h-6 min-w-6 items-center justify-center rounded-md border px-1 text-[10px] font-semibold leading-none transition-colors ${
                active ? "border-emerald-300/40 bg-emerald-300/10" : "border-white/10 bg-[var(--surface)]"
              }`}>
                {icon}
              </span>
              <span>{label}</span>
              {active && <span className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-[var(--accent)]" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
