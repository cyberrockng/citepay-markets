# Smart Contract Specification

## Overview

CitePay Markets includes an optional Solidity contract (`CitePayMarket.sol`) deployed on Base Sepolia. It provides on-chain anchoring of payment receipts and supports objective slashing when creators tamper with content after payment.

The contract is **optional** — the application works fully in dev mode without it.

---

## Contract: CitePayMarket.sol

**Network:** Base Sepolia (chainId 84532)  
**Compiler:** Solidity ^0.8.24  
**Status:** Not yet deployed (deploy address TBD)  
**Token:** USDC on Base Sepolia (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`)

---

## Data Structures

```solidity
struct Payment {
    address creatorWallet;
    uint256 amount;         // micro-USDC (6 decimals)
    bytes32 evidenceHash;   // SHA-256 of the evidence preimage JSON
    uint256 timestamp;
    bool slashed;
}
```

---

## Core Functions

### `recordPayment`

```solidity
function recordPayment(
    bytes32 receiptId,
    address creatorWallet,
    uint256 amount,
    bytes32 evidenceHash
) external onlyAgent returns (bool)
```

Called by the CitePay agent after a PAY decision. Anchors the evidence hash on-chain. Emits `PaymentRecorded`.

### `slashPayment`

```solidity
function slashPayment(bytes32 receiptId) external returns (bool)
```

Called by any observer after a content-hash challenge succeeds. Marks the payment as slashed. Emits `PaymentSlashed`.

Prerequisites:
- Receipt must exist
- Payment must not already be slashed
- Content hash at decision must differ from current content hash (enforced off-chain via `/api/challenge/:receiptId`)

### `getPayment`

```solidity
function getPayment(bytes32 receiptId) external view returns (Payment memory)
```

Returns the full payment record for a given receipt ID.

### `isSlashed`

```solidity
function isSlashed(bytes32 receiptId) external view returns (bool)
```

Returns whether a payment was successfully challenged.

---

## Events

```solidity
event PaymentRecorded(
    bytes32 indexed receiptId,
    address indexed creatorWallet,
    uint256 amount,
    bytes32 evidenceHash,
    uint256 timestamp
);

event PaymentSlashed(
    bytes32 indexed receiptId,
    address indexed creatorWallet,
    address indexed challenger,
    uint256 timestamp
);
```

---

## Access Control

- `onlyAgent` modifier restricts `recordPayment` to the configured `agentAddress`
- The agent address is set in the constructor and can be updated by the contract owner
- `slashPayment` is permissionless — any observer can challenge

---

## Deployment

```bash
# Install dependencies
npm run compile

# Deploy to Base Sepolia
npm run deploy:contract

# Required environment variables
PRIVATE_KEY=                    # Deployer private key
BASE_SEPOLIA_RPC_URL=          # Base Sepolia RPC URL
CITEPAY_PAYOUT_WALLET=         # Agent payout wallet address
```

After deployment, set `CITEPAY_CONTRACT_ADDRESS=<deployed address>` in `.env.local`.

---

## Contract Addresses

| Network | Address |
|---|---|
| Base Sepolia | TBD (not yet deployed) |
| Base Mainnet | Not deployed |

---

## Testing

```bash
cd contracts
npx hardhat test
```

Test coverage:
- `recordPayment` success and access control
- `slashPayment` success and already-slashed guard
- `getPayment` and `isSlashed` view functions
- Event emission checks
