# CitePay Markets — Submission Kit
> Everything needed to submit to the Lepton Agents Hackathon. Deadline: **July 6, 2026, 11:59 PM ET.** Form: https://forms.gle/SMqLaw2pMGDe58LFA · You may resubmit unlimited times before the deadline.

## Traction baseline (record before outreach)
As of Jul 4 evening: **404 on-chain citations · 827 agent decisions · 136 queries · 11 creators paid · $0.91 USDC routed.**
Measurement: watch `/traction` (on-chain counter climbs with real demo runs) + Vercel Analytics (visitor counts). Tomorrow's delta = real-human traction.

---

## FORM ANSWERS (copy-paste ready)

**Project Name:** CitePay Markets
**GitHub Handle:** cyberrockng
**Source Code:** https://github.com/cyberrockng/citepay-markets
**Project Live:** https://citepay-markets.vercel.app
**Team Size:** 1 (Solo)
**Video Demo:** _(paste YouTube/Loom link after recording)_

### Problem Statement
> AI agents cite human work constantly — but without permission, payment, or accountability. Creators get scraped and credited to a void; users can't tell if an agent's sources were paid for or just taken. As autonomous agents transact more, this becomes a real economic gap: there's no settlement layer for citations. CitePay makes every citation a real, on-chain payment with a tamper-evident receipt — turning "agents cite freely" into "agents pay creators, verifiably."

### Project Description
> CitePay is the policy and payment layer for AI citations. An agent asks a question with a budget; the server returns HTTP 402; the agent pays USDC via Circle Gateway on Arc; then Claude Haiku scores sources and issues PAY / REFUSE / SKIP decisions — each one a public, hash-verifiable receipt anchored on-chain via CitePayMarket.sol. Creators register content, set a price, optionally bond it; tampering is caught by objective hash-comparison, not AI opinion. Tech: Next.js, x402 + Circle Gateway, Arc Testnet, Claude Haiku, an on-chain contract, and a published MCP server (citepay-mcp) for Claude Code/Cursor. This week we also closed a two-way settlement loop with another agent network, Tollgate — mutually confirmed on-chain.

### Traction (update numbers to live before submitting)
> The product runs live on Arc Testnet with 404+ confirmed on-chain citation payments across 827 agent decisions, 136 queries, and 11 creators paid — all verifiable at /proof, read directly from the chain. Beyond human users, we validated agent-to-agent demand: Tollgate ran 5 autonomous paid queries into CitePay, and CitePay became Tollgate's first external paying reader (queryId 0x44dee…, confirmed by Tollgate on-chain). We're also the first external capital sponsor on Shadow Float V2. So validation comes from three sides — real citations, a mutually-confirmed cross-network loop, and a live financial integration. _(Add: "N real people ran the live demo this week" once outreach lands.)_

### Arc OSS — "why should we choose your project?" (optional field, do fill it)
> CitePay is fully open-source and built natively on Arc + Circle Gateway x402 — not ported, but designed around HTTP-402 settlement from the ground up. It ships a reusable MCP server, an on-chain citation contract, and the first mutually-confirmed two-way settlement loop between two independent agent networks on Arc. It's a working primitive other agent builders can plug into: a payment + trust layer for the citation economy.

---

## OUTREACH MESSAGES (fire before recording — drives real-user traction)

### Discord (Lepton hackathon channel)
> 🔨 **CitePay Markets is live — would love 30 seconds of your time**
>
> It's a payment + policy layer for AI citations: an agent asks a question, hits HTTP 402, pays USDC via Circle Gateway on Arc, then Claude Haiku scores sources and pays creators per citation — every decision a hash-verifiable, on-chain receipt.
>
> Try it, no wallet needed → **citepay-markets.vercel.app/demo** (auto-runs the full pay→cite→receipt flow in one click)
>
> It's all real: 400+ confirmed on-chain citations, verifiable at `/proof`. This week we also closed a two-way settlement loop with @Tollgate — agents from two teams paying each other on-chain.
>
> Any feedback massively appreciated 🙏 — happy to run a query into *your* project too if we can loop.

### X / Twitter (attach a receipt or /traction screenshot)
> AI agents cite your work every day — without permission or payment.
>
> CitePay fixes that: every citation becomes a real USDC payment with a tamper-proof, on-chain receipt. ⛓️
>
> Try it live (no wallet, 30s) 👉 citepay-markets.vercel.app/demo
>
> 400+ paid citations, all verifiable on-chain. Built on @arc + @circle x402.
>
> #LeptonHackathon #Arc #x402

### Friend DM
> Hey! I built something for a hackathon and I need 30 seconds of real feedback 🙏
>
> It's a system where AI agents actually *pay* the creators they cite — with a public receipt for every payment. No wallet needed, just click and watch it run:
>
> citepay-markets.vercel.app/demo
>
> Then hit me with one honest reaction — cool / confusing / meh. Means a lot 🙏

---

## FINAL CHECKLIST (Jul 6, before submitting)
- [ ] Video recorded (single guide: `docs/VIDEO_RECORDING_GUIDE.md`), uploaded, link ready
- [ ] Outreach fired; screenshot real-user reactions for the traction answer
- [ ] Update traction numbers in the form to live `/traction` values
- [ ] Confirm live site + `/demo` + `/proof` all green (they were, Jul 4)
- [ ] Fill Arc OSS checkbox + rationale
- [ ] Submit before 11:59 PM ET Jul 6 — then resubmit an improved version if time allows

## Verified assets (all confirmed Jul 4)
- Contract live on Arc: `0x396cf1646EbAeF85ee8428C2d9239C46Ae956085`
- MCP package works: `npx citepay-mcp` (v0.1.0)
- Tollgate two-way loop: queryId `0x44dee3a04a09ac6c`, mutually confirmed on-chain
- Demo wallet funded + spike-proof (~900 runs), refill source topped up (tx `0x52b1c124…f290f`)
- No secrets in repo/history; build + 16 tests pass; Vercel Analytics live
