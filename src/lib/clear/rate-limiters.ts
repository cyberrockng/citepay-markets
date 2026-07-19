import { createHash } from "crypto";
import { checkNeonClearRateLimit } from "@/lib/neon";
import { createRateLimiter, type RateLimitCheckResult, type RateLimiterOptions } from "@/lib/rate-limit";

type ClearRateLimiter = (subject: string) => Promise<RateLimitCheckResult>;

function hashRateLimitSubject(limiterId: string, subject: string): string {
  return createHash("sha256")
    .update(limiterId)
    .update("\0")
    .update(subject)
    .digest("hex");
}

function createClearRateLimiter(limiterId: string, opts: RateLimiterOptions): ClearRateLimiter {
  const memoryCheck = createRateLimiter(opts);

  return async function check(subject: string): Promise<RateLimitCheckResult> {
    const neonResult = await checkNeonClearRateLimit({
      limiterId,
      subjectHash: hashRateLimitSubject(limiterId, subject),
      windowMs: opts.windowMs,
      maxPerWindow: opts.maxPerWindow,
      lifetimeCap: opts.lifetimeCap,
    });
    return neonResult ?? memoryCheck(subject);
  };
}

/**
 * Shared singletons, keyed by API key hash. Both the REST routes and the
 * MCP tool handlers import from here so a caller can't bypass a limit by
 * switching transport.
 */
export const clearCheckRateLimiter = createClearRateLimiter("clear_check", {
  windowMs: 60_000,
  maxPerWindow: 30,
  lifetimeCap: 300,
});

export const clearSettleRateLimiter = createClearRateLimiter("clear_settle", {
  windowMs: 60_000,
  maxPerWindow: 10,
  lifetimeCap: 100,
});

export const clearMandateRateLimiter = createClearRateLimiter("clear_mandate", {
  windowMs: 60_000,
  maxPerWindow: 10,
  lifetimeCap: 100,
});

/**
 * Public GET surfaces (no API key) — keyed by IP instead of key hash.
 * Generous limits: badges/receipts are meant to be embedded and viewed
 * by many legitimate visitors, not just the publisher checking it once.
 */
export const clearGetRateLimiter = createClearRateLimiter("clear_get", {
  windowMs: 60_000,
  maxPerWindow: 30,
  lifetimeCap: 600,
});

export const clearBadgeRateLimiter = createClearRateLimiter("clear_badge", {
  windowMs: 60_000,
  maxPerWindow: 60,
  lifetimeCap: 1200,
});

export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
