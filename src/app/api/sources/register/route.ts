import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { insertSource } from "@/lib/db";
import { contentHashFromText } from "@/lib/evidence";
import type { Source } from "@/types";

export async function POST(req: NextRequest) {
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

  return NextResponse.json({ source, message: "Source registered" }, { status: 201 });
}
