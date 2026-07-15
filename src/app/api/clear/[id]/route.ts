import { NextResponse } from "next/server";
import { getClearanceById } from "@/lib/clear/get-clearance";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getClearanceById(id);
  if (!result) {
    return NextResponse.json({ error: "Clearance not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}
