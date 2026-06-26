/**
 * Fetches a URL and extracts plain-text content for scoring.
 * Strips HTML tags, collapses whitespace, returns first ~1500 words.
 * Used at source registration time so the scoring agent sees real content.
 */

const MAX_WORDS = 1500;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 512_000; // 512 KB — enough for any article

function stripHtml(html: string): string {
  return html
    // Remove script/style blocks entirely
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Convert block-level tags to newlines so words don't merge
    .replace(/<\/(p|div|li|h[1-6]|section|article|blockquote|td|th|tr)[^>]*>/gi, "\n")
    // Strip remaining tags
    .replace(/<[^>]+>/g, " ")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    // Collapse whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "…";
}

export interface IndexResult {
  content: string;   // plain text, max MAX_WORDS words
  wordCount: number;
  fetchedAt: string;
  error?: string;
}

export async function fetchPageContent(url: string): Promise<IndexResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "CitePay-Indexer/1.0 (citation market; +https://citepay-markets.vercel.app)",
        "Accept": "text/html,application/xhtml+xml,text/plain",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      return { content: "", wordCount: 0, fetchedAt, error: `HTTP ${res.status}` };
    }

    const contentType = res.headers.get("content-type") ?? "";
    // For non-HTML (PDFs, JSON APIs, plain text), take raw text
    let raw: string;
    if (contentType.includes("text/plain") || contentType.includes("application/json")) {
      raw = await res.text();
    } else {
      const html = (await res.text()).slice(0, MAX_HTML_BYTES);
      raw = stripHtml(html);
    }

    const content = truncateToWords(raw, MAX_WORDS);
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    return { content, wordCount, fetchedAt };
  } catch (err) {
    return { content: "", wordCount: 0, fetchedAt, error: String(err).slice(0, 120) };
  }
}
