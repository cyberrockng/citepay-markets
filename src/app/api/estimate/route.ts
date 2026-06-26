import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "@/lib/db";
import { fetchPageContent } from "@/lib/page-indexer";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// Rate limit: 3 estimates per IP per 10 minutes
const _ipLog = new Map<string, number[]>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const window = 10 * 60 * 1000;
  const hits = (_ipLog.get(ip) ?? []).filter((t) => now - t < window);
  if (hits.length >= 3) return true;
  hits.push(now);
  _ipLog.set(ip, hits);
  return false;
}

function extractMeta(html: string): { title: string; description: string } {
  const ogTitle  = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']{1,120})["']/i);
  const title    = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
  const ogDesc   = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']{1,300})["']/i);
  const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']{1,300})["']/i);
  return {
    title:       (ogTitle?.[1] ?? title?.[1] ?? "").replace(/&amp;/g,"&").replace(/&#39;/g,"'").trim().slice(0, 120),
    description: (ogDesc?.[1] ?? metaDesc?.[1] ?? "").replace(/&amp;/g,"&").replace(/&#39;/g,"'").trim().slice(0, 300),
  };
}

async function scoreUrlAgainstQuery(
  query: string,
  title: string,
  content: string,
  client: Anthropic
): Promise<{ relevance: number; excerpt: string }> {
  const preview = content.slice(0, 800);
  const prompt = `You are scoring a web page for relevance to a query an AI agent submitted.

Query: "${query}"

Page title: "${title}"
Page content:
"""
${preview}
"""

Score relevance 0–100. 80+ means this page directly answers the query.
Return ONLY JSON: {"relevance": 72, "excerpt": "one sentence why"}`;

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 80,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (msg.content[0] as { text: string }).text;
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    return {
      relevance: Math.max(0, Math.min(100, Number(parsed.relevance) || 0)),
      excerpt: String(parsed.excerpt ?? ""),
    };
  } catch {
    // Keyword fallback
    const words = query.toLowerCase().split(/\s+/);
    const combined = `${title} ${content}`.toLowerCase();
    const hits = words.filter((w) => w.length > 3 && combined.includes(w)).length;
    return { relevance: Math.min(70, hits * 12 + 20), excerpt: "" };
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Rate limit: 3 estimates per 10 minutes." }, { status: 429 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const url = String(body.url ?? "").trim();
  if (!url || !url.startsWith("http")) {
    return NextResponse.json({ error: "url is required and must start with http(s)://" }, { status: 400 });
  }

  // 1. Fetch the page
  let title = "";
  let description = "";
  let content = "";

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "CitePay-Estimator/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return NextResponse.json({ error: `Could not fetch page (HTTP ${res.status})` }, { status: 422 });
    const html = await res.text();
    const meta = extractMeta(html);
    title = meta.title;
    description = meta.description;
    const indexed = await fetchPageContent(url);
    content = indexed.content || description;
  } catch (err) {
    return NextResponse.json({ error: `Could not reach page: ${String(err).slice(0, 80)}` }, { status: 422 });
  }

  if (!title && !content) {
    return NextResponse.json({ error: "Page returned no readable content." }, { status: 422 });
  }

  // 2. Pull last 30 unique completed queries from DB
  const db = getDb();
  const rows = db.prepare(
    `SELECT DISTINCT query FROM queries WHERE status = 'completed' ORDER BY created_at DESC LIMIT 30`
  ).all() as { query: string }[];

  // Pad with representative queries if DB is sparse
  const SEED_QUERIES = [
    "How do AI agents pay for resources using HTTP 402 and USDC?",
    "What is the best way to build autonomous agent payment systems?",
    "How does Circle CCTP work for cross-chain transfers?",
    "What are the emerging architectures for LLM applications?",
    "How do creators get paid in the age of generative AI?",
    "What is content addressing and how does IPFS use it?",
    "How can AI agents verify identity and prevent Sybil attacks?",
    "What is USDC and why do AI agents use stablecoins?",
    "How does x402 enable machine-native payments?",
    "What are the key patterns for building agentic AI systems?",
  ];

  const liveQueries = rows.map((r) => r.query);
  const queryPool: string[] = [
    ...new Set([...liveQueries, ...SEED_QUERIES]),
  ].slice(0, 30);

  // 3. Score URL against each query in parallel (batches of 5)
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const PAY_THRESHOLD = 70;
  const DEFAULT_PRICE_MICRO = 1500; // $0.0015 — mid-market default

  const results: { query: string; relevance: number; excerpt: string; wouldPay: boolean; earning: number }[] = [];

  const BATCH = 5;
  for (let i = 0; i < queryPool.length; i += BATCH) {
    const batch = queryPool.slice(i, i + BATCH);
    const scored = await Promise.all(
      batch.map(async (q) => {
        const { relevance, excerpt } = await scoreUrlAgainstQuery(q, title, content, client);
        const wouldPay = relevance >= PAY_THRESHOLD;
        return { query: q, relevance, excerpt, wouldPay, earning: wouldPay ? DEFAULT_PRICE_MICRO : 0 };
      })
    );
    results.push(...scored);
  }

  // 4. Compute summary
  const matches = results.filter((r) => r.wouldPay);
  const totalEarnedMicro = matches.reduce((s, r) => s + r.earning, 0);
  const conversionRate = Math.round((matches.length / queryPool.length) * 100);

  // Project monthly: assume current query volume × 30 days / observation window
  // Conservative: treat queryPool size as "queries per week"
  const weeklyQueries = queryPool.length;
  const projectedMonthlyMicro = Math.round((totalEarnedMicro / weeklyQueries) * weeklyQueries * 4);

  return NextResponse.json({
    url,
    title: title || url,
    description,
    queriesAnalyzed: queryPool.length,
    liveQueriesUsed: liveQueries.length,
    matches: matches.length,
    conversionRate,
    estimatedEarningsMicro: totalEarnedMicro,
    estimatedEarningsUSD: (totalEarnedMicro / 1_000_000).toFixed(4),
    projectedMonthlyMicro,
    projectedMonthlyUSD: (projectedMonthlyMicro / 1_000_000).toFixed(4),
    defaultPriceMicro: DEFAULT_PRICE_MICRO,
    topMatches: matches
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 5)
      .map((r) => ({ query: r.query, relevance: r.relevance, excerpt: r.excerpt })),
    registerUrl: "https://citepay-markets.vercel.app/join",
  });
}
