# Smart Contract Specification

## Overview

CitePay Markets includes `CitePayMarket.sol` deployed on Base Sepolia. It provides on-chain anchoring of source registrations, citation decisions, and content-integrity challenges.

The backend mirrors all data to SQLite for fast reads. The contract is the authoritative on-chain record.

---

## Contract: CitePayMarket.sol

**Network:** Base Sepolia (chainId 84532)  
**Compiler:** Solidity ^0.8.24  
**Address:** [`0x396cf1646EbAeF85ee8428C2d9239C46Ae956085`](https://sepolia.basescan.org/address/0x396cf1646EbAeF85ee8428C2d9239C46Ae956085)  
**Token:** USDC on Base Sepolia (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`)  
**Explorer:** https://sepolia.basescan.org/address/0x396cf1646EbAeF85ee8428C2d9239C46Ae956085

---

## Core Functions

### `registerSource`

```solidity
function registerSource(
    address payoutWallet,
    bytes32 contentHash,
    string calldata metadataURI,
    uint256 price,
    uint256 bond
) external payable returns (uint256 sourceId)
```

Registers a creator source. `contentHash` is the SHA-256 of the content at registration time. Bonded sources post ETH as credibility collateral.

### `payCitation`

```solidity
function payCitation(
    uint256 sourceId,
    bytes32 queryHash,
    bytes32 evidenceHash
) external onlyAuthorizedAgent returns (uint256 receiptId)
```

Called by an authorized agent after a PAY decision. Records the citation on-chain, increments source reputation, and emits `CitationPaid`.

### `recordDecision`

```solidity
function recordDecision(
    uint256 sourceId,
    uint8 decision,
    bytes32 queryHash,
    bytes32 evidenceHash,
    uint8 reasonCode
) external onlyAuthorizedAgent returns (uint256 receiptId)
```

Records a REFUSE (decision=1) or SKIP (decision=2). Emits `CitationRefused` or `CitationSkipped`.

### `challengeHashChanged`

```solidity
function challengeHashChanged(uint256 receiptId) external returns (bool)
```

Objective-only challenge. Succeeds only if `currentHash != contentHashAtDecision`. On success: creator reputation −3, agent reputation −1. Emits `HashChallengeResolved`.

### `updateSourceHash`

```solidity
function updateSourceHash(uint256 sourceId, bytes32 newContentHash) external
```

Called by the creator to update their content hash. Enables challengers to detect post-payment tampering.

---

## Events

```solidity
event SourceRegistered(uint256 indexed sourceId, address indexed creator, address payoutWallet, bytes32 contentHash, uint256 price, uint256 bond);
event CitationPaid(uint256 indexed receiptId, uint256 indexed sourceId, address indexed agent, address creator, uint256 amount, bytes32 queryHash, bytes32 evidenceHash);
event CitationRefused(uint256 indexed receiptId, uint256 indexed sourceId, address indexed agent, bytes32 queryHash, bytes32 evidenceHash, uint8 reasonCode);
event CitationSkipped(uint256 indexed receiptId, uint256 indexed sourceId, address indexed agent, bytes32 queryHash, bytes32 evidenceHash, uint8 reasonCode);
event SourceHashUpdated(uint256 indexed sourceId, bytes32 oldHash, bytes32 newHash);
event HashChallengeResolved(uint256 indexed receiptId, uint256 indexed sourceId, address agent, address creator, uint256 refundAmount);
event SourceReputationChanged(uint256 indexed sourceId, int256 oldScore, int256 newScore);
event AgentReputationChanged(address indexed agent, int256 oldScore, int256 newScore);
```

---

## Access Control

- `onlyAuthorizedAgent` — restricts `payCitation` and `recordDecision` to agents authorized by the owner and who have posted a bond
- `onlyOwner` — restricts `setAuthorizedAgent`
- `challengeHashChanged` — permissionless, anyone can challenge

---

## Receipt Mirror Architecture

The backend records every decision in SQLite for fast API reads. The contract serves as the authoritative on-chain anchor. Both stores share the same `evidenceHash` (SHA-256 of the evidence preimage JSON), making receipts independently verifiable.

```
/api/ask  →  agent scores sources
          →  PAY: payCreator() USDC transfer + insertReceipt() in SQLite
                  + anchorPAY() → payCitation() on CitePayMarket.sol
          →  REFUSE/SKIP: insertReceipt() in SQLite
```

---

## Contract Addresses

| Network | Address |
|---|---|
| Base Sepolia | [`0x396cf1646EbAeF85ee8428C2d9239C46Ae956085`](https://sepolia.basescan.org/address/0x396cf1646EbAeF85ee8428C2d9239C46Ae956085) |
| Base Mainnet | Not deployed |

---

## Testing

```bash
cd contracts
npx hardhat test
```

17 tests covering: source registration, agent authorization, payCitation, recordDecision, content hash challenge, reputation slashing, double-challenge guard, and market stats.

---

## Deployment

```bash
cd contracts
npm run deploy:baseSepolia
```

Required environment variables in `contracts/.env`:
```
DEPLOYER_PRIVATE_KEY=   # Wallet private key with Base Sepolia ETH
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```
