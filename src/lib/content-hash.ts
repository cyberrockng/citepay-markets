/**
 * Real content fingerprinting for CitePay sources.
 *
 * Fetches a URL, strips HTML to plain text, normalises whitespace, and
 * produces a SHA-256 hash of the result.  The hash is stable across
 * trivial formatting changes (extra spaces, line endings) but detects
 * meaningful content edits — enabling objective challenge resolution.
 */

import { createHash } from "crypto";
import { ssrfSafeFetch } from "@/lib/ssrf-safe-fetch";

export interface ContentFetchResult {
  hash:          string;   // 64-char hex SHA-256
  contentLength: number;   // characters of normalised text
  fetchedAt:     string;   // ISO timestamp
  source:        "fetch" | "fallback";
  error?:        string;   // present only when source === "fallback"
}

// Tags whose full subtree we discard (nav, ads, boilerplate)
const SKIP_TAGS = new Set([
  "script", "style", "noscript", "svg", "iframe", "header",
  "footer", "nav", "aside", "form", "button", "select",
]);

/**
 * Strip HTML → plain text.
 * Uses a simple regex-based state machine — no DOM dependency so it
 * works in the Node.js edge runtime without JSDOM.
 */
function extractText(html: string): string {
  let out = "";
  let i = 0;
  let skipDepth = 0;
  let skipTag = "";

  while (i < html.length) {
    if (html[i] !== "<") {
      if (skipDepth === 0) out += html[i];
      i++;
      continue;
    }

    // Find end of tag
    const close = html.indexOf(">", i);
    if (close === -1) { out += html.slice(i); break; }

    const tag = html.slice(i + 1, close);
    const isClose = tag.startsWith("/");
    const rawName = (isClose ? tag.slice(1) : tag).split(/[\s/]/)[0].toLowerCase();

    if (skipDepth === 0 && !isClose && SKIP_TAGS.has(rawName)) {
      skipDepth = 1;
      skipTag = rawName;
    } else if (skipDepth > 0 && rawName === skipTag) {
      if (isClose) { skipDepth--; }
      else if (!tag.endsWith("/")) { skipDepth++; }
    } else if (skipDepth === 0) {
      // Block elements → newline so words don't merge
      const BLOCK = new Set(["p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "br", "tr", "td", "th"]);
      if (BLOCK.has(rawName)) out += "\n";
    }

    i = close + 1;
  }

  // Decode common HTML entities
  return out
    .replace(/&amp;/gi,  "&")
    .replace(/&lt;/gi,   "<")
    .replace(/&gt;/gi,   ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi,  "'")
    .replace(/&nbsp;/gi, " ");
}

/** Collapse whitespace and truncate to 64 KB so hashes are deterministic. */
function normalise(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 65_536);
}

function sha256hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * Fetch a URL, extract its text content, and return a SHA-256 hash.
 * Fails open: if the fetch fails (including SSRF rejection — private/
 * loopback/link-local targets are always rejected), hashes the URL
 * string itself and sets source: "fallback" so callers can log/warn.
 *
 * Uses the shared SSRF-safe primitive: DNS resolved and validated as
 * public before connecting, connection pinned to that IP, redirects
 * re-verified at every hop — a publisher-submitted URL can't be used
 * to reach internal/private infrastructure.
 */
export async function fetchAndHash(url: string): Promise<ContentFetchResult> {
  const fetchedAt = new Date().toISOString();

  try {
    const fetched = await ssrfSafeFetch(url, {
      timeoutMs: 12_000,
      maxBytes: 5_000_000,
      headers: {
        "User-Agent": "CitePay-Markets/1.0 (content-verification; +https://citepay-markets.vercel.app)",
        "Accept":     "text/html,text/plain,application/json;q=0.9,*/*;q=0.8",
      },
    });
    if (!fetched.ok) {
      throw new Error(fetched.error);
    }

    const res = fetched.result;
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`HTTP ${res.status}`);
    }

    const contentType = res.contentType ?? "";
    let text: string;

    if (contentType.includes("application/json")) {
      // JSON endpoints: hash the raw JSON body
      text = res.body;
    } else {
      // HTML / plain text: strip markup
      text = extractText(res.body);
    }

    const normalised = normalise(text);
    if (normalised.length < 20) {
      throw new Error("Extracted content too short — possible bot-block or empty page");
    }

    return {
      hash:          sha256hex(normalised),
      contentLength: normalised.length,
      fetchedAt,
      source:        "fetch",
    };
  } catch (err) {
    // Fallback: hash the URL so the record isn't empty, but flag it
    const fallbackInput = `FETCH_FAILED:${url}:${fetchedAt}`;
    return {
      hash:          sha256hex(fallbackInput),
      contentLength: 0,
      fetchedAt,
      source:        "fallback",
      error:         err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Verify a stored hash against the current live content.
 * Returns a structured result suitable for the challenge and verify endpoints.
 */
export async function verifyContentHash(opts: {
  url:           string;
  storedHash:    string;
  label?:        string;
}): Promise<{
  verified:      boolean;
  storedHash:    string;
  liveHash:      string;
  fetchSource:   "fetch" | "fallback";
  contentLength: number;
  fetchedAt:     string;
  fetchError?:   string;
  verdict:       "VERIFIED" | "CHANGED" | "FETCH_FAILED";
  verdictDetail: string;
}> {
  const live = await fetchAndHash(opts.url);
  const label = opts.label ?? opts.url;

  if (live.source === "fallback") {
    return {
      verified:      false,
      storedHash:    opts.storedHash,
      liveHash:      live.hash,
      fetchSource:   "fallback",
      contentLength: 0,
      fetchedAt:     live.fetchedAt,
      fetchError:    live.error,
      verdict:       "FETCH_FAILED",
      verdictDetail: `Could not fetch ${label}: ${live.error ?? "unknown error"}`,
    };
  }

  const verified = live.hash === opts.storedHash;
  return {
    verified,
    storedHash:    opts.storedHash,
    liveHash:      live.hash,
    fetchSource:   "fetch",
    contentLength: live.contentLength,
    fetchedAt:     live.fetchedAt,
    verdict:       verified ? "VERIFIED" : "CHANGED",
    verdictDetail: verified
      ? `Content unchanged — live hash matches hash recorded at citation time`
      : `Content has changed since citation — hashes differ`,
  };
}
