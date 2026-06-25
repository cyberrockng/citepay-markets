# CitePay Markets

> **CitePay Markets is the policy and payment layer for autonomous AI citations. Agents enforce configurable Agent Spend Policies, pay creators in real USDC via Circle Gateway on Arc Testnet, and publish tamper-evident Policy Receipts anchored on-chain.**

[![CI](https://github.com/cyberrockng/citepay-markets/actions/workflows/ci.yml/badge.svg)](https://github.com/cyberrockng/citepay-markets/actions/workflows/ci.yml)
[![Arc Testnet](https://img.shields.io/badge/network-Arc%20Testnet-blue)](https://testnet.arcscan.app)
[![x402](https://img.shields.io/badge/payments-x402%20%2B%20Circle%20Gateway-green)](https://x402.org)
[![MCP](https://img.shields.io/badge/MCP-Claude%20Code%20%2F%20Cursor-purple)](https://citepay-markets.vercel.app/mcp)

---

## Judge Quick Start

**Live app:** [citepay-markets.vercel.app](https://citepay-markets.vercel.app)

| Path | What to show |
|---|---|
| `/orchestrate` | Pilot Agent reads onchain reputation → attests plan → hires researcher agents via x402 |
| `/agents` | 3 competing source agents with live Healthy/Watch/Stop reputation from CitationPaid events |
| `/wallet` | Circle DCW + App Kit + Unified Balance Kit + DCW Adapter: live USDC balance across chains |
| `/register` | Public creator onboarding — register content, set price per citation, earn USDC instantly |
| `/audit` | On-chain audit — reads Arc RPC directly, no database; verify wallet balance + every tx |
| `/live` | Real-time SSE agent decision feed (auto-reconnects) |
| `/demo` | Auto-runs 4 proofs: tamper → x402 pay → query → challenge |
| `/ask` | Agent workbench with configurable spend policy + proof console |
| `/receipt/:id` | Receipt with evidence preimage viewer + hash recomputation |
| `/traction` | Live on-chain stats: 700+ agent decisions, 194+ paid citations from CitePayMarket.sol |
| `/mcp` | MCP server install for Claude Code / Cursor integration |

**Contracts:** Arc Testnet (chainId 5042002)  
· [`CitePayMarket`](https://testnet.arcscan.app/address/0x396cf1646EbAeF85ee8428C2d9239C46Ae956085) `0x396cf164…6085`  
· [`CreatorBond`](https://testnet.arcscan.app/address/0x7DBa1C67Fd9BA976aE09E744D8cbcC71F805D6C0) `0x7DBa1C67…D6C0`  
· [`CitationMandate`](https://testnet.arcscan.app/address/0xBad090764dd720B5EdcD8B49e054D5d8Ce13C695) `0xBad09076…C695`  
**Agent wallet:** `0x5389688243328c26a92b301faEEAb5fbf9AFf105`

---

## The Decisive Receipt

CitationPaid receipt #1 at block [48070337](https://testnet.arcscan.app/tx/0xc02c70abadf076c326e4fe393edc6bf0634816b82cf1402127cb96e6116269b0) is the baseline proof: FactAgent's x402 Protocol source (sourceId=1) received a `CitationPaid` event — $0.002 USDC routed to the `@amara_protocol` creator wallet — while the same batch evaluated 9 other sources and produced REFUSE and SKIP decisions for those that fell below the relevance or price threshold. The PAY receipts are immutable. The REFUSE receipts show the policy layer working, not failed volume.

A query run against all three agents simultaneously — FactAgent (conservative), TechAgent (balanced), EconAgent (aggressive) — typically yields:

| Agent | Source | Outcome | Reason |
|---|---|---|---|
| FactAgent | x402 Protocol | **CITED** · $0.002 USDC | High relevance (87/100), bonded creator, fair price |
| TechAgent | Circle Wallets | **CITED** · $0.003 USDC | Relevant to infrastructure query, within budget |
| EconAgent | Agentic AI a16z | **REFUSED** | Relevance below threshold for technical query |
| FactAgent | Content Integrity | **SKIPPED** | Weak match — agent budget already allocated |
| EconAgent | USDC Dollar Internet | **BLOCKED_BY_POLICY** | Source unbonded, policy requires `require_bonded_source` |

One query. Five source agents. Five different outcomes. All decisions signed by the veracity agent and anchored on Arc Testnet via `CitePayMarket.sol`.

**Tx:** [0xc02c70ab…](https://testnet.arcscan.app/tx/0xc02c70abadf076c326e4fe393edc6bf0634816b82cf1402127cb96e6116269b0) · **Block:** 48070337 · **194+ total `CitationPaid` events** on-chain

---

## 1. Product Overview

CitePay Markets is a live agentic citation economy where:

- **3 competing source agents** — FactAgent, TechAgent, EconAgent — publish knowledge claims with distinct specialties and policies. Each has an onchain identity on CitePayMarket.sol. Their reputation is derived entirely from `CitationPaid` events — no editable leaderboard.
- **Pilot Agent** reads each source agent's live onchain reputation, allocates query budget proportionally, and anchors a SHA-256 plan hash onchain before a single USDC token moves.
- **AI veracity agent** (Claude Haiku) receives a query and a USDC budget, evaluates source claims on relevance, price, creator bond, and reputation, subject to a configurable **Agent Spend Policy**.
- **Every decision** — PAY, REFUSE, SKIP, or BLOCKED_BY_POLICY — generates a public receipt with an evidence hash, content hash, payment proof, and human-readable reason.
- **Multi-agent orchestration** — An orchestrator agent decomposes complex queries, hires researcher agents via real x402 Circle Gateway payments, and synthesizes a comprehensive answer. Agent-to-agent USDC flows are live.
- **Circle stack (7 products)**: Gateway + x402 (pay per query), DCW (MPC-secured creator payouts + `signTypedData` Programmable Wallet buyer), App Kit (Unified Balance Kit + Circle Wallets Adapter), Modular Wallets (Circle HSM signs EIP-3009 — no browser key), Gas Station (gasless creator onboarding), CCTP v2 (`POST /api/cctp/fund-creator` — burn on Arc, mint on Base/Ethereum/Arbitrum via Circle Forwarder).
- **MCP server** at `/api/mcp` exposes `cite_query`, `get_receipt`, and `check_policy` as tools for Claude Code and Cursor integration.
- **Purpose taxonomy** — every USDC movement is tagged: `CITE`, `QUERY_FEE`, `AGENT_REWARD`, `BOND_SLASH`. Queryable via `/api/audit-summary`.
- **Citation memory** — source `paidCount` / `refusedCount` persists across serverless cold starts via Vercel Edge Config. Frequently cited sources earn a pre-trust bonus (+8 to +12 score).
- **Public creator registration** — `/register` lets anyone register their content in 60 seconds, no approval, no API key required.

### Live Traction (Arc Testnet)
- **194+ `CitationPaid` events** on CitePayMarket.sol (verifiable: [0x396c…6085](https://testnet.arcscan.app/address/0x396cf1646EbAeF85ee8428C2d9239C46Ae956085))
- **700+ agent decisions** — PAY / REFUSE / SKIP / BLOCKED_BY_POLICY — all with public receipts
- **194+ on-chain citation receipts** anchored via CitePayMarket.sol across 90+ unique queries; creator USDC payout is a separate Arc transaction per receipt
- **9 of 10 creators** received USDC transfers to their registered payout wallets

> Production metrics count only confirmed payout transactions. Simulated receipts (zero-balance fallback, dev/zero-balance mode only) are excluded from confirmed stats at `/api/proof`.
- **10 sources** registered onchain across 3 source agents
- **3 source agent identities** with distinct wallets, specialties, and reputation scores
- **1 Pilot Agent** attesting allocation decisions onchain before paying
- **Citation memory** — source reputation persists across cold starts via Edge Config

---

## 2. Problem

AI agents increasingly answer questions by drawing on creator content — articles, research, documentation, original analysis — without attribution or compensation. Citations are invisible. There is no accountability for which sources an agent chose, why it chose them, or how much it paid.

This creates three problems:

1. **Creators are not compensated** when their work grounds an AI answer.
2. **Agents are not accountable** for their source selection decisions.
3. **Users cannot verify** that citations are earned, not fabricated.

---

## 3. Solution

CitePay Markets solves all three:

1. A user or agent pays a small USDC fee via **Circle Gateway x402** to submit a query.
2. CitePay's **buyer agent** (Claude Haiku) searches the creator source market.
3. The agent scores each source on **relevance, price, creator bond, and reputation**, subject to a configurable **Agent Spend Policy**.
4. The agent **pays** the best sources in USDC, **refuses** overpriced or weak ones, **skips** irrelevant ones, and **blocks** those that violate policy rules.
5. Every decision gets a **public receipt** with evidence preimage, evidence hash, content hash, and payment proof.
6. Creators see earnings on their **dashboard** and share a **payout card**.
7. The **traction dashboard** shows live on-chain stats: creators paid, USDC routed, receipts generated — sourced from Arc Testnet Transfer events.

---

## 4. Why CitePay is Different

| Feature | CitePay | Typical hackathon submission |
|---|---|---|
| 3 competing source agents with onchain reputation | ✓ | ✗ |
| Pilot Agent: attest allocation hash onchain before paying | ✓ | ✗ |
| Healthy/Watch/Stop badges derived from CitationPaid events | ✓ | ✗ |
| Real Circle Gateway x402 payments | ✓ | ✗ |
| Multi-agent orchestration (agent pays agents) | ✓ | ✗ |
| Circle DCW (MPC-secured creator payouts) | ✓ | ✗ |
| Circle App Kit (Unified Balance Kit + Wallets Adapter) | ✓ | ✗ |
| MCP server (Claude Code / Cursor integration) | ✓ | ✗ |
| Agent pays AND refuses sources (per-source policy outcomes) | ✓ | ✗ |
| Configurable Agent Spend Policies (conservative/balanced/aggressive) | ✓ | ✗ |
| SHA-256 evidence hash per decision | ✓ | ✗ |
| Objective content-integrity challenge | ✓ | ✗ |
| 194+ CitationPaid events verifiable on Arc Testnet | ✓ | ✗ |
| Purpose taxonomy: CITE / QUERY_FEE / AGENT_REWARD / BOND_SLASH | ✓ | ✗ |
| Citation memory: reputation persists across cold starts (Edge Config) | ✓ | ✗ |
| Public creator registration — no API key, no approval | ✓ | ✗ |

**Circle SDK coverage:** `@circle-fin/x402-batching` · `@circle-fin/developer-controlled-wallets` · `@circle-fin/adapter-circle-wallets` · `@circle-fin/unified-balance-kit` · `@circle-fin/provider-gateway-v1` · `@circle-fin/adapter-viem-v2`

| New Circle product | Where |
|---|---|
| Circle Programmable Wallets (DCW `signTypedData`) | `/api/auth/circle-session` + `/api/auth/sign-payment` |
| CCTP v2 cross-chain creator payouts | `POST /api/cctp/fund-creator` |
| Circle Gateway V1 (`spend`, `addDelegate`) | `src/lib/cctp.ts` via Unified Balance Kit |

---

## 5. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      User / AI Agent / MCP Client               │
└──────────┬───────────────────────┬──────────────────────────────┘
           │                       │
           │ POST /api/ask         │ POST /api/orchestrate
           ▼                       ▼
  ┌─────────────────┐    ┌──────────────────────────────┐
  │  x402 Gateway   │    │  Orchestrator Agent          │
  │  /api/ask       │    │  Claude Haiku                │
  │                 │    │  decomposes query →          │
  │  402 → pay via  │    │  hires researcher agents     │
  │  Circle Gateway │    │  via x402 payments →         │
  └────────┬────────┘    │  synthesizes answer          │
           │              └────────────┬─────────────────┘
           │                           │ x402 per sub-query
           ▼                           ▼
  ┌─────────────────────────────────────────────────────────┐
  │                  AI Buyer Agent (Claude Haiku)           │
  │  src/lib/agent.ts                                        │
  │                                                          │
  │  Scores each source:                                     │
  │  • relevance    45%  (Claude Haiku relevance score)      │
  │  • price        25%  (price vs budget)                   │
  │  • bond         15%  (creator bonded?)                   │
  │  • reputation   15%  (past decisions)                    │
  │  + freshness modifier · dedup penalty                    │
  │                                                          │
  │  Agent Spend Policy: conservative / balanced / aggressive│
  │  → maxPricePerCitation, minRelevanceScore, requireBonded │
  └──┬──────────────┬──────────┬──────────────┬─────────────┘
     │ PAY          │ REFUSE   │ SKIP         │ BLOCKED_BY_POLICY
     ▼              ▼          ▼              ▼
  payCreator()   Receipt    Receipt        Policy Receipt
  Circle USDC    (no pay)   (no pay)       (policy reason)
  Arc Testnet
     │
     ▼
  ┌──────────────────────────────────────┐
  │   SQLite (better-sqlite3)             │
  │   sources / receipts / queries        │
  │   traction / share_cards             │
  │   Auto-seeded on cold start          │
  └──────────────────────────────────────┘
     │
     ▼
  ┌──────────────────────────────────────┐
  │  CitePayMarket.sol (Arc Testnet)     │
  │  On-chain receipts + reputation      │
  │  Events: Transfer logs for traction  │
  └──────────────────────────────────────┘
```

**Tech stack:**
- **Frontend**: Next.js App Router, Tailwind CSS 4
- **Backend**: Next.js API routes, better-sqlite3 (Node 24)
- **AI**: Anthropic Claude Haiku (relevance scoring + answer generation + orchestration)
- **Payments**: x402 protocol + Circle Gateway (BatchFacilitatorClient) + GatewayClient — real USDC on Arc Testnet
- **Contract**: Solidity 0.8.24, deployed on Arc Testnet (chainId 5042002)
- **MCP**: JSON-RPC 2.0 server at `/api/mcp` — `cite_query`, `get_receipt`, `check_policy`
- **CI**: GitHub Actions

---

## 6. Circle Gateway Payment Flow

All payments use Circle's `GatewayClient` (buyer side) and `BatchFacilitatorClient` (verifier side).

```
Step 1 — Unpaid request
  POST /api/ask
  Body: { query: "...", budget: 0.05 }

  Response: 402 Payment Required
  Headers:
    WWW-Authenticate: x402 {"accepts":[{"scheme":"exact","network":"eip155:5042002",
      "maxAmountRequired":"1000","payTo":"0x5389...","asset":"..."}]}

Step 2 — Client pays via Circle GatewayClient
  const client = new GatewayClient({ privateKey, rpcUrl, chainId: 5042002, usdcAddress });
  const res = await client.pay(askUrl, { method: "POST", body: JSON.stringify({ query, budget }) });
  // GatewayClient signs EIP-3009 authorization, sends Payment-Signature header

Step 3 — Server verifies + settles
  const facilitator = new BatchFacilitatorClient({ url: "https://gateway-api-testnet.circle.com" });
  await facilitator.verify(paymentPayload, requirements);
  await facilitator.settle(paymentPayload, requirements);
  // Real USDC transfer settled on Arc Testnet via Circle Gateway

Step 4 — Agent runs, pays creators
  runBuyerAgent(query, budget, policy) → PAY / REFUSE / SKIP per source
  payCreator() → ERC-20 USDC transfer on Arc Testnet
```

**Query fee:** 1,000 micro-USDC ($0.001)  
**Creator payments:** 1,500–4,000 micro-USDC per citation ($0.0015–$0.004)  
**Network:** Arc Testnet (chainId 5042002)  
**USDC precompile:** `0x3600000000000000000000000000000000000000`

---

## 7. Multi-Agent Orchestration

`POST /api/orchestrate` runs a real agent-to-agent payment chain:

```
You → Orchestrator (Claude Haiku)
        decomposeQuery() → ["sub-question 1", "sub-question 2", "sub-question 3"]
        ↓ parallel (for each sub-question)
        orchestratorClient.pay(askUrl, { body: JSON.stringify(subQuery) })
        ← Researcher Agent responds with answer + decisions + receipts
        ↓
        synthesize(originalQuery, subResults) → Claude Haiku → final answer

Returns:
  finalAnswer         — synthesized from all sub-agents
  subQueries[]        — per-agent: subQuery, answer, decisions[], totalPaid, gatewayAmountMicro
  agentTrace[]        — full execution trace with [Orchestrator] / [Researcher Agent] labels
  stats:
    subQueriesDispatched     — number of agents hired
    totalGatewayFeeMicro     — USDC paid in x402 fees
    totalCreatorPaymentsMicro — USDC paid to creators
    citationsPurchased       — total PAY decisions
    orchestratorWallet       — verifiable on Arc Testnet
```

Every sub-agent payment is a real Circle Gateway x402 transaction. The orchestrator wallet address is included in the response so the chain can be verified on the Arc explorer.

---

## 8. MCP Server

`/api/mcp` is a JSON-RPC 2.0 MCP server. Install it in Claude Code or Cursor and the AI can autonomously cite sources, check policies, and retrieve receipts.

**Claude Code / Claude Desktop:**
```json
{
  "mcpServers": {
    "citepay": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://citepay-markets.vercel.app/api/mcp"]
    }
  }
}
```

**Cursor / HTTP clients:**
```json
{ "url": "https://citepay-markets.vercel.app/api/mcp" }
```

**Available tools:**
- `cite_query` — runs the full buyer agent, pays creators, returns answer + receipts
- `get_receipt` — retrieves a receipt by ID with hash verification
- `check_policy` — checks what a spend policy would do for a given source

---

## 9. Agent Spend Policies

Every query runs under a named policy preset:

| Policy | Max price | Min relevance | Bonded only | Spend cap |
|---|---|---|---|---|
| `conservative` | $0.002 | 70 | ✓ | $0.01 |
| `balanced` | $0.005 | 40 | ✗ | none |
| `aggressive` | $0.01 | 20 | ✗ | none |

Sources that violate policy rules produce a `BLOCKED_BY_POLICY` decision with a policy receipt explaining which rule triggered. Policy receipts are public and auditable just like PAY receipts.

---

## 10. Contract Overview

Three contracts deployed on Arc Testnet (chainId 5042002):

**CitePayMarket.sol** — [`0x396cf1646EbAeF85ee8428C2d9239C46Ae956085`](https://testnet.arcscan.app/address/0x396cf1646EbAeF85ee8428C2d9239C46Ae956085)

| Function | Description |
|---|---|
| `registerSource(payoutWallet, contentHash, metadataURI, price, bond)` | Creator registers a paid source |
| `setAuthorizedAgent(agent, allowed)` | Owner authorizes a buyer agent |
| `depositAgentBond(amount)` | Agent deposits credibility bond |
| `payCitation(sourceId, queryHash, evidenceHash)` | Records PAY receipt, updates reputation |
| `recordDecision(sourceId, decision, queryHash, evidenceHash)` | Records REFUSE/SKIP receipt |
| `updateSourceHash(sourceId, newContentHash)` | Creator updates content hash |
| `challengeHashChanged(receiptId)` | Objective slash if hash changed after payment |
| `getSource(sourceId)` | Read source metadata |
| `getReceipt(receiptId)` | Read receipt details |
| `getMarketStats()` | Aggregated market metrics |

**CreatorBond.sol** — [`0x7DBa1C67Fd9BA976aE09E744D8cbcC71F805D6C0`](https://testnet.arcscan.app/address/0x7DBa1C67Fd9BA976aE09E744D8cbcC71F805D6C0)

| Function | Description |
|---|---|
| `postBond()` | Creator posts ETH bond → earns `isBonded=true` (+20 agent score) |
| `slashBond(receiptId)` | Anyone slashes bond if content hash changed post-payment; bond burned |
| `withdrawBond()` | Creator withdraws after 7-day challenge window |
| `isBonded(creator)` | Read bond status for agent scoring |

**CitationMandate.sol** — [`0xBad090764dd720B5EdcD8B49e054D5d8Ce13C695`](https://testnet.arcscan.app/address/0xBad090764dd720B5EdcD8B49e054D5d8Ce13C695)

| Function | Description |
|---|---|
| `createMandate(policyHash, maxPerCitation, sessionCap, minRelevance, requireBonded)` | Agent registers policy intent before querying |
| `checkAndRecord(mandateId, sourceId, evidenceHash, amount, relevance, bonded)` | Records `CitationAllowed` or `CitationBlocked` per PAY decision |
| `closeMandate(mandateId)` | Closes session, emits final tally on-chain |
| `getMarketStats()` | Total mandates / allows / blocks across all agents |

---

## 11. Receipt Format

Every agent decision produces a receipt:

```json
{
  "id": "uuid",
  "decision": "PAY | REFUSE | SKIP | BLOCKED_BY_POLICY",
  "query": "What makes x402 useful for AI agents?",
  "queryHash": "sha256(query)",
  "sourceTitle": "x402: HTTP-Native Payments",
  "sourceUrl": "https://x402.org",
  "creatorWallet": "0x...",
  "agentAddress": "0x...",
  "amountPaid": 2000,
  "txHash": "0x...",
  "evidenceHash": "sha256(evidencePreimage)",
  "evidencePreimage": {
    "query": "...",
    "queryHash": "...",
    "sourceUrl": "...",
    "excerptUsed": "...",
    "decision": "PAY",
    "scoreInputs": {
      "relevance": 85,
      "price": "0.002 USDC",
      "bonded": true,
      "creatorReputation": 5,
      "budgetRemainingBefore": "0.050 USDC"
    },
    "reason": "High relevance, bonded creator, fair price.",
    "timestamp": "2026-06-21T..."
  },
  "contentHashAtDecision": "sha256(sourceContentAtPaymentTime)",
  "scores": { "relevance": 85, "price": 68, "bond": 20, "reputation": 30, "total": 62 },
  "policyProfile": "balanced",
  "policyRulesPassed": ["maxPrice", "minRelevance"],
  "policyRulesFailed": [],
  "budgetBefore": 50000,
  "budgetAfter": 48000,
  "challenged": false
}
```

Evidence hash is recomputable: `SHA-256(JSON.stringify(evidencePreimage))`.

---

## 12. Objective Slashing

Slashing is **objective-only**. The only automatic slash condition:

> The source content hash changed after the agent paid for it.

**Challenge flow:**
1. Agent pays Source A. Receipt stores `contentHashAtDecision`.
2. Creator later updates the source, changing its content hash.
3. Anyone calls `POST /api/challenge/:receiptId`.
4. System compares `source.contentHash` vs `receipt.contentHashAtDecision`.
5. If hashes differ → challenge succeeds: receipt marked challenged, creator reputation drops, agent reputation adjusted.
6. Anyone calls `slashBond(receiptId)` on **CreatorBond.sol** — the creator's ETH bond is burned on-chain (live on Arc Testnet).

**What is NOT a valid challenge:** subjective quality judgment, AI opinion, price disputes after payment.

---

## 13. Local Setup

**Prerequisites:** Node.js 20–24, npm 10+

```bash
# 1. Clone
git clone https://github.com/cyberrockng/citepay-markets
cd citepay-markets

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Add ANTHROPIC_API_KEY and AGENT_PRIVATE_KEY (funded Arc Testnet wallet)

# 4. Start dev server
npm run dev
# → http://localhost:3000

# 5. App pages
# → http://localhost:3000/market      (creator source registry)
# → http://localhost:3000/ask         (agent workbench)
# → http://localhost:3000/orchestrate (multi-agent demo)
# → http://localhost:3000/mcp         (MCP install guide)
# → http://localhost:3000/traction    (live metrics)
```

---

## 14. Environment Variables

```bash
# ── Required ──────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...        # Claude Haiku for scoring + orchestration

# ── Agent wallet (Arc Testnet) ────────────────────────────────
AGENT_PRIVATE_KEY=0x...             # Funded Arc Testnet wallet for creator payouts
                                    # Also used as orchestrator wallet

# ── Demo buyer (Circle Gateway) ───────────────────────────────
DEMO_BUYER_KEY=0x...                # Separate buyer wallet (must differ from agent)
                                    # Auto-refilled from agent wallet via depositFor()

# ── Arc Testnet (optional overrides) ──────────────────────────
ARC_RPC_URL=https://rpc.testnet.arc.network
ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
ARC_CREATOR_BOND_ADDRESS=0x7DBa1C67Fd9BA976aE09E744D8cbcC71F805D6C0
ARC_CITATION_MANDATE_ADDRESS=0xBad090764dd720B5EdcD8B49e054D5d8Ce13C695

# ── Security (optional) ───────────────────────────────────────
SEED_KEY=...                        # Protects POST /api/seed (DB reset endpoint)
REGISTER_API_KEY=...                # Protects POST /api/sources/register (spam guard)
```

**Never commit `.env.local`.** The app runs without `AGENT_PRIVATE_KEY` — creator payouts fall back to deterministic simulated hashes so receipts remain structurally valid.

---

## 15. API Reference

| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/sources` | List all creator sources |
| POST | `/api/sources/register` | Register a new source (optional `X-Api-Key` auth) |
| POST | `/api/sources/register-public` | Auth-free public creator registration (IP rate-limited) |
| GET | `/api/audit-summary` | Receipts filtered by agent, purpose code, date range |
| GET | `/api/live-events` | Recent decisions with reason, score, creatorHandle |
| POST | `/api/ask` | x402 pay-to-query endpoint — returns 402 without payment |
| POST | `/api/demo-query` | Web UI proxy — Circle Gateway payment server-side, auto-refill |
| POST | `/api/orchestrate` | Multi-agent orchestrator — hires researcher agents via x402 |
| POST | `/api/mcp` | MCP JSON-RPC 2.0 server |
| GET | `/api/query/:queryId` | Get query record + receipts |
| GET | `/api/receipt/:receiptId` | Get receipt + hash validity |
| GET | `/api/creator/:wallet` | Creator earnings + sources |
| GET | `/api/agent/:address` | Agent decision history |
| GET | `/api/traction` | Live traction metrics |
| GET | `/api/onchain-stats` | On-chain stats from Arc Testnet Transfer events |
| POST | `/api/challenge/:receiptId` | Submit objective hash-change challenge |
| POST | `/api/seed` | Reset + re-seed DB (requires `SEED_KEY` if set) |

---

## 16. Pages

- `/` — Landing: hero (agents + creators), live activity ticker, real receipt cards, stats
- `/ask` — Agent workbench: policy selector, proof console, source competition board
- `/register` — Public creator onboarding: name, URL, price slider, Arc wallet, instant activation
- `/orchestrate` — Multi-agent orchestrator: agent flow diagram, stats, per-agent tabs
- `/audit` — On-chain audit: reads Arc RPC directly, wallet balance, tx count, ArcScan links
- `/demo` — 4-step interactive demo: tamper → pay → query → challenge
- `/market` — Creator source registry with price, bond, reputation
- `/receipt/:id` — Full receipt with evidence preimage viewer + hash recomputation + purpose code
- `/creator/:wallet` — Creator earnings dashboard + citation memory badges + ArcScan tx links
- `/agent/:address` — Agent decision history
- `/source/:id` — Source detail and receipt history
- `/traction` — Live on-chain metrics from Arc Testnet
- `/mcp` — MCP server install guide for Claude Code / Cursor
- `/live` — Real-time decision feed with glyph colour-coding
- `/leaderboard` — Creator leaderboard by earnings

---

## 17. Known Limitations

- **SQLite persistence**: Sources are auto-seeded (with baked on-chain IDs) on every cold start. Receipts accumulate on warm Vercel instances and reset on cold starts. Suitable for demo; production needs a managed DB.
- **Testnet only**: All payments are Arc Testnet USDC with no real monetary value. Circle Gateway testnet settles on Arc chainId 5042002.
- **Relevance scoring**: Claude Haiku scores relevance from title + description only (not full content fetch). Scores are probabilistic.
- **Bond withdrawal window**: Creator bond withdrawals are locked for 7 days after posting to allow challengers to act. Bonds can be slashed immediately on hash change via `CreatorBond.slashBond()`.

---

## 18. Next Phase

| Phase | Feature |
|---|---|
| 1 | Gasless source registration via Coinbase Paymaster |
| 2 | Managed persistent DB (Vercel Postgres / Turso) for full receipt history |
| 2 | Arc Mainnet deployment with real bond forfeiture |
| 3 | Policy marketplace — publish, share, fork Agent Spend Policies |
| 3 | zkProof receipts — prove evidence hash matches preimage without revealing query |
| 3 | Cross-chain expansion: Base Mainnet, Optimism |

---

## 19. Contract Addresses

| Contract | Network | Address |
|---|---|---|
| CitePayMarket | Arc Testnet (5042002) | [`0x396cf1646EbAeF85ee8428C2d9239C46Ae956085`](https://testnet.arcscan.app/address/0x396cf1646EbAeF85ee8428C2d9239C46Ae956085) |
| CreatorBond | Arc Testnet (5042002) | [`0x7DBa1C67Fd9BA976aE09E744D8cbcC71F805D6C0`](https://testnet.arcscan.app/address/0x7DBa1C67Fd9BA976aE09E744D8cbcC71F805D6C0) |
| CitationMandate | Arc Testnet (5042002) | [`0xBad090764dd720B5EdcD8B49e054D5d8Ce13C695`](https://testnet.arcscan.app/address/0xBad090764dd720B5EdcD8B49e054D5d8Ce13C695) |
| USDC precompile | Arc Testnet | `0x3600000000000000000000000000000000000000` |

---

---

## 20. Cross-Project Integration

CitePay Markets is registered as a creator source on [Tollgate](https://tollgate.gudman.xyz) — when Tollgate's agent answers questions about AI payments, MCP tools, or on-chain auditing, it may cite CitePay and pay `0x5389…f105` directly.

CitePay also participates in the [Shadow Float](https://shadow-arc.vercel.app/float) credit line — agent `0x5389…f105` signed a `FloatSpendIntent` (EIP-712) giving Shadow's treasury-fronted x402 credit access. Verify: `shadow-arc.vercel.app/api/float-tools?action=verify&hash=0x81f48871477fdb4efb1d77362dd42312c7d0caef27a260a071ede5b8ef627d22`

---

*Built for the Lepton Hackathon (Jun 15–29 2026) · x402 + Circle Gateway + Claude Haiku + Arc Testnet · [citepay-markets.vercel.app](https://citepay-markets.vercel.app)*
