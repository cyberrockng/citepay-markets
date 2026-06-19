# CitePay Receipt Specification

## Overview

Every agent decision — PAY, REFUSE, or SKIP — produces a tamper-evident receipt. Receipts are the core accountability primitive in CitePay Markets.

---

## Receipt Fields

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Globally unique receipt identifier |
| `sourceId` | UUID | Source that was evaluated |
| `queryId` | UUID | Query session this receipt belongs to |
| `agentAddress` | string | Wallet address of the decision-making agent |
| `creatorWallet` | string | Creator's payout wallet (from source registration) |
| `decision` | enum | `PAY`, `REFUSE`, or `SKIP` |
| `query` | string | Original query text |
| `queryHash` | hex | SHA-256 of query text |
| `sourceTitle` | string | Title of the evaluated source |
| `sourceUrl` | string | URL of the evaluated source |
| `amountPaid` | integer | Micro-USDC (0 for non-PAY decisions) |
| `evidenceHash` | hex | SHA-256 of the serialized evidence preimage |
| `evidencePreimage` | JSON | Full inputs used to make the decision |
| `contentHashAtDecision` | hex | SHA-256 of source content at time of decision |
| `scores` | JSON | `{ relevance, price, bond, reputation, total }` |
| `reason` | string | Human-readable explanation of the decision |
| `txHash` | hex or null | On-chain or simulated transaction hash |
| `budgetBefore` | integer | Micro-USDC remaining before this decision |
| `budgetAfter` | integer | Micro-USDC remaining after this decision |
| `challenged` | boolean | Whether a content-hash challenge has been submitted |
| `createdAt` | ISO timestamp | When the decision was made |

---

## Evidence Preimage Schema

The `evidencePreimage` is a JSON object containing every input that influenced the agent's decision:

```json
{
  "query": "What is x402?",
  "queryHash": "a3f4b2...",
  "sourceId": "uuid-...",
  "sourceUrl": "https://example.com/article",
  "sourceTitle": "x402: HTTP-Native Payments",
  "excerptUsed": "x402 enables HTTP-native micropayments via the 402 status code.",
  "decision": "PAY",
  "scoreInputs": {
    "relevance": 85,
    "priceScore": 68,
    "bondScore": 20,
    "reputationScore": 18,
    "totalScore": 72,
    "withinBudget": true,
    "sourcePrice": 2000,
    "budgetBefore": 50000
  },
  "reason": "High relevance, bonded creator, fair price.",
  "agentAddress": "0xCITEPAY_AGENT",
  "timestamp": "2026-06-19T10:00:00Z",
  "contentHashAtDecision": "sha256:abc123..."
}
```

The `evidenceHash` stored in the DB equals `SHA-256(JSON.stringify(evidencePreimage, null, 2))`.

---

## Hash Verification

The receipt page (`/receipt/:id`) recomputes the evidence hash from the stored preimage and checks it against the stored `evidenceHash`. A "✓ Hash valid" indicator means the stored data is intact.

Anyone can independently verify:

```bash
echo -n '<evidencePreimage JSON>' | sha256sum
```

The output should equal `receipt.evidenceHash`.

---

## Content Hash Challenge

When a PAY decision is made, the source's current `content_hash` is snapshotted into `contentHashAtDecision`.

If the creator later updates their content and the new hash differs, any observer can submit an objective challenge:

```
GET /api/challenge/:receiptId
```

The challenge endpoint:
1. Fetches the source's current `content_hash` from the DB
2. Compares it against `contentHashAtDecision` from the receipt
3. If they differ: marks receipt as `challenged = true`, decrements creator reputation, decrements agent reputation
4. If they are the same: returns 409 "Content unchanged — challenge not valid"

Challenges are objective (hash comparison only — no AI judgment).

---

## Receipt Lifecycle

```
Query submitted
  → Agent decision made
    → evidencePreimage built from all inputs
    → evidenceHash = SHA-256(preimage)
    → contentHashAtDecision = current source hash
    → receipt inserted to DB
    → (if PAY) USDC transfer initiated
    → receiptId returned to caller

Public receipt accessible at /receipt/:id
  → evidenceHash recomputed on page load → displayed as valid/invalid
  → Share card shown for PAY decisions
  → Challenge link shown for unchallenged PAY decisions
```

---

## On-Chain Anchoring (Optional)

When `CITEPAY_CONTRACT_ADDRESS` and `PRIVATE_KEY` are set, the evidence hash can be anchored on Base Sepolia via `CitePayMarket.recordPayment()`. This makes the receipt permanently verifiable without trusting the CitePay server.

See `docs/CONTRACTS.md` for the contract specification.
