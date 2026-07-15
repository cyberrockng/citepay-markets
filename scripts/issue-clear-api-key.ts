import { buildClearApiKeyRecord, generateClearApiKey } from "../src/lib/clear/auth";
import { insertClearApiKey } from "../src/lib/db";
import { upsertNeonClearApiKey } from "../src/lib/neon";

async function main() {
  const ownerLabel = process.argv.slice(2).join(" ").trim();
  if (!ownerLabel) {
    console.error("Usage: npx tsx scripts/issue-clear-api-key.ts <owner-label>");
    process.exit(1);
  }

  const rawKey = generateClearApiKey();
  const record = buildClearApiKeyRecord(rawKey, ownerLabel);
  insertClearApiKey(record);
  await upsertNeonClearApiKey(record);

  console.log("Clear API key created. Store this value now; it will not be shown again.");
  console.log(rawKey);
  console.log(`prefix=${record.keyPrefix}`);
  console.log(`owner=${record.ownerLabel}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
