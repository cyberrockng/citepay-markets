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
  "visibility": "private_hash_only"              // default; use "public" to show claim/quote text on the receipt
}
```

Returns `decision` (`CLEARED` / `UNSUPPORTED` / `BLOCKED_LICENSE` / `BLOCKED_POLICY` / `OVER_CAP`),
`clearanceId`, `receiptUrl`, and `contentHash`.

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

## Full loop

1. `POST /api/clear/mandate` once (REST) → `mandateConfigId`
2. `clear_claim` before every citation → `CLEARED` or a refusal
3. `settle_clearance` only on `CLEARED` clearances you intend to pay
4. `get_clearance` any time to check status or show a receipt
