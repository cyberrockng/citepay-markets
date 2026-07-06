"use client";

import { useEffect, useState } from "react";
import type { TractionStats } from "@/types";

type TractionState = {
  stats: TractionStats | null;
  generatedAt: string;
  loading: boolean;
};

let cached: TractionState = { stats: null, generatedAt: "", loading: true };
let inFlight: Promise<TractionState> | null = null;
const listeners = new Set<(state: TractionState) => void>();

function emit(state: TractionState) {
  cached = state;
  listeners.forEach((listener) => listener(state));
}

async function loadTraction() {
  if (inFlight) return inFlight;
  inFlight = fetch("/api/traction")
    .then((r) => r.json())
    .then((d) => ({
      stats: d.stats ?? null,
      generatedAt: d.generatedAt ?? "",
      loading: false,
    }))
    .catch(() => ({
      stats: null,
      generatedAt: "",
      loading: false,
    }))
    .then((state) => {
      emit(state);
      return state;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function useTraction({ refreshMs }: { refreshMs?: number } = {}) {
  const [state, setState] = useState<TractionState>(cached);

  useEffect(() => {
    listeners.add(setState);
    loadTraction();
    const interval = refreshMs ? window.setInterval(loadTraction, refreshMs) : null;
    return () => {
      listeners.delete(setState);
      if (interval) window.clearInterval(interval);
    };
  }, [refreshMs]);

  return state;
}
