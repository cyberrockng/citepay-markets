import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { insertSource } from "@/lib/db";
import { registerSourceOnChain } from "@/lib/anchor";
import { fetchAndHash } from "@/lib/content-hash";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Rate limit: 1 RSS feed registration per IP per 5 minutes
const ipLog = new Map<string, number>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const last = ipLog.get(ip) ?? 0;
  if (now - last < 5 * 60 * 1000) return true;
  ipLog.set(ip, now);
  return false;
}

function extractText(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, "i");
  return (xml.match(re)?.[1] ?? "").replace(/<[^>]+>/g, "").trim();
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*${attr}="([^"]+)"`, "i");
  return xml.match(re)?.[1] ?? "";
}

interface FeedItem { title: string; url: string; description: string }

function parseFeed(xml: string): FeedItem[] {
  const isAtom = /<feed/i.test(xml);
  const tag = isAtom ? "entry" : "item";
  const re = new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, "gi");
  const items: FeedItem[] = [];

  for (const block of xml.matchAll(re)) {
    const content = block[0];
    const title = extractText(content, "title");

    // Atom: <link href="..."/> or <link rel="alternate" href="..."/>
    // RSS 2.0: <link>url</link>
    let url = extractAttr(content, "link", "href");
    if (!url) url = extractText(content, "link");
    if (!url) url = extractText(content, "id"); // Atom fallback

    const description = extractText(content, isAtom ? "summary" : "description").slice(0, 300);

    if (title && url && url.startsWith("http")) {
      items.push({ title, url, description });
    }
  }

  return items.slice(0, 20); // cap at 20 articles
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Rate limit: 1 feed per 5 minutes." }, { status: 429 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const feedUrl      = String(body.feedUrl      ?? "").trim();
  const payoutWallet = String(body.payoutWallet ?? "").trim();
  const creatorName  = String(body.creatorName  ?? "").trim();
  const handle       = String(body.handle       ?? creatorName).trim();
  const category     = String(body.category     ?? "Research").trim();
  const priceRaw     = body.price ?? 1500;
  const price        = Math.max(500, Math.min(10_000, Number(priceRaw) || 1500));

  if (!feedUrl)      return NextResponse.json({ error: "feedUrl is required" }, { status: 400 });
  if (!payoutWallet) return NextResponse.json({ error: "payoutWallet is required" }, { status: 400 });
  if (!creatorName)  return NextResponse.json({ error: "creatorName is required" }, { status: 400 });

  if (!feedUrl.startsWith("http")) {
    return NextResponse.json({ error: "feedUrl must start with http(s)://" }, { status: 400 });
  }

  // Fetch the RSS/Atom feed
  let feedXml: string;
  try {
    const res = await fetch(feedUrl, {
      headers: { "User-Agent": "CitePay-RSS-Bot/1.0", "Accept": "application/rss+xml, application/atom+xml, text/xml, */*" },
      signal: AbortSignal.timeout(10_000),
    });
    feedXml = await res.text();
  } catch (err) {
    return NextResponse.json({ error: `Feed fetch failed: ${String(err)}` }, { status: 400 });
  }

  const items = parseFeed(feedXml);
  if (items.length === 0) {
    return NextResponse.json({ error: "No items found in feed. Make sure the URL points to an RSS or Atom feed." }, { status: 400 });
  }

  // Register each item — fetch + hash in parallel, then insert
  const results: Array<{ id: string; title: string; url: string; contentHash: string; onChainId?: number | null; error?: string }> = [];

  await Promise.all(
    items.map(async (item) => {
      try {
        const { hash, contentLength } = await fetchAndHash(item.url);
        const sourceId = uuidv4();
        const now = new Date().toISOString();

        const source = {
          id: sourceId,
          title: item.title.slice(0, 120),
          url: item.url,
          creatorName,
          creatorHandle: handle,
          payoutWallet,
          description: item.description,
          category,
          price,
          contentHash: hash,
          contentLength,
          metadataURI: item.url,
          bond: 0,
          bonded: false,
          reputation: 0,
          active: true,
          paidCount: 0,
          refusedCount: 0,
          skipCount: 0,
          createdAt: now,
          onChainId: null,
          avgContributionWeight: 0,
          totalContributionQueries: 0,
        };

        insertSource(source);

        // Attempt on-chain registration (fire-and-forget, non-blocking)
        let onChainId: number | null = null;
        try {
          onChainId = await registerSourceOnChain({ payoutWallet, contentHash: hash, metadataURI: item.url, price: price / 1_000_000 });
        } catch { /* on-chain is best-effort */ }

        results.push({ id: sourceId, title: item.title, url: item.url, contentHash: hash, onChainId });
      } catch (err) {
        results.push({ id: "", title: item.title, url: item.url, contentHash: "", error: String(err) });
      }
    })
  );

  const registered = results.filter((r) => !r.error).length;
  const failed = results.filter((r) => !!r.error).length;

  return NextResponse.json({
    registered,
    failed,
    sources: results,
    feedUrl,
    message: `Registered ${registered} article${registered !== 1 ? "s" : ""} from your feed.${failed > 0 ? ` ${failed} failed (URL fetch errors).` : ""}`,
  });
}
