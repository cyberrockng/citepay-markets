import { NextRequest, NextResponse } from "next/server";
import { createSession, getRecentSessions } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ sessions: getRecentSessions(20) });
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  let body: { title?: string; policy?: string } = {};
  try { body = await req.json(); } catch {}
  try {
    const session = createSession({ title: body.title, policy: body.policy });
    return NextResponse.json({ session }, { status: 201 });
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}
