"use client";

export function BackButton({ label = "Back" }: { label?: string }) {
  return (
    <button
      onClick={() => window.history.back()}
      className="inline-flex items-center gap-1 text-[#8b8b9e] hover:text-[#f0f0f5] text-sm transition-colors"
    >
      ← {label}
    </button>
  );
}
