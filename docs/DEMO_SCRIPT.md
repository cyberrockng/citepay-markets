# CitePay Markets — Demo Script

**Target duration:** Under 3 minutes  
**Audience:** Hackathon judges, technical observers  
**Format:** Live screen recording or walkthrough

---

## Setup (before recording)

1. Start dev server: `npm run dev`
2. Seed sources: `npx tsx scripts/seed-sources.ts`
3. Verify DB is fresh: `rm -f data/citepay.db && npx tsx scripts/seed-sources.ts`
4. Open browser to `http://localhost:3000`

---

## Script

### [0:00 – 0:20] The Problem

> "AI agents today cite sources without permission, without payment, and without accountability. CitePay fixes this. Every citation becomes a payment. Every decision becomes a public receipt."

Show the landing page briefly.

---

### [0:20 – 0:45] The Source Market

Navigate to `/market`.

> "Creators register their articles, research, and datasets here. Each source has a price in USDC, an optional credibility bond, and a content hash for tamper detection."

Point out: price in USDC, bonded badge, reputation score, content hash.

---

### [0:45 – 1:30] Ask a Question

Navigate to `/ask`.

> "I'm going to ask: 'What is x402 and how does it enable micropayments?' With a $0.05 budget."

1. Type the query
2. Set budget to 0.05
3. Click "Ask"

Show the 402 → payment → results flow:

> "The server returned HTTP 402. The client paid. Now the agent is scoring sources using Claude Haiku..."

Wait for results. Show the decision board:

> "4 sources got PAY decisions — USDC is being transferred right now. 3 were refused: too expensive or too weak. 2 were skipped as irrelevant."

---

### [1:30 – 1:55] Open a Receipt

Click on a PAY receipt.

> "Every decision has a public receipt. Here's what it contains: the query, the source, the score breakdown — relevance 85, price 68, bond 20, reputation 18 — total 72 out of 100. And the evidence preimage: the exact JSON payload that was hashed."

Show the "Hash valid: ✓ Yes" indicator.

> "Anyone can recompute this SHA-256 hash from the inputs and verify the agent didn't lie."

---

### [1:55 – 2:15] Creator Share Card

Still on the PAY receipt:

> "The creator gets a share card. One click to post on X or Farcaster: 'An AI cited my work and paid me USDC.'"

Click "Share on X" (don't actually post, just show the compose window opens).

---

### [2:15 – 2:35] Content Hash Challenge

> "What if the creator updates their content after getting paid? That's a violation."

Navigate to `/source/:id` for a source.

> "I'll paste in new content to simulate a post-payment edit."

Update the hash. Navigate back to the receipt.

> "Now I click 'Submit objective challenge.' The system compares the hash at decision time against the current hash. They differ. Challenge succeeds. Creator's reputation drops. No AI judgment — pure cryptographic proof."

---

### [2:35 – 2:50] Traction Dashboard

Navigate to `/traction`.

> "Here's the live traction dashboard. Every metric here comes from real agent decisions — PAY, REFUSE, SKIP — each backed by a SHA-256 evidence hash and recorded on Base Sepolia. Payments run through the x402 protocol with testnet USDC. This is the citation economy running end-to-end."

---

### [2:50 – 3:00] Closing

> "CitePay Markets: pay-to-query, AI scoring, tamper-evident receipts, on-chain anchoring, and creator share cards. Built in 48 hours on Base Sepolia with x402 and Circle USDC."

End recording.

---

## Key Demo Points to Hit

1. HTTP 402 response (show the network tab or the "Payment Required" state in the UI)
2. Agent making PAY / REFUSE / SKIP decisions with scores
3. Public receipt with evidence hash + score breakdown
4. Hash valid indicator
5. Creator share card + social share buttons
6. Content hash challenge working
7. Traction dashboard with real numbers

---

## Fallback (if live demo fails)

Have a 30-second pre-recorded video of the full flow as backup. Narrate from the recording if the live server is unavailable.
