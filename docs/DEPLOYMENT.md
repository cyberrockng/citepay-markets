# Deployment Guide

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 18+ | Runtime |
| npm | 9+ | Package manager |
| Vercel CLI | latest | Deploy |
| Arc Testnet ETH | ≥ 0.01 | Gas for on-chain anchoring |
| Arc Testnet USDC | ≥ 1.0 | Agent wallet balance for creator payments |

---

## Local Development

```bash
git clone https://github.com/cyberrockng/citepay-markets
cd citepay-markets
npm install
cp .env.example .env.local   # fill in required vars (see below)
npm run dev                  # http://localhost:3000
```

First local cold start auto-seeds 10 creator sources into the local SQLite fallback. Production receipts and history use Neon when `DATABASE_URL` is configured.

---

## Environment Variables

### Required

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude Haiku for source scoring + answer generation |
| `AGENT_PRIVATE_KEY` | Agent wallet — pays creators, anchors on-chain. Must hold Arc USDC. |
| `AGENT_WALLET_ADDRESS` | Public address matching `AGENT_PRIVATE_KEY` |
| `DATABASE_URL` | Neon Postgres URL for durable receipts and traction history |
| `REPLAY_GUARD_SECRET` | Random HMAC secret; required in production because replay protection fails closed if unset |

### Circle Gateway (x402)

| Variable | Description | Default |
|---|---|---|
| `CIRCLE_GATEWAY_URL` | Circle Gateway testnet endpoint | `https://gateway-api-testnet.circle.com` |
| `DEMO_BUYER_KEY` | Demo buyer wallet for `/api/demo-query*` paths | Deterministic key |

### On-Chain Anchoring

| Variable | Description | Default |
|---|---|---|
| `ARC_RPC_URL` | Arc Testnet RPC | `https://rpc.testnet.arc.network` |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | `CitePayMarket.sol` address | `0x396cf1646EbAeF85ee8428C2d9239C46Ae956085` |
| `ARC_CREATOR_BOND_ADDRESS` | `CreatorBond.sol` address | Set after deploy |
| `ARC_CITATION_MANDATE_ADDRESS` | `CitationMandate.sol` address | Set after deploy |
| `ARC_USDC_ADDRESS` | Arc USDC precompile | `0x3600000000000000000000000000000000000000` |

### Circle Developer-Controlled Wallets (optional)

| Variable | Description |
|---|---|
| `CIRCLE_API_KEY` | Circle API key for DCW |
| `CIRCLE_ENTITY_SECRET` | Circle entity secret |
| `CIRCLE_WALLET_SET_ID` | Wallet set ID for creator payouts |

If DCW vars are missing, creator payments fall back to direct viem ERC-20 transfers from `AGENT_PRIVATE_KEY`.

### Auth / Security

| Variable | Description |
|---|---|
| `REGISTER_API_KEY` | Authorization for `POST /api/sources/register` |
| `REPLAY_GUARD_SECRET` | Required HMAC secret for replay protection in production |

### Feature Flags

| Variable | Default | Description |
|---|---|---|
| `X402_DEV_MODE` | `false` | Accept `X-PAYMENT` header without real Circle Gateway verification (local dev only) |
| `DISABLE_ONCHAIN_ANCHOR` | `false` | Skip Arc anchoring (faster local dev) |

---

## Vercel Deployment

```bash
npm i -g vercel
vercel --prod
```

Set all environment variables in the Vercel dashboard under **Settings → Environment Variables**, or use:

```bash
vercel env add ANTHROPIC_API_KEY
vercel env add AGENT_PRIVATE_KEY
# ... repeat for each variable
```

The project uses `force-dynamic` on all API routes — no edge caching. Production receipts and traction history are durable in Neon when `DATABASE_URL` is configured; SQLite is only the local-development fallback.

---

## Contract Deployment

```bash
cd contracts
npm install
npm run deploy:arcTestnet
```

`contracts/.env`:
```
DEPLOYER_PRIVATE_KEY=<Arc testnet wallet with ETH>
ARC_RPC_URL=https://rpc.testnet.arc.network
```

Deploys all three contracts — CitePayMarket, CreatorBond, CitationMandate — and prints all addresses.

After deployment, set the three `ARC_*_ADDRESS` env vars in Vercel, then authorize the agent wallet:

```bash
npx hardhat run scripts/authorize-agent.ts --network arcTestnet
```

---

## Verifying the Deploy

```bash
# 1. Check 402 gate
curl -X POST https://citepay-markets.vercel.app/api/ask \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}' -w "\n%{http_code}"
# → 402

# 2. Check traction
curl https://citepay-markets.vercel.app/api/traction | jq '.paidCitations'

# 3. Check MCP
curl https://citepay-markets.vercel.app/api/mcp \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

---

## GitHub Actions Setup

Three workflows run automatically:

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | Push / PR to main | Type-check + unit tests + Next.js build |
| `agent-heartbeat.yml` | Every 6 hours + manual | Live query → receipt verification → MCP health |
| `publish-receipts.yml` | Daily at 00:00 UTC + manual | Traction snapshot + on-chain anchor check |

Required GitHub repo secrets (Settings → Secrets → Actions):

```
CITEPAY_URL=https://citepay-markets.vercel.app
```

The CI workflow stubs secrets for the build step — no real API keys needed in CI.

---

## Arc Testnet Resources

| Resource | URL |
|---|---|
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Faucet | `https://faucet.arc.network` |
| Chain ID | 5042002 |
| USDC precompile | `0x3600000000000000000000000000000000000000` |
| Circle Gateway wallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
