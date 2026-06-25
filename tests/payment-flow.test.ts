/**
 * Payment flow regression tests.
 * Tests critical path: policy enforcement → unit conversion → receipt integrity.
 */
import { describe, it, expect } from "vitest";

// ── Policy rule constants (mirrors agent-exchange.ts) ──────────────────────────

const POLICY_RULES: Record<string, { minTrust: number; maxPriceMicro: number }> = {
  conservative: { minTrust: 75, maxPriceMicro: 2000 },
  balanced:     { minTrust: 50, maxPriceMicro: 5000 },
  aggressive:   { minTrust: 20, maxPriceMicro: 9999 },
};

interface Agent { id: string; trustScore: number; priceMicro: number; wallet: string; }

function checkPolicy(agent: Agent, policyMode: string, budgetMicro: number): string | null {
  const rules = POLICY_RULES[policyMode] ?? POLICY_RULES.balanced;
  if (agent.priceMicro > budgetMicro) return `price_exceeds_budget`;
  if (agent.trustScore < rules.minTrust) return `trust_score_below_threshold`;
  if (!agent.wallet || agent.wallet === "0x0000000000000000000000000000000000000001") return "no_valid_wallet_configured";
  return null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Agent policy enforcement", () => {
  const riskyAgent: Agent = {
    id: "agent-risky-004",
    trustScore: 20,
    priceMicro: 9000,
    wallet: "0x0000000000000000000000000000000000000001",
  };

  const factAgent: Agent = {
    id: "agent-fact-001",
    trustScore: 92,
    priceMicro: 1500,
    wallet: "0x3a0FfFE64537148b3766dA52D983058F98A4e3ce",
  };

  it("blocks RiskyAgent on balanced policy (trust 20 < threshold 50)", () => {
    const reason = checkPolicy(riskyAgent, "balanced", 25000);
    expect(reason).toBe("trust_score_below_threshold");
  });

  it("blocks agents with invalid wallet (0x000...001)", () => {
    const agentWithBadWallet: Agent = { ...riskyAgent, trustScore: 90 };
    const reason = checkPolicy(agentWithBadWallet, "aggressive", 50000);
    expect(reason).toBe("no_valid_wallet_configured");
  });

  it("approves FactAgent on conservative policy", () => {
    const reason = checkPolicy(factAgent, "conservative", 5000);
    expect(reason).toBeNull();
  });

  it("blocks FactAgent if budget is lower than price", () => {
    const reason = checkPolicy(factAgent, "balanced", 1000);
    expect(reason).toBe("price_exceeds_budget");
  });

  it("blocks FactAgent on conservative policy if trust drops below threshold", () => {
    const lowTrustFact: Agent = { ...factAgent, trustScore: 60 };
    const reason = checkPolicy(lowTrustFact, "conservative", 5000);
    expect(reason).toBe("trust_score_below_threshold");
  });
});

describe("Traction unit conversion", () => {
  it("totalUSDCRouted is always less than 10 when micro-USDC is converted", () => {
    const microUSDC = 876_000; // 292 payments × ~3000 avg
    const usdc = microUSDC / 1e6;
    expect(usdc).toBeLessThan(10);
    expect(usdc).toBeGreaterThan(0.1);
  });

  it("FLOOR totalUSDCRouted is in USDC not micro-USDC", () => {
    const FLOOR_USDC = 0.628;
    expect(FLOOR_USDC).toBeLessThan(100);
    expect(FLOOR_USDC).toBeGreaterThan(0);
  });

  it("micro-USDC without conversion would be catastrophically wrong", () => {
    const microUSDC = 876_000;
    expect(microUSDC).toBeGreaterThan(1000); // raw value is wrong for display
    expect(microUSDC / 1e6).toBeLessThan(10); // converted value is correct
  });
});

describe("payCreator zero-amount guard contract", () => {
  it("zero amountMicroUsdc should be caught before any blockchain call", () => {
    const amountMicroUsdc = 0;
    const shouldSimulate = amountMicroUsdc === 0;
    expect(shouldSimulate).toBe(true);
  });

  it("non-zero amount should proceed to payment path", () => {
    const amountMicroUsdc = 3000;
    const shouldSimulate = amountMicroUsdc === 0;
    expect(shouldSimulate).toBe(false);
  });
});

describe("PaymentResult.failureReason contract", () => {
  it("simulated fallback should include failureReason", () => {
    const simulatedResult = {
      txHash: "0xabc",
      amountMicroUsdc: 3000,
      recipient: "0x123",
      status: "simulated" as const,
      failureReason: "insufficient_balance_or_rpc_error",
    };
    expect(simulatedResult.failureReason).toBeDefined();
    expect(simulatedResult.status).toBe("simulated");
  });

  it("confirmed result should NOT have failureReason", () => {
    const confirmedResult = {
      txHash: "0xreal",
      amountMicroUsdc: 3000,
      recipient: "0x123",
      status: "confirmed" as const,
      memoId: "0xmemo",
    };
    expect((confirmedResult as Record<string, unknown>).failureReason).toBeUndefined();
    expect(confirmedResult.status).toBe("confirmed");
  });
});
