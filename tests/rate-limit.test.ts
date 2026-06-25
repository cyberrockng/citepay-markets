import { describe, it, expect } from "vitest";
import { createRateLimiter } from "../src/lib/rate-limit";

describe("createRateLimiter", () => {
  it("allows first request", () => {
    const check = createRateLimiter({ windowMs: 5000 });
    expect(check("ip1").allowed).toBe(true);
  });

  it("blocks second request within window", () => {
    const check = createRateLimiter({ windowMs: 5000 });
    check("ip2");
    expect(check("ip2").allowed).toBe(false);
  });

  it("blocks different IPs independently", () => {
    const check = createRateLimiter({ windowMs: 5000 });
    check("ip3");
    expect(check("ip4").allowed).toBe(true);
  });

  it("enforces lifetime cap", () => {
    const check = createRateLimiter({ windowMs: 0, lifetimeCap: 2 });
    expect(check("ip5").allowed).toBe(true);
    expect(check("ip5").allowed).toBe(true);
    const third = check("ip5");
    expect(third.allowed).toBe(false);
    expect(third.reason).toContain("limit");
  });

  it("returns retryAfterMs when blocked by window", () => {
    const check = createRateLimiter({ windowMs: 8000 });
    check("ip6");
    const result = check("ip6");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs!).toBeLessThanOrEqual(8000);
  });

  it("allows request after window expires (simulated via 0ms window)", () => {
    const check = createRateLimiter({ windowMs: 0 });
    check("ip7");
    expect(check("ip7").allowed).toBe(true);
  });
});
