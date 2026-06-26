import { NextResponse } from "next/server";
import { getW3SStatus } from "@/lib/circle-w3s";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status:  "ok",
    service: "citepay-markets",
    ts:      Date.now(),
    signing: getW3SStatus(),
  });
}
