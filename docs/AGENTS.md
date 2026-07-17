# CitePay Clear — Agent Quickstart

Check whether a citation deserves payment before you quote or pay for it. One MCP
server, three tools, no manual demo required.

## Install

```json
{
  "mcpServers": {
    "citepay": {
      "command": "npx",
      "args": ["-y", "citepay-mcp"],
      "env": { "CITEPAY_API_KEY": "cpk_..." }
    }
  }
}
```

Claude Code: `claude mcp add citepay -e CITEPAY_API_KEY=cpk_... -- npx -y citepay-mcp`

`CITEPAY_API_KEY` is only required for `clear_claim` and `settle_clearance`.
`get_clearance` is public.

## Tools

### `clear_claim`
Check a claim/quote/source against a policy. The quote match is deterministic —
if the exact quote isn't in the source, no support score can force a `CLEARED`.

```jsonc
{
  "claim": "x402 lets agents pay per HTTP request without a subscription.",
  "quote": "x402 lets agents pay per HTTP request without a subscription.",
  "source": { "onChainId": "14" },              // or { "text": "...", "label": "..." }
  "policy": { "mandateConfigId": "mnd_..." },    // or inline: { "maxPricePerCitationMicro": 100000, "requiredLicenseClass": "standard" }
  "externalRef": "shadow-float-request-hash-...",
  "visibility": "private_hash_only"              // default; use "public" to show claim/quote text on the receipt
}
```

Returns `decision` (`CLEARED` / `UNSUPPORTED` / `BLOCKED_LICENSE` / `BLOCKED_POLICY` / `OVER_CAP`),
`clearanceId`, `externalRef`, `receiptUrl`, and `contentHash`.

`externalRef` is optional but recommended for adapters. When it is present, retries
with the same API-key owner, `mandateConfigId`, and `externalRef` return the original
clearance instead of creating a second one. Use this to bind a CitePay clearance to
an upstream signed intent or request hash.

### `get_clearance`
`{ "clearanceId": "clr_..." }` — public, no key needed. Returns the same receipt
shown at `/clearance/<id>`, including `settlement` (`null` until a real on-chain
payment confirms).

### `settle_clearance`
Pays a `CLEARED` clearance against a mandate's budget. Re-evaluates against the
mandate's *current* state before paying — a clearance being `CLEARED` at check
time is never trusted as final.

```jsonc
{
  "clearanceId": "clr_...",
  "mandateConfigId": "mnd_...",
  "idempotencyKey": "unique-per-attempt",
  "confirm": true
}
```

Retrying with the same `idempotencyKey` returns the original result — safe to retry on a timeout.

## Settlement accounting

`settle_clearance` is a **separate downstream creator payout** from the CitePay
agent wallet to the registered source creator. It does not replace an upstream
provider transfer made by another system.

For Shadow Float integrations, the Float transfer pays the configured provider.
Use CitePay `clear_claim` / `get_clearance` as the fail-closed clearance gate,
and do **not** call `settle_clearance` unless both sides explicitly intend a
second creator-payout leg with a separate recipient and amount.

## Settleable end-to-end path (read this before your first integration)

`clear_claim` accepts two source modes, but only one is **settleable**:

- **Inline source** (`source.text`): great for a quick verification of the quote/license/support logic. An inline claim can return `CLEARED`, but it **cannot** be settled — there's no real payout wallet. `clear_claim` tells you this up front: the response carries `"settleable": false` and `"settlementRequirement": "registered_source"`. Calling `settle_clearance` on it returns `422`.
- **Registered source** (`source.onChainId`): a catalog source with a real creator payout wallet. A `CLEARED` result here has `"settleable": true` and can be settled end-to-end.

So the real loop is: `clear_claim` with `source.onChainId` → `CLEARED` (`settleable: true`) → `settle_clearance`.

**Copy-paste settleable vector** (registered source, license `standard`, price 1000 µUSDC — fits the recommended mandate below):

```jsonc
// clear_claim
{
  "claim": "USDC settles instantly on Base.",
  "quote": "USDC is a fully reserved, dollar-backed stablecoin that settles instantly on Base.",
  "source": { "onChainId": "22" },
  "policy": { "mandateConfigId": "mnd_..." }
}
// → decision: "CLEARED", settleable: true  → then settle_clearance that clearanceId
```

