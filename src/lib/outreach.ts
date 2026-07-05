/**
 * External Citation Outreach
 *
 * When a query would have paid an external URL (not in the CitePay registry),
 * we: 1) log the missed citation to Neon, 2) try to find a contact email from
 * the page, 3) send a Resend outreach email inviting them to register.
 */

import { neon } from "@neondatabase/serverless";
import Anthropic from "@anthropic-ai/sdk";

const FETCH_TIMEOUT_MS = 8_000;
const DEFAULT_PRICE_MICRO = 1_500; // $0.0015 per citation

// ─── Neon setup ──────────────────────────────────────────────────────────────

let _sql: ReturnType<typeof neon> | null = null;
function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!_sql) _sql = neon(url);
  return _sql;
}

let _tableReady = false;
async function ensureTable() {
  if (_tableReady) return;
  const sql = getSql();
  if (!sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS cp_missed_citations (
      id            TEXT PRIMARY KEY,
      url           TEXT NOT NULL,
      domain        TEXT NOT NULL,
      title         TEXT NOT NULL,
      query         TEXT NOT NULL,
      score         INTEGER NOT NULL,
      est_earning   BIGINT NOT NULL DEFAULT 0,
      contact_email TEXT,
      email_sent    BOOLEAN NOT NULL DEFAULT FALSE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_mc_domain ON cp_missed_citations(domain)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_mc_created ON cp_missed_citations(created_at DESC)`;
  _tableReady = true;
}

// ─── Email extraction ─────────────────────────────────────────────────────────

function extractEmailsFromHtml(html: string): string[] {
  // mailto: links
  const mailto = [...html.matchAll(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi)]
    .map((m) => m[1].toLowerCase());

  // Plain text emails (limited to common patterns in meta/contact areas)
  const plain = [...html.matchAll(/\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/g)]
    .map((m) => m[1].toLowerCase())
    .filter((e) => !e.includes("example.com") && !e.includes("sentry.io") && !e.includes("schema.org"));

  const all = [...new Set([...mailto, ...plain])];
  // Prefer contact/hello/info addresses
  const preferred = all.filter((e) => /^(contact|hello|info|hi|support|team)@/.test(e));
  return preferred.length > 0 ? preferred : all.slice(0, 1);
}

async function findContactEmail(url: string, html: string): Promise<string | null> {
  // Try the page itself
  const emails = extractEmailsFromHtml(html);
  if (emails.length > 0) return emails[0];

  // Try /contact page
  try {
    const base = new URL(url);
    const contactUrl = `${base.origin}/contact`;
    const res = await fetch(contactUrl, {
      headers: { "User-Agent": "CitePay-Outreach/1.0" },
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      const contactHtml = await res.text();
      const contactEmails = extractEmailsFromHtml(contactHtml);
      if (contactEmails.length > 0) return contactEmails[0];
    }
  } catch { /* no-op */ }

  return null;
}

// ─── External URL discovery ───────────────────────────────────────────────────

export interface ExternalCandidate {
  url: string;
  title: string;
  score: number;
  estimatedEarning: number;
  contactEmail: string | null;
  domain: string;
}

/**
 * Ask Claude to suggest 3 external URLs highly relevant to this query,
 * then fetch + score each. Returns candidates that would have been paid.
 */
export async function discoverExternalCandidates(
  query: string,
  client: Anthropic
): Promise<ExternalCandidate[]> {
  // Step 1: Ask Claude for relevant external URLs
  let suggestions: string[] = [];
  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `Suggest 3 real, publicly accessible URLs that would directly answer this query.
Return ONLY a JSON array of URL strings. No explanation.

Query: "${query}"

Example format: ["https://docs.example.com/page", "https://blog.example.com/article", "https://example.org/guide"]`,
      }],
    });
    const text = (msg.content[0] as { text: string }).text;
    const match = text.match(/\[[\s\S]*\]/);
    if (match) suggestions = JSON.parse(match[0]) as string[];
  } catch { return []; }

  suggestions = suggestions
    .filter((u) => typeof u === "string" && u.startsWith("http"))
    .slice(0, 3);

  if (suggestions.length === 0) return [];

  // Step 2: Fetch + score each URL
  const results = await Promise.allSettled(
    suggestions.map(async (url) => {
      const res = await fetch(url, {
        headers: { "User-Agent": "CitePay-Outreach/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
      const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']{1,120})["']/i);
      const title = (ogTitleMatch?.[1] ?? titleMatch?.[1] ?? url).trim();

      // Score relevance
      const textContent = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 800);

      const scoreMsg = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 60,
        messages: [{
          role: "user",
          content: `Score 0-100 how well this page answers the query. 80+ = directly answers it.
Query: "${query}"
Title: "${title}"
Content: "${textContent}"
Return ONLY JSON: {"relevance": 75}`,
        }],
      });
      const scoreText = (scoreMsg.content[0] as { text: string }).text;
      const parsed = JSON.parse(scoreText.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { relevance?: number };
      const score = Math.max(0, Math.min(100, Number(parsed.relevance) || 0));

      const contactEmail = await findContactEmail(url, html);
      const domain = new URL(url).hostname.replace(/^www\./, "");

      return { url, title, score, estimatedEarning: DEFAULT_PRICE_MICRO, contactEmail, domain };
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<ExternalCandidate> => r.status === "fulfilled" && r.value.score >= 70)
    .map((r) => r.value);
}

// ─── Neon logging ─────────────────────────────────────────────────────────────

export async function logMissedCitation(c: ExternalCandidate, query: string): Promise<string> {
  const sql = getSql();
  const id = crypto.randomUUID();
  if (!sql) return id;
  try {
    await ensureTable();
    await sql`
      INSERT INTO cp_missed_citations (id, url, domain, title, query, score, est_earning, contact_email, email_sent)
      VALUES (${id}, ${c.url}, ${c.domain}, ${c.title}, ${query}, ${c.score}, ${c.estimatedEarning}, ${c.contactEmail ?? null}, FALSE)
      ON CONFLICT DO NOTHING
    `;
  } catch (err) {
    console.error("[outreach] logMissedCitation failed:", String(err).slice(0, 80));
  }
  return id;
}

export async function markEmailSent(id: string): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  try {
    await sql`UPDATE cp_missed_citations SET email_sent = TRUE WHERE id = ${id}`;
  } catch { /* no-op */ }
}

export async function getRecentMissedCitations(limit = 20): Promise<{
  id: string; url: string; domain: string; title: string; query: string;
  score: number; estEarning: number; contactEmail: string | null; emailSent: boolean; createdAt: string;
}[]> {
  const sql = getSql();
  if (!sql) return [];
  try {
    await ensureTable();
    const rows = await sql`
      SELECT * FROM cp_missed_citations ORDER BY created_at DESC LIMIT ${limit}
    ` as Record<string, unknown>[];
    return rows.map((r) => ({
      id:           r.id as string,
      url:          r.url as string,
      domain:       r.domain as string,
      title:        r.title as string,
      query:        r.query as string,
      score:        Number(r.score),
      estEarning:   Number(r.est_earning),
      contactEmail: r.contact_email as string | null,
      emailSent:    Boolean(r.email_sent),
      createdAt:    String(r.created_at),
    }));
  } catch (err) {
    console.error("[outreach] getRecentMissedCitations failed:", String(err).slice(0, 80));
    return [];
  }
}

// ─── Email sending ────────────────────────────────────────────────────────────

export async function sendOutreachEmail(
  toEmail: string,
  candidate: ExternalCandidate,
  query: string
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[outreach] RESEND_API_KEY not set — would email ${toEmail} about ${candidate.url}`);
    return false;
  }

  const amountUSD = (candidate.estimatedEarning / 1_000_000).toFixed(4);
  const registerUrl = `https://citepay-markets.vercel.app/join?url=${encodeURIComponent(candidate.url)}`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9f9f9; margin: 0; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e5e5e5;">
    <div style="background: #0a0a0f; padding: 32px; text-align: center;">
      <p style="color: #34D399; font-family: monospace; font-size: 11px; letter-spacing: 0.1em; margin: 0 0 8px;">CITEPAY MARKETS</p>
      <h1 style="color: #f0f0f5; font-size: 22px; margin: 0; line-height: 1.3;">An AI agent cited your work.<br>You could have earned USDC.</h1>
    </div>
    <div style="padding: 32px;">
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
        An AI agent searched for <strong style="color: #111;">"${query}"</strong> and your page
        scored <strong style="color: #6366f1;">${candidate.score}/100</strong> — high enough to trigger a citation payment.
      </p>
      <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 0 0 24px;">
        <p style="color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 6px;">Your page</p>
        <p style="color: #111; font-weight: 600; margin: 0 0 4px;">${candidate.title}</p>
        <p style="color: #888; font-size: 12px; margin: 0; word-break: break-all;">${candidate.url}</p>
      </div>
      <div style="background: #f0fff8; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 0 0 28px; text-align: center;">
        <p style="color: #555; font-size: 12px; margin: 0 0 4px;">You would have earned</p>
        <p style="color: #059669; font-size: 32px; font-weight: 800; font-family: monospace; margin: 0;">$${amountUSD} USDC</p>
        <p style="color: #888; font-size: 11px; margin: 4px 0 0;">per citation · paid instantly on Arc Testnet</p>
      </div>
      <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        CitePay Markets is a citation marketplace where AI agents pay creators in USDC every time they cite their content.
        Registration takes 30 seconds — just your URL and a wallet address.
      </p>
      <div style="text-align: center; margin: 0 0 28px;">
        <a href="${registerUrl}" style="display: inline-block; background: #6366f1; color: white; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 10px; text-decoration: none;">
          Register &amp; Start Earning →
        </a>
      </div>
      <div style="border-top: 1px solid #e5e5e5; padding-top: 20px;">
        <p style="color: #888; font-size: 12px; line-height: 1.6; margin: 0;">
          You received this because your page was cited by an AI agent using CitePay Markets.
          You can ignore this if you're not interested — no further emails unless your content is cited again.
          <br><br>
          <a href="https://citepay-markets.vercel.app" style="color: #6366f1;">citepay-markets.vercel.app</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "CitePay Markets <outreach@citepay-markets.vercel.app>",
        to: [toEmail],
        subject: `An AI cited your work — you could have earned $${amountUSD} USDC`,
        html,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("[outreach] sendOutreachEmail failed:", String(err).slice(0, 80));
    return false;
  }
}

// ─── Main async entrypoint (use with waitUntil so the function stays alive) ───

export async function runExternalOutreachAsync(query: string, client: Anthropic): Promise<void> {
  try {
    const candidates = await discoverExternalCandidates(query, client);
    for (const c of candidates) {
      const id = await logMissedCitation(c, query);
      if (c.contactEmail) {
        const sent = await sendOutreachEmail(c.contactEmail, c, query);
        if (sent) await markEmailSent(id);
      }
    }
    if (candidates.length > 0) {
      console.log(`[outreach] ${candidates.length} external candidates found for query: "${query.slice(0, 60)}"`);
    }
  } catch (err) {
    console.error("[outreach] runExternalOutreachAsync failed:", String(err).slice(0, 120));
  }
}
