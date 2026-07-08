# CitePay Clear Judge Handoff

This is the fastest way to evaluate CitePay Clear without needing a wallet, private keys, or setup.

## Start Here

Live app: https://citepay-markets.vercel.app

Primary demo: https://citepay-markets.vercel.app/clear/demo

The core claim is not "AI pays creators when cited." The core claim is:

> This citation was cleared: authorized, quote-supported, licensed, paid, and challengeable.

## 90-Second Path

1. Open `/clear/demo`.
2. Click `Run clearance proof`.
3. Confirm the fabricated quote is refused even though the advisory AI support score is high.
4. Open the paid clearance receipt.
5. Check the creator payout, evidence span, policy trace, hash integrity, and underlying payment receipt.
6. Open `/recover` to show post-answer enforcement for citations generated outside CitePay.

## What To Look For

### 1. Refusal before payment

CitePay Clear first proves that it can say no. A naive citation-payment system may pay whenever an answer includes a citation. CitePay Clear refuses a citation when the exact quoted span is not found in the licensed source text.

The important guarantee:

- Advisory support score can be high.
- Deterministic quote verification can still fail.
- If quote verification fails, amount paid stays `0`.

### 2. Claim-level clearance

Each claim receives its own clearance decision. The receipt shows:

- mandate authorization
- quote/span verification
- license decision
- policy result
- creator payout status
- challenge window status
- hash-bound proof data

### 3. Creator economics

The clearance receipt shows the creator wallet, source, amount due, amount paid, payment status, and underlying payment receipt. This keeps creator compensation visible without adding a broad creator dashboard.

### 4. Post-answer enforcement

The recovery surface audits answers CitePay did not generate. It is compute-only by default; settlement is separate, mandate-scoped, budget-capped, and duplicate-claim guarded.

### 5. Existing on-chain foundation

CitePay Clear extends the already-deployed `CitationMandate.sol` instead of replacing it.

Contracts:

- CitePayMarket: `0x396cf1646EbAeF85ee8428C2d9239C46Ae956085`
- CreatorBond: `0x7DBa1C67Fd9BA976aE09E744D8cbcC71F805D6C0`
- CitationMandate: `0xBad090764dd720B5EdcD8B49e054D5d8Ce13C695`

## Verified Production Examples

Paid clearance:

- Clearance ID: `c9cfcd45-d8e5-4ead-b37b-b5dae2e5f4fa`
- URL: https://citepay-markets.vercel.app/clearance/c9cfcd45-d8e5-4ead-b37b-b5dae2e5f4fa
- Result: creator payout visible, payment confirmed, underlying receipt linked.

Refused clearance:

- Clearance ID: `71239ecb-0d6a-4cd2-9616-78d5b3e981c1`
- URL: https://citepay-markets.vercel.app/clearance/71239ecb-0d6a-4cd2-9616-78d5b3e981c1
- Result: unsupported quote refused, quote verification false, amount paid `0`.

## How This Differs From Access Toll Projects

Access tolls prove that an agent paid to read content. CitePay Clear proves a narrower and stronger thing: a specific claim was authorized, supported by an exact source span, licensed, policy-approved, paid if valid, refused if invalid, and preserved in a challengeable receipt.

Access and payment systems prove an agent paid. CitePay Clear proves a specific claim deserved payment before money moved.

## Scope Discipline

The Clear surface is intentionally narrow:

- `/clear/demo`
- `/clearance/[id]`
- `/api/clear/demo-run`
- `/api/clear/[id]`

Recovery endpoints exist for controlled missed-citation handling, but the judge path does not depend on a broad dashboard, dispute UI, or multi-mode settlement system.

## Local Verification

```bash
npm ci
npx tsc --noEmit
npx eslint .
npm run test
npm run build
```

The test suite includes regression coverage for the critical guarantee: a high advisory support score cannot mark an absent quote as verified.
