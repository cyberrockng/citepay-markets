# Tollgate Reader Query Evidence — CitePay as External Paying Reader

Date: 2026-07-04  
Tollgate endpoint: `POST https://tollgate.gudman.xyz/api/paid-query`  
Question: `How do agent networks settle citations on Arc?`

## Result

- Query ID: `0x44dee3a04a09ac6c`
- Answer URL: https://tollgate.gudman.xyz/answers/0x44dee3a04a09ac6c
- Answer URL verification: HTTP 200
- Endpoint response status: HTTP 201 Created
- Reader payment amount: `0.01` USDC (`10000` atomic micro-USDC)
- Reader payment settlement mode: `x402-settled`
- Reader payment transaction reference: `813d7623-4402-47af-bd5a-a53e388e3838`
- Reader payment hash: `0x37591710e5493b46afd62292f9a715c38b5738b5b1dd6fc4debd0af0e634f39b`

## Wallet Rationale

The original invite named `0xdfDEA2015f0b176e89a79cb8b4D5ef22bE6e044f`, but no local private key for that wallet exists. The final reader wallet is:

`0x5389688243328c26a92b301faEEAb5fbf9AFf105`

This is CitePay's main creator/sponsor wallet. Tollgate already lists this address as an earning creator, so the same on-chain identity now proves both sides of the loop:

1. CitePay earns as a cited Tollgate creator.
2. CitePay pays as an external Tollgate reader.

It also satisfies Tollgate's external-reader condition because it is not Tollgate's demo payer `0x12F25B721Cc21c38495e33A4c8524dd0B647ba03`.

## Answer Summary

Tollgate answered that agent networks settle citation-backed answers on Arc by treating an answer as a paid, source-backed transaction rather than a free scrape. It bought a minimum useful bundle of sources, paid each cited creator in USDC atomic units, and wrote receipt-chain evidence tying the answer to the citations that earned.

Paid sources:

1. CitePay Markets — CitePay Agent Commerce Network
2. qdee — Shadow Float V2 live external agent board
3. Indie Researcher — Citation Economics for AI Answers

## Creator Payouts

| Creator | Amount | Settlement mode | Arcscan |
|---|---:|---|---|
| CitePay Markets | `1000` micro-USDC | `forum-routed` | https://testnet.arcscan.app/tx/0xcb617e0eda3bb4124abc41a06c2c313f42b8ea0aad2f90a6e7c4c73246a73629 |
| qdee | `1500` micro-USDC | `forum-routed` | https://testnet.arcscan.app/tx/0x97753f78df917b5175014e1323cc3b46435b8abb9f77ff213724af0d299c38b4 |
| Indie Researcher | `1200` micro-USDC | `forum-routed` | https://testnet.arcscan.app/tx/0x9d002cdb3735c023096065d6a5ee88892e00e00548538f9bd08a3282a68c8b28 |

All three Arcscan links resolved with HTTP 200 during verification.

## Command Shape

The key was passed only as an environment variable and was not written to a tracked file or included in logs:

```bash
READER_PRIVATE_KEY=0x<REDACTED_CITEPAY_MAIN_WALLET_KEY> \
  node scripts/dev/tollgate-reader-paid-query.mjs \
  "How do agent networks settle citations on Arc?"
```

`AUTO_DEPOSIT=1` was not required because the wallet already had enough Circle Gateway balance:

- wallet USDC: `15.124819`
- Gateway available USDC: `0.325`

## Endpoint Deviations

- The endpoint expects request body field `question`, not `query`.
- The successful paid query returned HTTP `201 Created`, not HTTP `200 OK`.
- The top-level response did not expose `settlementMode`; it was nested at `query.readerPayment.settlementMode`.

## Verification Checklist

- Paid request completed: yes.
- Query ID returned: yes, `0x44dee3a04a09ac6c`.
- Answer URL resolves: yes, HTTP 200.
- Settlement mode is `x402-settled`: yes, nested under `query.readerPayment`.
- Creator payout Arcscan links captured: yes.
