# CitePay Buyer Agent Policy

## Overview

The CitePay buyer agent is an autonomous AI system that evaluates creator sources and allocates USDC payments on behalf of a querying user or agent. It uses Claude Haiku for relevance judgment combined with deterministic scoring rules for price, bond, and reputation.

**The agent never pays blindly.** Every decision — PAY, REFUSE, or SKIP — is computed from visible inputs and explained with a human-readable reason.

---

## Scoring Weights

| Dimension | Weight | Range | Description |
|---|---|---|---|
| Relevance | 45% | 0–100 | AI-judged match between query and source content |
| Price | 25% | 0–100 | Relative cheapness vs all sources in competition |
| Bond | 15% | 0 or 20 | Creator credibility bond deposited |
| Reputation | 15% | 0–30 | Historical PAY/REFUSE ratio (clamped) |

**Total score** = `relevance × 0.45 + price × 0.25 + bond × 0.15 + reputation × 0.15`

---

## Score Components

### Relevance (0–100)
Claude Haiku is given the query text, source title, creator name, and a short description/preview. It returns a JSON object with `relevance` (0–100) and `excerpt` (one-sentence reason).

If the Claude call fails (network error, timeout), a fallback heuristic is used: count overlapping words between query and source title, map to 30–90.

### Price Score (0–100)
Computed relative to all sources in the current competition:
```
priceScore = round((1 - source.price / maxPrice) * 80 + 20)
```
- The cheapest source gets 100, the most expensive gets 20
- If `source.price > budgetRemaining`, `priceScore = 0` (cannot afford)
- Minimum price score is 20 (for the most expensive source)

### Bond Score (0 or 20)
Binary: bonded creator = 20 points, unbonded = 0 points.

A creator is "bonded" if they deposited any non-zero bond when registering their source.

### Reputation Score (0–30)
```
repScore = clamp(reputation × 3 + 15, 0, 30)
```
- Reputation starts at 0 for new creators
- Each PAY decision: +1 reputation
- Each REFUSE decision: -1 reputation
- Each SKIP decision: no change
- New creator with reputation=0: repScore = 15 (neutral)
- Creator with reputation=5: repScore = 30 (cap)
- Creator with reputation=-5: repScore = 0 (floor)

---

## Modifiers

### Freshness Bonus
Sources registered within the last 30 days receive a context note in the Claude prompt. This does not directly add to the numeric score but influences the Claude relevance judgment to give credit to recently published material.

### Duplicate-Source Penalty
After scoring, sources from the same root domain as a higher-scoring already-paid source receive a -10 penalty on their total score. This prevents the agent from paying two sources from the same creator website.

---

## Decision Thresholds

| Decision | Condition |
|---|---|
| PAY | `total >= 45` AND `source.price <= budgetRemaining` |
| REFUSE | `total >= 25` (but either score < 45 or source over budget) |
| SKIP | `total < 25` |

Sources are evaluated in descending order of total score. Budget is decremented only for PAY decisions.

### PAY means:
The source is relevant enough, fairly priced, trustworthy enough, and within budget. The agent autonomously transfers USDC to the creator's payout wallet.

### REFUSE means:
The source is somewhat relevant or has other merit but fails on price, budget, or trust threshold. A receipt is still created with reason, but no payment is made.

### SKIP means:
The source is not relevant enough to be worth even refusing. A receipt is still created (for accountability), but no reason beyond "weak relevance" is needed.

---

## Budget Allocation

The agent receives a `budget` (in micro-USDC) from the querying user. This is the total it can spend across all creator payouts for a single query.

```
budgetRemaining = budget  (e.g. 50,000 micro-USDC = $0.05)

For each source (sorted by score, best first):
  if PAY: budgetRemaining -= source.price
  # Never goes negative — price check is pre-condition for PAY
```

The agent can PAY multiple sources in one query, up to the budget limit.

---

## Why Decisions Are Not Hardcoded

Each scoring component uses real data:
- **Relevance**: Claude Haiku reads the actual query text and source content preview
- **Price**: computed from the actual prices registered by actual creators
- **Bond**: read from the actual source registration
- **Reputation**: computed from the actual historical PAY/REFUSE decisions in the database

The agent cannot be "tricked" into paying every source because:
1. Low-relevance sources score below REFUSE threshold → SKIP
2. Overpriced sources get priceScore=0 → score drops below PAY threshold → REFUSE
3. Unbonded sources with no reputation score low on bond+rep → harder to reach PAY threshold
4. Budget cap is enforced with real arithmetic, not an AI judgment call

---

## Evidence and Accountability

Every decision produces a tamper-evident evidence preimage:
```json
{
  "query": "...",
  "queryHash": "sha256(query)",
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
}
```

The SHA-256 hash of this JSON is stored in both the SQLite receipt and (optionally) the on-chain contract. Anyone can recompute the hash from the visible inputs and verify it matches.
