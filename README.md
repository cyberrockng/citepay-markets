# CitePay Markets

**The citation economy for AI agents.**

> Agents pay creators when they cite their work, refuse weak sources, and publish auditable receipts proving every payment, refusal, and source decision.

---

## Problem

AI agents increasingly use creator content to answer questions — but creators are never paid. Citations are invisible. There is no accountability for which sources an agent chose, why it chose them, or how much it paid.

## Solution

CitePay Markets is a live agentic citation economy:

1. A user or agent pays a small USDC fee via **x402** to run a query.
2. CitePay's **buyer agent** searches a creator source market and evaluates 3–5 sources.
3. The agent scores each source on **relevance, price, creator bond, and reputation**.
4. The agent **pays** the best sources, **refuses** overpriced or weak ones, and **skips** irrelevant ones.
5. Every decision gets a **public receipt** with evidence hash, content hash, and reasoning.
6. Creators see payments on their **dashboard** and can share a **payout card**.

## Why CitePay is Different

| Feature | CitePay | Typical submission |
|---|---|---|
| Agent pays AND refuses sources | ✓ | ✗ |
| Evidence hash per decision | ✓ | ✗ |
| Objective content-integrity challenge | ✓ | ✗ |
| Creator bonds + reputation | ✓ | ✗ |
| x402 HTTP-native payment | ✓ | Rare |
| Public receipt explorer | ✓ | ✗ |
| Source competition board | ✓ | ✗ |

---

## Architecture

```
User / Agent
     │
     ▼
POST /api/ask ──── 402 Payment Required (x402)
     │                      │
     │   X-PAYMENT header ──┘
     ▼
  x402 Verify (Circle)
     │
     ▼
  Buyer Agent (Claude Haiku)
     │  scores 3-5 sources by: relevance · price · bond · reputation
     ├── PAY    → payCreator() → Circle USDC transfer → Receipt
     ├── REFUSE → Receipt (no payment)
     └── SKIP   → Receipt (no payment)
     │
     ▼
  Answer + Citations + Receipt IDs
```

## x402 Payment Flow

```
1. POST /api/ask  (no header)
   → 402 { x402: { maxAmountRequired, payTo, asset, network } }

2. Client pays USDC on Base Sepolia

3. POST /api/ask  (X-PAYMENT: {...})
   → verifyX402Payment() → Circle API or dev-mode accept
   → Agent runs
   → 200 { answer, decisions, receipts, queryFeeTxHash }
```

## Contract Overview

CitePayMarket.sol (Base Sepolia):
- registerSource() — creator registers content with optional bond
- setAuthorizedAgent() — owner authorizes AI buyer agents
- depositAgentBond() — agent deposits ETH bond
- payCitation() — records PAY receipt, increments source reputation
- recordDecision() — records REFUSE or SKIP receipt
- updateSourceHash() — creator updates content hash
- challengeHashChanged() — objective slash if hash changed after payment

## Objective Slashing

Slashing is objective-only. The only auto-slash condition:
> The source content hash changed after the agent paid for it.

No subjective AI quality judgment triggers a slash.

---

## Local Setup

```bash
git clone https://github.com/cyberrockng/citepay-markets
cd citepay-markets
npm install
cp .env.example .env.local
# Add ANTHROPIC_API_KEY to .env.local
npm run dev
```

Seed creator sources (separate terminal):

```bash
npm run seed
```

Visit http://localhost:3000

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| ANTHROPIC_API_KEY | Yes | Claude Haiku for relevance scoring |
| X402_DEV_MODE | Dev | "true" to skip Circle payment verification |
| CIRCLE_API_KEY | Prod | Circle API for real USDC verification |
| CIRCLE_WALLET_ID | Prod | Circle wallet for creator payouts |
| DEPLOYER_PRIVATE_KEY | Deploy | Private key for Base Sepolia |
| NEXT_PUBLIC_CONTRACT_ADDRESS | Prod | Deployed CitePayMarket address |
| AGENT_WALLET_ADDRESS | Prod | Agent wallet address |

## Test Commands

```bash
npm run test:unit     # agent scoring + evidence hash tests
npm run test:api      # API tests (requires running server)
cd contracts && npm test  # Solidity contract tests (Hardhat)
```

## Deployment

```bash
# Deploy to Vercel
npx vercel --prod

# Deploy contract to Base Sepolia
cd contracts && npm install
npx hardhat run scripts/deploy.ts --network baseSepolia
```

## Demo Script

1. /market — show creator sources with bond, reputation, price
2. /ask — enter a question, set budget $0.05
3. Watch proof console: 402 → payment → agent scoring → decisions
4. See source competition board (PAY / REFUSE / SKIP + reasons)
5. Click a receipt — view evidence preimage, hash, content hash
6. /traction — live metrics dashboard

## Known Limitations

- Creator payouts are simulated without CIRCLE_API_KEY
- x402 in dev mode accepts any X-PAYMENT header
- Runs on Base Sepolia testnet

## Future Roadmap

- Mainnet deployment with real USDC
- Multi-agent marketplace
- Creator staking via smart contract
- zkProof for evidence preimages
