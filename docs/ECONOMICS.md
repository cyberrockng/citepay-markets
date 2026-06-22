# CitePay Economics

## Fee Model

Every query through CitePay Markets involves two distinct payment layers.

### Layer 1 — Query Fee (agent → platform)

| Item | Amount | Mechanism |
|---|---|---|
| Query fee | $0.001 USDC | x402 nanopayment via Circle Gateway on Arc |
| Payer | Buyer agent (server key or non-custodial session EOA) | EIP-3009 `transferWithAuthorization` |
| Receiver | `PAYMENT_RECEIVER` (agent wallet) | Circle Gateway BatchFacilitatorClient settles on-chain |
| Settlement | Sub-second on Arc Testnet | `CitationPaid` event on ArcScan |

The query fee is enforced at the HTTP layer — no fee, no response. Any agent (curl, Claude MCP, custom SDK) that can sign an EIP-3009 transfer can query CitePay.

### Layer 2 — Creator Payments (agent → creator wallets)

The buyer agent allocates a per-session budget (default $0.05 USDC) across cited sources. Payments are **not flat** — they are weighted by relevance contribution.

```
totalCreatorBudget = sum(source.price for all PAY decisions)
contributionWeight[i] = relevance[i] / sum(relevance for all PAY)
weightedAmount[i]     = contributionWeight[i] × totalCreatorBudget
```

**Example** (3 sources paid, balanced policy):

| Source | Listed Price | Relevance Score | Weight | Actual Payment |
|---|---|---|---|---|
| x402 Protocol Docs | $0.003 | 87 | 42% | $0.00357 |
| Circle Wallets Guide | $0.002 | 74 | 36% | $0.00288 |
| Agentic AI Overview | $0.003 | 55 | 27% | $0.00216 (–$0.00084) |
| **Total** | **$0.008** | **216** | **100%** | **$0.008** |

Total USDC out is always preserved exactly (rounding drift assigned to highest-weight source). Listed prices act as a floor signal, not a fixed fee.

---

## Weighted Citation — Design Rationale

Flat per-source pricing creates two failure modes:

1. **Gaming**: creator lists at maximum price regardless of content quality — any PAY pays equally
2. **Noise tolerance**: agent pays the same for a 90-relevance source as a 45-relevance source

Relevance-proportional weighting aligns creator earnings with the value they actually delivered to the query. A source that scores 87 relevance earns more than one scoring 45, even if both are cited.

The weight is baked into the SHA-256 evidence preimage (`scoreInputs.contributionWeight`, `scoreInputs.weightedAmountPaid`), making the redistribution tamper-evident.

---

## Policy Economics

Agent spend policies cap spending before the weighted distribution runs:

| Policy | Max per citation | Min relevance | Max daily | Early stop |
|---|---|---|---|---|
| Conservative | $0.002 | 70 | $0.01 | 2 citations |
| Balanced | $0.005 | 40 | none | 3 citations |
| Aggressive | $0.010 | 20 | none | 5 citations |

**Early stopping** (sufficiency check) halts citation after enough high-quality sources are found, preserving budget. The stop threshold is policy-aware: conservative agents stop earlier, aggressive agents exhaust more of the source list.

Three stop conditions (whichever triggers first):
- Citation cap hit (e.g. 3 for balanced)
- Cumulative relevance target reached (e.g. 210 for balanced)
- 88% of session budget spent (hard floor across all policies)

---

## Creator Bonding Economics

Creators can post a USDC bond when registering a source. Bond size signals credibility:

- Bonded sources earn `bond: true` in agent scoring (+20 score points)
- Conservative policy **requires** bonded sources (`requireBonded: true`)
- Bond is slashable via `challengeHashChanged` if content is modified after payment

Expected creator earnings increase non-linearly with bond: a bonded source at moderate relevance out-earns an unbonded source at high relevance under conservative policy.

---

## Agent Reputation Economics

Agents accumulate reputation on `CitePayMarket.sol` through citation behaviour:

- PAY decision on a source that later passes content challenge → reputation +1
- PAY decision on a source later slashed for hash change → reputation −1
- Long-run positive reputation enables higher daily policy limits (roadmap)

---

## Revenue Model (Mainnet Path)

| Stream | Rate | Direction |
|---|---|---|
| Query fees | $0.001/query | Agent → platform |
| Protocol fee on creator payments | 2.5% (roadmap) | Creator earnings → protocol treasury |
| Bonding yield (roadmap) | Creator bond earns APY via treasury deployment | Protocol → creator |

See `docs/ROADMAP.md` for the mainnet fee structure.
