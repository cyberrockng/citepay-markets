import { NextRequest, NextResponse } from "next/server";
import { getBountyById, submitToBounty } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bounty = getBountyById(id);
  if (!bounty) return NextResponse.json({ error: "Bounty not found" }, { status: 404 });
  if (bounty.status !== "open") return NextResponse.json({ error: "Bounty is not open" }, { status: 409 });
  if (new Date(bounty.deadline) < new Date()) return NextResponse.json({ error: "Bounty deadline has passed" }, { status: 409 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { creatorName, creatorHandle, creatorWallet, content, contentUrl } = body as {
    creatorName?: string; creatorHandle?: string; creatorWallet?: string;
    content?: string; contentUrl?: string;
  };

  if (!creatorName || !creatorWallet || !content) {
    return NextResponse.json({ error: "creatorName, creatorWallet, content required" }, { status: 400 });
  }
  if (String(content).length < 50) {
    return NextResponse.json({ error: "Content must be at least 50 characters" }, { status: 400 });
  }

  try {
    const submission = submitToBounty({
      bountyId: id,
      creatorName: String(creatorName).slice(0, 80),
      creatorHandle: String(creatorHandle || "").slice(0, 40),
      creatorWallet: String(creatorWallet),
      content: String(content).slice(0, 5000),
      contentUrl: contentUrl ? String(contentUrl).slice(0, 500) : undefined,
    });
    return NextResponse.json({ submission }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
