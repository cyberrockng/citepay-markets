import { NextRequest, NextResponse } from "next/server";
import { getSessionById, getSessionTurns } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getSessionById(id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  const turns = getSessionTurns(id);
  return NextResponse.json({ session, turns });
}
