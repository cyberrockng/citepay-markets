"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Source } from "@/types";

export default function MarketPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", url: "", creatorName: "", creatorHandle: "", payoutWallet: "", price: "0.002", bond: "0", content: "" });
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
      body: JSON.stringify({ ...form, price: Math.round(parseFloat(form.price) * 1_000_000), bond: Math.round(parseFloat(form.bond) * 1_000_000) }),
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

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm">← Home</Link>
            <h1 className="text-3xl font-bold mt-4">Creator Source Market</h1>
            <p className="text-gray-400 mt-1">{sources.length} sources competing for AI citations</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-2 rounded-lg transition"
          >
            + Register Source
          </button>
        </div>

        {msg && <div className="mb-4 px-4 py-3 rounded-lg bg-indigo-900/30 border border-indigo-800 text-indigo-300 text-sm">{msg}</div>}

        {/* Register Form */}
        {showForm && (
          <form onSubmit={handleRegister} className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-8 space-y-4">
            <h2 className="font-semibold">Register a Creator Source</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: "Title", key: "title", placeholder: "Your article or content title" },
                { label: "URL", key: "url", placeholder: "https://..." },
                { label: "Creator Name", key: "creatorName", placeholder: "Your name" },
                { label: "Handle", key: "creatorHandle", placeholder: "@handle" },
                { label: "Payout Wallet", key: "payoutWallet", placeholder: "0x..." },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm text-gray-400 mb-1">{label}</label>
                  <input
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                    placeholder={placeholder}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    required={key !== "creatorHandle"}
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Price (USDC)</label>
                <input type="number" step="0.001" min="0.001" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Credibility Bond (USDC, optional)</label>
                <input type="number" step="0.001" min="0" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" value={form.bond} onChange={(e) => setForm((f) => ({ ...f, bond: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Content excerpt (used for content hash)</label>
              <textarea className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none" rows={3} placeholder="Paste a key excerpt or summary of your content..." value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-6 py-2 rounded-lg transition text-sm">
                {submitting ? "Registering..." : "Register"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="text-gray-500 hover:text-gray-300 text-sm">Cancel</button>
            </div>
          </form>
        )}

        {/* Source Table */}
        {loading ? (
          <div className="text-gray-500 text-center py-12">Loading sources...</div>
        ) : sources.length === 0 ? (
          <div className="text-gray-500 text-center py-12">
            No sources registered yet. Be the first to register a source.
          </div>
        ) : (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500 text-xs">
                    <th className="px-4 py-3 text-left">Source</th>
                    <th className="px-4 py-3 text-center">Bond</th>
                    <th className="px-4 py-3 text-right">Reputation</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3 text-right">Paid</th>
                    <th className="px-4 py-3 text-right">Refused</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => (
                    <tr key={s.id} className="border-b border-gray-800 hover:bg-gray-800/30">
                      <td className="px-4 py-3">
                        <Link href={`/source/${s.id}`} className="font-medium text-white hover:text-indigo-400 transition">{s.title}</Link>
                        <div className="text-gray-500 text-xs">{s.creatorName} · <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">{s.url.replace(/^https?:\/\//, "").slice(0, 40)}</a></div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s.bonded
                          ? <span className="text-green-400 text-xs font-mono border border-green-800 bg-green-900/20 px-2 py-0.5 rounded">Bonded</span>
                          : <span className="text-gray-600 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={s.reputation >= 0 ? "text-green-400" : "text-red-400"}>
                          {s.reputation >= 0 ? "+" : ""}{s.reputation}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-gray-300">
                        ${(s.price / 1_000_000).toFixed(4)}
                      </td>
                      <td className="px-4 py-3 text-right text-green-400">{s.paidCount}</td>
                      <td className="px-4 py-3 text-right text-red-400">{s.refusedCount}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded border ${s.active ? "text-green-400 border-green-800 bg-green-900/20" : "text-gray-600 border-gray-700"}`}>
                          {s.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
