/**
 * Replay guard for x402 payment signatures.
 * Prevents the same payment-signature header from being reused across requests.
 * HMAC-SHA256 fingerprint → timestamp, TTL-pruned on every check (serverless-safe, no setInterval).
 */

import { createHmac } from "crypto";

const TTL_MS = 600_000; // 10 minutes — matches Circle Gateway max timeout
const _seen = new Map<string, number>(); // fingerprint → timestamp

const HMAC_SECRET = process.env.REPLAY_GUARD_SECRET ?? "citepay-replay-guard-v1";

function fingerprint(sig: string): string {
  return createHmac("sha256", HMAC_SECRET).update(sig).digest("hex");
}

function prune(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [fp, ts] of _seen) {
    if (ts < cutoff) _seen.delete(fp);
  }
}

/** Returns true if this signature has been seen within the TTL window. */
export function isReplayed(paymentSignature: string): boolean {
  prune();
  return _seen.has(fingerprint(paymentSignature));
}

/** Records a payment signature as used. Call only after successful verification. */
export function recordSignature(paymentSignature: string): void {
  _seen.set(fingerprint(paymentSignature), Date.now());
}
