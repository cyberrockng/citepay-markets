import { describe, expect, it } from "vitest";
import { verifyQuoteSpan } from "../src/lib/clear/quote-verify";

describe("verifyQuoteSpan", () => {
  it("verifies an exact quote and returns original offsets", () => {
    const text = "Arc enables USDC-native settlement for agents.";
    const result = verifyQuoteSpan("USDC-native settlement", text);
    expect(result.verified).toBe(true);
    expect(text.slice(result.quoteStart, result.quoteEnd)).toBe("USDC-native settlement");
  });

  it("normalizes whitespace and case", () => {
    const text = "Agents pay creators\nwith tiny USDC receipts.";
    const result = verifyQuoteSpan("agents   pay creators with TINY usdc receipts", text);
    expect(result.verified).toBe(true);
  });

  it("normalizes unicode compatibility characters", () => {
    const text = "Creator receives ＵＳＤＣ after clearance.";
    const result = verifyQuoteSpan("usdc after clearance", text);
    expect(result.verified).toBe(true);
  });

  it("rejects absent quotes", () => {
    const result = verifyQuoteSpan("this text is not present", "Only exact source spans can pass.");
    expect(result.verified).toBe(false);
    expect(result.quoteStart).toBe(-1);
  });

  it("does not allow a high advisory score to override absent quote verification", () => {
    const advisorySupportScore = 96;
    const result = verifyQuoteSpan("paraphrased idea about x402", "x402 returns HTTP 402 payment challenges.");
    const decision = result.verified && advisorySupportScore >= 80 ? "CLEARED" : "UNSUPPORTED";
    expect(result.verified).toBe(false);
    expect(decision).toBe("UNSUPPORTED");
  });
});
