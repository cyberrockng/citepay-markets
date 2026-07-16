# MCP integration — Claude Code / Claude Desktop / any MCP client

Zero HTTP code required. `citepay-mcp` is a thin stdio proxy that exposes
`clear_claim`, `get_clearance`, and `settle_clearance` (plus the original
Markets tools) as MCP tools.

## Install

**Claude Code:**

```bash
claude mcp add citepay -e CITEPAY_API_KEY=cpk_your_key_here -- npx -y citepay-mcp
```

**Claude Desktop / any JSON-config MCP client** (`claude_desktop_config.json`
or equivalent):

```json
{
  "mcpServers": {
    "citepay": {
      "command": "npx",
      "args": ["-y", "citepay-mcp"],
      "env": { "CITEPAY_API_KEY": "cpk_your_key_here" }
    }
  }
}
```

`get_clearance` works with no key at all — only `clear_claim` and
`settle_clearance` need `CITEPAY_API_KEY`.

## The pattern: refuse to cite unless cleared

This is the part that actually matters — not just that the tool is wired in,
but that the agent is instructed to treat a non-`CLEARED` result as a hard
stop. Put something like this in your system prompt:

```
Before you quote or cite any external source in your answer, call
clear_claim with the exact claim, the exact quote, and the source.

- If the result's decision is CLEARED, you may cite it.
- If the decision is anything else (UNSUPPORTED, BLOCKED_LICENSE,
  BLOCKED_POLICY, OVER_CAP), do NOT use that quote. Either find a
  different, verifiable quote from the same source, or tell the user
  the citation could not be verified. Never present an unverified
  quote as if it were confirmed.
```

## Example session

A prompt like this, against a live-wired agent, exercises the whole loop:

```
Fetch the CitePay Clear documentation and cite the exact sentence that
explains what a "receipt" is. Verify the citation with clear_claim before
including it in your answer.
```

Watch for two outcomes depending on whether the agent quotes accurately:
a real, exact quote clears; a paraphrased or slightly-off quote gets
refused — even if the agent was confident about it. That refusal, not the
happy path, is the actual proof the integration is doing something real.

## Settling a cleared claim

`settle_clearance` needs a `mandateConfigId` — create one once via REST
(no MCP tool for this yet):

```bash
curl -X POST https://citepay-markets.vercel.app/api/clear/mandate \
  -H "Authorization: Bearer $CITEPAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"my agent policy","requiredLicenseClass":"standard","maxPricePerCitationMicro":100000,"totalBudgetMicro":5000000}'
```

Then pass the returned `mandateConfigId` as `policy.mandateConfigId` in
`clear_claim`, and as `mandateConfigId` in `settle_clearance`.

See [`docs/AGENTS.md`](../../docs/AGENTS.md) in the main repo for the full
tool reference.
