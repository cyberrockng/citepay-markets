# Verification Guide

Copy-paste commands to verify CitePay Markets claims independently.

## 1. x402 gate is real — no payment, no access

```bash
curl -i -X POST https://citepay-markets.vercel.app/api/ask \
  -H 'content-type: application/json' \
  --data '{"question":"What is x402?"}'
# Expected: HTTP 402 Payment Required
```

## 2. Fake payment is rejected

```bash
curl -i -X POST https://citepay-markets.vercel.app/api/ask \
  -H 'content-type: application/json' \
  -H 'X-PAYMENT: fake-payment-should-fail' \
  --data '{"question":"What is x402?"}'
# Expected: HTTP 402 or payment verification failure
```

## 3. Confirmed creator payments

```bash
curl https://citepay-markets.vercel.app/api/proof
# Returns only receipts with paymentStatus=confirmed and Arc tx hash
```

## 4. On-chain stats (direct from Arc Testnet)

```bash
curl https://citepay-markets.vercel.app/api/onchain-stats
# Returns CitationPaid event count from CitePayMarket.sol
```

## 5. Live traction

```bash
curl https://citepay-markets.vercel.app/api/traction
```

## 6. App health

```bash
curl https://citepay-markets.vercel.app/api/health
```

## 7. Run tests locally

```bash
npm ci
npm run lint
npx tsc --noEmit
npm run build
npm run test:unit
cd contracts && npm ci && npm run compile && npm test
```

## 8. Contracts on ArcScan

- CitePayMarket.sol: https://testnet.arcscan.app/address/0x396cf1646EbAeF85ee8428C2d9239C46Ae956085
- CreatorBond.sol: https://testnet.arcscan.app/address/0x7DBa1C67Fd9BA976aE09E744D8cbcC71F805D6C0
- CitationMandate.sol: https://testnet.arcscan.app/address/0xBad090764dd720B5EdcD8B49e054D5d8Ce13C695

## 9. Agent wallet on ArcScan

https://testnet.arcscan.app/address/0x5389688243328c26a92b301faEEAb5fbf9AFf105
