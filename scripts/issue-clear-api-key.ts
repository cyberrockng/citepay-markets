import { buildClearApiKeyRecord, CLEAR_API_SCOPES, generateClearApiKey } from "../src/lib/clear/auth";
import { insertClearApiKey } from "../src/lib/db";
import { upsertNeonClearApiKey } from "../src/lib/neon";

function parseArgs(args: string[]): { ownerLabel: string; scopes: string[] | null } {
  const scopesArg = args.find((arg) => arg.startsWith("--scopes="));
  const scopes = scopesArg
    ? scopesArg.slice("--scopes=".length).split(",").map((scope) => scope.trim()).filter(Boolean)
    : null;
  if (scopes) {
    for (const scope of scopes) {
      if (!CLEAR_API_SCOPES.has(scope)) {
        throw new Error(`Unknown scope "${scope}". Valid scopes: ${[...CLEAR_API_SCOPES].join(", ")}`);
      }
    }
  }
  const ownerLabel = args.filter((arg) => !arg.startsWith("--scopes=")).join(" ").trim();
  return { ownerLabel, scopes };
}

async function main() {
  const { ownerLabel, scopes } = parseArgs(process.argv.slice(2));
  if (!ownerLabel) {
    console.error("Usage: npx tsx scripts/issue-clear-api-key.ts [--scopes=mandate:create,clear:check] <owner-label>");
    process.exit(1);
  }

  const rawKey = generateClearApiKey();
  const record = buildClearApiKeyRecord(rawKey, ownerLabel, new Date().toISOString(), scopes);
  insertClearApiKey(record);
  await upsertNeonClearApiKey(record);

  console.log("Clear API key created. Store this value now; it will not be shown again.");
  console.log(rawKey);
  console.log(`prefix=${record.keyPrefix}`);
  console.log(`owner=${record.ownerLabel}`);
  console.log(`scopes=${record.scopes ? record.scopes.join(",") : "all"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
