/**
 * SSRF-safe fetcher for /.well-known/citepay.json — a publisher's own
 * domain declaring its citation/payment policy. Fetched once at
 * registration to prefill policy and prove domain control. Never
 * crawled automatically after that.
 *
 * Uses the shared ssrf-safe-fetch primitive: DNS resolved and validated
 * as public BEFORE connecting, then the connection is pinned to that
 * validated IP (Host/SNI stay the real hostname) so a DNS answer that
 * changes between the check and the request can't redirect the fetch to
 * a private address.
 */
import { ssrfSafeFetch } from "@/lib/ssrf-safe-fetch";

export { isBlockedIp } from "@/lib/ssrf-safe-fetch";

export interface WellKnownPolicy {
  version: number;
  licenseClass: string;
  pricePerCitationMicro: number;
  payoutAddress: string;
  contact: string | null;
}

export type WellKnownFetchResult =
  | { ok: true; policy: WellKnownPolicy }
  | { ok: false; error: string };

const MAX_REDIRECTS = 3;
const MAX_BYTES = 100_000;
const TIMEOUT_MS = 5_000;
const WELL_KNOWN_PATH = "/.well-known/citepay.json";

export function extractHostname(input: string): string | null {
  const candidates = input.includes("://") ? [input] : [`https://${input}`];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (url.protocol !== "https:") return null;
      return url.hostname;
    } catch {
      continue;
    }
  }
  return null;
}

export function validatePolicy(raw: unknown): WellKnownPolicy | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) return null;
  if (typeof obj.licenseClass !== "string" || !obj.licenseClass.trim() || obj.licenseClass.length > 64) return null;
  if (typeof obj.pricePerCitationMicro !== "number" || !Number.isInteger(obj.pricePerCitationMicro) || obj.pricePerCitationMicro < 0 || obj.pricePerCitationMicro > 1_000_000_000) return null;
  if (typeof obj.payoutAddress !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(obj.payoutAddress)) return null;
  const contact = typeof obj.contact === "string" && obj.contact.trim() ? obj.contact.trim().slice(0, 200) : null;
  return {
    version: 1,
    licenseClass: obj.licenseClass.trim(),
    pricePerCitationMicro: obj.pricePerCitationMicro,
    payoutAddress: obj.payoutAddress,
    contact,
  };
}

/**
 * Fetch and validate https://<host>/.well-known/citepay.json for the
 * domain of `urlOrDomain`. Best-effort — a missing or invalid file is
 * a normal, non-fatal result (registration must not require it).
 */
export async function fetchWellKnownPolicy(urlOrDomain: string): Promise<WellKnownFetchResult> {
  const hostname = extractHostname(urlOrDomain);
  if (!hostname) return { ok: false, error: "Could not determine an https hostname." };

  const fetched = await ssrfSafeFetch(`https://${hostname}${WELL_KNOWN_PATH}`, {
    timeoutMs: TIMEOUT_MS,
    maxBytes: MAX_BYTES,
    maxRedirects: MAX_REDIRECTS,
    allowedProtocols: ["https:"],
    headers: {
      "User-Agent": "CitePay-Clear/1.0 (+https://citepay-markets.vercel.app)",
      Accept: "application/json",
    },
  });
  if (!fetched.ok) return { ok: false, error: fetched.error };

  const res = fetched.result;
  if (res.status !== 200) return { ok: false, error: `HTTP ${res.status} fetching ${WELL_KNOWN_PATH}.` };
  if (!res.contentType || !res.contentType.toLowerCase().includes("application/json")) {
    return { ok: false, error: "Expected application/json." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    return { ok: false, error: "Response was not valid JSON." };
  }

  const policy = validatePolicy(parsed);
  if (!policy) return { ok: false, error: "citepay.json did not match the expected schema." };
  return { ok: true, policy };
}

export interface PublisherLicenseResolution {
  licenseClass: string;
  verificationStatus: "domain_verified" | "unverified";
}

/**
 * Decide whether a registration is domain-verified: the well-known file
 * must be present AND its payoutAddress must match what the publisher
 * submitted. A mismatch or missing file falls back to the self-declared
 * license class — never blocks registration.
 */
export function resolvePublisherLicense(
  wellKnown: WellKnownFetchResult,
  selfDeclaredLicenseClass: string,
  submittedPayoutWallet: string
): PublisherLicenseResolution {
  if (wellKnown.ok && wellKnown.policy.payoutAddress.toLowerCase() === submittedPayoutWallet.toLowerCase()) {
    return { licenseClass: wellKnown.policy.licenseClass, verificationStatus: "domain_verified" };
  }
  return { licenseClass: selfDeclaredLicenseClass, verificationStatus: "unverified" };
}
