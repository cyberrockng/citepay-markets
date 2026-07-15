import { createHash, randomBytes } from "crypto";
import type { ClearApiKeyRecord } from "./types";
import { getClearApiKeyByHash } from "@/lib/db";
import { getNeonClearApiKeyByHash } from "@/lib/neon";

export interface ClearApiAuth {
  keyHash: string;
  keyPrefix: string;
  ownerLabel: string;
  tier: string;
}

export type ClearApiAuthResult =
  | { ok: true; auth: ClearApiAuth }
  | { ok: false; status: 401; error: string };

const KEY_PREFIX = "cpk_";
const KEY_BYTES = 24;

export function hashClearApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateClearApiKey(): string {
  return `${KEY_PREFIX}${randomBytes(KEY_BYTES).toString("base64url")}`;
}

export function buildClearApiKeyRecord(rawKey: string, ownerLabel: string, nowIso = new Date().toISOString()): ClearApiKeyRecord {
  if (!rawKey.startsWith(KEY_PREFIX)) {
    throw new Error(`Clear API keys must start with ${KEY_PREFIX}`);
  }
  return {
    keyHash: hashClearApiKey(rawKey),
    keyPrefix: rawKey.slice(0, 12),
    ownerLabel,
    tier: "stage2",
    revokedAt: null,
    createdAt: nowIso,
  };
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function authFromRecord(record: ClearApiKeyRecord): ClearApiAuth {
  return {
    keyHash: record.keyHash,
    keyPrefix: record.keyPrefix,
    ownerLabel: record.ownerLabel,
    tier: record.tier,
  };
}

export async function authenticateClearApiRequest(req: { headers: { get(name: string): string | null } }): Promise<ClearApiAuthResult> {
  const token = bearerToken(req.headers.get("authorization"));
  if (!token || !token.startsWith(KEY_PREFIX) || token.length < KEY_PREFIX.length + 16) {
    return { ok: false, status: 401, error: "Missing or invalid Clear API key." };
  }

  const keyHash = hashClearApiKey(token);
  const record = getClearApiKeyByHash(keyHash) ?? await getNeonClearApiKeyByHash(keyHash);
  if (!record || record.revokedAt) {
    return { ok: false, status: 401, error: "Missing or invalid Clear API key." };
  }

  return { ok: true, auth: authFromRecord(record) };
}
