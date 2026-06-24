import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { AgentPolicy } from "@/lib/policy";
import { POLICY_PRESETS } from "@/lib/policy";

export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  let body: { description?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { description } = body;
  if (!description?.trim()) return NextResponse.json({ error: "description required" }, { status: 400 });

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    messages: [{
      role: "user",
      content: `You are a CitePay Markets spend-policy expert. Convert this plain-English description into a structured AgentSpendPolicy JSON.

Description: "${description.slice(0, 500)}"

Fields (all required):
- name: string (≤20 chars, describes the policy)
- maxPricePerCitation: integer micro-USDC (1000=0.001 USDC, 5000=0.005, 0=no limit)
- minRelevanceScore: integer 0-100 (70=strict, 40=balanced, 20=permissive)
- requireBonded: boolean (true=only bonded/staked sources)
- sessionSpendCap: integer micro-USDC (0=no cap, 10000=0.01 USDC cap)
- requireOnChainAnchor: boolean
- allowSimulatedPayout: boolean (false=real USDC only)
- sufficiencyMaxCitations: integer (0=no limit, 2=stop after 2 citations)
- sufficiencyRelevanceTarget: integer (0=no limit, 150=stop when cumulative relevance hits 150)

Preset reference:
conservative: maxPrice:2000 minRelevance:70 requireBonded:true cap:10000 maxCitations:2
balanced:     maxPrice:5000 minRelevance:40 requireBonded:false cap:0 maxCitations:3
aggressive:   maxPrice:10000 minRelevance:20 requireBonded:false cap:0 maxCitations:5

Return ONLY valid JSON:
{"policy":{...},"explanation":"one sentence what this policy does","confidence":85}`,
    }],
  });

  const text = (msg.content[0] as { text: string }).text;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return NextResponse.json({ error: "Claude returned no JSON" }, { status: 500 });

  let parsed: { policy: AgentPolicy; explanation: string; confidence: number };
  try { parsed = JSON.parse(match[0]) as typeof parsed; }
  catch { return NextResponse.json({ error: "Failed to parse Claude response" }, { status: 500 }); }

  // Clamp + validate all fields
  const p = parsed.policy;
  const policy: AgentPolicy = {
    name: String(p.name ?? "Custom").slice(0, 20),
    maxPricePerCitation: Math.max(0, Math.round(Number(p.maxPricePerCitation ?? 5000))),
    minRelevanceScore: Math.min(100, Math.max(0, Math.round(Number(p.minRelevanceScore ?? 40)))),
    requireBonded: Boolean(p.requireBonded),
    sessionSpendCap: Math.max(0, Math.round(Number(p.sessionSpendCap ?? 0))),
    requireOnChainAnchor: Boolean(p.requireOnChainAnchor),
    allowSimulatedPayout: Boolean(p.allowSimulatedPayout ?? true),
    sufficiencyMaxCitations: Math.max(0, Math.round(Number(p.sufficiencyMaxCitations ?? 3))),
    sufficiencyRelevanceTarget: Math.max(0, Math.round(Number(p.sufficiencyRelevanceTarget ?? 0))),
  };

  // Find closest preset match
  const presetMatch = Object.entries(POLICY_PRESETS).find(([, preset]) => (
    Math.abs(preset.minRelevanceScore - policy.minRelevanceScore) < 20 &&
    preset.requireBonded === policy.requireBonded
  ))?.[0] ?? null;

  return NextResponse.json({ policy, explanation: parsed.explanation, confidence: parsed.confidence ?? 80, presetMatch });
}
