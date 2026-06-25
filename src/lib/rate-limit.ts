/**
 * Shared in-memory rate limiter for payment-triggering endpoints.
 * Per-IP: configurable cooldown window + lifetime request cap.
 * State survives within a Vercel instance; resets on cold start (by design).
 */
export function createRateLimiter(opts: {
  windowMs: number;
  maxPerWindow?: number;
  lifetimeCap?: number;
}) {
  const timestamps = new Map<string, number>();
  const counts = new Map<string, number>();

  return function check(ip: string): { allowed: boolean; retryAfterMs?: number; reason?: string } {
    const now = Date.now();
    const last = timestamps.get(ip) ?? 0;
    const count = counts.get(ip) ?? 0;
    const elapsed = now - last;

    if (opts.windowMs > 0 && elapsed < opts.windowMs) {
      const wait = opts.windowMs - elapsed;
      return {
        allowed: false,
        retryAfterMs: wait,
        reason: `Rate limit: wait ${Math.ceil(wait / 1000)}s`,
      };
    }

    const cap = opts.lifetimeCap ?? 50;
    if (count >= cap) {
      return { allowed: false, reason: "Session request limit reached" };
    }

    timestamps.set(ip, now);
    counts.set(ip, count + 1);
    return { allowed: true };
  };
}
