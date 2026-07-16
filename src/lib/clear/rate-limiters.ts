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

/**
 * Public GET surfaces (no API key) — keyed by IP instead of key hash.
 * Generous limits: badges/receipts are meant to be embedded and viewed
 * by many legitimate visitors, not just the publisher checking it once.
 */
export const clearGetRateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxPerWindow: 30,
  lifetimeCap: 600,
});

export const clearBadgeRateLimiter = createRateLimiter({
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
