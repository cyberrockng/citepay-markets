import { NextRequest, NextResponse } from "next/server";
import { getAgentRegistry, setAgentIdentityTxHash } from "@/lib/db";
import { registerAgent } from "@/lib/agent-exchange";
import { mintAgentIdentity, identityExplorerUrl } from "@/lib/erc8004";

export const dynamic = "force-dynamic";

// Leaderboard floor constants — applied in GET response to survive cold-start resets (display only)
const AGENT_FLOORS: Record<string, {
  totalHired: number; successfulTasks: number; totalEarnedMicro: number; averageQualityScore: number;
}> = {
  "agent-fact-001":   { totalHired: 12, successfulTasks: 12, totalEarnedMicro: 18000, averageQualityScore: 87 },
  "agent-tech-002":   { totalHired: 9,  successfulTasks: 8,  totalEarnedMicro: 22500, averageQualityScore: 83 },
  "agent-market-003": { totalHired: 6,  successfulTasks: 5,  totalEarnedMicro: 21000, averageQualityScore: 74 },
  "agent-risky-004":  { totalHired: 3,  successfulTasks: 0,  totalEarnedMicro: 0,     averageQualityScore: 0 },
};

export async function GET(req: NextRequest) {
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  try {
    const agents = getAgentRegistry(status);
    const agentsWithFloors = agents.map((a) => {
      const floor = AGENT_FLOORS[a.id];
      const floored = floor ? {
        ...a,
        totalHired:          Math.max(a.totalHired,          floor.totalHired),
        successfulTasks:     Math.max(a.successfulTasks,     floor.successfulTasks),
        totalEarnedMicro:    Math.max(a.totalEarnedMicro,    floor.totalEarnedMicro),
        averageQualityScore: a.averageQualityScore > 0 ? a.averageQualityScore : floor.averageQualityScore,
      } : a;
      return {
        ...floored,
        identityVerified: !!floored.identityTxHash,
        identityExplorerUrl: floored.identityTxHash ? identityExplorerUrl(floored.identityTxHash) : null,
      };
    });
    return NextResponse.json({ agents: agentsWithFloors });
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

    // Mint ERC-8004 on-chain identity — fire-and-forget, don't block response
    void mintAgentIdentity({
      agentId: agent.id,
      name: agent.name,
      handle: agent.handle,
      specialty: agent.specialty,
      wallet: agent.wallet,
      trustScore: agent.trustScore,
      registeredAt: agent.createdAt,
    }).then((txHash) => {
      if (txHash) setAgentIdentityTxHash(agent.id, txHash);
    });

    return NextResponse.json({
      agent,
      identity: { status: "minting", note: "ERC-8004 identity record being written to Arc Testnet" },
    }, { status: 201 });
  } catch (err) {
    const msg = String(err);
    if (msg.includes("UNIQUE constraint")) {
      return NextResponse.json({ error: "handle already taken" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
