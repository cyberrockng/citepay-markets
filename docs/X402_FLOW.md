# x402 Payment Flow

## What is x402?

x402 is an HTTP-native micropayment protocol built on the existing HTTP 402 Payment Required status code. It allows servers to require payment before serving a resource, with no browser plugin or wallet extension required.

**CitePay Markets implements x402 as the access gate for `/api/ask`.**

---

## The Flow

```
Client                                  CitePay Server
──────                                  ──────────────
POST /api/ask { query, budget }
                                  →     Check X-PAYMENT header
                                        → absent: return 402

←── HTTP 402 Payment Required ──────────
    Content-Type: application/json
    {
      "x402": true,
      "maxAmountRequired": "0.001",
      "asset": "USDC",
      "network": "eip155:84532",
      "memo": "CitePay query fee"
    }

Client constructs payment proof:
  {
    "scheme": "exact",
    "network": "eip155:84532",
    "payload": {
      "signature": "0x...",
      "transaction": { "hash": "0x..." }
    }
  }

POST /api/ask { query, budget }
X-PAYMENT: <JSON payment proof>
                                  →     verifyX402Payment(req)
                                        → Dev mode: accept any non-empty string
                                        → Production: verify with Circle API
                                        → Extract txHash from proof
                                        → Run buyer agent
                                        → Return results

←── HTTP 200 ────────────────────────
    {
      "queryId": "uuid",
      "answer": "...",
      "decisions": [...],
      "receipts": [...],
      "totalPaid": 4000
    }
```

---

## 402 Response Format

```json
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "x402": true,
  "maxAmountRequired": "0.001",
  "asset": "USDC",
  "network": "eip155:84532",
  "memo": "CitePay query fee — run AI buyer agent",
  "payTo": "0xCITEPAY_PAYOUT_WALLET",
  "receiptUrl": "https://citepay.markets/api/query/{queryId}"
}
```

---

## Payment Proof Format

The `X-PAYMENT` header must contain a JSON-encoded payment proof:

```json
{
  "scheme": "exact",
  "network": "eip155:84532",
  "payload": {
    "signature": "0x<EIP-712 signature>",
    "transaction": {
      "hash": "0x<transaction hash>",
      "chainId": 84532,
      "from": "0x<payer address>",
      "to": "0x<payee address>",
      "value": "1000"
    }
  }
}
```

---

## Development Mode

Set `X402_DEV_MODE=true` in your `.env.local` to accept any non-empty `X-PAYMENT` header without verifying the payment proof. This allows local development without a Circle API key or real USDC.

In dev mode, a fake `txHash` is generated as `SHA-256(paymentHeader + timestamp)`.

**Never deploy with `X402_DEV_MODE=true`.**

---

## Production Mode

In production, payment verification calls the Circle API:

```
POST https://api.circle.com/v1/w3s/payments/verify
Authorization: Bearer <CIRCLE_API_KEY>
{
  "paymentProof": <X-PAYMENT header value>,
  "network": "eip155:84532"
}
```

The Circle API validates:
- Signature validity (EIP-712)
- Transaction inclusion on Base Sepolia
- Amount matches the required fee
- Recipient matches `CITEPAY_PAYOUT_WALLET`

---

## Implementation

See `src/lib/x402.ts` for:
- `buildX402Response()` — constructs the 402 response with payment details
- `verifyX402Payment()` — validates the X-PAYMENT header (dev or production)
- `extractX402TxHash()` — extracts the transaction hash from a verified payment

---

## Why x402?

Traditional API monetization requires API keys, subscriptions, or usage meters. x402 enables:

- **Per-request pricing** — pay only for what you use
- **No registration required** — any agent with USDC can call the API
- **Permissionless** — no approval or account creation
- **Auditable** — every payment produces an on-chain transaction hash

This aligns perfectly with the CitePay model: AI agents make autonomous spending decisions and pay creators directly, without a human intermediary approving each transaction.
