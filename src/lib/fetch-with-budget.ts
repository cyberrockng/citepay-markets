/**
 * fetchWithBudget — agentic price-probe layer for x402 resources.
 *
 * Pattern (lifted from Mimir, adapted for CitePay):
 *   1. PROBE  — hit the URL without payment, read the 402 requirements
 *   2. DECIDE — compare quoted price against agent's budget cap
 *   3. PAY    — only fetch+pay if price ≤ budget; otherwise SKIP
 *
 * This makes every external fetch a transparent, auditable decision:
 * the receipt carries probePrice + probeDecision so judges can see
 * the agent reasoning about cost before committing USDC.
 *
 * Works on any x402-gated URL (CitePay /api/ask, Mimir, external APIs, etc.)
 */

export interface ProbeResult {
  requiresPayment: boolean;
  priceMicro:      number;           // 0 if free
  maxPriceMicro:   number;           // buyer-signed ceiling (upto scheme)
  network:         string;
  asset:           string;
  payTo:           string;
  scheme:          string;
  raw:             Record<string, unknown> | null;
}

export interface FetchBudgetResult {
  decision:      "PAY" | "SKIP" | "FREE";
  probePrice:    number;             // what the endpoint asked for (micro-USDC)
  probePassed:   boolean;
  probeDecision: string;             // human-readable reason
  body:          unknown;            // parsed JSON response body (null on SKIP)
  status:        number;
  txHash?:       string;
  durationMs:    number;
}

// ─── Probe ────────────────────────────────────────────────────────────────────

/**
 * Hit a URL without a payment header.
 * If the response is 402, parse the PAYMENT-REQUIRED header and return pricing.
 * If the response is 200, the resource is free.
 */
export async function probeX402(url: string): Promise<ProbeResult> {
  const blank: ProbeResult = {
    requiresPayment: false, priceMicro: 0, maxPriceMicro: 0,
    network: "", asset: "", payTo: "", scheme: "", raw: null,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "__probe__", budget: 0 }),
      signal: AbortSignal.timeout(8_000),
    });

    if (res.status !== 402) return blank;

    // Try to parse PAYMENT-REQUIRED header (base64 JSON per x402 spec)
    const headerRaw = res.headers.get("PAYMENT-REQUIRED") ?? res.headers.get("payment-required");
    let parsed: Record<string, unknown> | null = null;
    if (headerRaw) {
      try {
        parsed = JSON.parse(Buffer.from(headerRaw, "base64").toString("utf-8"));
      } catch {
        try { parsed = JSON.parse(headerRaw); } catch { /* ignore */ }
      }
    }

    // Also try the 402 body (CitePay puts paymentRequired in the JSON body)
    if (!parsed) {
      try {
        const bodyJson = await res.clone().json() as Record<string, unknown>;
        const pr = bodyJson.paymentRequired as Record<string, unknown> | undefined;
        if (pr) parsed = pr;
      } catch { /* ignore */ }
    }

    if (!parsed) return { ...blank, requiresPayment: true };

    const accepts = (parsed.accepts as Array<Record<string, unknown>> | undefined)?.[0] ?? {};
    const priceMicro = Number(accepts.amount ?? 0);
    const extra = accepts.extra as Record<string, unknown> | undefined;
    const maxPriceMicro = Number(extra?.maxChargeMicro ?? accepts.maxAmount ?? priceMicro);

    return {
      requiresPayment: true,
      priceMicro,
      maxPriceMicro,
      network: String(accepts.network ?? ""),
      asset:   String(accepts.asset   ?? ""),
      payTo:   String(accepts.payTo   ?? ""),
      scheme:  String(accepts.scheme  ?? "exact"),
      raw:     parsed,
    };
  } catch {
    return blank;
  }
}

// ─── fetchWithBudget ─────────────────────────────────────────────────────────

export interface FetchBudgetOpts {
  /** Maximum micro-USDC this agent is willing to pay for this resource. */
  maxCostMicro: number;
  /** POST body to send when actually fetching (after probe passes). */
  body?:        Record<string, unknown>;
  /** Optional headers to attach on the paid fetch (e.g. payment-signature). */
  paymentHeaders?: Record<string, string>;
  /** Log prefix for console output. */
  label?: string;
}

/**
 * Probe an x402 URL, decide based on budget, and optionally pay+fetch.
 * Returns a structured result showing the probe price and final decision.
 *
 * Note: for the CitePay demo flow, `paymentHeaders` carries the pre-signed
 * Circle Gateway header. For fully autonomous agents, callers use
 * circle-dcw.ts to generate the header after the probe price is known.
 */
