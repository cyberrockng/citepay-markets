# CitePay Markets

> **CitePay Markets is the policy and payment layer for autonomous AI citations. Agents enforce configurable Agent Spend Policies, pay creators in real USDC via Circle Gateway on Arc Testnet, and publish tamper-evident Policy Receipts anchored on-chain.**

[![CI](https://github.com/cyberrockng/citepay-markets/actions/workflows/ci.yml/badge.svg)](https://github.com/cyberrockng/citepay-markets/actions/workflows/ci.yml)
[![Arc Testnet](https://img.shields.io/badge/network-Arc%20Testnet-blue)](https://testnet.arcscan.app)
[![x402](https://img.shields.io/badge/payments-x402%20%2B%20Circle%20Gateway-green)](https://x402.org)
[![MCP](https://img.shields.io/badge/MCP-Claude%20Code%20%2F%20Cursor-purple)](https://citepay-markets.vercel.app/mcp)

---

## ⏱️ If You Only Have 5 Minutes

1. **[/demo](https://citepay-markets.vercel.app/demo)** — auto-runs 4 live proofs: tamper detection → x402 payment → paid query → objective challenge. No wallet needed.
2. **[/ask](https://citepay-markets.vercel.app/ask)** — run one real paid query and watch PAY / REFUSE / SKIP decisions settle in USDC.
3. **Click any PAY receipt** — hash-recomputable evidence, Arcscan-linked when anchored.
4. **[/proof](https://citepay-markets.vercel.app/proof)** — recent `CitationPaid` events read straight from Arc RPC. No database to trust.
5. **[/traction](https://citepay-markets.vercel.app/traction)** — the live economy: reconciled queries, decisions, USDC routed, and creator counts.

**One sentence:** every AI citation becomes a real USDC payment with a tamper-evident receipt — and this week, money completed a full loop between two independent agent networks in three blocks (proof directly below).

---

## Cross-Network Proof — Two Agent Networks Paying Each Other

CitePay and Tollgate completed a **two-way agent settlement loop**: Tollgate had already paid CitePay as a cited creator (0.10 USDC across 69 receipts), and on Jul 4, 2026 CitePay paid Tollgate as **its first external paying reader** — queryId `0x44dee3a04a09ac6c`, 0.01 USDC, x402-settled, creator payouts confirmed on Arc in blocks 50147160–50147177 ([live answer page](https://tollgate.gudman.xyz/answers/0x44dee3a04a09ac6c)). One CitePay wallet (`0x5389…f105`) both **earned and paid** through agent-mediated citation settlement — and Tollgate's answer cited CitePay itself, so part of the payment looped straight back to us as a creator payout.

> Tollgate's confirmation, verbatim: *"Confirmed on our side — all on-chain: reader 0x5389… (you, not our wallet), x402-settled, 0.01 USDC, and all three payouts (CitePay / qdee / Indie Researcher) are success on Arc, blocks 50147160–50147177. This is Tollgate's first external paying reader."*

Payout txs: [CitePay](https://testnet.arcscan.app/tx/0xcb617e0eda3bb4124abc41a06c2c313f42b8ea0aad2f90a6e7c4c73246a73629) · [qdee](https://testnet.arcscan.app/tx/0x97753f78df917b5175014e1323cc3b46435b8abb9f77ff213724af0d299c38b4) · [Indie Researcher](https://testnet.arcscan.app/tx/0x9d002cdb3735c023096065d6a5ee88892e00e00548538f9bd08a3282a68c8b28) · Full evidence: [`docs/evidence-tollgate-reader-2026-07-04.md`](docs/evidence-tollgate-reader-2026-07-04.md) · Plus: first external capital sponsor on Shadow Float V2 (section 20c below).

---

## Architecture

```mermaid
flowchart LR
    A[AI Agent / Browser] -->|POST /api/ask| B{x402 Gate}
    B -->|402 Payment Required| A
    A -->|Circle Gateway EIP-3009| C[Arc Testnet USDC]
    C -->|x402 verified| D[CitePay Engine]
    D -->|Claude Haiku scores| E[10 Creator Sources]
    E -->|PAY decision| F[Creator Wallet]
    D -->|anchorPAY| G[CitePayMarket.sol]
    G -->|CitationPaid event| H[ArcScan Explorer]
    D -->|receipt| I[Public Receipt API]
    I --> J[/proof Explorer]
```

---

## Trust Boundary

CitePay separates semantic judgment from payment authority.

- `src/lib/policy.ts` is the deterministic gate for all payable decisions. It enforces max price, relevance threshold, creator bond requirements, session budget, and policy receipts.
- Claude Haiku informs semantic relevance, source excerpts, and answer text. Claude does not set payment amounts and cannot bypass policy checks.
- Amounts are derived from configured source prices, policy limits, contribution weights, and budget state in code before any USDC transfer is attempted.
- Receipts are tamper-evident: the evidence preimage recomputes to the stored SHA-256 hash, and anchored PAY events can be checked against Arc Testnet.

---

## Judge Quick Start

**Live app:** [citepay-markets.vercel.app](https://citepay-markets.vercel.app)

> **Start here:** `/demo` → `/ask` → any receipt → `/proof` → `/traction`. Everything below is deep-dive material.
> Receipts and traction history are persisted durably in Neon when `DATABASE_URL` is configured, with SQLite used only as the local-development fallback. On-chain settlement remains the source of truth for confirmed USDC movement.

| Path | What to show |
|---|---|
| `/demo` | Best first stop — auto-runs 4 proofs: tamper → x402 pay → query → challenge. No wallet needed. |
| `/ask` | Agent workbench with configurable spend policy, Circle Programmable Wallet, live proof console |
| `/register` | Public creator onboarding — register content, set price per citation, earn USDC instantly |
| `/audit` | On-chain audit — reads Arc RPC directly, no database; verify wallet balance + every tx |
| `/receipt/:id` | Receipt with OG share card, evidence preimage viewer + hash recomputation |
| `/traction` | Live traction stats: reconciled agent decisions, paid citations, USDC routed, and creator counts |
| `/proof` | On-chain proof explorer — reads CitationPaid events directly from Arc Testnet, no database |
| `/mcp` | MCP server install for Claude Code / Cursor integration |
| `/labs/*` | Experimental agent-commerce demos, separated from the core product surface |

**MCP (Claude Code / Cursor):**
```json
{
  "mcpServers": {
    "citepay": {
      "command": "npx",
      "args": ["-y", "citepay-mcp"]
    }
  }
}
```

> Package: [`citepay-mcp`](https://www.npmjs.com/package/citepay-mcp) · `npm install -g citepay-mcp`

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

**Tx:** [0xc02c70ab…](https://testnet.arcscan.app/tx/0xc02c70abadf076c326e4fe393edc6bf0634816b82cf1402127cb96e6116269b0) · **Block:** 48070337 · live `CitationPaid` event count at [`/proof`](https://citepay-markets.vercel.app/proof)

---

## 1. Product Overview

CitePay Markets is a live agentic citation economy where:

- **3 competing source agents** — FactAgent, TechAgent, EconAgent — publish knowledge claims with distinct specialties and policies. Each has an onchain identity on CitePayMarket.sol. Their reputation is derived entirely from `CitationPaid` events — no editable leaderboard.
- **Pilot Agent** reads each source agent's live onchain reputation, allocates query budget proportionally, and anchors a SHA-256 plan hash onchain before a single USDC token moves.
- **AI veracity agent** (Claude Haiku) receives a query and a USDC budget, evaluates source claims on relevance, price, creator bond, and reputation, subject to a configurable **Agent Spend Policy**.
- **Trust boundary** — Claude informs semantic relevance and explanation text only; deterministic policy code in `src/lib/policy.ts` gates every payable decision by relevance threshold, creator bond status, max price, session budget, and evidence hash before any USDC movement is attempted. Claude never sets payment amounts.
- **Every decision** — PAY, REFUSE, SKIP, or BLOCKED_BY_POLICY — generates a public receipt with an evidence hash, content hash, payment proof, and human-readable reason.
- **Labs** — agent-commerce experiments such as orchestrator, agent exchange, agent registry, and economy index live under `/labs/*` so production journeys stay focused.
- **Circle stack (7 products)**: Gateway + x402 (pay per query), DCW (MPC-secured creator payouts + `signTypedData` Programmable Wallet buyer), App Kit (Unified Balance Kit + Circle Wallets Adapter), Modular Wallets (Circle HSM signs EIP-3009 — no browser key), Gas Station (gasless creator onboarding), CCTP v2 (`POST /api/cctp/fund-creator` — burn on Arc, mint on Base/Ethereum/Arbitrum via Circle Forwarder).
- **MCP server** at `/api/mcp` exposes `cite_query`, `get_receipt`, and `check_policy` as tools for Claude Code and Cursor integration.
- **Purpose taxonomy** — every USDC movement is tagged: `CITE`, `QUERY_FEE`, `AGENT_REWARD`, `BOND_SLASH`. Queryable via `/api/audit-summary`.
- **Durable receipt storage** — receipts are written to Neon when `DATABASE_URL` is configured; SQLite remains the local-development fallback.
- **Public creator registration** — `/register` lets anyone register their content in 60 seconds, no approval, no API key required.

### Live Traction (Arc Testnet) · [live numbers →](https://citepay-markets.vercel.app/traction)
- Confirmed `CitationPaid` events on CitePayMarket.sol (verifiable: [0x396c…6085](https://testnet.arcscan.app/address/0x396cf1646EbAeF85ee8428C2d9239C46Ae956085))
- Reconciled agent decisions — PAY / REFUSE / SKIP — all with public receipts
- Total queries processed; creator USDC payout is a separate Arc transaction per receipt
- USDC routed to creators across unique creator wallets
- Sources registered onchain across source agents
- **3 source agent identities** with distinct wallets, specialties, and reputation scores
- **1 Pilot Agent** attesting allocation decisions onchain before paying
- **Citation memory** — source reputation persists across cold starts via Edge Config

> Production metrics count only confirmed payout transactions. Simulated receipts (zero-balance fallback) are excluded from confirmed stats at `/api/proof`.

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
2. The x402 gate verifies or rejects the payment before agent work starts.
3. CitePay's buyer agent scores each source semantically; deterministic policy code then decides PAY, REFUSE, SKIP, or BLOCKED_BY_POLICY.
4. PAY decisions settle USDC to creator wallets on Arc Testnet.
5. Every decision gets a **public receipt** with evidence preimage, evidence hash, content hash, payment status, and policy result.
6. `/receipt/:id` verifies the hash; `/proof` reads Arc events; `/traction` exposes reconciled live metrics from `/api/traction`.

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
| Live CitationPaid events verifiable on Arc Testnet | ✓ | ✗ |
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
  │   Neon Postgres + SQLite fallback     │
  │   receipts / queries / traction       │
  │   SQLite only for local development   │
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
- **Durable storage**: Neon Postgres for production receipt/history persistence; SQLite fallback for local development
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

## 7. Labs: Agent Commerce Experiments

Experimental agent-commerce routes are separated under `/labs/*`. They are useful demos, but they are not the core CitePay payment-and-receipt journey.

| Path | Purpose |
|---|---|
| `/labs/orchestrate` | Multi-agent orchestrator demo |
| `/labs/agent-exchange` | Agent discovery, hiring, and reputation experiment |
| `/labs/agents` | Source-agent connection examples |
| `/labs/economy` | Experimental economy dashboard |

`POST /api/orchestrate` remains the backing API for the labs orchestrator:

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

## 7.5 CitePay Agent Commerce Network

AI agents can register as paid services, be discovered by orchestrators, get hired through policy-gated payments, produce research outputs, and build on-chain reputation — all in one run.

**Live at:** [`/labs/agent-exchange`](https://citepay-markets.vercel.app/labs/agent-exchange)

### Demo flow

1. Open `/labs/agent-exchange`
2. View 4 registered agents: FactAgent (conservative, trust 92), TechAgent (balanced, trust 85), MarketAgent (aggressive, trust 68), RiskyAgent (blocked — trust 20, invalid wallet)
3. Run "Agent Commerce Demo" with **balanced policy** and `agentCount: 2`
4. Watch orchestrator: hire FactAgent + TechAgent (real USDC on Arc Testnet), warn MarketAgent, block RiskyAgent
5. Each hired agent returns a real **Claude Haiku** research response specific to its specialty
6. View `AGENT_HIRE` receipts with ArcScan-verifiable txHashes
7. Leaderboard shows earned USDC, quality scores, and task history

### Policy enforcement

| Policy | minTrust | maxPrice | Effect |
|--------|----------|----------|--------|
| conservative | 75 | $0.002 | Only highest-trust, cheapest agents |
| balanced | 50 | $0.005 | Mid-tier trust, reasonable prices |
| aggressive | 20 | $0.010 | Low-trust allowed, high prices OK |

RiskyAgent (trust=20, invalid wallet) is **always blocked** on any policy due to wallet validation failure — not just the trust threshold.

### Architecture

```
Orchestrator → discoverAgents(query, budget, policy)
             → selectAgents(candidates, count, budget, policy)
             → hireAgent(agentId) [for each selected]
               → payCreator() → real USDC Arc Testnet tx
               → Claude Haiku → specialty research response
               → saveAgentHireReceipt() → SQLite + on-chain memo
             → finalAnswer (synthesized from all responses)
```

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
# → http://localhost:3000/labs/orchestrate (multi-agent demo)
# → http://localhost:3000/mcp         (MCP install guide)
# → http://localhost:3000/traction    (live metrics)
```

---

## 14. Environment Variables

```bash
# ── Required ──────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...        # Claude Haiku for scoring + orchestration
DATABASE_URL=postgres://...         # Neon durable receipts/history in production
REPLAY_GUARD_SECRET=...             # 32+ random bytes; required outside explicit dev mode

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
X402_DEV_MODE=false                 # Local-only x402 bypass; requires VERCEL_ENV=development/preview
```

**Never commit `.env.local`.** Production must set `REPLAY_GUARD_SECRET`; without it the replay guard fails closed. The app can run locally without `AGENT_PRIVATE_KEY` — creator payouts fall back to deterministic simulated hashes so receipts remain structurally valid.

---

## 15. API Reference

| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/sources` | List all creator sources |
| POST | `/api/sources/register` | Register a new source (optional `X-Api-Key` auth) |
| POST | `/api/sources/register-public` | Auth-free public creator registration (IP rate-limited) |
| GET | `/api/audit-summary` | Receipts filtered by agent, purpose code, date range |
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
| GET | `/api/agent-exchange/register` | List registered labs agents |
| POST | `/api/agent-exchange/register` | Register a new agent in the commerce network |
| POST | `/api/agent-exchange/run` | Run Agent Commerce Demo (discovery → hire → pay → respond) |
| POST | `/api/agent-exchange/hire` | Hire a single agent by ID (rate-limited: 1/8s per IP) |
| GET | `/api/proof` | On-chain CitationPaid event proof from Arc Testnet |

---

## 16. Pages

- `/` — Landing: hero (agents + creators), live activity ticker, real receipt cards, stats
- `/ask` — Agent workbench: policy selector, proof console, source competition board
- `/register` — Public creator onboarding: name, URL, price slider, Arc wallet, instant activation
- `/audit` — On-chain audit: reads Arc RPC directly, wallet balance, tx count, ArcScan links
- `/demo` — 4-step interactive demo: tamper → pay → query → challenge
- `/market` — Creator source registry with price, bond, reputation
- `/receipt/:id` — Full receipt with evidence preimage viewer + hash recomputation + purpose code
- `/creator/:wallet` — Creator earnings dashboard + citation memory badges + ArcScan tx links
- `/agent/:address` — Agent decision history
- `/source/:id` — Source detail and receipt history
- `/traction` — Live on-chain metrics from Arc Testnet
- `/mcp` — MCP server install guide for Claude Code / Cursor
- `/labs` — Experimental agent-commerce surface
- `/labs/orchestrate`, `/labs/agent-exchange`, `/labs/agents`, `/labs/economy` — labs experiments

---

## 17. Known Limitations

- **Storage boundary**: Production receipts and traction history use Neon when `DATABASE_URL` is configured. SQLite is retained for local development and seeded fallback data.
- **Testnet only**: All payments are Arc Testnet USDC with no real monetary value. Circle Gateway testnet settles on Arc chainId 5042002.
- **Relevance scoring**: Claude Haiku informs semantic scoring. Deterministic policy code, not Claude, gates payable decisions and amounts.
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

CitePay Markets is registered as a creator source on [Tollgate](https://tollgate.gudman.xyz) with **10 verified sources** — when Tollgate's agent answers questions about AI payments, MCP tools, on-chain auditing, or agent commerce, it cites CitePay and pays `0x5389…f105` directly via real USDC on Arc Testnet. CitePay has earned and claimed **0.099 USDC** in creator fees from Tollgate (claimed Jul 2, 2026 — tx [`0x4290f75a…f98d5`](https://testnet.arcscan.app/tx/0x4290f75a0c49357b6067b95f95b06fa19426ecc473e3d9f84b2d2d1282bf98d5)).

CitePay holds three roles on Shadow Float V2: **paid provider** (Shadow paid CitePay for queries), **credit user** (CitePay agent used the V2 signed EIP-712 intent flow — verify: `shadow-arc.vercel.app/api/float-tools?action=verify&hash=0x81f48871477fdb4efb1d77362dd42312c7d0caef27a260a071ede5b8ef627d22`), and **capital sponsor** (first non-operator sponsor on Shadow Float V2 — see §20c).

---

## 20a. Tollgate × CitePay — Cross-Project Paid Provider Proof

**Date:** June 30, 2026  
**Flow:** Tollgate → CitePay via DirectTransfer (real USDC, Arc Testnet)

Tollgate ran 5 autonomous paid queries into CitePay — every `/api/ask` returned HTTP 200 with a real answer, a `queryHash`, and `decisions: [{decision: "PAY"…}]`. CitePay received the payment, scored the sources, served the answer, and paid its own creators. This is a live cross-project agent-to-agent payment flow between two independent Lepton builders.

**Tollgate payer wallet:** `0x12F25B721Cc21c38495e33A4c8524dd0B647ba03`  
**CitePay recipient:** `0x5389688243328c26a92b301faEEAb5fbf9AFf105`  
**Amount per query:** 1,000 µUSDC (0.001 USDC)  
**Total paid:** 5,000 µUSDC (0.005 USDC)  
**Token:** USDC precompile `0x3600000000000000000000000000000000000000`  
**Chain:** Arc Testnet, chainId 5042002  
**Method:** `transfer(address, uint256)` — standard ERC-20 via Circle FiatTokenProxy

| # | Tx Hash | Status |
|---|---|---|
| 1 | [`0xeb98b6e5…0121`](https://testnet.arcscan.app/tx/0xeb98b6e5c02cb023b358daf138dd6a0901cf2ced66a246e2ef25f13c26980121) | ✅ Confirmed |
| 2 | [`0x37013780…d19f`](https://testnet.arcscan.app/tx/0x370137802b9e2b324b5a60e46b860d4acccb739fb4270a7b1af02e818e93d19f) | ✅ Confirmed |
| 3 | [`0x5f54c3b2…f12f`](https://testnet.arcscan.app/tx/0x5f54c3b24e64ed462ae9a7403567bb1836f4b62ca478f0ec7ef80c71e182f12f) | ✅ Confirmed |
| 4 | [`0x3f94b8b5…55d0`](https://testnet.arcscan.app/tx/0x3f94b8b5a5556f434f4342a83377e5434464c2c1f726332808978aab02f55fd0) | ✅ Confirmed |
| 5 | [`0xd8c51327…c829`](https://testnet.arcscan.app/tx/0xd8c51327a899483affce7a5cf6720c00af6043579f69446a2f3ffdad3d16c829) | ✅ Confirmed |

Tx 1 verified via Arc Testnet API: block 49509135, timestamp 2026-06-30T18:09:35Z, status OK.

CitePay now has **two confirmed cross-project integrations** — Shadow (June 29) and Tollgate (June 30) — both with verifiable on-chain payment trails.

---

## 20b. Tollgate → CitePay Earnings Claim + 10th Source Registration

**Date:** July 2, 2026

### Earnings Claim
CitePay claimed accumulated creator earnings from Tollgate's FeeRouter contract.

| Field | Value |
|---|---|
| Amount claimed | **0.099 USDC** |
| FeeRouter | `0xeff9bc359e8f2a5eabce55af3f1bb24f98eabf59` |
| Claim tx | [`0x4290f75a…f98d5`](https://testnet.arcscan.app/tx/0x4290f75a0c49357b6067b95f95b06fa19426ecc473e3d9f84b2d2d1282bf98d5) |
| Wallet | `0x5389688243328c26a92b301faEEAb5fbf9AFf105` |

### 10th Source Registered
CitePay registered its 10th verified source on Tollgate — the Agent Commerce Network page, covering agent-to-agent hiring with on-chain USDC payments.

| Field | Value |
|---|---|
| Source ID | `citepay-agent-commerce-network-hire-specialized-ai-agents-with-u` |
| Title | CitePay Agent Commerce Network — Hire Specialized AI Agents with USDC |
| URL | `https://citepay-markets.vercel.app/labs/agent-exchange` |
| Price | 1,000 µUSDC per citation |
| Ownership proof | Wallet-signature (`0x769a5bb8…f7da`) verified on Tollgate Jul 2, 2026 |
| Verified creator | ✅ `true` |

CitePay now has **10 verified sources** on Tollgate covering: on-chain audit, citation marketplace, MCP server, policy builder, research sessions, economic dashboard, knowledge bounties, autonomous knowledge-gap agent, live auction, and agent commerce network.

---

## 20c. CitePay × Shadow Float V2 — First External Sponsor Proof

**Date:** July 2, 2026  
**Role:** CitePay as **sponsor** (not agent, not provider) — first non-operator sponsor on Shadow Float V2

CitePay put 0.05 testnet USDC behind a fresh agent line on Shadow Float V2, ran a signed EIP-712 spend intent, repaid the debt, and closed the borrow-spend-repay loop entirely on-chain. Shadow confirmed: CitePay's wallet (`0x5389…f105`) is not the Shadow operator wallet, making CitePay the first external capital sponsor on the V2 contract. The reserve remains live in the contract through judging so the Shadow board shows a live external sponsor — it will be reclaimed after judging ends.

**Sponsor:** `0x5389688243328c26a92b301faEEAb5fbf9AFf105` (CitePay)  
**Agent:** `0xdfDEA2015f0b176e89a79cb8b4D5ef22bE6e044f` (fresh, external)  
**ShadowFloat V2:** `0x20dcA96B0C487D94De885c726c956ffaF38b12C2`  
**Reserve:** 0.05 USDC · **Score after repay:** 8250 · **Status:** REPAID · **Active debt:** 0

| Step | Tx Hash | Status |
|---|---|---|
| Approve reserve | [`0xa23a69aa…d2af`](https://testnet.arcscan.app/tx/0xa23a69aa34d4d3532ad1cc15718ca9a8537a9d085a9312937a2596ba319ad2af) | ✅ Confirmed |
| **openSponsoredLine** | [`0xf2dabb1c…3540`](https://testnet.arcscan.app/tx/0xf2dabb1ce651330a389acd4d6cacee1a859dc4fc12f18459143dc0f60ee53540) | ✅ Confirmed |
| Bind spend intent | [`0xeeb2f3b3…6dae`](https://testnet.arcscan.app/tx/0xeeb2f3b31215a00ef5becbd7c0388f28ec943efc383af5cc7f83f86c044d6dae) | ✅ Confirmed |
| Repay | [`0x2e2ecb06…06fe`](https://testnet.arcscan.app/tx/0x2e2ecb060340f04173d945bd45dc64119309c7e692ec7ad8d4e295413a8d06fe) | ✅ Confirmed |

Shadow verified `SponsoredLineOpened.sponsor !== 0xBDb1e0718EC6f6e2817c9cd4e5c5ed25Ac191Fb8` (the operator wallet), confirming CitePay as the first external capital sponsor on Shadow Float V2.

**What this proves for CitePay:** CitePay operates in three roles simultaneously — paid provider (Shadow and Tollgate pay CitePay for citations), credit user (CitePay agent used the Shadow Float V2 signed EIP-712 intent flow), and capital sponsor (CitePay backs an external agent line as the first non-operator sponsor on Shadow Float V2). Full agent commerce loop, all on-chain.

---

## 21. Shadow × CitePay — Cross-Project Paid Provider Proof

**Date:** June 29, 2026  
**Flow:** Shadow → CitePay via DirectTransfer (real USDC, Arc Testnet)

Shadow ran 5 autonomous paid queries into CitePay using the DirectTransfer payment scheme — a raw Arc USDC transfer + `X-Arc-Tx-Hash` header, no Circle Gateway required. This is a live cross-project agent-to-agent payment flow between two independent Lepton builders.

**Shadow operator wallet:** `0xBDb1e0718EC6f6e2817c9cd4e5c5ed25Ac191Fb8`  
**CitePay recipient:** `0x5389688243328c26a92b301faEEAb5fbf9AFf105`  
**Amount per query:** 1,000 µUSDC (0.001 USDC)  
**Token:** USDC precompile `0x3600000000000000000000000000000000000000`  
**Chain:** Arc Testnet, chainId 5042002

| # | Tx Hash | Block | Status |
|---|---|---|---|
| 1 | [`0x3c74ba90…9929`](https://testnet.arcscan.app/tx/0x3c74ba902d9494c7762f440affa0065ef4a2478b6e9cb4cb228e11cd689a9929) | 49317407 | ✅ Confirmed |
| 2 | [`0xc8ee30e0…532a`](https://testnet.arcscan.app/tx/0xc8ee30e0c2ab5943f472baf819fb17af8b39571665ba4ac408b9fe8d9343532a) | 49317640 | ✅ Confirmed |
| 3 | [`0xb1b67271…48bd`](https://testnet.arcscan.app/tx/0xb1b6727138218b79ec829cd221db65bd4abe47b5a9b7afee8bdd42b14e1f48bd) | 49317729 | ✅ Confirmed |
| 4 | [`0x88ef62f2…def8`](https://testnet.arcscan.app/tx/0x88ef62f2ab2b13cbea658ca9f4d26ebd38c6e86aa8e0704dd7e51a676beadef8) | 49317818 | ✅ Confirmed |
| 5 | [`0x85aea6df…1311`](https://testnet.arcscan.app/tx/0x85aea6dfce5b589fa5a1e5526889d31ca9126385217614b42d0ad34656261311) | 49317933 | ✅ Confirmed |

**Total received:** 5,000 µUSDC (0.005 USDC) across 5 sequential blocks  
**CitePay confirmed:** all 5 queries received, scored, answered, creators paid, receipts anchored on `CitePayMarket.sol`.

This is a verifiable autonomous agent-to-agent payment flow — no human intermediary, no mock data, settled on-chain.

---

*Built for the Lepton Hackathon (Jun 15–29 2026) · x402 + Circle Gateway + Claude Haiku + Arc Testnet · [citepay-markets.vercel.app](https://citepay-markets.vercel.app)*
