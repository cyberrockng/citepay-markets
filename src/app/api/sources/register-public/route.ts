import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { insertSource, updateSourceOnChainId } from "@/lib/db";
import { contentHashFromText } from "@/lib/evidence";
import { registerSourceOnChain } from "@/lib/anchor";
import type { Source } from "@/types";

export const dynamic = "force-dynamic";

// Simple in-memory IP rate limit — 3 registrations per IP per hour
const ipLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  try {
    const now = Date.now();
    const window = 60 * 60 * 1000; // 1 hour
    const hits = (ipLog.get(ip) ?? []).filter((t) => now - t < window);
    if (hits.length >= 3) return true;
    hits.push(now);
    ipLog.set(ip, hits);
    return false;
  } catch {
    return false; // fail-open
  }
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Rate limit: max 3 registrations per hour. Come back later." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title         = String(body.title ?? "").trim();
  const url           = String(body.url ?? "").trim();
  const creatorName   = String(body.creatorName ?? "").trim();
  const creatorHandle = String(body.creatorHandle ?? creatorName).trim();
  const payoutWallet  = String(body.payoutWallet ?? "").trim();
  const description   = String(body.description ?? "").trim();
  const priceRaw      = body.price ?? body.priceAtomicUsdc ?? 1500;
  const price         = Math.max(1, Math.min(1_000_000, Number(priceRaw) || 1500));

  // Required field checks
  if (!title)       return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!url)         return NextResponse.json({ error: "url is required" }, { status: 400 });
  if (!creatorName) return NextResponse.json({ error: "creatorName is required" }, { status: 400 });
  if (!payoutWallet) return NextResponse.json({ error: "payoutWallet is required" }, { status: 400 });

  // Validate URL
  if (!url.startsWith("https://") && !url.startsWith("http://")) {
    return NextResponse.json({ error: "url must start with https://" }, { status: 400 });
  }

  // Validate wallet
  if (!/^0x[0-9a-fA-F]{40}$/.test(payoutWallet)) {
    return NextResponse.json(
      { error: "payoutWallet must be a valid 0x Ethereum address (42 chars)" },
      { status: 400 }
    );
  }

  // Length guards
  if (creatorName.length > 72) return NextResponse.json({ error: "creatorName must be ≤ 72 chars" }, { status: 400 });
  if (description.length > 340) return NextResponse.json({ error: "description must be ≤ 340 chars" }, { status: 400 });
  if (title.length > 120) return NextResponse.json({ error: "title must be ≤ 120 chars" }, { status: 400 });

  const id          = uuidv4();
  const contentHash = contentHashFromText(`${url}:${title}:${Date.now()}`);

  const source: Source = {
    id,
    title,
    url,
    creatorName,
    creatorHandle: creatorHandle.startsWith("@") ? creatorHandle : `@${creatorHandle}`,
    payoutWallet,
    contentHash,
    metadataURI: "",
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
  };

  insertSource(source);

  // Anchor on-chain (non-blocking)
  void registerSourceOnChain({
    payoutWallet: source.payoutWallet,
    contentHash:  source.contentHash,
    metadataURI:  source.metadataURI,
    price:        source.price,
  }).then((onChainId) => {
    if (onChainId) {
      updateSourceOnChainId(id, onChainId);
      console.log(`[anchor] public source ${id} → on-chain #${onChainId}`);
    }
  });

  return NextResponse.json({ source, message: "Source registered — you are now in the CitePay market." }, { status: 201 });
}
