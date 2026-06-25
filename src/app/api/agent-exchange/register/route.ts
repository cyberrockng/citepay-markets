import { NextRequest, NextResponse } from "next/server";
import { getAgentRegistry } from "@/lib/db";
import { registerAgent } from "@/lib/agent-exchange";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  try {
    const agents = getAgentRegistry(status);
    return NextResponse.json({ agents });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { name, handle, specialty, endpointUrl, wallet, priceUsdc, policyProfile } = body as {
    name?: string; handle?: string; specialty?: string; endpointUrl?: string;
    wallet?: string; priceUsdc?: number; policyProfile?: string;
  };

  if (!name || !handle || !specialty || !endpointUrl || !wallet) {
    return NextResponse.json(
      { error: "name, handle, specialty, endpointUrl, wallet are required" },
      { status: 400 },
    );
  }

  const priceMicro = Math.max(100, Math.round((Number(priceUsdc) || 0.002) * 1_000_000));
  const profile = ["conservative", "balanced", "aggressive"].includes(String(policyProfile))
    ? String(policyProfile)
    : "balanced";

  try {
    const agent = registerAgent({
      name: String(name).slice(0, 80),
      handle: String(handle).slice(0, 40),
      specialty: String(specialty).slice(0, 120),
      endpointUrl: String(endpointUrl).slice(0, 500),
      wallet: String(wallet).slice(0, 42),
      priceMicro,
      policyProfile: profile,
    });
    return NextResponse.json({ agent }, { status: 201 });
  } catch (err) {
    const msg = String(err);
    if (msg.includes("UNIQUE constraint")) {
      return NextResponse.json({ error: "handle already taken" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
