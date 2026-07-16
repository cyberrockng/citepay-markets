#!/usr/bin/env node
/**
 * CitePay Clear — direct REST integration example (Node 18+, zero dependencies).
 *
 * Shows the pattern any custom agent loop (LangChain.js, a hand-rolled
 * tool-call loop, etc.) should follow: before citing or paying for a quoted
 * source, call POST /api/clear/check. Only proceed if decision === "CLEARED".
 *
 * Usage:
 *   CITEPAY_API_KEY=cpk_... node check-before-cite.mjs
 */

const CITEPAY_API = process.env.CITEPAY_API ?? "https://citepay-markets.vercel.app";
const CITEPAY_API_KEY = process.env.CITEPAY_API_KEY;

if (!CITEPAY_API_KEY) {
  console.error("Set CITEPAY_API_KEY (a cpk_... key) before running this example.");
  process.exit(1);
}

/**
 * The reusable integration point. Any agent loop should call this before
 * using a quote, and treat any decision other than CLEARED as a hard stop.
 */
async function checkCitation({ claim, quote, source, maxPriceMicro = 100_000 }) {
  const res = await fetch(`${CITEPAY_API}/api/clear/check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CITEPAY_API_KEY}`,
    },
    body: JSON.stringify({
      claim,
      quote,
      source,
      policy: { maxPricePerCitationMicro: maxPriceMicro, requiredLicenseClass: "standard" },
      visibility: "public",
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`clear/check failed: HTTP ${res.status} — ${body.error ?? "unknown error"}`);
  }
  return body;
}

/** What a real agent should do with the result — refuse anything not CLEARED. */
function citeIfCleared(label, result) {
  if (result.decision === "CLEARED") {
    console.log(`✅ [${label}] CLEARED — safe to cite/pay. Receipt: ${result.receiptUrl}`);
  } else {
    console.log(`🚫 [${label}] ${result.decision} — refusing to cite. Not paying.`);
  }
}

async function main() {
  const source = {
    text: "x402 enables machine-native payments over HTTP. It uses the 402 status code, previously reserved but unused, to signal that payment is required before a resource is served.",
    label: "x402 protocol overview",
  };

  // Case 1: an exact, real quote from the source — should CLEAR.
  const realQuote = await checkCitation({
    claim: "x402 uses the HTTP 402 status code to request payment.",
    quote: "x402 enables machine-native payments over HTTP. It uses the 402 status code",
    source,
  });
  citeIfCleared("real quote", realQuote);

  // Case 2: a plausible-sounding but fabricated quote — should be refused,
  // regardless of how confident an LLM might be that it's "close enough."
  const fabricatedQuote = await checkCitation({
    claim: "x402 was designed by the HTTP working group in 2019.",
    quote: "x402 was designed by the HTTP working group in 2019.",
    source,
  });
  citeIfCleared("fabricated quote", fabricatedQuote);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
