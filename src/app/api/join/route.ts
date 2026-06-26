import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { insertSource } from "@/lib/db";
import { registerSourceOnChain } from "@/lib/anchor";
import { fetchAndHash } from "@/lib/content-hash";
import { fetchPageContent } from "@/lib/page-indexer";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Rate limit: 5 joins per IP per hour
const ipLog = new Map<string, number[]>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const window = 60 * 60 * 1000;
  const hits = (ipLog.get(ip) ?? []).filter((t) => now - t < window);
  if (hits.length >= 5) return true;
  hits.push(now);
  ipLog.set(ip, hits);
  return false;
}

function extractMeta(html: string): { title: string; description: string } {
  const titleMatch = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']{1,120})["']/i);
  const ogDesc  = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']{1,300})["']/i);
  const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']{1,300})["']/i);

  const title = (ogTitle?.[1] ?? titleMatch?.[1] ?? "").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#39;/g,"'").replace(/&quot;/g,'"').trim();
  const description = (ogDesc?.[1] ?? metaDesc?.[1] ?? "").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#39;/g,"'").replace(/&quot;/g,'"').trim();

  return { title: title.slice(0, 120), description: description.slice(0, 300) };
}

function guessCategory(url: string, title: string, description: string): string {
  const text = `${url} ${title} ${description}`.toLowerCase();
  if (/github|npm|sdk|library|package|open.?source/.test(text)) return "Protocol";
  if (/agent|mcp|llm|gpt|claude|ai|model|inference/.test(text)) return "AI/Agents";
  if (/infra|rpc|node|chain|network|blockchain|testnet|mainnet/.test(text)) return "Infrastructure";
  return "Research";
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Rate limit: 5 joins per hour." }, { status: 429 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url          = String(body.url          ?? "").trim();
  const payoutWallet = String(body.wallet        ?? body.payoutWallet ?? "").trim();
  const creatorName  = String(body.name          ?? body.creatorName  ?? "").trim();
  const priceRaw     = body.price ?? 1500;
  const price        = Math.max(500, Math.min(10_000, Number(priceRaw) || 1500));

  if (!url)          return NextResponse.json({ error: "url is required" },    { status: 400 });
  if (!payoutWallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  if (!url.startsWith("http")) return NextResponse.json({ error: "url must start with http(s)://" }, { status: 400 });
  if (!/^0x[0-9a-fA-F]{40}$/.test(payoutWallet)) return NextResponse.json({ error: "wallet must be a valid 0x address" }, { status: 400 });

  // Fetch page — extract metadata, hash, and full-text index in one pass
  let title = "";
  let description = "";
  let contentHash = "";
  let contentLength = 0;
  let fullContent: string | null = null;
  let fetchSource = "fallback";

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "CitePay-Indexer/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    const html = await res.text();
    const meta = extractMeta(html);
    title = meta.title;
    description = meta.description;
    fetchSource = "live";
    contentLength = html.length;

    // Content hash
    const encoder = new TextEncoder();
    const data = encoder.encode(html.slice(0, 65536));
    const hashBuf = await crypto.subtle.digest("SHA-256", data);
    contentHash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");

    // Full-text index from the same HTML fetch (no second network call)
    const { content } = await fetchPageContent(url).catch(() => ({ content: "" }));
    fullContent = content || null;
  } catch {
    const encoder = new TextEncoder();
    const data = encoder.encode(url);
    const hashBuf = await crypto.subtle.digest("SHA-256", data);
    contentHash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Use provided name or domain as creator name
  const domain = new URL(url).hostname.replace(/^www\./, "");
  const finalName = creatorName || domain;
  const category = guessCategory(url, title, description);
  const finalTitle = title || `${domain} — ${url.split("/").slice(-1)[0] || "home"}`;

  const sourceId = uuidv4();
  const source = {
    id: sourceId,
    title: finalTitle.slice(0, 120),
    url,
    creatorName: finalName,
    creatorHandle: `@${finalName.toLowerCase().replace(/\s+/g, "")}`,
    payoutWallet,
    description,
    category,
    price,
    contentHash,
    contentLength,
    fullContent,
    metadataURI: url,
    bond: 0,
    bonded: false,
    reputation: 0,
    active: true,
    paidCount: 0,
    refusedCount: 0,
    skipCount: 0,
    createdAt: new Date().toISOString(),
    onChainId: null,
    avgContributionWeight: 0,
    totalContributionQueries: 0,
  };

  insertSource(source);

  // On-chain registration — fire and forget
  void registerSourceOnChain({ payoutWallet, contentHash, metadataURI: url, price: price / 1_000_000 }).catch(() => {});

  return NextResponse.json({
    success: true,
    sourceId,
    title: finalTitle,
    url,
    category,
    price,
    fetchSource,
    contentHash: contentHash.slice(0, 16) + "…",
    marketUrl: `https://citepay-markets.vercel.app/source/${sourceId}`,
    message: `"${finalTitle}" is now in the CitePay market. Agents will pay you USDC when they cite it.`,
  });
}

// GET — returns instructions for agents
export async function GET() {
  return NextResponse.json({
    description: "CitePay self-registration. POST your URL and wallet to join the citation market.",
    usage: {
      method: "POST",
      body: {
        url:    "https://your-project.com/docs  (required)",
        wallet: "0x...  your Arc Testnet wallet  (required)",
        name:   "Your project name  (optional — auto-detected from page)",
        price:  "micro-USDC per citation, 500–10000  (optional, default 1500 = $0.0015)",
      },
    },
    example: {
      curl: `curl -X POST https://citepay-markets.vercel.app/api/join -H "Content-Type: application/json" -d '{"url":"https://your-project.com","wallet":"0xYOUR_WALLET"}'`,
    },
    market: "https://citepay-markets.vercel.app/market",
  });
}
