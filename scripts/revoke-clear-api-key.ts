import { hashClearApiKey } from "../src/lib/clear/auth";
import { getClearApiKeyByHash, revokeClearApiKey } from "../src/lib/db";
import { getNeonClearApiKeyByHash } from "../src/lib/neon";

async function main() {
  const rawKeyOrHash = process.argv[2]?.trim();
  if (!rawKeyOrHash) {
    console.error("Usage: npx tsx scripts/revoke-clear-api-key.ts <cpk_... key OR its sha256 hash>");
    process.exit(1);
  }

  const keyHash = rawKeyOrHash.startsWith("cpk_") ? hashClearApiKey(rawKeyOrHash) : rawKeyOrHash;
  const existing = getClearApiKeyByHash(keyHash) ?? await getNeonClearApiKeyByHash(keyHash);
  if (!existing) {
    console.error(`No Clear API key found for that value (hash=${keyHash}).`);
    process.exit(1);
  }
  if (existing.revokedAt) {
    console.log(`Already revoked at ${existing.revokedAt} (owner=${existing.ownerLabel}, prefix=${existing.keyPrefix}).`);
    return;
  }

  await revokeClearApiKey(keyHash);
  console.log(`Revoked. owner=${existing.ownerLabel} prefix=${existing.keyPrefix} keyHash=${keyHash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
