# CitePay Markets

> **CitePay is Proof-of-Paid-Citation for AI agents: agents pay creators in USDC, publish verifiable receipts, and expose tampering through objective hash challenges.**

[![CI](https://github.com/cyberrockng/citepay-markets/actions/workflows/ci.yml/badge.svg)](https://github.com/cyberrockng/citepay-markets/actions/workflows/ci.yml)
[![Base Sepolia](https://img.shields.io/badge/network-Base%20Sepolia-blue)](https://sepolia.basescan.org)
[![x402](https://img.shields.io/badge/payments-x402%20%2B%20Circle%20USDC-green)](https://x402.org)

---

## Judge Quick Start

1. Open the live app → **[citepay-markets.vercel.app](https://citepay-markets.vercel.app)** — or the alias **[citepay-markets-blrtq2g0o-cyberrockng-s-projects.vercel.app](https://citepay-markets-blrtq2g0o-cyberrockng-s-projects.vercel.app)**
2. Click **Run Demo** on the `/demo` page — four proofs run automatically
3. Open any generated receipt — verify the evidence hash client-side
4. Confirm the Base Sepolia tx link on any `USDC payout: confirmed on-chain` receipt
5. Click **Submit challenge** after the tamper step — watch the receipt flip to `CHALLENGED`

Contract: [`0x396cf1646EbAeF85ee8428C2d9239C46Ae956085`](https://sepolia.basescan.org/address/0x396cf1646EbAeF85ee8428C2d9239C46Ae956085) · Network: Base Sepolia (chainId 84532)

---

## 1. Product Overview

CitePay Markets is a live agentic citation economy where:

- **Creators** register articles, research, and content as paid sources with a price, bond, and payout wallet.
- **AI buyer agents** receive a query and a USDC budget, evaluate creator sources on multiple dimensions, and autonomously decide to PAY, REFUSE, or SKIP each one.
- **Every decision** — PAY, REFUSE, or SKIP — generates a public receipt with an evidence hash, content hash, payment proof, and human-readable reason.
- **Judges and users** can click any receipt, verify the evidence hash, and see exactly why the agent made each choice.

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

1. A user or agent pays a small USDC fee via **x402** to submit a query.
2. CitePay's **buyer agent** (Claude Haiku) searches the creator source market.
3. The agent scores each source on **relevance, price, creator bond, and reputation**.
4. The agent **pays** the best sources in USDC, **refuses** overpriced or weak ones, and **skips** irrelevant ones.
5. Every decision gets a **public receipt** with evidence preimage, evidence hash, content hash, and payment proof.
6. Creators see earnings on their **dashboard** and share a **payout card**.
7. The **traction dashboard** shows real-time market metrics: creators paid, USDC routed, receipts generated.

---

## 4. Why CitePay is Different

| Feature | CitePay | Typical hackathon submission |
|---|---|---|
| Agent pays AND refuses sources | ✓ | ✗ |
| Evidence hash per decision | ✓ | ✗ |
| Objective content-integrity challenge | ✓ | ✗ |
| Creator bonds + reputation system | ✓ | ✗ |
| x402 HTTP-native payment protocol | ✓ | Rare |
| Public receipt explorer | ✓ | ✗ |
| Source competition board | ✓ | ✗ |
| Agent budget allocation | ✓ | ✗ |
| Creator share cards | ✓ | ✗ |

CitePay is a **product**, not just an integration. It shows source competition, agent budget allocation, creator bonds, reputation movement, receipts for both payments and refusals, objective challenge/slashing, real creator payout cards, and a public proof explorer.

---

## 5. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      User / AI Agent                        │
└──────────────────────┬──────────────────────────────────────┘
                       │  POST /api/ask (no payment)
                       ▼
              ┌─────────────────┐
              │  Next.js API    │──── 402 Payment Required
              │  /api/ask       │     WWW-Authenticate: x402 {...}
              └────────┬────────┘
                       │  POST /api/ask (X-PAYMENT header)
                       ▼
              ┌─────────────────┐
              │  x402 Verify    │──── Circle API (prod)
              │  src/lib/x402   │     or dev-mode accept
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────────────────────────┐
              │         AI Buyer Agent               │
              │    src/lib/agent.ts                  │
              │                                      │
              │  Scores each source (Claude Haiku):  │
              │  • relevance    45%                  │
              │  • price        25%                  │
              │  • bond         15%                  │
              │  • reputation   15%                  │
              │  • freshness    modifier             │
              │  • dedup        modifier             │
              └──┬──────────────┬──────────┬─────────┘
                 │ PAY          │ REFUSE   │ SKIP
                 ▼              ▼          ▼
        ┌──────────────┐  ┌──────────┐ ┌──────────┐
        │ payCreator() │  │ Receipt  │ │ Receipt  │
        │ Circle USDC  │  │ (no pay) │ │ (no pay) │
        └──────┬───────┘  └──────────┘ └──────────┘
               │
               ▼
        ┌──────────────────────────────────┐
        │   SQLite (better-sqlite3)         │
        │   sources / receipts / queries    │
        │   traction / share_cards          │
        └──────────────────────────────────┘
               │
               ▼
        ┌──────────────────────┐
        │  Answer + Citations  │
        │  + Receipt IDs       │
        └──────────────────────┘
```

**Tech stack:**
- **Frontend**: Next.js 16.2.9 (App Router, Turbopack), Tailwind CSS 4
- **Backend**: Next.js API routes, better-sqlite3 (Node 24)
- **AI**: Anthropic Claude Haiku (relevance scoring + answer generation)
- **Payments**: x402 protocol + Circle Programmable Wallets (USDC on Base Sepolia)
- **Contract**: Solidity 0.8.24, Hardhat, Base Sepolia (chainId 84532)
- **CI**: GitHub Actions

---

## 6. Agent Flow

```
runBuyerAgent(query, budget, sources)
  │
  ├─ For each source (concurrent):
  │   ├─ Call Claude Haiku → relevance score 0–100 + excerpt
  │   ├─ Compute price score  = (1 - price/maxPrice) * 80 + 20
  │   ├─ Compute bond score   = bonded ? 20 : 0
  │   ├─ Compute rep score    = clamp(reputation * 3 + 15, 0, 30)
  │   ├─ Apply freshness mod  = recent sources get +2 bonus
  │   ├─ Apply dedup penalty  = same-domain source gets -10
  │   └─ total = relevance*0.45 + price*0.25 + bond*0.15 + rep*0.15
  │
  ├─ Sort sources by total score descending
  │
  └─ For each source (in order):
      ├─ score ≥ 45 AND price ≤ budgetRemaining → PAY
      │     budgetRemaining -= price
      ├─ score ≥ 25                             → REFUSE
      └─ otherwise                              → SKIP
```

Each decision includes:
- Human-readable `reason` string
- `excerptUsed` from Claude's relevance assessment
- Full `ScoreBreakdown` (relevance, price, bond, reputation, total)
- `evidenceHash` = SHA-256 of the evidence preimage

---

## 7. x402 Payment Flow

```
Step 1 — Unpaid request
  POST /api/ask
  Body: { query: "...", budget: 0.05 }

  Response: 402 Payment Required
  Headers:
    WWW-Authenticate: x402 {"scheme":"exact","network":"eip155:84532",
      "maxAmountRequired":"10000","payTo":"0x...","asset":"eip155:84532/erc20:0x036C..."}
  Body: { error: "Payment Required", x402: { ... } }

Step 2 — Client pays 0.01 USDC on Base Sepolia
  (transfer to CitePay receiver wallet)

Step 3 — Paid request
  POST /api/ask
  Headers:
    X-PAYMENT: {"scheme":"exact","network":"eip155:84532",
      "payload":{"signature":"0x...","transaction":{"hash":"0x..."}}}
  Body: { query: "...", budget: 0.05 }

  verifyX402Payment():
    • Production: POST https://api.circle.com/v1/w3s/payments/verify
    • Dev mode  : X402_DEV_MODE=true → accept any non-empty header

  Response: 200
  Body: { queryId, answer, decisions: [...], receipts: [...], totalPaid }
```

Query fee: **0.01 USDC** (10,000 micro-USDC)  
Agent budget: **0.01–1.00 USDC** (set by caller)  
Network: **Base Sepolia** (chainId 84532)  
Asset: **USDC** `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

---

## 8. Contract Overview

**CitePayMarket.sol** — Solidity 0.8.24 on Base Sepolia

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

**Events emitted:** `SourceRegistered`, `CitationPaid`, `CitationRefused`, `CitationSkipped`, `SourceHashUpdated`, `HashChallengeResolved`, `SourceReputationChanged`, `AgentReputationChanged`

See [docs/CONTRACTS.md](docs/CONTRACTS.md) for full specification.

---

## 9. Receipt Format

Every agent decision produces a receipt:

```json
{
  "id": "uuid",
  "decision": "PAY | REFUSE | SKIP",
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
    "timestamp": "2026-06-19T..."
  },
  "contentHashAtDecision": "sha256(sourceContentAtPaymentTime)",
  "scores": { "relevance": 85, "price": 68, "bond": 20, "reputation": 30, "total": 62 },
  "budgetBefore": 50000,
  "budgetAfter": 48000,
  "challenged": false
}
```

Evidence hash is recomputable: `SHA-256(JSON.stringify(evidencePreimage))`.

See [docs/RECEIPT_SPEC.md](docs/RECEIPT_SPEC.md) for full specification.

---

## 10. Objective Slashing

Slashing is **objective-only**. The only automatic slash condition:

> The source content hash changed after the agent paid for it.

**Challenge flow:**
1. Agent pays Source A. Receipt stores `contentHashAtDecision`.
2. Creator later updates the source, changing its content hash.
3. Anyone calls `POST /api/challenge/:receiptId`.
4. System compares `source.contentHash` vs `receipt.contentHashAtDecision`.
5. If hashes differ → challenge succeeds: receipt marked challenged, creator reputation drops, agent reputation drops slightly.
6. If hashes are the same → challenge rejected with clear error message.

**What is NOT a valid challenge:**
- Subjective quality judgment ("the source wasn't good enough")
- AI opinion that the content changed in meaning but not hash
- Price disputes after payment

See [docs/SECURITY.md](docs/SECURITY.md) for the full security model.

---

## 11. Local Setup

**Prerequisites:** Node.js 20–24, npm 10+

```bash
# 1. Clone
git clone https://github.com/cyberrockng/citepay-markets
cd citepay-markets

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Open .env.local and add your ANTHROPIC_API_KEY

# 4. Start dev server
npm run dev
# → http://localhost:3000

# 5. Seed creator sources (in a second terminal)
npm run seed
# → registers 10 real creator sources

# 6. Open the app
# → http://localhost:3000/market   (view sources)
# → http://localhost:3000/ask      (run a query)
# → http://localhost:3000/traction (live metrics)
```

---

## 12. Environment Variables

```bash
# ── Required ──────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...        # Claude Haiku for relevance scoring

# ── Dev mode (skip Circle verification) ───────────────────────
X402_DEV_MODE=true                  # Accept any X-PAYMENT header in dev
NODE_ENV=development

# ── Circle (production USDC payouts) ──────────────────────────
CIRCLE_API_KEY=                     # Circle API key for real transfers
CIRCLE_WALLET_ID=                   # Circle wallet ID for creator payouts
USDC_TOKEN_ID=usdc

# ── Agent wallet (primary USDC payout path) ───────────────────
AGENT_PRIVATE_KEY=                  # Private key of funded Base Sepolia wallet
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
DEPLOYER_PRIVATE_KEY=               # For contract deployment only
BASESCAN_API_KEY=                   # For contract verification (optional)

# ── Contract ──────────────────────────────────────────────────
NEXT_PUBLIC_CONTRACT_ADDRESS=       # Deployed CitePayMarket address
AGENT_WALLET_ADDRESS=0x...          # Agent wallet (authorized in contract)
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

Copy `.env.example` to `.env.local` — never commit `.env.local`.

---

## 13. Deployment Instructions

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy (preview)
vercel

# Deploy to production
vercel --prod
```

Set these environment variables in the Vercel dashboard (Settings → Environment Variables):
- `ANTHROPIC_API_KEY` (required)
- `CIRCLE_API_KEY` + `CIRCLE_WALLET_ID` (for real payouts)
- `NEXT_PUBLIC_CONTRACT_ADDRESS` (after contract deploy)
- `AGENT_WALLET_ADDRESS`
- `USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e`

> Note: CitePay uses SQLite (`data/citepay.db`) for the receipt mirror. On Vercel, this resets on each deployment. For persistent storage, migrate to a Vercel-compatible DB (Postgres/Turso).

### Deploy contract to Base Sepolia

```bash
cd contracts
npm install

# Set DEPLOYER_PRIVATE_KEY in contracts/.env
npx hardhat run scripts/deploy.ts --network baseSepolia

# Verify on Basescan
npx hardhat verify --network baseSepolia <CONTRACT_ADDRESS>
```

---

## 14. Test Commands

```bash
# Unit tests — agent scoring + evidence hash (no server needed)
npm run test:unit

# Backend API tests (requires running server at localhost:3000)
npm run dev &
npm run test:api

# Contract tests (Hardhat)
cd contracts && npm install && npm test

# TypeScript check
npx tsc --noEmit

# Lint
npm run lint

# Build
npm run build
```

CI runs all of the above automatically on every push via `.github/workflows/ci.yml`.

---

## 15. Demo Script

**Full 3-minute walkthrough:**

**0:00–0:20 — Problem**
> "AI agents increasingly use creator content to answer questions — but creators are never paid. Citations are invisible. CitePay turns citations into accountable payments."

**0:20–0:45 — Market**
- Open `/market`
- Show 10 creator sources: price, bond status, reputation score, payout wallet
- Point out: some are bonded (trusted), some aren't

**0:45–1:10 — x402 Query Payment**
- Open `/ask`
- Type: "How does x402 work for AI agents?" Budget: $0.05
- Click "Ask →"
- Proof console shows: `→ POST /api/ask` → `← 402 Payment Required` → payment constructed → retry

**1:10–1:45 — Agent Decision**
- Source competition board appears
- Show: agent PAY'd 3 sources, REFUSED 5, SKIPPED 2
- Point out: score breakdown (relevance %, total), reason column
- "The agent is not blindly paying — it's making real decisions"

**1:45–2:10 — Answer and Receipts**
- Final answer shown with inline citations
- Click a PAY receipt → `/receipt/:id`
- Show: amount paid, txHash, score breakdown, reason

**2:10–2:35 — Proof and Accountability**
- Receipt page: evidence preimage JSON visible
- "Evidence hash: SHA-256 of this payload — anyone can recompute it"
- Show content hash at decision
- Point to challenge link: "If creator changes content after payment, this triggers an objective slash"

**2:35–2:55 — Traction**
- Open `/traction`
- Show: creators paid, USDC routed, total decisions, receipts generated
- "All real data from the agent decisions you just saw"

**2:55–3:00 — Close**
> "CitePay is the citation economy for AI agents: pay creators, prove citations, and make agent spending accountable."

---

## 16. Contract Addresses

| Contract | Network | Address |
|---|---|---|
| CitePayMarket | Base Sepolia (84532) | [`0x396cf1646EbAeF85ee8428C2d9239C46Ae956085`](https://sepolia.basescan.org/address/0x396cf1646EbAeF85ee8428C2d9239C46Ae956085) |
| USDC | Base Sepolia | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

Contract source: [`contracts/contracts/CitePayMarket.sol`](contracts/contracts/CitePayMarket.sol)

---

## 17. Live App

**GitHub:** https://github.com/cyberrockng/citepay-markets

Run locally: `npm run dev` → http://localhost:3000

See [section 13](#13-deployment-instructions) for Vercel deployment steps.

---

## 18. Pages

**Pages:**
- `/` — Landing: hero, how it works, live market stats
- `/ask` — Proof console + source competition board
- `/market` — Creator source registry
- `/receipt/:id` — Full receipt with evidence preimage viewer
- `/creator/:wallet` — Creator earnings dashboard
- `/agent/:address` — Agent decision history
- `/source/:id` — Source detail and receipt history
- `/traction` — Live traction metrics dashboard

---

## 19. Known Limitations

- **SQLite persistence**: The receipt mirror resets on Vercel redeploy. Suitable for demo; production needs a managed DB.
- **Payout fallback**: Creator payouts are real on-chain USDC transfers when `AGENT_PRIVATE_KEY` is set and the wallet is funded. If neither `AGENT_PRIVATE_KEY` nor `CIRCLE_API_KEY` is configured, the system generates a deterministic SHA-256 txHash so receipts remain structurally valid during local development.
- **Dev mode x402**: `X402_DEV_MODE=true` accepts any `X-PAYMENT` header. Production requires Circle payment verification.
- **Relevance scoring**: Claude Haiku scores relevance from title + description only (not full content fetch). Scores are probabilistic.
- **Contract deployment**: CitePayMarket.sol deployed to Base Sepolia at [`0x396cf1646EbAeF85ee8428C2d9239C46Ae956085`](https://sepolia.basescan.org/address/0x396cf1646EbAeF85ee8428C2d9239C46Ae956085). The backend mirrors all data to SQLite for fast reads.
- **Base Sepolia only**: All payments are testnet USDC with no real monetary value.

---

## 20. Future Roadmap

- **Mainnet deployment** with real USDC payments
- **IPFS content addressing** — store source content on IPFS, use CID as content hash
- **zkProof receipts** — zero-knowledge proof that evidence hash matches preimage without revealing query
- **Multi-agent marketplace** — multiple competing buyer agents with different policies
- **Creator staking** — on-chain bond via smart contract instead of off-chain tracking
- **Reputation NFTs** — creator reputation as transferable on-chain credential
- **Agent subscription model** — flat monthly fee for unlimited queries
- **Cross-chain expansion** — Ethereum mainnet, Optimism, Arbitrum

---

## 21. Agent API

Any AI application can use CitePay as citation infrastructure. The single endpoint is:

```
POST /api/ask
```

**How it works:** The server returns HTTP 402 on the first call. The client retries with an `X-PAYMENT` header. The agent then scores all registered sources, pays the best ones in USDC, and returns a structured answer with receipt IDs.

```bash
curl -X POST https://your-citepay-url/api/ask \
  -H "Content-Type: application/json" \
  -H "X-PAYMENT: dev-proof" \
  -d '{"query": "What is x402?", "budget": 0.05}'
```

**Response includes:**
- `answer` — Claude Haiku answer citing only paid sources
- `decisions` — array of PAY / REFUSE / SKIP with scores, reason, txHash, evidenceHash
- `receiptIds` — public receipt URLs for every decision
- `totalPaid` — micro-USDC paid this query

Every receipt is independently verifiable: `SHA-256(JSON.stringify(evidencePreimage))` equals the stored `evidenceHash` — recomputable by anyone.

See [`docs/AGENT_API.md`](docs/AGENT_API.md) for full request/response schema, curl examples, and source registration.

---

## 22. Creator Monetization Flow

Creators earn USDC every time an AI agent cites their work.

```
1. Register source   →  POST /api/sources/register  (or /market UI)
                         Fields: title, url, price (USDC), bond, content
                         Content is hashed — any post-payment edit is challengeable

2. Set price         →  price field in micro-USDC (2000 = $0.002 per citation)
                         Bond increases credibility score and agent willingness to pay

3. Agent pays        →  POST /api/ask triggers automatic scoring + payout
                         Real ERC-20 USDC transfer to payoutWallet on Base Sepolia
                         On-chain receipt written to CitePayMarket.sol

4. View earnings     →  /creator/:wallet
                         Shows all paid citations, total USDC earned, source reputation
```

**Creator dashboard:** `/creator/<your-wallet-address>` — linked from every source row on the market page.

**Share card:** Every PAY receipt includes a one-click share card so creators can post proof of payment on X or Farcaster.

---

## API Reference

| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/sources` | List all creator sources |
| POST | `/api/sources/register` | Register a new source |
| POST | `/api/ask` | x402 pay-to-query (returns 402 without X-PAYMENT) |
| GET | `/api/query/:queryId` | Get query record + receipts |
| GET | `/api/receipt/:receiptId` | Get receipt + hash validity |
| GET | `/api/creator/:wallet` | Creator earnings + sources |
| GET | `/api/agent/:address` | Agent decision history |
| GET | `/api/traction` | Live traction metrics |
| POST | `/api/challenge/:receiptId` | Submit objective hash-change challenge |

---

*Built on Base Sepolia with x402 + Circle USDC + Claude Haiku.*

**Proof transparency:** All agent decisions use real x402 payment headers and SHA-256 evidence hashes. When `AGENT_PRIVATE_KEY` is set and the wallet holds USDC, creator payouts are real on-chain ERC-20 transfers on Base Sepolia — the demo wallet (`0x5389688243328c26a92b301faEEAb5fbf9AFf105`) was funded via a Uniswap V3 swap (tx [`0xad6e7c5...`](https://sepolia.basescan.org/tx/0xad6e7c56af23961247fb0c3ee8a4a07543f7f44f6add71081cd0fa5f7ccdbb71)). Without `AGENT_PRIVATE_KEY` or when balance is zero the system falls back to a deterministic SHA-256 tx hash so receipts remain structurally valid during development. `X402_DEV_MODE=true` relaxes only the 402 handshake header check; it does not affect the USDC transfer path. Traction metrics come exclusively from actual agent runs — no seeded or fabricated data. The deployed contract (`0x396cf1646EbAeF85ee8428C2d9239C46Ae956085`) serves as on-chain proof of deployment; the backend mirrors receipts to SQLite for fast reads.
