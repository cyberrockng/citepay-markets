export interface RateLimiterOptions {
  windowMs: number;
  maxPerWindow?: number;
  lifetimeCap?: number;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterMs?: number;
  reason?: string;
}

/**
 * Shared in-memory rate limiter for payment-triggering endpoints.
 * Per-IP: configurable cooldown window + lifetime request cap.
 * State survives within a Vercel instance; resets on cold start (by design).
 */
export function createRateLimiter(opts: RateLimiterOptions) {
  const timestamps = new Map<string, number>();
  const windows = new Map<string, { startedAt: number; count: number }>();
  const counts = new Map<string, number>();

  return function check(ip: string): RateLimitCheckResult {
    const now = Date.now();
    const count = counts.get(ip) ?? 0;

    const cap = opts.lifetimeCap ?? 50;
    if (count >= cap) {
      return { allowed: false, reason: "Session request limit reached" };
    }

    if (opts.maxPerWindow !== undefined) {
      const existing = windows.get(ip);
      const windowState = !existing || now - existing.startedAt >= opts.windowMs
        ? { startedAt: now, count: 0 }
        : existing;

      if (windowState.count >= opts.maxPerWindow) {
        const wait = Math.max(0, opts.windowMs - (now - windowState.startedAt));
        return {
          allowed: false,
          retryAfterMs: wait,
          reason: `Rate limit: wait ${Math.ceil(wait / 1000)}s`,
        };
      }

      windowState.count += 1;
      windows.set(ip, windowState);
      counts.set(ip, count + 1);
      return { allowed: true };
    }

    const last = timestamps.get(ip) ?? 0;
    const elapsed = now - last;

    if (opts.windowMs > 0 && elapsed < opts.windowMs) {
      const wait = opts.windowMs - elapsed;
      return {
        allowed: false,
        retryAfterMs: wait,
        reason: `Rate limit: wait ${Math.ceil(wait / 1000)}s`,
      };
    }

    timestamps.set(ip, now);
    counts.set(ip, count + 1);
    return { allowed: true };
  };
}
