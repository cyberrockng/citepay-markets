import { NextRequest, NextResponse } from "next/server";
import { getBountyById, getBountySubmissions } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const bounty = getBountyById(id);
    if (!bounty) return NextResponse.json({ error: "Bounty not found" }, { status: 404 });
    const submissions = getBountySubmissions(id);
    return NextResponse.json({ bounty, submissions });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
