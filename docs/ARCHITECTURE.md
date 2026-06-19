# CitePay Markets — Architecture

## System Overview

CitePay Markets is a Next.js 16 application (App Router) that implements an agentic citation economy. It has three layers:

1. **Frontend** — React pages for users, creators, and agents
2. **Backend API** — Next.js route handlers implementing the x402 pay-to-query flow
3. **Data layer** — SQLite (better-sqlite3) as a receipt mirror; optional smart contract on Base Sepolia

---

## Component Map

```
citepay-markets/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Landing page
│   │   ├── ask/page.tsx                # Proof console + source competition board
│   │   ├── market/page.tsx             # Creator source registry
│   │   ├── receipt/[id]/page.tsx       # Public receipt + evidence viewer
│   │   ├── creator/[wallet]/page.tsx   # Creator dashboard
│   │   ├── agent/[address]/page.tsx    # Agent dashboard
│   │   ├── source/[id]/page.tsx        # Source detail + receipt history
│   │   ├── traction/page.tsx           # Live metrics dashboard
│   │   └── api/
│   │       ├── health/route.ts
│   │       ├── sources/route.ts
│   │       ├── sources/register/route.ts
│   │       ├── ask/route.ts            ← core x402 endpoint
│   │       ├── query/[queryId]/route.ts
│   │       ├── receipt/[id]/route.ts
│   │       ├── creator/[wallet]/route.ts
│   │       ├── agent/[address]/route.ts
│   │       ├── traction/route.ts
│   │       └── challenge/[receiptId]/route.ts
│   ├── lib/
│   │   ├── x402.ts      # 402 response builder + payment verifier
│   │   ├── agent.ts     # AI buyer agent (Claude Haiku scoring)
│   │   ├── evidence.ts  # SHA-256 preimage + hash builder
│   │   ├── payments.ts  # Circle USDC payout + simulated fallback
│   │   └── db.ts        # SQLite interface (better-sqlite3)
│   └── types/index.ts   # Shared TypeScript types
├── contracts/
│   ├── contracts/CitePayMarket.sol
│   └── test/CitePayMarket.test.ts
├── scripts/
│   └── seed-sources.ts   # Seed 10 real creator sources
├── tests/
│   ├── agent.test.ts     # Unit tests (vitest)
│   └── api.test.ts       # Backend API tests (vitest + fetch)
└── data/
    └── citepay.db        # SQLite database (gitignored)
```

---

## Request Lifecycle — POST /api/ask

```
1.  Receive POST /api/ask { query, budget }
2.  Check for X-PAYMENT header
      → absent: return 402 with x402 payment details
      → present: continue
3.  verifyX402Payment(req)
      → X402_DEV_MODE=true: accept any string, generate fake txHash
      → CIRCLE_API_KEY set: POST circle.com/v1/w3s/payments/verify
4.  insertQuery(queryRecord) → SQLite
5.  getAllSources() → SQLite
6.  runBuyerAgent(query, budget, sources) → Claude Haiku
      For each source (concurrent):
        scoreSource() → relevance via Claude, price/bond/rep deterministic
      Sort by total score desc
      Decide PAY/REFUSE/SKIP per source (budget-aware)
7.  For each PAY decision:
      payCreator() → Circle API or simulated txHash
8.  For each decision:
      buildEvidencePreimage() → JSON payload
      hashEvidence() → SHA-256
      insertReceipt() → SQLite
      updateSourceStats() → SQLite (reputation, counts)
9.  Generate answer via Claude Haiku (using paid sources as context)
10. updateQuery(status=completed, answer, receiptIds, totalPaid)
11. Return { answer, decisions, receipts, queryId, totalPaid }
```

---

## Database Schema

```sql
-- Creator sources
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  creator_name TEXT NOT NULL,
  creator_handle TEXT NOT NULL,
  payout_wallet TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  metadata_uri TEXT,
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL,       -- micro-USDC (6 decimals)
  bond INTEGER NOT NULL DEFAULT 0,
  bonded INTEGER NOT NULL DEFAULT 0,
  reputation INTEGER NOT NULL DEFAULT 0,
  paid_count INTEGER NOT NULL DEFAULT 0,
  refused_count INTEGER NOT NULL DEFAULT 0,
  skip_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Agent decisions (one per source per query)
CREATE TABLE receipts (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  query_id TEXT NOT NULL,
  agent_address TEXT NOT NULL,
  creator_wallet TEXT NOT NULL,
  decision TEXT NOT NULL,       -- PAY | REFUSE | SKIP
  query TEXT NOT NULL,
  query_hash TEXT NOT NULL,
  source_title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  amount_paid INTEGER NOT NULL DEFAULT 0,
  evidence_hash TEXT NOT NULL,
  evidence_preimage TEXT NOT NULL,  -- JSON
  content_hash_at_decision TEXT NOT NULL,
  scores TEXT NOT NULL,             -- JSON
  reason TEXT NOT NULL,
  tx_hash TEXT,
  budget_before INTEGER NOT NULL,
  budget_after INTEGER NOT NULL,
  challenged INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Query sessions
CREATE TABLE queries (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  query_hash TEXT NOT NULL,
  budget INTEGER NOT NULL,
  agent_address TEXT NOT NULL,
  query_fee INTEGER NOT NULL DEFAULT 0,
  query_fee_tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  total_paid INTEGER NOT NULL DEFAULT 0,
  receipt_ids TEXT NOT NULL DEFAULT '[]',
  answer TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Traction counters (key-value)
CREATE TABLE traction (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

-- Creator share cards
CREATE TABLE share_cards (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL,
  creator_wallet TEXT NOT NULL,
  opened INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## External Services

| Service | Usage | Required |
|---|---|---|
| Anthropic Claude Haiku | Relevance scoring + answer generation | Yes |
| Circle API | x402 payment verification + USDC transfer | Production only |
| Base Sepolia | Testnet blockchain for contract + USDC | Optional |

In development (`X402_DEV_MODE=true`, no `CIRCLE_API_KEY`), all payments are simulated with deterministic SHA-256 txHashes.

---

## Security Boundaries

- All secrets are environment variables — never in source or frontend
- `X-PAYMENT` header is verified before agent runs (not just checked for presence)
- Evidence hash is recomputed and verified on every receipt page load
- Content hash at decision is immutable — challenge compares current vs snapshot
- Objective-only slashing: no AI judgment, only hash comparison
