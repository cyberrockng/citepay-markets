/**
 * Shared SSRF-safe fetch primitive: resolves DNS and validates the IP is
 * public BEFORE connecting, then pins the TCP/TLS connection to that
 * validated IP (Host/SNI stay the real hostname) so a DNS answer that
 * changes between the check and the request can't redirect the fetch to
 * a private address. Used by both the /.well-known/citepay.json fetcher
 * and general content fetching (register-public's fetchAndHash).
 */
import { lookup } from "dns/promises";
import http from "http";
import https from "https";
import { isIP } from "net";

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

export async function resolvePublicIp(hostname: string): Promise<{ ok: true; ip: string } | { ok: false; error: string }> {
  if (!hostname || hostname.length > 253) {
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

export interface SsrfSafeFetchResult {
  status: number;
  location: string | null;
  contentType: string | null;
  body: string;
}

export interface SsrfSafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  /** Restrict which protocols are ever accepted, including through redirects. Default: http: and https:. */
  allowedProtocols?: Array<"http:" | "https:">;
}

/**
 * Fetch an arbitrary http(s) URL safely: DNS-resolve-then-verify, pinned
 * connection, redirects re-verified at every hop, size and time capped.
 * Only http:/https: are ever accepted — anything else is rejected outright.
 */
export async function ssrfSafeFetch(
  targetUrl: string,
  opts: SsrfSafeFetchOptions = {}
): Promise<{ ok: true; result: SsrfSafeFetchResult } | { ok: false; error: string }> {
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const maxBytes = opts.maxBytes ?? 5_000_000;
  const maxRedirects = opts.maxRedirects ?? 3;
  const allowedProtocols = opts.allowedProtocols ?? ["http:", "https:"];

  let current: URL;
  try {
    current = new URL(targetUrl);
  } catch {
    return { ok: false, error: "Invalid URL." };
  }

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!allowedProtocols.includes(current.protocol as "http:" | "https:")) {
      return { ok: false, error: `Only ${allowedProtocols.join("/")} URLs are supported.` };
    }

    const resolved = await resolvePublicIp(current.hostname);
    if (!resolved.ok) return { ok: false, error: resolved.error };

    const hostname = current.hostname;
    const path = current.pathname + current.search;
    const isHttps = current.protocol === "https:";
    const port = current.port ? Number(current.port) : isHttps ? 443 : 80;
    const transport = isHttps ? https : http;

    let response: SsrfSafeFetchResult;
    try {
      response = await new Promise<SsrfSafeFetchResult>((resolve, reject) => {
        const req = transport.request(
          {
            host: resolved.ip,
            servername: isHttps ? hostname : undefined,
            path,
            port,
            method: "GET",
            timeout: timeoutMs,
            rejectUnauthorized: true,
            headers: { Host: hostname, ...opts.headers },
          },
          (res) => {
            let body = "";
            let bytes = 0;
            res.on("data", (chunk: Buffer) => {
              bytes += chunk.length;
              if (bytes > maxBytes) {
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
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Request failed." };
    }

    if (response.status >= 300 && response.status < 400 && response.location) {
      try {
        current = new URL(response.location, current);
      } catch {
        return { ok: false, error: "Invalid redirect target." };
      }
      continue;
    }

    return { ok: true, result: response };
  }

  return { ok: false, error: "Too many redirects." };
}
