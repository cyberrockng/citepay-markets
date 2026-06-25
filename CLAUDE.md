@AGENTS.md

# CitePay Markets

AI agent citation marketplace where agents pay creators in USDC for sources they cite, settled on Arc Testnet via Circle Gateway x402.

## What this is

- Agents call `POST /api/ask` (x402-gated) or `POST /api/demo-query` (server-side Circle Gateway) to query 10 seeded creator sources
- Every PAY/REFUSE/SKIP decision gets a public receipt with SHA-256 evidence hash
- Receipts are anchored on-chain via `CitePayMarket.sol` on Arc Testnet
- `/api/orchestrate` runs a multi-agent flow: decompose → parallel sub-agents (each paying via Circle Gateway) → synthesize
- `/api/mcp` exposes `cite_query`, `get_receipt`, `check_policy` as Claude tools (JSON-RPC 2.0)

## Chain / contracts

- **Network**: Arc Testnet (chainId 5042002, RPC `https://rpc.testnet.arc.network`)
- **USDC**: `0x3600000000000000000000000000000000000000`
- **CitePayMarket.sol**: `0x396cf1646EbAeF85ee8428C2d9239C46Ae956085`
- **CreatorBond.sol**: `0x7DBa1C67Fd9BA976aE09E744D8cbcC71F805D6C0` (Arc Testnet)
- **CitationMandate.sol**: `0xBad090764dd720B5EdcD8B49e054D5d8Ce13C695` (Arc Testnet)
- **Explorer**: `https://testnet.arcscan.app`

## Key env vars (set on Vercel)

| Var | Purpose |
|-----|---------|
| `AGENT_PRIVATE_KEY` | Agent wallet — pays creators, anchors on-chain |
| `ANTHROPIC_API_KEY` | Claude Haiku for scoring + orchestration |
| `DEMO_BUYER_KEY` | Optional — defaults to `0x1111…1111` deterministic key |
| `SEED_KEY` | Auth for `POST /api/seed` reset endpoint |
| `REGISTER_API_KEY` | Auth for `POST /api/sources/register` |

## Database

SQLite at `/tmp/citepay.db` on Vercel (ephemeral — resets on cold start).  
`getDb()` in `src/lib/db.ts` auto-seeds 10 sources on every cold start via `seedIfEmpty()`.  
Judges can manually reset via the `↺ Reset DB` button on `/demo` or `POST /api/seed`.

## Payment flow

```
Browser → POST /api/demo-query
  → GatewayClient(DEMO_BUYER_KEY).pay("/api/ask")
    → x402 middleware returns 402 with PAYMENT-REQUIRED header
    → GatewayClient signs EIP-3009 + sends Payment-Signature header
    → BatchFacilitatorClient.verify() → Circle Gateway testnet
    → settle() → Arc Testnet USDC transfer
  → /api/ask handler runs, scores sources, pays creators, anchors on-chain
```

## Important file locations

- `src/lib/x402.ts` — x402 middleware + BatchFacilitatorClient setup
- `src/lib/db.ts` — SQLite schema, seed data, all DB helpers
- `src/lib/payments.ts` — on-chain USDC transfers to creators via viem
- `src/lib/anchor.ts` — writes PAY decisions to CitePayMarket.sol; creates CitationMandate per session; checks CreatorBond status
- `src/lib/policy.ts` — conservative/balanced/aggressive agent spend policies
- `src/lib/arc-reader.ts` — cached Arc Testnet CitationPaid + SourceRegistered reader (60s TTL, 9k block chunks)
- `src/lib/rate-limit.ts` — shared `createRateLimiter()` used on all payment-triggering routes
- `src/lib/constants.ts` — CLAUDE_HAIKU_MODEL, contract addresses, CITEPAY_DEPLOY_BLOCK
- `src/app/api/ask/route.ts` — main x402-gated query endpoint
- `src/app/api/demo-query/route.ts` — server-side Circle Gateway buyer
- `src/app/api/orchestrate/route.ts` — multi-agent orchestrator (rate-limited: 1 req/15s per IP)
- `src/app/api/mcp/route.ts` — MCP server (JSON-RPC 2.0)
- `src/app/api/seed/route.ts` — demo reset endpoint

## Agent Commerce Network

- **Route**: `/agent-exchange`
- **Registry**: `agent_registry` table in SQLite (4 demo agents seeded on cold start)
- **Hire receipts**: `agent_hire_receipts` table
- **Policy**: conservative (trust≥75, price≤2000µ) / balanced (trust≥50, price≤5000µ) / aggressive (trust≥20, price≤9999µ)
- **Payments**: `payCreator()` → real USDC on Arc Testnet for approved agents; simulated with `failureReason` on failure
- **Responses**: Claude Haiku per agent specialty (CLAUDE_HAIKU_MODEL constant from `src/lib/constants.ts`)
- **Leaderboard floors**: applied in GET `/api/agent-exchange/register` response (display only, not persisted)
- **policyStatus**: `APPROVED` for selected, `WARNING` for selected-but-warned, `BLOCKED` for rejected
- **Rate limiting**: hire 1/8s per IP (max 20/instance), run 1/10s per IP (max 15/instance)

## Traction three-layer

`/api/traction` merges three sources, always taking the max:
1. **SQLite** (ephemeral) — `amount_paid` is INTEGER micro-USDC, divided by 1e6 for USDC display
2. **Redis/Edge Config** (cross-instance) — persists across cold starts
3. **Arc Testnet** (permanent) — `getArcCitationStats()` returns `citationCount`, `totalAmountMicro`, `uniqueAgents`, `uniqueCreators`

`creatorsPaid` uses live `arcStats.uniqueCreators` (from SourceRegistered events cross-referenced with CitationPaid sourceIds).
