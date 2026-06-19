# Traction Metrics Specification

## Overview

CitePay Markets tracks all economic activity in a `traction` table (SQLite key-value store). Metrics are aggregated in real time and exposed at `/api/traction` and `/traction`.

**All metrics are derived from real activity only — no fake traction, no synthetic data.**

---

## Metric Definitions

### Core Citation Economy

| Metric | Source | Description |
|---|---|---|
| `creatorsIndexed` | `COUNT(DISTINCT payout_wallet) FROM sources` | Unique creator wallets with at least one registered source |
| `creatorsPaid` | `COUNT(DISTINCT creator_wallet) FROM receipts WHERE decision='PAY'` | Creators who have received at least one real payment |
| `sourcesRegistered` | `COUNT(*) FROM sources` | Total registered sources (including inactive) |
| `bondedSources` | `COUNT(*) FROM sources WHERE bonded=1` | Sources where creator deposited a non-zero bond |
| `totalQueries` | `COUNT(*) FROM queries` | Total query sessions run through CitePay |
| `totalDecisions` | `COUNT(*) FROM receipts` | Total agent decisions (PAY + REFUSE + SKIP) |
| `paidCitations` | `COUNT(*) FROM receipts WHERE decision='PAY'` | Sources that received actual USDC payment |
| `refusals` | `COUNT(*) FROM receipts WHERE decision='REFUSE'` | Sources evaluated but refused |
| `skips` | `COUNT(*) FROM receipts WHERE decision='SKIP'` | Sources deemed irrelevant |
| `totalUSDCRouted` | `SUM(amount_paid) FROM receipts WHERE decision='PAY'` | Total micro-USDC transferred to creators |
| `avgPaymentPerCitation` | `totalUSDCRouted / paidCitations` | Average payment per paid citation |

### Social & Challenges

| Metric | Source | Description |
|---|---|---|
| `shareCardsGenerated` | `traction.share_cards_generated` | Number of PAY receipts that triggered a share card |
| `shareCardsOpened` | `traction.share_cards_opened` | Number of share cards actually viewed/shared |
| `challengeCount` | `COUNT(*) FROM receipts WHERE challenged=1` | Number of successful content-hash challenges |

### Agent Activity

| Metric | Source | Description |
|---|---|---|
| `activeAgents` | `COUNT(DISTINCT agent_address) FROM queries WHERE status='completed'` | Unique agent addresses that completed at least one query |
| `agentReputation` | `SUM(value) FROM traction WHERE key LIKE 'agent_rep_%'` | Net agent reputation across all agents (PAY = +1, successful challenge = -1) |

---

## API Response Format

**GET /api/traction**

```json
{
  "stats": {
    "creatorsIndexed": 3,
    "creatorsPaid": 2,
    "sourcesRegistered": 10,
    "bondedSources": 7,
    "totalQueries": 5,
    "totalDecisions": 45,
    "paidCitations": 18,
    "refusals": 22,
    "skips": 5,
    "totalUSDCRouted": 36000,
    "avgPaymentPerCitation": 2000,
    "shareCardsGenerated": 18,
    "shareCardsOpened": 6,
    "challengeCount": 1,
    "activeAgents": 1,
    "agentReputation": 17
  },
  "generatedAt": "2026-06-19T10:00:00.000Z"
}
```

---

## Incrementing Traction

Traction counters are incremented by backend functions in `src/lib/db.ts`:

```typescript
incrementTraction("share_cards_generated")    // when share card appears on PAY receipt
incrementTraction("share_cards_opened")        // when share card is opened/copied
incrementTraction("challenge_count")           // when challenge succeeds
incrementTraction(`agent_rep_${agentAddress}`, -1)  // per-agent reputation decrement
```

Agent reputation per agent is stored as separate keys (`agent_rep_0xABCD...`) so individual agent histories are trackable.

---

## Dashboard

The live dashboard at `/traction` polls `/api/traction` every 10 seconds and displays all metrics in a responsive card grid. It also links to:

- `/ask` — generate more decisions
- `/market` — view and register sources

---

## Traction Goals (Hackathon)

| Metric | Target |
|---|---|
| `creatorsPaid` | ≥ 3 distinct creators |
| `paidCitations` | ≥ 10 paid citations |
| `totalUSDCRouted` | ≥ $0.01 USDC routed |
| `totalDecisions` | ≥ 30 agent decisions |
| `shareCardsOpened` | ≥ 1 share card opened |

All targets are achievable by running 3–5 queries against the seeded creator sources.
