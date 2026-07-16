import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { insertSource, updateSourceOnChainId } from "@/lib/db";
import { registerSourceOnChain } from "@/lib/anchor";
import { fetchAndHash } from "@/lib/content-hash";
import { fetchWellKnownPolicy, resolvePublisherLicense } from "@/lib/clear/wellknown";
import type { Source } from "@/types";

const ALLOWED_LICENSE_CLASSES = new Set(["open", "standard"]);

export const dynamic = "force-dynamic";

// In-memory IP rate limit — 3 registrations per IP per hour
const ipLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  try {
    const now = Date.now();
    const window = 60 * 60 * 1000;
    const hits = (ipLog.get(ip) ?? []).filter((t) => now - t < window);
    if (hits.length >= 3) return true;
    hits.push(now);
    ipLog.set(ip, hits);
    return false;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Rate limit: max 3 registrations per hour." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const title         = String(body.title ?? "").trim();
  const url           = String(body.url ?? "").trim();
  const creatorName   = String(body.creatorName ?? "").trim();
  const creatorHandle = String(body.creatorHandle ?? creatorName).trim();
  const payoutWallet  = String(body.payoutWallet ?? "").trim();
  const description   = String(body.description ?? "").trim();
  const category      = String(body.category ?? "Research").trim();
  const priceRaw      = body.price ?? 1500;
  const price         = Math.max(500, Math.min(10_000, Number(priceRaw) || 1500));
  const licenseClassRaw = String(body.licenseClass ?? "standard").trim();
  const licenseClass  = ALLOWED_LICENSE_CLASSES.has(licenseClassRaw) ? licenseClassRaw : "standard";

  if (!title)        return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!url)          return NextResponse.json({ error: "url is required" }, { status: 400 });
  if (!creatorName)  return NextResponse.json({ error: "creatorName is required" }, { status: 400 });
  if (!payoutWallet) return NextResponse.json({ error: "payoutWallet is required" }, { status: 400 });

  if (!url.startsWith("https://") && !url.startsWith("http://")) {
    return NextResponse.json({ error: "url must start with https://" }, { status: 400 });
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(payoutWallet)) {
    return NextResponse.json({ error: "payoutWallet must be a valid 0x address" }, { status: 400 });
  }
  if (title.length > 120)       return NextResponse.json({ error: "title must be ≤ 120 chars" }, { status: 400 });
  if (creatorName.length > 72)  return NextResponse.json({ error: "creatorName must be ≤ 72 chars" }, { status: 400 });
  if (description.length > 340) return NextResponse.json({ error: "description must be ≤ 340 chars" }, { status: 400 });

  // Fetch and hash real URL content
  const fetched = await fetchAndHash(url);
  if (fetched.source === "fallback") {
    console.warn(`[register-public] URL fetch failed for ${url}: ${fetched.error}`);
  }

  // Best-effort: read the publisher's own /.well-known/citepay.json to prove domain
  // control and prefill policy. Never required — a missing file just means "unverified".
  const wellKnown = await fetchWellKnownPolicy(url);
  const resolved = resolvePublisherLicense(wellKnown, licenseClass, payoutWallet);
  const domainVerified = resolved.verificationStatus === "domain_verified";

  const id = uuidv4();
  const source: Source = {
    id,
    title,
    url,
    creatorName,
    creatorHandle: creatorHandle.startsWith("@") ? creatorHandle : `@${creatorHandle}`,
    payoutWallet,
    contentHash:  fetched.hash,
    metadataURI:  JSON.stringify({ fetchedAt: fetched.fetchedAt, fetchSource: fetched.source, category }),
    description,
    price,
    bond: 0,
    bonded: false,
    reputation: 0,
    paidCount: 0,
    refusedCount: 0,
    skipCount: 0,
    active: true,
    createdAt: new Date().toISOString(),
    licenseClass: resolved.licenseClass,
    verificationStatus: resolved.verificationStatus,
  };

  insertSource(source);

  // Anchor on-chain (non-blocking)
  void registerSourceOnChain({
    payoutWallet:  source.payoutWallet,
    contentHash:   source.contentHash,
    metadataURI:   source.metadataURI,
    price:         source.price,
  }).then((onChainId) => {
    if (onChainId) {
      updateSourceOnChainId(id, onChainId);
      console.log(`[anchor] public source ${id} → on-chain #${onChainId}`);
    }
  });

  return NextResponse.json({
    source,
    contentHash:        fetched.hash,
    contentLength:      fetched.contentLength,
    contentFetchedAt:   fetched.fetchedAt,
    contentFetchSource: fetched.source,
    contentFetchError:  fetched.error ?? null,
    wellKnown: wellKnown.ok
      ? { found: true, verified: domainVerified, policy: wellKnown.policy }
      : { found: false, verified: false, error: wellKnown.error },
    message:            fetched.source === "fetch"
      ? `Source registered — ${fetched.contentLength.toLocaleString()} chars fingerprinted. You are now in the CitePay market.`
      : `Source registered with fallback hash (URL unreachable: ${fetched.error}). Challenges may not resolve correctly.`,
  }, { status: 201 });
}
