"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Source } from "@/types";
import { PageShell, BackLink, Badge, decisionStyle } from "@/components/ui";

export default function MarketPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "", url: "", creatorName: "", creatorHandle: "",
    payoutWallet: "", price: "0.002", bond: "0", content: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/sources")
      .then((r) => r.json())
      .then((d) => { setSources(d.sources || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMsg("");
    const res = await fetch("/api/sources/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        price: Math.round(parseFloat(form.price) * 1_000_000),
        bond: Math.round(parseFloat(form.bond) * 1_000_000),
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg("Source registered!");
      setSources((s) => [data.source, ...s]);
      setShowForm(false);
      setForm({ title: "", url: "", creatorName: "", creatorHandle: "", payoutWallet: "", price: "0.002", bond: "0", content: "" });
    } else {
      setMsg(data.error || "Error");
    }
    setSubmitting(false);
  }

  // Summary metrics
  const totalSources = sources.length;
  const bondedCount = sources.filter((s) => s.bonded).length;
  const activeCount = sources.filter((s) => s.active).length;
  const totalPaidCitations = sources.reduce((a, s) => a + s.paidCount, 0);

  return (
    <PageShell maxWidth="max-w-5xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <BackLink href="/" label="Home" />
          <h1 className="text-3xl font-bold mt-4 text-[#f0f0f5]">Creator Source Market</h1>
          <p className="text-[#8b8b9e] mt-1">
            {totalSources} sources competing for AI citations on Base Sepolia
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="mt-6 bg-[#6366f1] hover:bg-indigo-500 text-white font-semibold px-5 py-2 rounded-lg transition-colors text-sm"
        >
          + Register Source
        </button>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Sources", value: totalSources, accent: "text-[#6366f1]" },
          { label: "Active", value: activeCount, accent: "text-[#00ff88]" },
          { label: "Bonded", value: bondedCount, accent: "text-yellow-400" },
          { label: "Citations Paid", value: totalPaidCitations, accent: "text-[#00ff88]" },
        ].map(({ label, value, accent }) => (
          <div key={label} className="bg-[#111118] rounded-xl p-4 border border-[#1e1e2e]">
            <div className={`text-2xl font-bold font-mono ${accent}`}>{value}</div>
            <div className="text-[#8b8b9e] text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>

      {msg && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-[#6366f1]/10 border border-[#6366f1]/30 text-[#6366f1] text-sm">
          {msg}
        </div>
      )}

      {/* Register Form */}
      {showForm && (
        <form
          onSubmit={handleRegister}
          className="bg-[#111118] rounded-xl p-6 border border-[#1e1e2e] mb-8 space-y-4"
        >
          <h2 className="font-semibold text-[#f0f0f5]">Register a Creator Source</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: "Title", key: "title", placeholder: "Your article or content title" },
              { label: "URL", key: "url", placeholder: "https://…" },
              { label: "Creator Name", key: "creatorName", placeholder: "Your name" },
              { label: "Handle", key: "creatorHandle", placeholder: "@handle" },
              { label: "Payout Wallet", key: "payoutWallet", placeholder: "0x…" },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-xs text-[#8b8b9e] mb-1">{label}</label>
                <input
                  className="w-full bg-[#0a0a0f] border border-[#1e1e2e] focus:border-[#6366f1] rounded-lg px-3 py-2 text-[#f0f0f5] text-sm focus:outline-none transition-colors"
                  placeholder={placeholder}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  required={key !== "creatorHandle"}
                />
              </div>
            ))}
            <div>
              <label className="block text-xs text-[#8b8b9e] mb-1">Price (USDC)</label>
              <input
                type="number" step="0.001" min="0.001"
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] focus:border-[#6366f1] rounded-lg px-3 py-2 text-[#f0f0f5] text-sm focus:outline-none transition-colors"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-[#8b8b9e] mb-1">Credibility Bond (USDC, optional)</label>
              <input
                type="number" step="0.001" min="0"
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] focus:border-[#6366f1] rounded-lg px-3 py-2 text-[#f0f0f5] text-sm focus:outline-none transition-colors"
                value={form.bond}
                onChange={(e) => setForm((f) => ({ ...f, bond: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#8b8b9e] mb-1">Content excerpt (used for content hash)</label>
            <textarea
              className="w-full bg-[#0a0a0f] border border-[#1e1e2e] focus:border-[#6366f1] rounded-lg px-3 py-2 text-[#f0f0f5] text-sm focus:outline-none resize-none transition-colors"
              rows={3}
              placeholder="Paste a key excerpt or summary of your content…"
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="bg-[#6366f1] hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-6 py-2 rounded-lg transition-colors text-sm"
            >
              {submitting ? "Registering…" : "Register"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-[#8b8b9e] hover:text-[#f0f0f5] text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Source Table */}
      {loading ? (
        <div className="text-[#8b8b9e] text-center py-16 animate-pulse">Loading sources…</div>
      ) : sources.length === 0 ? (
        <div className="text-[#8b8b9e] text-center py-16 bg-[#111118] rounded-xl border border-[#1e1e2e]">
          No sources registered yet. Be the first to register a source.
        </div>
      ) : (
        <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e2e]">
                  <th className="px-4 py-3 text-left text-xs text-[#8b8b9e] font-medium">Source</th>
                  <th className="px-4 py-3 text-center text-xs text-[#8b8b9e] font-medium">Bond</th>
                  <th className="px-4 py-3 text-right text-xs text-[#8b8b9e] font-medium">Rep</th>
                  <th className="px-4 py-3 text-right text-xs text-[#8b8b9e] font-medium">Price</th>
                  <th className="px-4 py-3 text-right text-xs text-[#8b8b9e] font-medium">Paid</th>
                  <th className="px-4 py-3 text-right text-xs text-[#8b8b9e] font-medium">Refused</th>
                  <th className="px-4 py-3 text-center text-xs text-[#8b8b9e] font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => {
                  const repAbs = Math.abs(s.reputation);
                  const repColor = repAbs <= 2 ? "text-[#8b8b9e]" : s.reputation > 0 ? "text-[#00ff88]" : "text-red-400";
                  return (
                    <tr key={s.id} className="border-b border-[#1e1e2e] hover:bg-[#0a0a0f]/40 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/source/${s.id}`}
                          className="font-medium text-[#f0f0f5] hover:text-[#6366f1] transition-colors"
                        >
                          {s.title}
                        </Link>
                        <div className="text-[#8b8b9e] text-xs mt-0.5">
                          {s.creatorName} ·{" "}
                          <a href={s.url} target="_blank" rel="noopener noreferrer"
                             className="text-[#6366f1] hover:text-indigo-300">
                            {s.url.replace(/^https?:\/\//, "").slice(0, 40)}
                          </a>
                          {" · "}
                          <Link href={`/creator/${s.payoutWallet}`} className="text-[#00ff88] hover:underline">
                            earnings →
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s.bonded
                          ? <Badge type="BONDED" label="Bonded" />
                          : <span className="text-[#4a4a5e] text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-mono text-xs ${repColor}`}>
                          {s.reputation >= 0 ? "+" : ""}{s.reputation}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-[#f0f0f5]">
                        ${(s.price / 1_000_000).toFixed(4)}
                      </td>
                      <td className="px-4 py-3 text-right text-[#00ff88] font-mono text-xs">{s.paidCount}</td>
                      <td className="px-4 py-3 text-right text-red-400 font-mono text-xs">{s.refusedCount}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge type={s.active ? "ACTIVE" : "INACTIVE"} label={s.active ? "Active" : "Inactive"} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageShell>
  );
}
