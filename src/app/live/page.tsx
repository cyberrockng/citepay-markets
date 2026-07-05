"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";

interface FeedEvent {
  decision: string;
  sourceTitle: string;
  amountPaid: number;
  evidenceHash: string;
  query: string;
  timestamp: string;
  historical?: boolean;
}

type ConnState = "connecting" | "live" | "reconnecting";

const DECISION_STYLE: Record<string, string> = {
  PAY:               "text-[#34D399] border-[#34D399]/40 bg-[#34D399]/10",
  REFUSE:            "text-red-400 border-red-700/40 bg-red-900/10",
  SKIP:              "text-[#8b8b9e] border-[#1e1e2e] bg-[#0a0a0f]",
  BLOCKED_BY_POLICY: "text-orange-400 border-orange-700/40 bg-orange-900/10",
};

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function LivePage() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connState, setConnState] = useState<ConnState>("connecting");
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionTotals, setSessionTotals] = useState({ pay: 0, refuse: 0, skip: 0 });
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function connect() {
    if (esRef.current) esRef.current.close();
    setConnState("connecting");

    const es = new EventSource("/api/live");
    esRef.current = es;

    es.onopen = () => setConnState("live");

    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as FeedEvent;
        if (!ev.historical) {
          setSessionCount((n) => n + 1);
          setSessionTotals((t) => ({
            pay:    ev.decision === "PAY"    ? t.pay + 1    : t.pay,
            refuse: ev.decision === "REFUSE" ? t.refuse + 1 : t.refuse,
            skip:   (ev.decision !== "PAY" && ev.decision !== "REFUSE") ? t.skip + 1 : t.skip,
          }));
        }
        setEvents((prev) => {
          const next = [ev, ...prev];
          return next.slice(0, 50);
        });
      } catch { /* ignore malformed */ }
    };

    es.onerror = () => {
      setConnState("reconnecting");
      es.close();
      reconnectTimer.current = setTimeout(connect, 3000);
    };
  }

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connColors: Record<ConnState, string> = {
    connecting:   "bg-yellow-400",
    live:         "bg-[#34D399]",
    reconnecting: "bg-red-400",
  };
  const connLabels: Record<ConnState, string> = {
    connecting:   "Connecting…",
    live:         "Live",
    reconnecting: "Reconnecting…",
  };

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5]">
      <div className="max-w-3xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-8">
          <BackButton />
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center w-8 h-8">
                <span className={`absolute w-3 h-3 rounded-full ${connColors[connState]} opacity-40 animate-ping`} />
                <span className={`relative w-2.5 h-2.5 rounded-full ${connColors[connState]}`} />
              </div>
              <h1 className="text-3xl font-bold text-[#f0f0f5]">Live Agent Feed</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-mono px-2 py-1 rounded border ${
                connState === "live"
                  ? "border-[#34D399]/30 text-[#34D399]"
                  : "border-[#1e1e2e] text-[#4a4a5e]"
              }`}>
                {connLabels[connState]}
              </span>
              {sessionCount > 0 && (
                <span className="text-xs font-mono text-[#8b8b9e]">
                  +{sessionCount} ·{" "}
                  <span className="text-[#34D399]">{sessionTotals.pay} PAY</span>{" · "}
                  <span className="text-red-400">{sessionTotals.refuse} REFUSE</span>{" · "}
                  <span className="text-[#4a4a5e]">{sessionTotals.skip} other</span>
                </span>
              )}
            </div>
          </div>
          <p className="text-[#8b8b9e] mt-2 ml-11">
            Every agent decision — PAY, REFUSE, SKIP, BLOCKED — streams here in real time.
            Recent history loads on connect; new decisions appear as they happen.
          </p>
        </div>

        {/* Feed */}
        {events.length === 0 ? (
          <div className="bg-[#111118] rounded-xl border border-[#1e1e2e] p-12 text-center">
            <div className="text-[#4a4a5e] text-sm font-mono mb-3">Waiting for agent activity…</div>
            <div className="text-xs text-[#4a4a5e]">
              Run a query on{" "}
              <Link href="/ask" className="text-[#6366f1] hover:text-indigo-300 transition-colors">/ask</Link>
              {" "}or{" "}
              <Link href="/orchestrate" className="text-indigo-400 hover:text-indigo-300 transition-colors">/orchestrate</Link>
              {" "}to see decisions appear here.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((ev, i) => {
              const badge = DECISION_STYLE[ev.decision] ?? DECISION_STYLE.SKIP;
              const label = ev.decision === "BLOCKED_BY_POLICY" ? "BLOCKED" : ev.decision.slice(0, 4);
              return (
                <div
                  key={i}
                  className={`rounded-xl border p-4 transition-all ${
                    ev.historical
                      ? "border-[#1e1e2e] bg-[#111118] opacity-60"
                      : "border-[#1e1e2e] bg-[#111118] animate-fade-in"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`flex-shrink-0 text-xs font-mono px-2 py-0.5 rounded border ${badge}`}>
                        {label}
                      </span>
                      <span className="text-sm text-[#f0f0f5] truncate font-medium">{ev.sourceTitle}</span>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-3 text-xs font-mono text-[#4a4a5e]">
                      {ev.decision === "PAY" && ev.amountPaid > 0 && (
                        <span className="text-[#34D399]">+${(ev.amountPaid / 1e6).toFixed(4)}</span>
                      )}
                      {ev.historical && <span className="text-[#2e2e3e]">hist</span>}
                      <span>{relativeTime(ev.timestamp)}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-[#4a4a5e] font-mono">
                    <span className="text-[#2e2e3e]">query: </span>
                    <span className="text-[#8b8b9e]">{ev.query.slice(0, 80)}{ev.query.length > 80 ? "…" : ""}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-xs font-mono">
                    <span className="text-[#2e2e3e]">hash: {ev.evidenceHash.slice(0, 20)}…</span>
                    {ev.decision === "PAY" && (
                      <a
                        href={`https://testnet.arcscan.app/address/0xa539a18b55e5e3b98892c724f8f75914c0b69942`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-[#6366f1] hover:text-indigo-300"
                      >
                        ArcScan ↗
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer info */}
        <div className="mt-8 text-xs text-[#4a4a5e] font-mono space-y-1">
          <p>
            Showing up to 50 most recent decisions. New events update without refresh.
          </p>
          <p>
            Auto-query cron fires every 30 min →{" "}
            <Link href="/traction" className="text-[#6366f1] hover:text-indigo-300 transition-colors">
              view traction →
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
