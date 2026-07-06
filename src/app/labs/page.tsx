import Link from "next/link";

const LABS = [
  { href: "/labs/agents", label: "Agents", description: "Source-agent connection examples and API entry points." },
  { href: "/labs/agent-exchange", label: "Agent Exchange", description: "Experimental agent discovery, hiring, and reputation flows." },
  { href: "/labs/orchestrate", label: "Orchestrate", description: "Multi-agent research demo with experimental commerce mechanics." },
  { href: "/labs/economy", label: "Economy", description: "Experimental market activity dashboard for agent-commerce prototypes." },
];

export default function LabsPage() {
  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            Experimental
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Labs
          </h1>
          <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
            Prototype agent-commerce surfaces live here, away from the core CitePay product journey.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {LABS.map((lab) => (
            <Link
              key={lab.href}
              href={lab.href}
              className="rounded-lg border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-emerald-300/40"
            >
              <div className="text-base font-semibold">{lab.label}</div>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{lab.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
