/**
 * SSRF-safe fetcher for /.well-known/citepay.json — a publisher's own
 * domain declaring its citation/payment policy. Fetched once at
 * registration to prefill policy and prove domain control. Never
 * crawled automatically after that.
 *
 * Resolves DNS and validates the IP is public BEFORE connecting, then
 * pins the TCP connection to that validated IP (Host/SNI stay the real
 * hostname) so a DNS answer that changes between the check and the
 * request can't redirect the fetch to a private address.
 */
import { lookup } from "dns/promises";
import https from "https";
import { isIP } from "net";

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
const MAX_HOSTNAME_LEN = 253;
const WELL_KNOWN_PATH = "/.well-known/citepay.json";

export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    if (a === 127) return true;                         // loopback
    if (a === 10) return true;                           // private
    if (a === 172 && b >= 16 && b <= 31) return true;     // private
    if (a === 192 && b === 168) return true;              // private
    if (a === 169 && b === 254) return true;              // link-local
    if (a === 100 && b >= 64 && b <= 127) return true;     // CGNAT
    if (a === 0) return true;                              // "this network"
    if (a >= 224) return true;                             // multicast + reserved
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // fe80::/10
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 unique-local
    if (lower.startsWith("::ffff:")) {
      const v4 = lower.slice(7);
      return isIP(v4) === 4 ? isBlockedIp(v4) : true;
    }
    return false;
  }
  return true; // not a resolvable IP literal → treat as blocked
}

async function resolvePublicIp(hostname: string): Promise<{ ok: true; ip: string } | { ok: false; error: string }> {
  if (!hostname || hostname.length > MAX_HOSTNAME_LEN) {
    return { ok: false, error: "Invalid hostname." };
  }
  let records;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    return { ok: false, error: `Could not resolve ${hostname}.` };
  }
  if (records.length === 0) return { ok: false, error: `No DNS records for ${hostname}.` };
  for (const r of records) {
    if (isBlockedIp(r.address)) {
      return { ok: false, error: `${hostname} resolves to a non-public address.` };
    }
  }
  return { ok: true, ip: records[0].address };
}

interface RawResponse {
  status: number;
  location: string | null;
  contentType: string | null;
  body: string;
}

function requestPinned(hostname: string, ip: string, path: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: ip,
        servername: hostname, // SNI + cert CN/SAN validation still checks the real hostname
        path,
        port: 443,
        method: "GET",
        timeout: TIMEOUT_MS,
        rejectUnauthorized: true,
        headers: {
          Host: hostname,
          "User-Agent": "CitePay-Clear/1.0 (+https://citepay-markets.vercel.app)",
          Accept: "application/json",
        },
      },
      (res) => {
        let body = "";
        let bytes = 0;
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > MAX_BYTES) {
            req.destroy(new Error("Response exceeded size limit."));
            return;
          }
          body += chunk.toString("utf8");
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            location: (res.headers.location as string | undefined) ?? null,
            contentType: (res.headers["content-type"] as string | undefined) ?? null,
            body,
          });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Request timed out.")));
    req.on("error", reject);
    req.end();
  });
}

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
  const initialHostname = extractHostname(urlOrDomain);
  if (!initialHostname) return { ok: false, error: "Could not determine an https hostname." };
  let hostname: string = initialHostname;
  let path = WELL_KNOWN_PATH;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const resolved = await resolvePublicIp(hostname);
    if (!resolved.ok) return { ok: false, error: resolved.error };

    let res: RawResponse;
    try {
      res = await requestPinned(hostname, resolved.ip, path);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Request failed." };
    }

    if (res.status >= 300 && res.status < 400 && res.location) {
      const absoluteLocation = res.location.includes("://") ? res.location : `https://${hostname}${res.location}`;
      let next: URL | null;
      try {
        next = new URL(absoluteLocation);
      } catch {
        next = null;
      }
      if (!next || next.protocol !== "https:") return { ok: false, error: "Redirect target is not https." };
      hostname = next.hostname;
      path = next.pathname + next.search;
      continue;
    }

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

  return { ok: false, error: "Too many redirects." };
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
