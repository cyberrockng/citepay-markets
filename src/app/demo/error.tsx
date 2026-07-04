"use client";

import { useEffect } from "react";

// Route-level error boundary for /demo. If a render ever throws, the user sees a
// clean in-app recovery instead of the browser's "This page couldn't load" crash.
export default function DemoError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // surface for debugging without crashing the page
    console.error("[demo error boundary]", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5] flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h1 className="text-xl font-semibold mb-2">The demo hit a snag</h1>
        <p className="text-[#8b8b9e] text-sm mb-6">
          Something interrupted the run. Your data is safe — just start it again.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="px-4 py-2 rounded-lg bg-[#6366f1] text-white text-sm font-medium hover:bg-indigo-500 transition-colors"
          >
            Try again
          </button>
          <a
            href="/demo"
            className="px-4 py-2 rounded-lg border border-[#1e1e2e] text-[#8b8b9e] text-sm font-medium hover:border-[#6366f1] transition-colors"
          >
            Reload demo
          </a>
        </div>
      </div>
    </main>
  );
}