export async function fetchWithBudget(
  url: string,
  opts: FetchBudgetOpts,
): Promise<FetchBudgetResult> {
  const t0 = Date.now();
  const label = opts.label ?? url.split("/").pop() ?? url;

  // ── Step 1: PROBE ─────────────────────────────────────────────────────────
  const probe = await probeX402(url);

  if (!probe.requiresPayment) {
    // Resource is free — fetch directly
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts.body ?? {}),
        signal: AbortSignal.timeout(30_000),
      });
      const body = await res.json().catch(() => null);
      console.log(`[fetchWithBudget] ${label} FREE — status ${res.status}`);
      return { decision: "FREE", probePrice: 0, probePassed: true, probeDecision: "resource is free", body, status: res.status, durationMs: Date.now() - t0 };
    } catch {
      return { decision: "FREE", probePrice: 0, probePassed: true, probeDecision: "resource is free (fetch failed)", body: null, status: 0, durationMs: Date.now() - t0 };
    }
  }

  // ── Step 2: DECIDE ────────────────────────────────────────────────────────
  const probePrice = probe.priceMicro;

  if (probePrice > opts.maxCostMicro) {
    const reason = `probe price $${(probePrice/1e6).toFixed(5)} > budget $${(opts.maxCostMicro/1e6).toFixed(5)} — SKIP`;
    console.log(`[fetchWithBudget] ${label} SKIP — ${reason}`);
    return {
      decision: "SKIP", probePrice, probePassed: false,
      probeDecision: reason, body: null, status: 402,
      durationMs: Date.now() - t0,
    };
  }

  // ── Step 3: PAY + FETCH ───────────────────────────────────────────────────
  if (!opts.paymentHeaders || Object.keys(opts.paymentHeaders).length === 0) {
    // No payment header available — report probe passed but can't complete
    const reason = `probe passed ($${(probePrice/1e6).toFixed(5)} ≤ budget) but no payment header provided`;
    console.log(`[fetchWithBudget] ${label} PAY-PROBE-ONLY — ${reason}`);
    return {
      decision: "PAY", probePrice, probePassed: true,
      probeDecision: reason, body: null, status: 402,
      durationMs: Date.now() - t0,
    };
  }

  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json", ...opts.paymentHeaders },
      body:    JSON.stringify(opts.body ?? {}),
      signal:  AbortSignal.timeout(60_000),
    });
    const body = await res.json().catch(() => null);
    const txHash = res.headers.get("x-payment-receipt") ?? undefined;
    const reason = `probe $${(probePrice/1e6).toFixed(5)} ≤ budget $${(opts.maxCostMicro/1e6).toFixed(5)} — paid and fetched`;
    console.log(`[fetchWithBudget] ${label} PAY — status ${res.status} ${reason}`);
    return {
      decision: "PAY", probePrice, probePassed: true,
      probeDecision: reason, body, status: res.status,
      txHash, durationMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      decision: "PAY", probePrice, probePassed: true,
      probeDecision: `probe passed but fetch failed: ${String(err).slice(0, 80)}`,
      body: null, status: 0, durationMs: Date.now() - t0,
    };
  }
}

// ─── Source-level probe (used by agent.ts before scoring) ────────────────────

export interface SourceProbeResult {
  sourceId:      string;
  sourcePrice:   number;   // what the source charges (from SQLite, micro-USDC)
  budgetBefore:  number;
  probePassed:   boolean;  // price ≤ remaining budget
  probeDecision: string;
}

/**
 * Budget probe for a CitePay source — no HTTP call needed because price is
 * stored in SQLite. Evaluates whether the source price fits within the
 * current remaining budget and returns a structured probe record.
 */
export function probeSourceBudget(opts: {
  sourceId:       string;
  sourcePrice:    number;
  budgetRemaining: number;
  policyMaxPrice: number;
}): SourceProbeResult {
  const { sourceId, sourcePrice, budgetRemaining, policyMaxPrice } = opts;

  if (sourcePrice > budgetRemaining) {
    return {
      sourceId, sourcePrice, budgetBefore: budgetRemaining,
      probePassed: false,
      probeDecision: `price $${(sourcePrice/1e6).toFixed(5)} > remaining budget $${(budgetRemaining/1e6).toFixed(5)}`,
    };
  }
  if (sourcePrice > policyMaxPrice) {
    return {
      sourceId, sourcePrice, budgetBefore: budgetRemaining,
      probePassed: false,
      probeDecision: `price $${(sourcePrice/1e6).toFixed(5)} > policy max $${(policyMaxPrice/1e6).toFixed(5)}`,
    };
  }
  return {
    sourceId, sourcePrice, budgetBefore: budgetRemaining,
    probePassed: true,
    probeDecision: `price $${(sourcePrice/1e6).toFixed(5)} ≤ budget and policy — proceed`,
  };
}
