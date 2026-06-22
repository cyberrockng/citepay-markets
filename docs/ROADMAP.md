# CitePay Markets — Roadmap

## Current State (Hackathon Demo, Jun 2026)

| Feature | Status |
|---|---|
| x402 pay-to-query via Circle Gateway | Live |
| Buyer agent with 3 spend policies | Live |
| Weighted citation payments | Live |
| Early stopping / sufficiency check | Live |
| SHA-256 tamper-evident receipts | Live |
| On-chain anchoring (`CitePayMarket.sol` on Arc) | Live |
| Non-custodial buyer wallet (MetaMask + SIWE + EIP-3009) | Live |
| Creator onboarding with WebAuthn passkey | Live |
| Multi-agent orchestration (`/api/orchestrate`) | Live |
| MCP server (Claude tool integration) | Live |
| Streaming agent console (SSE) | Live |
| Circle Developer-Controlled Wallets | Live |
| Circle App Kit (unified balance) | Live |
| Circle Gas Station | Live |
| Circle Modular Wallets (passkey smart accounts) | Live |

---

## Near-Term (Q3 2026)

### CreatorBond.sol

On-chain bonding contract that enforces the `bonded` flag agents already score against. Creators post USDC bond → earn bonded status → bond is slashable via `challengeHashChanged` if content hash changes after payment.

- BondedMandateEnforcer pattern (adapted from DeFi to citation economy)
- Slashing produces verifiable on-chain evidence — not subjective
- Conservative policy gate: agents can require bonded-only sources

### CitationMandate.sol

Per-session on-chain mandate: agent registers spend ceiling, daily cap, and policy preset before querying. Every PAY is checked against the mandate. Extends the accountability chain from the receipt layer to the intent layer.

```
query session starts
→ agent registers CitationMandate (on-chain, pre-query)
→ agent runs, PAY decisions anchor against mandate ID
→ mandate tracks cumulative spend; excess PAYs revert
```

This closes the gap between what the agent policy allows and what the on-chain record proves — today the policy is enforced off-chain, the contract only records outcomes.

### CCTP Cross-Chain Creator Funding

Creators and buyers on Base, Polygon, or Ethereum can bridge USDC to Arc via Circle CCTP without a centralized bridge. Flow:

1. Creator burns USDC on source chain
2. `/api/cctp/fund` verifies Circle Iris attestation
3. Arc mint + creator wallet credit executes automatically

This removes the Arc-only constraint for creators.

---

## Medium-Term (Q4 2026)

### Protocol Fee + Treasury

- 2.5% protocol fee on creator payments, accumulated in treasury contract
- Treasury deploys idle USDC to yield-bearing protocols on Arc
- Bonded creators earn a share of treasury yield proportional to bond size
- Creates a self-sustaining incentive loop: more bonds → more yield → higher bond attractiveness

### Agent Reputation NFT

Agents with long-run positive citation records receive a soulbound NFT attestation from `CitePayMarket.sol`. The NFT unlocks:
- Higher daily spend limits under aggressive policy
- Priority routing to premium bonded sources
- Reduced query fee ($0.0005 vs $0.001)

### Delegated Query

An orchestrating agent can pay the query fee on behalf of a sub-agent, passing `agentId` in the request. The sub-agent inherits the parent's reputation and policy. Enables truly hierarchical multi-agent citation networks.

---

## Long-Term (2027+)

### Arc Mainnet Launch

Deploy `CitePayMarket.sol` to Arc Mainnet once available. Migrate seeded sources. Live USDC flows replace testnet.

### Source NFT (ERC-6551)

Each registered source becomes a token-bound account. Creators can transfer ownership of their source's earnings stream to a DAO, fund, or agent portfolio.

### Citation Index Oracle

Publish a public on-chain oracle (`CitationIndex.sol`) that any protocol can read to verify whether a source has been cited N times with ≥ M relevance by agents with ≥ R reputation. Enables composable citation gating in DeFi (e.g. "only lend against sources cited ≥ 10 times").

### x402 v3 Support

Upgrade to x402 v3 when Circle publishes it. Support streaming payment channels for long-running agent sessions that query incrementally rather than in a single burst.

---

## What CitePay Does Not Plan

- Subjective slashing or human dispute arbitration (all challenges are objective hash comparisons)
- LLM-override of deterministic policy rules (agent policy is code, not a prompt)
- Centralized content storage (CitePay hashes, it does not host)
- Token issuance or speculative tokenomics
