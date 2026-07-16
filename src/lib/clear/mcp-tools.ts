import { authenticateClearApiRequest } from "./auth";
import { runClearCheck } from "./check";
import { runClearSettle } from "./settle-api";
import { getClearanceById } from "./get-clearance";
import { clearCheckRateLimiter, clearGetRateLimiter, clearSettleRateLimiter, getClientIp } from "./rate-limiters";

type JsonObject = Record<string, unknown>;
type RequestLike = { headers: { get(name: string): string | null } };

export const CLEAR_MCP_TOOL_DEFS = [
  {
    name: "clear_claim",
    description:
      "Check whether a claim/quote/source citation clears for payment before you cite or pay for it. " +
      "Verifies the exact quote exists in the source (deterministic — no support score can override a failed match), " +
      "scores claim support, checks license/policy, and returns one decision: CLEARED, UNSUPPORTED, BLOCKED_LICENSE, " +
      "BLOCKED_POLICY, or OVER_CAP. Requires a CitePay Clear API key (cpk_...) via the CITEPAY_API_KEY env var.",
    inputSchema: {
      type: "object",
      properties: {
        claim: { type: "string", description: "The claim being made, up to 1000 characters." },
        quote: { type: "string", description: "The exact quoted text, up to 2000 characters." },
        source: {
          type: "object",
          description: "Exactly one of onChainId (registered catalog source) or text (inline source).",
          properties: {
            onChainId: { type: "string", description: "Numeric on-chain source id, as a string." },
            text: { type: "string", description: "Inline source text, up to 20000 characters." },
            label: { type: "string", description: "Label for an inline source." },
            priceMicro: { type: "number", description: "Inline source price in micro-USDC." },
            licenseClass: { type: "string", description: "Inline source license class." },
          },
        },
        policy: {
          type: "object",
          description: "Exactly one of mandateConfigId (existing mandate) or inline policy fields.",
          properties: {
            mandateConfigId: { type: "string", description: "Existing mandate id from POST /api/clear/mandate." },
            maxPricePerCitationMicro: { type: "number" },
            requiredLicenseClass: { type: "string" },
            minSupportScore: { type: "number" },
          },
        },
        externalRef: { type: "string", description: "Optional caller reference, up to 128 characters." },
        visibility: {
          type: "string",
          enum: ["public", "private_hash_only"],
          description: "Defaults to private_hash_only, which redacts claim/quote text on the public receipt.",
        },
      },
      required: ["claim", "quote", "source", "policy"],
    },
  },
  {
    name: "get_clearance",
    description:
      "Fetch a CitePay Clear clearance receipt by id. Returns the decision, content hash, visibility, and settlement " +
      "status (with tx hash if paid). Public — no API key required.",
    inputSchema: {
      type: "object",
      properties: {
        clearanceId: { type: "string", description: "The clearance id returned by clear_claim, e.g. clr_...." },
      },
      required: ["clearanceId"],
    },
  },
  {
    name: "settle_clearance",
    description:
      "Settle a previously CLEARED clearance against a mandate's budget. Re-evaluates against the mandate's current " +
      "state before paying — a CLEARED decision at check time is never trusted as final. Idempotent by idempotencyKey. " +
      "Requires a CitePay Clear API key (cpk_...) via the CITEPAY_API_KEY env var.",
    inputSchema: {
      type: "object",
      properties: {
        clearanceId: { type: "string" },
        mandateConfigId: { type: "string" },
        idempotencyKey: { type: "string", description: "Caller-supplied unique key, up to 64 characters, so retries are safe." },
        confirm: { type: "boolean", description: "Must be true to actually settle." },
      },
      required: ["clearanceId", "mandateConfigId", "idempotencyKey", "confirm"],
    },
  },
] as const;

export const CLEAR_MCP_TOOL_NAMES: Set<string> = new Set(CLEAR_MCP_TOOL_DEFS.map((t) => t.name));

export interface ClearMcpToolResult {
  status: number;
  body: unknown;
}

/** Shared by the MCP route's tools/call dispatch — one auth+ratelimit+dispatch path per tool. */
export async function handleClearMcpToolCall(
  name: string,
  args: JsonObject,
  req: RequestLike,
  baseUrl: string
): Promise<ClearMcpToolResult> {
  if (name === "get_clearance") {
    const rl = clearGetRateLimiter(getClientIp(req));
    if (!rl.allowed) return { status: 429, body: { error: rl.reason } };
    const clearanceId = typeof args.clearanceId === "string" ? args.clearanceId.trim() : "";
    if (!clearanceId) return { status: 400, body: { error: "clearanceId is required." } };
    const result = await getClearanceById(clearanceId);
    if (!result) return { status: 404, body: { error: "Clearance not found" } };
    return { status: 200, body: result };
  }

  const auth = await authenticateClearApiRequest(req);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  if (name === "clear_claim") {
    const rl = clearCheckRateLimiter(auth.auth.keyHash);
    if (!rl.allowed) return { status: 429, body: { error: rl.reason } };
    return runClearCheck(args, auth.auth, baseUrl);
  }

  if (name === "settle_clearance") {
    const rl = clearSettleRateLimiter(auth.auth.keyHash);
    if (!rl.allowed) return { status: 429, body: { error: rl.reason } };
    return runClearSettle(args, auth.auth, baseUrl);
  }

  return { status: 404, body: { error: `Unknown Clear tool: ${name}` } };
}
