import { describe, expect, it } from "vitest";
import { buildClearApiKeyRecord, CLEAR_SCOPE_CLEAR_CHECK } from "../src/lib/clear/auth";
import { insertClearApiKey } from "../src/lib/db";
import { CLEAR_MCP_TOOL_DEFS, CLEAR_MCP_TOOL_NAMES, handleClearMcpToolCall } from "../src/lib/clear/mcp-tools";

// Unit fixtures must never be persisted to durable project storage.
delete process.env.DATABASE_URL;

const SOURCE_TEXT = "Exact source evidence supports the cleared claim. Additional context follows.";
const QUOTE = "Exact source evidence supports the cleared claim.";

function reqWithBearer(token: string | null) {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === "authorization" && token ? `Bearer ${token}` : null),
    },
  };
}

describe("CitePay Clear MCP tools", () => {
  it("exposes exactly clear_claim, get_clearance, and settle_clearance", () => {
    expect(CLEAR_MCP_TOOL_NAMES).toEqual(new Set(["clear_claim", "get_clearance", "settle_clearance"]));
    const names = CLEAR_MCP_TOOL_DEFS.map((t) => t.name);
    expect(names).toEqual(["clear_claim", "get_clearance", "settle_clearance"]);
    for (const tool of CLEAR_MCP_TOOL_DEFS) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("get_clearance requires no auth and 404s for an unknown id", async () => {
    const result = await handleClearMcpToolCall("get_clearance", { clearanceId: "clr_does_not_exist" }, reqWithBearer(null), "https://citepay.test");
    expect(result.status).toBe(404);
  });

  it("get_clearance rejects a missing clearanceId", async () => {
    const result = await handleClearMcpToolCall("get_clearance", {}, reqWithBearer(null), "https://citepay.test");
    expect(result.status).toBe(400);
  });

  it("clear_claim rejects requests with no Clear API key", async () => {
    const result = await handleClearMcpToolCall("clear_claim", {
      claim: QUOTE,
      quote: QUOTE,
      source: { text: SOURCE_TEXT, label: "Inline source", licenseClass: "standard" },
      policy: { maxPricePerCitationMicro: 0, requiredLicenseClass: "standard" },
    }, reqWithBearer(null), "https://citepay.test");
    expect(result.status).toBe(401);
  });

  it("clear_claim with a valid key clears a real quote, and get_clearance reads it back via the same lookup path used by REST", async () => {
    const rawKey = "cpk_test_mcp_clear_claim_key_1234567890";
    insertClearApiKey(buildClearApiKeyRecord(rawKey, "mcp-owner", "2026-07-15T00:00:00.000Z"));

    const checkResult = await handleClearMcpToolCall("clear_claim", {
      claim: QUOTE,
      quote: QUOTE,
      source: { text: SOURCE_TEXT, label: "Inline source", licenseClass: "standard" },
      policy: { maxPricePerCitationMicro: 0, requiredLicenseClass: "standard" },
      visibility: "public",
    }, reqWithBearer(rawKey), "https://citepay.test");

    expect(checkResult.status).toBe(200);
    const body = checkResult.body as { clearanceId: string; decision: string };
    expect(body.decision).toBe("CLEARED");

    const lookup = await handleClearMcpToolCall("get_clearance", { clearanceId: body.clearanceId }, reqWithBearer(null), "https://citepay.test");
    expect(lookup.status).toBe(200);
    const lookupBody = lookup.body as { decision: string; clearance: { visibility: string } };
    expect(lookupBody.decision).toBe("CLEARED");
    expect(lookupBody.clearance.visibility).toBe("public");
  });

  it("settle_clearance requires auth and 404s an unknown clearance for an authenticated caller", async () => {
    const rawKey = "cpk_test_mcp_settle_key_1234567890";
    insertClearApiKey(buildClearApiKeyRecord(rawKey, "mcp-settle-owner", "2026-07-15T00:00:00.000Z"));

    const noAuth = await handleClearMcpToolCall("settle_clearance", {
      clearanceId: "clr_x", mandateConfigId: "mnd_x", idempotencyKey: "idem-1", confirm: true,
    }, reqWithBearer(null), "https://citepay.test");
    expect(noAuth.status).toBe(401);

    const authed = await handleClearMcpToolCall("settle_clearance", {
      clearanceId: "clr_does_not_exist", mandateConfigId: "mnd_does_not_exist", idempotencyKey: "idem-2", confirm: true,
    }, reqWithBearer(rawKey), "https://citepay.test");
    expect(authed.status).toBe(404);
  });

  it("honors scoped keys that can check but cannot settle", async () => {
    const rawKey = "cpk_test_mcp_scoped_check_key_1234567890";
    insertClearApiKey(buildClearApiKeyRecord(rawKey, "mcp-scoped-owner", "2026-07-17T00:00:00.000Z", [CLEAR_SCOPE_CLEAR_CHECK]));

    const checkResult = await handleClearMcpToolCall("clear_claim", {
      claim: QUOTE,
      quote: QUOTE,
      source: { text: SOURCE_TEXT, label: "Inline source", licenseClass: "standard" },
      policy: { maxPricePerCitationMicro: 0, requiredLicenseClass: "standard" },
      visibility: "public",
    }, reqWithBearer(rawKey), "https://citepay.test");
    expect(checkResult.status).toBe(200);

    const settle = await handleClearMcpToolCall("settle_clearance", {
      clearanceId: "clr_no_settle_scope",
      mandateConfigId: "mnd_no_settle_scope",
      idempotencyKey: "idem-no-scope",
      confirm: true,
    }, reqWithBearer(rawKey), "https://citepay.test");
    expect(settle.status).toBe(403);
  });
});
