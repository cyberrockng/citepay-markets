# CitePay Clear — Agent Integration Examples

Three real, working ways to wire an agent through CitePay Clear before it cites
or pays for a source. All three implement the same pattern: **check, then
decide** — a claim/quote/source gets checked, and the agent only cites or
pays when the decision is `CLEARED`.

| Example | For agents that... | Integration path |
|---|---|---|
| [`mcp-agent/`](./mcp-agent) | Run in Claude Code, Claude Desktop, or any MCP-compatible client | `citepay-mcp` — zero HTTP code |
| [`node-rest-agent/`](./node-rest-agent) | Are custom TypeScript/JavaScript agents (LangChain.js, custom loops) | Direct REST calls |
| [`python-agent/`](./python-agent) | Are Python agents (LangChain, custom loops) | Direct REST calls, stdlib only |

All three hit the same live API (`https://citepay-markets.vercel.app`) and the
same underlying check — pick whichever matches your stack, not a "best" one.

## Getting an API key

Keys aren't self-serve yet. Ask the CitePay team for a `cpk_...` key scoped to
your use case. `get_clearance` / `GET /api/clear/[id]` are public and need no
key — only checking and settling do.

## The pattern, in one sentence

Call `clear_claim` (or `POST /api/clear/check`) with the claim, the exact
quote, and the source. If `decision !== "CLEARED"`, don't cite it and don't
pay for it — the check is deterministic, so a high AI confidence score can
never force a pass on a quote that isn't actually in the source.

## Badge embed

After `clear_claim`, link the public receipt and badge together:

```html
<a href="https://citepay-markets.vercel.app/clearance/clr_..."><img alt="CitePay clearance badge" src="https://citepay-markets.vercel.app/api/clear/clr_.../badge" /></a>
```

The same copy-paste snippet appears on each `/clearance/<id>` receipt page.
Badge states are `Cleared`, `Cleared Paid`, `Not cleared`, and `Not found`.
