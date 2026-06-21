"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/",            label: "Home",    icon: "◈" },
  { href: "/orchestrate", label: "Multi",   icon: "⬡" },
  { href: "/ask",         label: "Ask",     icon: "✦" },
  { href: "/live",        label: "Live",    icon: "⬤" },
  { href: "/mcp",         label: "MCP",     icon: "⬟" },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0f]/95 backdrop-blur-md border-t border-[#1e1e2e]">
      <div className="flex">
        {NAV.map(({ href, label, icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex-1 flex flex-col items-center gap-0.5 py-3 text-[10px] font-medium tracking-wide transition-colors ${
                active ? "text-[#6366f1]" : "text-[#4a4a5e] hover:text-[#8b8b9e]"
              }`}
            >
              <span className={`text-lg leading-none transition-transform ${active ? "scale-110" : ""}`}>{icon}</span>
              <span>{label}</span>
              {active && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#6366f1] rounded-full" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
