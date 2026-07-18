import { hashClearApiKey } from "../src/lib/clear/auth";
import { getClearApiKeyByHash, revokeClearApiKey } from "../src/lib/db";
import { getNeonClearApiKeyByHash, isNeonEnabled } from "../src/lib/neon";

const NEON_VERIFY_ATTEMPTS = 5;
const NEON_VERIFY_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  // Always attempt the write, even if a local or already-fetched record claims this key is
  // revoked — revokeClearApiKey's UPDATE is idempotent, and a prior run may have recorded the
  // revocation locally while its fire-and-forget Neon write silently failed (network flakiness
  // or otherwise). Trusting that local/cached state here was itself a real gap: it let a script
  // that failed to revoke the *authoritative* production store still print "Revoked"/"Already
  // revoked" with nothing to indicate the key was still live. Not acceptable for a tool whose
  // whole purpose is killing a credential.
  await revokeClearApiKey(keyHash);

  if (!isNeonEnabled()) {
    console.log(`Revoked locally (no DATABASE_URL — nothing to verify against Neon). owner=${existing.ownerLabel} prefix=${existing.keyPrefix} keyHash=${keyHash}`);
    return;
  }

  for (let attempt = 1; attempt <= NEON_VERIFY_ATTEMPTS; attempt++) {
    const row = await getNeonClearApiKeyByHash(keyHash);
    if (row?.revokedAt) {
      console.log(`Revoked and verified in Neon (revokedAt=${row.revokedAt}). owner=${existing.ownerLabel} prefix=${existing.keyPrefix} keyHash=${keyHash}`);
      return;
    }
    if (attempt < NEON_VERIFY_ATTEMPTS) {
      console.error(`[verify ${attempt}/${NEON_VERIFY_ATTEMPTS}] revoked_at not yet visible in Neon — retrying the write.`);
      await revokeClearApiKey(keyHash);
      await sleep(NEON_VERIFY_DELAY_MS);
    }
  }

  console.error(`FAILED: could not verify revocation in Neon after ${NEON_VERIFY_ATTEMPTS} attempts. The key may still be live in production. Re-run this script or check Neon connectivity directly before telling anyone this credential is dead.`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
