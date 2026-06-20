# CitePay Agent API

Any AI application can use CitePay Markets as citation infrastructure.
One endpoint, one header, structured receipts.

---

## Endpoint

```
POST /api/ask
```

## Authentication — x402

CitePay uses the [x402 protocol](https://x402.org). The server returns HTTP 402 on
the first call; the client retries with an `X-PAYMENT` header.

```
# First call — server returns 402 with payment details
POST /api/ask  →  402 Payment Required

# Second call — with payment proof
POST /api/ask
X-PAYMENT: <payment-proof>
→  200 OK  { answer, decisions, receipts }
```

In dev mode (`X402_DEV_MODE=true`) any non-empty string is accepted as payment proof.

---

## Request body

```json
{
  "query":  "What is x402 and how does it enable micropayments for AI agents?",
  "budget": 0.05
}
```

| Field | Type | Required | Default |
|---|---|---|---|
| `query` | string | Yes | — |
| `budget` | number (USDC) | No | 0.05 |

---

## Response

```json
{
  "queryId":        "uuid",
  "query":          "What is x402...",
  "queryHash":      "sha256hex",
  "answer":         "x402 enables HTTP-native micropayments...",
  "totalPaid":      5500,
  "budgetUsed":     5500,
  "budgetRemaining": 44500,
  "queryFee":       1000,
  "receiptIds":     ["uuid-1", "uuid-2"],
  "decisions": [
    {
      "receiptId":  "uuid-1",
      "decision":   "PAY",
      "source":     "x402: HTTP-Native Payments for AI Agents",
      "url":        "https://x402.org",
      "scores":     { "relevance": 92, "price": 80, "bond": 20, "reputation": 18, "total": 85 },
      "reason":     "Highly relevant, bonded creator, fair price.",
      "amountPaid": 2000,
      "txHash":     "0x...",
      "evidenceHash": "sha256hex",
      "receiptUrl": "/receipt/uuid-1"
    },
    {
      "receiptId":  "uuid-2",
      "decision":   "REFUSE",
      "source":     "Expensive Marketing Article",
      "scores":     { "relevance": 40, "price": 20, "bond": 0, "reputation": 5, "total": 32 },
      "reason":     "Low relevance, overpriced.",
      "amountPaid": 0,
      "txHash":     null,
      "evidenceHash": "sha256hex",
      "receiptUrl": "/receipt/uuid-2"
    }
  ]
}
```

All amounts are in micro-USDC (1 USDC = 1,000,000).

---

## curl example

```bash
# Dev mode — any X-PAYMENT value accepted
curl -X POST https://your-citepay-url/api/ask \
  -H "Content-Type: application/json" \
  -H "X-PAYMENT: dev-proof" \
  -d '{"query": "What is x402?", "budget": 0.05}'
```

```bash
# Check the returned receipt
curl https://your-citepay-url/api/receipt/<receiptId>
```

---

## Register creator sources

```bash
curl -X POST https://your-citepay-url/api/sources/register \
  -H "Content-Type: application/json" \
  -d '{
    "title":         "My Research on AI Payments",
    "url":           "https://example.com/my-article",
    "creatorName":   "Alice",
    "creatorHandle": "@alice",
    "payoutWallet":  "0xYourWalletAddress",
    "price":         2000,
    "bond":          10000,
    "content":       "Full text of the article used to generate the content hash."
  }'
```

Once registered, the agent will score and potentially pay this source on every relevant query.

---

## Use CitePay as infrastructure

```
1. Register your sources   →  POST /api/sources/register
2. Call from your agent    →  POST /api/ask  { query, budget }
3. Verify receipts         →  GET  /api/receipt/:id
4. View creator earnings   →  GET  /api/creator/:wallet
5. Submit challenges       →  POST /api/challenge/:receiptId
```

Every receipt is independently verifiable: the `evidenceHash` is
`SHA-256(JSON.stringify(evidencePreimage))` — recomputable by anyone without trusting the server.

---

## Related endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/sources` | List all registered sources |
| `GET` | `/api/query/:queryId` | Full query record + all receipt IDs |
| `GET` | `/api/creator/:wallet` | Creator earnings + source list |
| `GET` | `/api/agent/:address` | Agent decision history |
| `GET` | `/api/traction` | Market-wide traction metrics |
