import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { insertSource, updateSourceOnChainId, updateSourceContent } from "@/lib/db";
import { contentHashFromText } from "@/lib/evidence";
import { registerSourceOnChain } from "@/lib/anchor";
import { fetchPageContent } from "@/lib/page-indexer";
import type { Source } from "@/types";

export async function POST(req: NextRequest) {
  // Rate-limit: require X-API-Key when REGISTER_API_KEY is set
  const registerKey = process.env.REGISTER_API_KEY;
  if (registerKey) {
    const provided = req.headers.get("x-api-key");
    if (provided !== registerKey) {
      return NextResponse.json({ error: "Unauthorized — X-API-Key required" }, { status: 401 });
    }
  }

  let body: Partial<Source> & { content?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, url, creatorName, creatorHandle, payoutWallet, price, bond, content } = body;
  const description = (body as Record<string, unknown>).description as string || content || "";

  if (!title || !url || !creatorName || !payoutWallet || !price) {
    return NextResponse.json(
      { error: "Missing required fields: title, url, creatorName, payoutWallet, price" },
      { status: 400 }
    );
  }

  const id = uuidv4();
  const contentHash = content
    ? contentHashFromText(content)
    : contentHashFromText(`${url}:${title}:${Date.now()}`);

  const source: Source = {
    id,
    title: String(title),
    url: String(url),
    creatorName: String(creatorName),
    creatorHandle: String(creatorHandle || creatorName),
    payoutWallet: String(payoutWallet),
    contentHash,
    metadataURI: body.metadataURI || "",
    description,
    price: Number(price),
    bond: Number(bond || 0),
    bonded: Number(bond || 0) > 0,
    reputation: 0,
    paidCount: 0,
    refusedCount: 0,
    skipCount: 0,
    active: true,
    createdAt: new Date().toISOString(),
  };

  insertSource(source);

  // Index full page content non-blocking — improves scoring accuracy
  void fetchPageContent(String(url)).then(({ content, wordCount }) => {
    if (content) {
      updateSourceContent(id, content);
      console.log(`[indexer] source ${id} indexed ${wordCount} words from ${url}`);
    }
  });

  // Anchor source on-chain (non-blocking — don't delay the HTTP response)
  void registerSourceOnChain({
    payoutWallet: source.payoutWallet,
    contentHash:  source.contentHash,
    metadataURI:  source.metadataURI,
    price:        source.price,
  }).then((onChainId) => {
    if (onChainId) {
      updateSourceOnChainId(id, onChainId);
      console.log(`[anchor] source ${id} → on-chain #${onChainId}`);
    }
  });

  return NextResponse.json({ source, message: "Source registered" }, { status: 201 });
}
