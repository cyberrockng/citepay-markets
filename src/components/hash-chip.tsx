"use client";
import { useState } from "react";

interface HashChipProps {
  hash: string;
  valid?: boolean | null;
  label?: string;
}

export function HashChip({ hash, valid, label }: HashChipProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(hash).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const short = hash.length > 16
    ? `${hash.slice(0, 8)}…${hash.slice(-6)}`
    : hash;

  return (
    <div className="bg-[#0a0a0f] rounded-lg border border-[#1e1e2e] px-3 py-2.5 flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        {label && <div className="text-[#8b8b9e] text-xs mb-1">{label}</div>}
        <div className="flex items-center gap-2">
          <code className="font-mono text-xs text-[#f0f0f5]">{short}</code>
          {valid === true  && <span className="text-[#00ff88] text-xs font-mono shrink-0">✓ verified</span>}
          {valid === false && <span className="text-red-400 text-xs font-mono shrink-0">✗ mismatch</span>}
        </div>
      </div>
      <button
        onClick={copy}
        title="Copy full hash"
        className="text-[#4a4a5e] hover:text-[#8b8b9e] text-xs font-mono shrink-0 transition-colors px-1.5 py-0.5 rounded hover:bg-[#1e1e2e]"
      >
        {copied ? "✓" : "⎘"}
      </button>
    </div>
  );
}
