import { NextResponse } from "next/server";
import { getRecentLessons } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ lessons: getRecentLessons(30) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
