#!/usr/bin/env node
import { randomUUID } from "crypto";

const DEFAULT_BASE_URL = "https://citepay-markets.vercel.app";
const baseUrl = (process.env.CITEPAY_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
const apiKey = process.env.CITEPAY_API_KEY;

if (!apiKey) {
  console.error("CITEPAY_API_KEY is required.");
  process.exit(1);
}

if (baseUrl !== DEFAULT_BASE_URL && process.env.CITEPAY_ALLOW_NON_PROD !== "true") {
  console.error(`Refusing to run live verifier against non-production base URL: ${baseUrl}`);
  console.error("Set CITEPAY_ALLOW_NON_PROD=true only for explicit preview/local debugging.");
  process.exit(1);
}

const runId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
const sourceText = "USDC is a fully reserved, dollar-backed stablecoin that settles instantly on Base.";
const claim = "USDC settles instantly on Base.";
const quote = "USDC is a fully reserved, dollar-backed stablecoin that settles instantly on Base.";

function assert(condition, message, detail) {
  if (!condition) {
    const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
    throw new Error(`${message}${suffix}`);
  }
}

async function postJson(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function createMandate() {
  const body = {
    name: `live-clear-verify-${runId}`,
    requiredLicenseClass: "standard",
    maxPricePerCitationMicro: 1000,
    totalBudgetMicro: 100000,
  };
  const result = await postJson("/api/clear/mandate", body);
  assert(result.status === 201, "Mandate creation failed.", result);
  assert(typeof result.json?.mandateConfigId === "string", "Mandate response missing mandateConfigId.", result.json);
  return result.json.mandateConfigId;
}

async function clearClaim(vectorName, body) {
  const result = await postJson("/api/clear/check", body);
  assert(result.status === 200, `${vectorName} clear check returned unexpected HTTP status.`, result);
  assert(typeof result.json?.clearanceId === "string", `${vectorName} response missing clearanceId.`, result.json);
  assert(typeof result.json?.contentHash === "string", `${vectorName} response missing contentHash.`, result.json);
  return result.json;
}

async function main() {
  console.log(`CitePay Clear live verifier: ${baseUrl}`);

  const mandateConfigId = await createMandate();
  console.log(`mandate: ${mandateConfigId}`);

  const v1ExternalRef = `citepay-live-v1-${runId}`;
  const v1 = await clearClaim("V1", {
    claim,
    quote,
    source: {
      text: sourceText,
      label: "Shadow vector V1",
      licenseClass: "standard",
      priceMicro: 1000,
    },
    policy: { mandateConfigId },
    externalRef: v1ExternalRef,
    visibility: "private_hash_only",
  });
  assert(v1.decision === "CLEARED", "V1 expected CLEARED.", v1);
  assert(v1.quoteVerified === true || v1.checks?.quoteVerified === true, "V1 expected quoteVerified true.", v1);
  assert(v1.settleable === false, "V1 inline source should be non-settleable.", v1);
  assert(v1.settlementRequirement === "registered_source", "V1 expected registered_source settlement requirement.", v1);
  assert(v1.externalRef === v1ExternalRef, "V1 expected externalRef echo.", v1);
  console.log(`V1 CLEARED: ${v1.clearanceId}`);

  const v2 = await clearClaim("V2", {
    claim: "A changed retry payload must not create a new clearance.",
    quote: "This quote is intentionally absent from the source.",
    source: {
      text: sourceText,
      label: "Shadow vector V2 retry",
      licenseClass: "standard",
      priceMicro: 1000,
    },
    policy: { mandateConfigId },
    externalRef: v1ExternalRef,
    visibility: "public",
  });
  assert(v2.clearanceId === v1.clearanceId, "V2 expected same clearanceId as V1.", { v1, v2 });
  assert(v2.contentHash === v1.contentHash, "V2 expected same contentHash as V1.", { v1, v2 });
  assert(v2.decision === "CLEARED", "V2 expected original CLEARED decision.", v2);
  console.log("V2 idempotent retry: same clearanceId/contentHash");

  const v3ExternalRef = `citepay-live-v3-${runId}`;
  const v3 = await clearClaim("V3", {
    claim,
    quote: "This fabricated quote is not present in the source.",
    source: {
      text: sourceText,
      label: "Shadow vector V3",
      licenseClass: "standard",
      priceMicro: 1000,
    },
    policy: { mandateConfigId },
    externalRef: v3ExternalRef,
    visibility: "private_hash_only",
  });
  assert(v3.decision === "UNSUPPORTED", "V3 expected UNSUPPORTED.", v3);
  assert(v3.quoteVerified === false || v3.checks?.quoteVerified === false, "V3 expected quoteVerified false.", v3);
  console.log(`V3 UNSUPPORTED: ${v3.clearanceId}`);

  const v4ExternalRef = `citepay-live-v4-${runId}`;
  const v4 = await clearClaim("V4", {
    claim,
    quote,
    source: {
      text: sourceText,
      label: "Shadow vector V4",
      licenseClass: "standard",
      priceMicro: 2000,
    },
    policy: {
      maxPricePerCitationMicro: 1000,
      requiredLicenseClass: "standard",
      minSupportScore: 0,
    },
    externalRef: v4ExternalRef,
    visibility: "private_hash_only",
  });
  assert(v4.decision === "OVER_CAP", "V4 expected OVER_CAP.", v4);
  console.log(`V4 OVER_CAP: ${v4.clearanceId}`);

  console.log("CitePay Clear live verifier passed.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
