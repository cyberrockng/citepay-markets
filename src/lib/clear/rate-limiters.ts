import { createRateLimiter } from "@/lib/rate-limit";

/**
 * Shared singletons, keyed by API key hash. Both the REST routes and the
 * MCP tool handlers import from here so a caller can't bypass a limit by
 * switching transport.
 */
export const clearCheckRateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxPerWindow: 30,
  lifetimeCap: 300,
});

export const clearSettleRateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxPerWindow: 10,
  lifetimeCap: 100,
});

export const clearMandateRateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxPerWindow: 10,
  lifetimeCap: 100,
});
