# Security Considerations

## Principles

CitePay Markets is built on three security principles:

1. **No secrets in source** — all private keys and API keys are environment variables
2. **No fake data** — all receipts, decisions, and payments reflect real activity
3. **Objective enforcement** — slashing is hash-comparison only, no AI judgment

---

## Secret Management

| Secret | Storage | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `.env.local` only | Never committed; used server-side only |
| `CIRCLE_API_KEY` | `.env.local` only | Never committed; production only |
| `PRIVATE_KEY` | `.env.local` only | For contract deployment only; not used at runtime |
| `CITEPAY_PAYOUT_WALLET` | `.env.local` or public config | Just an address, not a key |

**`.env.local` is in `.gitignore`.** Never commit it. See `.env.example` for the required keys.

---

## Frontend Exposure

The Next.js App Router never passes server environment variables to the client unless explicitly prefixed with `NEXT_PUBLIC_`. All secrets (`ANTHROPIC_API_KEY`, `CIRCLE_API_KEY`, `PRIVATE_KEY`) are used only in route handlers that run server-side.

A client-side bundle scan should show no API keys.

---

## Payment Verification

In production, every `X-PAYMENT` header is verified via the Circle API before the agent runs. The verification checks:

- EIP-712 signature validity
- Transaction inclusion on Arc Testnet
- Amount ≥ required fee
- Recipient matches `CITEPAY_PAYOUT_WALLET`

The agent never runs without a verified payment in production mode.

**Dev mode** (`X402_DEV_MODE=true`) bypasses verification. This must not be set in production.

---

## Evidence Integrity

The `evidenceHash` stored per receipt is computed as:

```
SHA-256(JSON.stringify(evidencePreimage, null, 2))
```

The preimage is serialized with deterministic key ordering before hashing. The hash is recomputed on every receipt page load. If the stored preimage was tampered with, the hash check fails visibly.

This prevents the server from retroactively changing why a decision was made.

---

## Content-Hash Challenge

The challenge endpoint (`GET /api/challenge/:receiptId`) compares two SHA-256 hashes:
- `receipt.contentHashAtDecision` — snapshotted at decision time
- `source.contentHash` — current value in the DB

No AI model is involved. The comparison is deterministic and auditable. A successful challenge is not a "report" — it's a cryptographic proof that the content changed.

**Abuse mitigation:** Challenges are free, but a failed challenge (same hash) returns 409 and increments nothing. A challenger cannot manufacture a hash mismatch without actually changing the source.

---

## SQLite Security

The database is a local SQLite file (`data/citepay.db`). It is:
- Not exposed on any API endpoint directly
- Accessed only through prepared statements (no string interpolation = no SQL injection)
- Gitignored

In production on Vercel, SQLite is not persistent across deployments. A production deployment should replace better-sqlite3 with a persistent store (Vercel KV, Postgres, etc.).

---

## Input Validation

All API inputs are validated at the route handler level:
- `query`: must be a non-empty string (max 500 chars)
- `budget`: must be a positive number
- `X-PAYMENT`: verified cryptographically before use
- Source registration fields: title, url, creatorName, payoutWallet are required strings

No user input is interpolated into SQL queries or shell commands.

---

## Known Limitations

- SQLite is not horizontally scalable — concurrent writes may serialize on busy servers
- Content hash is SHA-256 of text content only; if the creator's URL serves dynamic content, the hash may drift even without bad intent
- Agent wallet address is an env var string, not a real on-chain identity (in dev mode)
- No rate limiting on the `/api/ask` endpoint — in production, add rate limiting per IP or per payment proof to prevent replay attacks