Always gate on `settleable === true` (not just `decision === "CLEARED"`) before calling `settle_clearance`.

## Before you settle: create a mandate

There's no MCP tool for this yet — call the REST endpoint once per policy:

```bash
curl -X POST https://citepay-markets.vercel.app/api/clear/mandate \
  -H "Authorization: Bearer $CITEPAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"my policy","requiredLicenseClass":"standard","maxPricePerCitationMicro":100000,"totalBudgetMicro":5000000}'
```

Use the returned `mandateConfigId` as `policy.mandateConfigId` in `clear_claim`,
and as `mandateConfigId` in `settle_clearance`.

## Getting an API key

Keys aren't self-serve yet — request one from the CitePay team. A key looks like `cpk_...`.

Scoped check-only key for provider adapters:

```bash
npx tsx scripts/issue-clear-api-key.ts \
  --scopes=mandate:create,clear:check \
  "shadow-clear-adapter"
```

Legacy keys with no scopes keep full stage2 access. Scoped keys with
`mandate:create,clear:check` can create mandates and run clearance checks; they
cannot call `settle_clearance`.

## V1-V4 JSON vectors

Use these after creating a mandate with `requiredLicenseClass: "standard"` and
`maxPricePerCitationMicro >= 1000`.

### V1 — CLEARED with externalRef

```json
{
  "claim": "USDC settles instantly on Base.",
  "quote": "USDC is a fully reserved, dollar-backed stablecoin that settles instantly on Base.",
  "source": {
    "text": "USDC is a fully reserved, dollar-backed stablecoin that settles instantly on Base.",
    "label": "Shadow vector V1",
    "licenseClass": "standard",
    "priceMicro": 1000
  },
  "policy": { "mandateConfigId": "mnd_..." },
  "externalRef": "shadow-v1-request-hash",
  "visibility": "private_hash_only"
}
```

Expected: `decision: "CLEARED"`, `quoteVerified: true`, `settleable: false`,
`settlementRequirement: "registered_source"`, and `externalRef` echoed.

### V2 — idempotent retry

```json
{
  "claim": "A changed retry payload must not create a new clearance.",
  "quote": "This quote is intentionally absent from the source.",
  "source": {
    "text": "USDC is a fully reserved, dollar-backed stablecoin that settles instantly on Base.",
    "label": "Shadow vector V2 retry",
    "licenseClass": "standard",
    "priceMicro": 1000
  },
  "policy": { "mandateConfigId": "mnd_..." },
  "externalRef": "shadow-v1-request-hash",
  "visibility": "public"
}
```

Expected: the same `clearanceId` and original `decision` returned by V1.

### V3 — UNSUPPORTED absent quote

```json
{
  "claim": "USDC settles instantly on Base.",
  "quote": "This fabricated quote is not present in the source.",
  "source": {
    "text": "USDC is a fully reserved, dollar-backed stablecoin that settles instantly on Base.",
    "label": "Shadow vector V3",
    "licenseClass": "standard",
    "priceMicro": 1000
  },
  "policy": { "mandateConfigId": "mnd_..." },
  "externalRef": "shadow-v3-request-hash",
  "visibility": "private_hash_only"
}
```

Expected: `decision: "UNSUPPORTED"`, `quoteVerified: false`, `amountDueMicro: 0`
on the receipt.

### V4 — OVER_CAP

```json
{
  "claim": "USDC settles instantly on Base.",
  "quote": "USDC is a fully reserved, dollar-backed stablecoin that settles instantly on Base.",
  "source": {
    "text": "USDC is a fully reserved, dollar-backed stablecoin that settles instantly on Base.",
    "label": "Shadow vector V4",
    "licenseClass": "standard",
    "priceMicro": 2000
  },
  "policy": {
    "maxPricePerCitationMicro": 1000,
    "requiredLicenseClass": "standard",
    "minSupportScore": 0
  },
  "externalRef": "shadow-v4-request-hash",
  "visibility": "private_hash_only"
}
```

Expected: `decision: "OVER_CAP"` and no settlement.

## Full loop

1. `POST /api/clear/mandate` once (REST) → `mandateConfigId`
2. `clear_claim` before every citation → `CLEARED` or a refusal
3. `settle_clearance` only on `CLEARED` clearances you intend to pay
4. `get_clearance` any time to check status or show a receipt
