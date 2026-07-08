# CitePay — Post-Hackathon Plan
**Status:** draft, not yet reviewed for commit. Written 2026-07-08 against the live repo state (commit `4e73070`). Revised same day to add a product-and-distribution layer above the original engineering plan (§5), following review.
**Author's note to future readers:** this document was written by inspecting the actual codebase, not by assumption. Every route, table, and function named below exists in this repo as of the commit above — check `git log` if that's changed.

---

## 1. Executive Summary

AI answer engines and autonomous agents now read, summarize, and cite human-written work millions of times a day. When one of those systems pays a creator at all, the payment proves one thing: money moved. It proves nothing about whether the citation was *true* — whether the quoted text actually exists in the source, whether the agent was licensed to use it, whether the claim it supports is the claim the source actually makes.

**CitePay is the layer that proves the second thing.** Given an AI agent's citation — a claim, a quote, a source — CitePay answers: was this agent authorized to use this source, does the quoted text actually appear there, was the license valid, and was the creator paid *because* all of that checked out, not merely because a citation was present? Every answer comes back as a public, hash-verifiable receipt: a **Clearance Receipt** — and when the citation is fake, CitePay refuses to pay and says exactly why.

This already works, live, on real infrastructure, not slideware: 400+ on-chain settlement events on Arc Testnet, a deployed policy-enforcement contract, and a regression-tested guarantee that a confident-but-fabricated AI citation gets refused even when the AI itself is sure it's right. The hackathon build proved the mechanism. This document is the plan for turning that mechanism into something publishers, agent builders, and platforms would actually pay for — and, critically, into something a non-technical reader can *see* and trust, not only an API a developer calls.

**One sentence for a partner meeting:** *A payment proves money moved. CitePay proves the citation deserved payment.*

**One sentence for where the product is going:** *The clearance and trust layer for AI citations — giving creators proof, payment, and protection whenever AI systems use their work.*

---

## 2. The Real Problem

Four things are true at once, and none of the current solutions handle all of them together:

- **AI answer engines are eating publisher traffic.** Readers get their answer from the AI, never click through, and the source gets nothing — not a visit, not a mention, not a payment.
- **Access tolls prove access, not correct use.** An AI crawler can pay to read a page and then misquote it, fabricate a claim, or cite it for something it never said. Nothing in a pay-per-crawl or bot-monetization system checks that afterward — they're built to answer "did this bot pay to get in," not "did the resulting sentence actually come from here."
- **Licensing deals favor whoever can negotiate one.** Large publishers get direct commercial agreements with AI labs. Independent writers, small newsletters, and documentation maintainers get neither the deal nor the leverage to demand one — they need a system that works without a negotiation.
- **There is no neutral receipt for a *correct* citation.** When an AI cites something wrong — a hallucinated quote, a paraphrase presented as a direct quote, a claim the source doesn't support — there's no independent record showing the citation failed, and no mechanism for a creator or reader to challenge it after the fact.

The gap isn't payment infrastructure — Circle, Coinbase's x402, and half a dozen access-toll products have that solved. The gap is **verification**: nothing in the current landscape checks, at the level of a specific claim and a specific quoted span, whether an AI's citation was true before money changes hands — and nothing gives a creator or a skeptical reader a way to independently check that later, *or see it at a glance without reading an API response*.

---

## 3. CitePay's Post-Hackathon Category

**Category: Citation clearance infrastructure for AI agents and answer engines.**

Not "AI pays creators when cited" — that framing is small, and it's the one every access-toll and payment-rail product already occupies. Clearance is a different claim: *this specific citation was checked, and here is the proof of what was checked.*

Why this category beats the adjacent ones on their own terms, not by dismissing them:

- **Stronger than pay-per-crawl.** A toll proves an agent paid to *read*. Clearance proves what the agent *did with what it read* — whether the resulting claim is actually supported.
- **Stronger than generic x402 content gates.** A payment gate is commodity infrastructure — anyone integrating Circle's stack gets one. The verification step in between the gate and the payout is the part nobody else in this space has built.
- **Stronger than a creator marketplace.** A marketplace solves discovery and listing. It says nothing about whether a specific citation drawn from that marketplace was used correctly.
- **Stronger than being an answer engine.** Answer engines compete for end users. Clearance infrastructure serves *every* answer engine, agent framework, and publisher as a neutral layer none of them has to build themselves — it's B2B2C, not another consumer product fighting for the same eyeballs.
- **Stronger than a proof-only receipt system.** A receipt without a verification step in front of it just proves a transaction happened — it says nothing about whether the transaction *should* have happened. CitePay's receipts are downstream of a real check, not a substitute for one.
- **Stronger than attribution-only systems.** Attribution estimates *how much* a source contributed, usually via a proprietary scoring model a third party can't audit. Clearance proves, at the level of one claim and one quoted span, that the source was actually used — independently checkable by anyone, not just trusted on the vendor's word.

---

## 4. Product Vision

CitePay as a full product, organized around what already exists (see §6) plus what completes the category claim:

- **Citation Clearance API** — the core, callable primitive: given a claim, a candidate quote, and a source, return authorized/supported/licensed/paid/refused, with a receipt. *(exists: `POST /api/clear/demo-run` as the scripted version; needs a general-purpose, parameterized endpoint — see Phase 2.)*
- **Publisher/Creator Licensing Console** — let a creator register content, set price and license terms, and see their clearance history without needing a broad dashboard. *(partially exists: `/register` for source registration; license terms and per-creator view are new.)*
- **Agent Mandate System** — an operator-signed, budget- and rule-bound policy an agent operates under. *(exists: `ClearMandateConfig` + the deployed `CitationMandate.sol` contract + `src/lib/anchor.ts`'s `createMandateOnChain`/`closeMandateOnChain`.)*
- **Claim-Level Quote/Span Verification** — the deterministic, non-negotiable check. *(exists and is the strongest asset in the repo: `src/lib/clear/quote-verify.ts`.)*
- **Creator Payout Receipts** — what a creator actually earned, per claim. *(exists: the Creator Payout panel on `/clearance/[id]`.)*
- **Refusal Receipts** — proof a bad citation was caught, not just a log entry. *(exists: any `UNSUPPORTED`/`BLOCKED_*` clearance is a full, public receipt, same as a paid one.)*
- **Recovery for Unpaid/Uncleared Citations** — audit an answer CitePay didn't generate. *(exists: `/recover` + `POST /api/clear/recover/audit`, settlement via `POST /api/clear/recover/settle`.)*
- **Challenge/Audit Workflow** — dispute a clearance after the fact. *(schema exists — `clearance_challenges` table in `src/lib/db.ts` — but has no insert/read functions or route wired to it yet. This is a real gap between what's modeled and what's built; see Phase 5.)*
- **Public Proof Pages** — every clearance is already a durable, linkable page. *(exists: `/clearance/[id]`.)*
- **Integration SDK/MCP Endpoint** — let any Claude/agent framework call CitePay as a tool. *(exists: `citepay-mcp` on npm, `src/app/api/mcp/route.ts`, tools `cite_query`/`get_receipt`/`check_policy`/`probe_source` — currently scoped to the base citation flow, not yet the Clear surface; see Phase 2.)*
- **Clear Badge** — a visible, embeddable trust mark for a cleared or refused citation. *(does not exist yet; see §5.1 and Phase 3 — the highest-leverage addition to this plan for making CitePay legible to non-developers.)*
- **CitePay Watch** — scheduled, creator-directed recovery against a submitted content list. *(does not exist yet; see §5.2 and Phase 4 — an extension of the existing recovery engine, not new infrastructure.)*
- **Publisher Policy File ingestion** — machine-readable terms a creator hosts on their own domain. *(does not exist yet; see §5.4 and Phase 1.)*
- **Analytics for Creators/Publishers** — earnings and clearance-rate trends over time. *(does not exist yet; explicitly deferred — see §16 and the backlog. A dashboard is the wrong Phase-0/1 investment.)*

---

## 5. CitePay's Product Expansion: From API to Trust Standard

Everything in §4 above is true, and none of it is visible to anyone who isn't a developer reading an API response. That's the real gap in this plan's first draft: an API-first roadmap describes how CitePay works, not how it becomes something people recognize, demand, and spread on their own. This section is the fix.

CitePay should evolve into three surfaces, not one:

1. **CitePay Clear API** — for agents and answer engines to verify, license, and pay before publishing a citation. (This is everything in §4 and the original roadmap — unchanged.)
2. **CitePay Clear Badge** — a public label shown beside AI citations, proving whether the citation was cleared, refused, challenged, or paid.
3. **CitePay Watch** — a creator-facing monitoring and recovery tool that helps writers, publishers, and maintainers detect unpaid, fake, or misused AI citations after publication.

The API is the engine. The Badge and Watch are what make the engine *legible and demanded* by people who will never call an API directly — journalists, independent writers, documentation maintainers, and readers.

### 5.1 CitePay Clear Badge

A small, embeddable, publicly verifiable mark — the same category of trust signal a payment-processor checkout badge or a C2PA content-credential icon is, applied to a citation instead of a page or an image. Any newsletter, docs site, or answer engine can embed it next to a citation.

**Why it matters:** a reader trusts a citation without reading a receipt page. A publisher can demand the badge from any AI product that wants to cite them, the same way sites demand HTTPS today. An AI tool gains a credibility signal it can show its own users. And every embed puts CitePay's name somewhere a developer's API integration never would — this is the mechanism that makes CitePay *visible* everywhere AI answers appear, not just present in agent backends.

**What it must show, and the discipline that keeps it honest:** badge states map directly onto the real, existing `ClaimDecision` and `ChallengeStatus` values in `src/lib/clear/types.ts` — never a second, parallel vocabulary that could drift from what the code actually decided. Friendlier display copy is fine (e.g. "Quote Not Found" for `UNSUPPORTED`); a badge state that isn't a direct rendering of a real field is not.

| Badge label (display) | Backing field |
|---|---|
| Cleared · Creator Paid | `decision === "CLEARED"` and `amountPaidMicro > 0` |
| Quote Not Found | `decision === "UNSUPPORTED"` |
| License Blocked | `decision === "BLOCKED_LICENSE"` |
| Policy Blocked | `decision === "BLOCKED_POLICY"` |
| Over Budget | `decision === "OVER_CAP"` |
| Challenge Open | `challengeStatus === "OPEN"` (overrides the above until resolved) |

**The staleness problem, and why it matters more than it looks:** Phase 5 exists specifically so a wrong clearance can be overturned. A badge that's a statically cached image would keep showing "Cleared" in an archived newsletter or a cached docs page after a challenge overturns it — which would make the badge actively dishonest, the opposite of its purpose. It must be served dynamically with a short cache TTL, and its click-through target is always the live `/clearance/[id]` page, never a static snapshot.

**Technical direction:** a thin rendering layer over data that already exists — the badge route reads from the same source `GET /api/clear/[id]` already serves; it does not duplicate or re-derive the evaluation. This follows the exact reuse pattern `src/app/opengraph-image.tsx` already establishes in this codebase for dynamic image generation from receipt data — the badge is the same category of artifact, applied to a smaller, embeddable format (SVG, matching the shields.io/GitHub-badge convention most developers already recognize).

**The distribution loop this closes:** every badge's click-through page (`/clearance/[id]`) should carry a small, honest call-to-action — "Verify your own agent's citations" for a developer who lands there, "Register your content" for a creator who lands there via a citation of their own work. Without this, the badge is a trust display; with it, every embed is also a funnel. This is a one-line addition to an existing page, not new infrastructure.

### 5.2 CitePay Watch

The real creator question this answers: *"Who is using my work, and are they using it correctly?"* — asked after publication, without the creator having to know in advance which URL an agent cited them from.

**Honest scope, stated explicitly because the name invites overreach:** "Watch" must not become a web-scale crawling or monitoring service — that's a different, much harder, and much more expensive product (and it's exactly the category §7's differentiation table already says CitePay is *not*: TollBit does bot-traffic monitoring; CitePay does claim verification). v1 of Watch is a creator submitting a list of URLs — their own site, RSS feed, specific known citing pages — and CitePay running the *existing* recovery evaluator (`matchAndEvaluateCandidate` in `src/lib/clear/recover.ts`) against that list on a schedule, re-checking for new citations or changes since the last run. This reuses the cron infrastructure already present in this repo (`src/app/api/cron/auto-query`, `cron/discord-update`, `cron/gap-agent` are all working precedent for scheduled Vercel functions) — it is not new infrastructure, only a new schedule and a creator-facing submission list.

Autonomous discovery — finding citations of a creator's work *without being told where to look* — is a genuinely different, harder problem (search-API integration, alerting infrastructure) and belongs later, only if there's real demand for it once the submitted-list version is proven. Do not build it as part of v1.

### 5.3 Non-Crypto Adoption Mode

Do not force a journalist, researcher, or school librarian to understand USDC, Arc, or x402 before they can get value from CitePay.

**The useful reframe here is mostly about naming a capability that's already half-built, not inventing a new one.** `POST /api/clear/recover/audit` already *is* proof-only mode — it computes what would clear and what wouldn't, and never calls `createPaidReceipt`. What's missing is recognizing this as a deliberate, named **product mode** available on the forward/live clearance path too, not just recovery of past answers: the already-planned `POST /api/clear/check` (§4, Phase 2) is specified as dry-run, no settlement — that *is* proof-only mode for live citations. The product work here is exposing this explicitly as two named modes wherever CitePay is presented, not two different technical systems:

- **Proof-only mode** — verify citation correctness (quote span, license match) with no payment involved. The entry point for anyone who doesn't have or want a wallet: journalists fact-checking, researchers auditing, schools evaluating AI tool outputs, legal/compliance reviewers.
- **Paid-clearance mode** — verify and pay, the full loop this plan's engineering sections already describe.

This is the single cheapest, highest-leverage change in this whole document: no new evaluation logic, only explicit product framing and UI/messaging that lets non-crypto users adopt CitePay before they ever need to think about a wallet.

### 5.4 Publisher Policy File (`/.well-known/citepay.json`)

A machine-readable declaration a creator hosts **on their own domain** — `https://creatorsite.com/.well-known/citepay.json` — describing allowed usage, price per citation, quote limits, license class, their payout wallet, whether payment is required at all, and whether AI training use is separately permitted. This is the concrete, buildable version of the RSL-alignment §7 (Market Differentiation) already gestures at abstractly.

**Technical scope, stated precisely so it's buildable without becoming a live-fetch dependency on every evaluation:** this file is resolved and cached **at source-registration time** (`/register`, `insertSource`), not fetched live on every single `evaluateClaimClearance` call — a live fetch on the hot path would be slow and fragile, and registration-time ingestion is consistent with how the rest of the license/policy fields already work (a registered, cached `licenseClass`, not a live lookup). The `.well-known` convention itself is already precedented in this exact codebase (`src/app/robots.txt`, `src/app/sitemap.xml`) — this is the same pattern, aimed outward at creator domains instead of inward at CitePay's own site.

This is what makes CitePay feel like infrastructure a creator's own site declares, rather than an app a creator has to separately trust.

### 5.5 Trust Score

Reputation over time — agent clearance rate, refusal rate, misquote rate, creator payout total, challenge-upheld rate, source reliability — turning CitePay from a per-transaction receipt generator into a running trust signal for a creator or an agent.

**The guardrail this needs, or it becomes a credibility risk instead of a trust asset:** a rate or percentage computed from a thin sample is worse than no score at all — a "100% clean" badge built on two real clearances is statistically noise dressed as confidence, and presenting it as a score invites over-trust exactly where the data doesn't support it. Raw counts (cleared: 2, refused: 0) are always honest to show, at any volume. A converted rate or score only renders once a real minimum sample size is met (the exact threshold is a product decision to make with real data, not a hackathon-time guess — do not ship a percentage-based score before that threshold logic exists).

**Scope boundary:** Trust Score stays a per-entity signal shown on a creator's or agent's own clearance/badge surface. It is explicitly **not** a searchable public ranking or leaderboard — that would edge into Phase 6 (Network and marketplace) territory, which stays deferred per §10 and §16 regardless of how appealing a leaderboard sounds.

---

## 6. Current Repo Reality (inspected, not assumed)

**Contracts (deployed, Arc Testnet chainId `5042002`):**
- `CitePayMarket.sol` — `0x396cf1646EbAeF85ee8428C2d9239C46Ae956085` — citation payment anchoring.
- `CreatorBond.sol` — `0x7DBa1C67Fd9BA976aE09E744D8cbcC71F805D6C0` — creator staking/bonding.
- `CitationMandate.sol` — `0xBad090764dd720B5EdcD8B49e054D5d8Ce13C695` — on-chain mandate registration and per-citation ALLOW/BLOCK attestation (retrospective — see below).

**Clear-specific library (`src/lib/clear/`):** `evaluate.ts` (`evaluateClaimClearance` — the real pre-payment gate: mandate active → license → source policy → quote verified → support score → price/budget, in that order), `quote-verify.ts` (`verifyQuoteSpan` — deterministic, NFKC-normalized substring match; the single load-bearing guarantee in the product), `settle.ts` (`createPaidReceipt` — shared real-settlement path), `recover.ts` (`matchAndEvaluateCandidate`, `auditMandate`), `hash.ts`, `source-text.ts`, `types.ts`.

**Clear routes:** pages `/clear/demo`, `/clearance/[id]`, `/recover`; APIs `POST /api/clear/demo-run`, `GET /api/clear/[id]`, `POST /api/clear/recover/audit`, `POST /api/clear/recover/settle`.

**Base platform this is built on (do not rebuild any of it):** `src/lib/policy.ts` (`AgentPolicy`, three presets — conservative/balanced/aggressive — plus `evaluatePolicy`), `src/lib/x402.ts` (Arc/Circle constants, `verifyGatewayPayment`, `verifyDirectPayment`, `build402Response`), `src/lib/anchor.ts` (`anchorPAY`, `anchorBLOCKED`, `registerSourceOnChain`, `isBondedOnChain`, `createMandateOnChain`, `closeMandateOnChain`), `src/lib/payments.ts` (`payCreator`), `src/lib/signature.ts` (`signReceiptHash`, `verifyReceiptSignature`), `src/lib/evidence.ts` (`sha256`, `buildEvidencePreimage`, `hashEvidence`).

**Precedent worth reusing for §5's new surfaces:** `src/app/robots.txt` and `src/app/sitemap.xml` establish the `.well-known`-style machine-readable-file pattern §5.4 needs. `src/app/opengraph-image.tsx` establishes the dynamic-image-from-receipt-data pattern §5.1's badge needs. `src/app/api/cron/*` establishes the scheduled-Vercel-function pattern §5.2's Watch needs. None of §5 requires new architectural categories — all of it composes existing patterns.

**Important architectural fact, verified by reading the code, not assumed:** `CitationMandate.sol`'s on-chain check runs *after* payment settles, and its result is never read downstream in this codebase — it's a retrospective attestation, not a pre-payment enforcement gate. The real pre-payment gate is `evaluateClaimClearance()` in `src/lib/clear/evaluate.ts`, running entirely in deterministic application code before any settlement call fires. Any external-facing material should describe it this way — "extends the existing on-chain mandate system with the first real pre-payment enforcement layer," not "the mandate contract enforces this on-chain."

**Database (SQLite local + Neon durable, `src/lib/db.ts` / `src/lib/neon.ts`):** 17 local tables including the Clear-specific `clear_mandate_configs`, `claim_clearances`, `clearance_certificates`, `clearance_challenges` (schema exists, unused — no insert/read functions built), `recovery_reports`. Every Clear table has a Neon-durable mirror with `local ?? await getNeon...()` fallback reads — verified live in production twice this project cycle (once for the base lookup gap, once for a source-identifier-stability gap where local `sources.id` regenerates on every cold start and only `onChainId` is stable).

**Security posture as of this commit:** `POST /api/clear/demo-run` and `GET /api/clear/[id]` are rate-limited (audit findings H2/L1 addressed for demo-run; `[id]` remains a lower-priority gap). `POST /api/clear/recover/audit` is rate-limited (20s window, 8 lifetime cap per instance) and input-capped at 6000 characters. `POST /api/clear/recover/settle` requires an existing budget-bearing mandate (never the unlimited audit-only mandate), re-evaluates against that mandate's real rules rather than trusting the audit's optimistic result, checks remaining budget via `getSpentMicroByMandateConfigId`, is replay-guarded via `src/lib/replay-guard.ts`, has a **permanent** duplicate-settlement check (`hasSettledClaim`/`getNeonHasSettledClaim` in `db.ts`/`neon.ts` — added specifically because the time-bound replay guard alone wasn't sufficient for this case), and requires an explicit `confirm: true`.

**Tests:** 52 passing across 7 files (`agent.test.ts`, `payment-flow.test.ts`, `rate-limit.test.ts`, `quote-verify.test.ts`, `clear-evaluate.test.ts`, `clear-recover.test.ts`, `api.test.ts` — the last excluded from `npm test` as a live-server integration suite). `npm run test` is wired into `.github/workflows/ci.yml` and runs on every push/PR. `tsc --noEmit` and `npx eslint .` both currently pass with zero errors; `npm run build` succeeds.

**Public proof of the core guarantee, live right now:** `docs/CLEAR_JUDGE_HANDOFF.md` cites two real, independently re-verifiable clearance IDs — a cleared/paid one and a refused one — both confirmed resolving correctly against production as of this writing.

---

## 7. Market-Informed Product Differentiation

Verified against the companies' own public materials, not assumed from secondhand description:

| | What they do | Where CitePay differs |
|---|---|---|
| **Cloudflare Pay Per Crawl / Monetization Gateway** | Lets site owners charge AI crawlers per page/dataset/API access, using x402-style stablecoin payment, before the crawler reads anything. | Cloudflare prices and gates *access*. CitePay evaluates *use* — after an agent has a candidate claim and quote, before it pays, checking whether that specific claim is actually supported by that specific source. Complementary, not competing: an agent could pass Cloudflare's toll to read a page, then still need CitePay to clear the citation it wants to make from it. |
| **TollBit** | Helps publishers (Reuters, Forbes, CNN and similar) separate AI bot traffic from human traffic, gate it, and monetize it — confirmed via their own site: the product is access control and licensing-deal facilitation. No evidence they verify downstream usage of what was accessed. | TollBit answers "did this bot pay to get in." CitePay answers "was what it said afterward actually true." A publisher could run both — TollBit at the door, CitePay at the citation. |
| **ProRata.ai** | Attribution and revenue-sharing for content that contributes to AI answers — confirmed via their own site: they commit to sharing "50% of revenues with content partners," but the mechanism for calculating contribution isn't published, and there's no stated way for an outside party to independently verify an attribution. | ProRata estimates *how much* a source contributed, on their own scoring, trusted on their word. CitePay proves, per claim, that a specific quoted span exists in a specific source — independently checkable by anyone via the receipt's hashes and the deterministic verification logic, not trusted on CitePay's word either. |
| **C2PA / Content Credentials** | Provenance for the *content itself* — where an image or document came from, its edit history, whether it's been manipulated. | C2PA answers "is this content authentic." CitePay answers "was this content used correctly by an AI, and was its creator paid for that use." The two are genuinely complementary: a C2PA-credentialed source is a *better* input to a CitePay clearance, not a competing claim. |
| **RSL (Really Simple Licensing) / emerging AI licensing standards** | Machine-readable declarations of what an AI is and isn't permitted to do with a piece of content. | RSL is a *declaration* format — it doesn't enforce or receipt anything by itself. CitePay is a natural *enforcement and receipting* layer for exactly that kind of declaration: a mandate's `requiredLicenseClass` field is already the shape of "check this license before paying," §5.4's policy file makes this concrete, and could read an RSL-format declaration as its license source in the future rather than only CitePay's own registered `licenseClass` field. |

**Honest bottom line:** CitePay does not replace any of these. It is the one layer in this list that answers "was the *specific use* correct," which none of the others currently do — and every one of them is a plausible upstream partner (access-gate before clearance) or format source (license before clearance), not a competitor to displace.

**One more distinction §5 makes concrete:** every product in this table is essentially invisible to an end reader — a payment happened somewhere in a backend, or a licensing deal exists on paper. The Clear Badge (§5.1) is the one thing in this entire competitive set designed to be *seen*, by a normal reader, at the moment they encounter an AI citation. That's not a minor UX detail — it's the difference between infrastructure only developers know exists and a trust mark the public starts to expect.

---

## 8. Wedge Product

**Sharper than "publishers and agent builders" in general: technical writers and open-source documentation maintainers whose work is frequently used by coding agents.**

- **Target user:** an open-source documentation maintainer or technical writer whose docs are already being read and cited by coding agents (Claude Code, Cursor, and similar) on a daily basis, almost always uncompensated and unacknowledged.
- **First use case:** a coding agent framework integrates the Clearance API as the step between "I found a candidate doc page" and "I'm about to cite it in a generated answer or code comment" — CitePay verifies the exact API signature, config example, or instruction actually appears in the docs before the agent asserts it.
- **Buyer:** on the maintainer side, the individual or small team maintaining the docs. On the agent side, the engineering lead of a coding-agent product or framework.
- **Why this wedge specifically, not the broader one:** coding agents already cite documentation constantly — this isn't a hypothetical use case, it's current behavior. Documentation maintainers are demonstrably underpaid relative to the value their docs provide to paid AI coding products. This audience already understands APIs, which removes most of the adoption friction §5.3's non-crypto mode exists to solve for *other* audiences — but proof-only mode still matters here for maintainers who want verification visibility before they ever think about payment. GitHub and docs-site integration is a natural distribution channel (a badge on a README or docs page, not a separate portal). And the stakes are concrete, not abstract: a coding agent misquoting a docs page doesn't just misattribute a source — it can produce code that doesn't work, which makes "verify the citation is real" a functional-correctness pitch, not only a fairness one.
- **Painful problem it solves:** maintainers currently have no way to know their docs were cited incorrectly by an agent, nor any mechanism to be compensated when cited correctly. Coding-agent builders have no way to prove, to a user debugging a hallucinated API call, that their citations are checked.
- **Why now:** x402/Circle-rail micropayments just became viable at the transaction sizes citations actually need (sub-cent), and the AI-content-licensing market (Brookings and others have covered this directly) is visibly forming around access and blanket deals — leaving the *verification* layer open before anyone else claims it, and coding-agent adoption is accelerating faster than any licensing conversation publishers are having.
- **Why CitePay wins the wedge specifically:** it already has the hard, unglamorous 20% built and *proven* — deterministic quote verification that survives an adversarial high-confidence-but-false test, a real deployed contract, real settlement, real durability across cold starts. A competitor starting today is behind on exactly the part that's hardest to fake convincingly in a demo.
- **Pricing possibility:** a small flat fee per cleared citation (see §12) plus a free tier for maintainers to register docs and use proof-only mode indefinitely — payment should never be a precondition for a maintainer seeing whether their docs are being cited correctly.
- **Onboarding flow:** maintainer registers a docs repo/site and license terms (`/register`, extended per Phase 1 with §5.4's policy-file ingestion) → a coding agent calls the Clearance API against a doc page → the maintainer sees their first real clearance (or refusal, in proof-only mode with zero setup) without having negotiated anything → a Clear Badge on the docs page or README makes it visible to every future visitor.

---

## 9. Founder-Level Go-To-Market Plan

**First 10 users:** 4–5 open-source documentation maintainers whose docs are visibly cited by coding agents (the sharpened wedge from §8 — start here, not with the broader creator population), 2–3 independent AI/crypto-research newsletter writers (small enough to say yes fast, technical enough to understand the pitch immediately), 2 small technical blogs, 1–2 hackathon/agent-builder teams already shipping something that cites external sources.

**First 3 partner types:** (1) coding-agent frameworks and MCP-tool builders who want a "we verify our doc citations" integration story — the sharpest match for §8's wedge, (2) small/independent publishers already frustrated with AI scraping but too small for a TollBit/ProRata-style negotiated deal, (3) other Arc/x402 hackathon-ecosystem builders who need a citation layer and would rather integrate than build one (the CitePay↔Tollgate cross-network settlement precedent from this project cycle is a real, usable case study here).

**Outreach message (maintainer/creator side):** *"Coding agents cite your docs every day, whether or not they get it right. CitePay lets you check — free, no wallet needed — whether an agent's citation of your work actually holds up, and get paid with a public, checkable receipt when it does."*

**Outreach message (agent-builder side):** *"Your agent cites documentation. Can you prove, to a user debugging a hallucinated API call, that the citation was real? CitePay is the check that runs before your agent asserts it. One API call, one badge, one receipt."*

**Demo story:** the existing 90-second `/clear/demo` flow (see §15) — a fabricated quote gets refused despite a high AI confidence score, a real one gets cleared and paid, both produce a public receipt with an embeddable badge. This is the whole pitch in one sitting; don't build a longer version for GTM before this version has actually converted a handful of real users.

**Onboarding flow:** maintainer or agent builder → register (existing `/register` flow, extended with §5.4's policy file and proof-only mode from §5.3) → first real clearance within the same session, no payment required to see it work → receipt link and Clear Badge they can put in their own README/docs page/newsletter as proof — this is also the distribution mechanism, not only the proof (§5.1).

**Trust proof needed:** the two things a skeptical first user will ask — "is the payment real" (yes, testnet USDC today, same rails scale to mainnet) and "can I verify this myself without trusting you" (yes — every receipt's hashes are independently recomputable, `/proof` reads on-chain events directly, not from CitePay's database, and proof-only mode means they don't even need to trust the payment rail to get value).

**Traction metrics to collect from day one:** cleared citations, refused citations (this number matters *more* than cleared count for the pitch — it's the proof the check is real), unique creators/maintainers paid or verified (proof-only counts too), unique agent/integration callers, Clear Badge embeds in the wild, recovery-audit runs against externally-generated answers, and — once Phase 5 exists — challenge outcomes.

---

## 10. Product Roadmap

### Phase 0 — Preserve and package current proof
**Goal:** make the current demo impossible to misunderstand.
**Features:** `docs/CLEAR_JUDGE_HANDOFF.md` (exists) kept current with live, re-verified clearance IDs; this document committed; README's judge path (exists, already correctly ordered) kept in sync as later phases land.
**Files:** `docs/CLEAR_JUDGE_HANDOFF.md`, `README.md`, `docs/POST_HACKATHON_PLAN.md`.
**Tests:** none new — this phase is documentation discipline.
**Risks:** letting the handoff doc's cited example IDs go stale as the demo data changes.
**Success criteria:** any new reader can go from README to a verified, working clearance receipt in under 2 minutes without help.
**What not to build yet:** anything code-level — this phase is entirely about not losing what's already proven.

### Phase 1 — Publisher/creator onboarding
**Goal:** a creator can register content, license terms, wallet, and price without any code — and, per §5.4, optionally declare those terms on their own domain instead.
**Features:** extend the existing `/register` flow (source registration already works) with license-class selection (reuse the `licenseClass`/`assetType`/`verificationStatus` columns already added to `sources` in `src/lib/db.ts`) and a "my clearances" view scoped to one creator wallet — reuse the existing Creator Payout panel logic from `/clearance/[id]` rather than building new aggregation. Add `/.well-known/citepay.json` resolution (§5.4) as an alternative registration path: given a domain, fetch and cache its policy file at registration time rather than requiring manual form entry of terms already published there.
**Files:** `src/app/register/page.tsx` (extend), new `src/app/creator/[wallet]/clearances/page.tsx` (or extend the existing `src/app/creator/[wallet]/` route if it already covers this — check before adding a new one), reuse `src/lib/db.ts` source functions, new `src/lib/clear/policy-file.ts` (fetch + parse + cache a creator's declared policy file).
**Tests:** a test asserting a newly registered source's `licenseClass` is respected by `evaluateClaimClearance` on the very next clearance run against it; a test asserting policy-file ingestion produces the same registered fields manual entry would.
**Risks:** turning "register content" into a form with too many fields — keep it to what Phase 2's API actually needs. Policy-file fetching needs the same timeout/size safety as Phase 4's URL-fetch work, applied once and shared.
**Success criteria:** a real, non-technical creator registers content and sees their license terms reflected in a real clearance decision, without any assistance — including via a policy file they never had to manually transcribe into a form.
**What not to build yet:** bulk import, RSS-based auto-registration beyond what already exists (`register-rss` route), any creator analytics beyond a simple clearance list.

### Phase 2 — Clearance API (the real product)
**Goal:** an external agent can request claim clearance through a general-purpose API/MCP call, not only the scripted demo — in both proof-only and paid-clearance mode (§5.3).
**Features:** a new `POST /api/clear/check` (dry-run, no settlement — proof-only mode, matches the naming already implied by the existing `/api/clear/[id]` GET convention) accepting `{ claimText, quoteText, sourceUrl or sourceId, mandateConfigId }` and returning the same `ClaimClearance` shape the demo already produces, by calling `evaluateClaimClearance` directly instead of only through the fixed 4-case script. A settlement variant (paid-clearance mode) reusing `createPaidReceipt` from `src/lib/clear/settle.ts` (already shared between `demo-run` and `recover/settle` — this is the third caller, not a new pattern). New MCP tools on the existing `citepay-mcp` package (`src/app/api/mcp/route.ts` already has the JSON-RPC scaffold) — `clear_claim`, `get_clearance` — added alongside, not replacing, `cite_query`/`get_receipt`/`check_policy`/`probe_source`.
**Files:** `src/app/api/clear/check/route.ts` (new), `src/app/api/clear/settle/route.ts` (new — general-purpose, distinct from `recover/settle` which stays specific to recovered findings), extend `src/app/api/mcp/route.ts`, extend the `citepay-mcp` npm package.
**Tests:** `tests/clear-check.test.ts` covering the same decision matrix already proven in `clear-evaluate.test.ts`, called through the new route's request/response shape, including a proof-only-mode call asserting no settlement path is ever triggered.
**Risks:** this is the first Clear route callable by an arbitrary, unauthenticated-by-default third party — needs the same rate-limit/input-cap discipline already applied to `recover/audit`, from day one, not retrofitted after a real integration abuses it.
**Success criteria:** a real external agent framework (even a toy one) calls the API and gets a correct, receipt-backed decision without needing to understand CitePay's internals, in either mode.
**What not to build yet:** a full developer portal, API key self-service billing, or SDKs beyond the existing MCP tool and a documented curl example.

### Phase 3 — Public trust pages (and the Clear Badge)
**Goal:** every cleared or refused citation already has a durable public proof page (`/clearance/[id]` — this exists). This phase makes that page discoverable, embeddable, and citable.
**Features:** a lightweight per-creator public page listing their real clearance history (reuses Phase 1's aggregation); OpenGraph metadata on `/clearance/[id]` so a linked receipt renders well when shared (check `src/app/opengraph-image.tsx` — the base product already has an OG pattern for receipts to extend); the **Clear Badge** (§5.1) — a dynamically-served SVG badge route reading from `GET /api/clear/[id]`, short cache TTL, click-through carrying the distribution-loop CTA.
**Files:** extend `src/app/opengraph-image.tsx` for clearance pages specifically, extend the creator page from Phase 1, new `src/app/api/clear/[id]/badge/route.ts` (SVG generator).
**Tests:** a test asserting the badge route's output changes correctly when the underlying clearance's `challengeStatus` changes (the staleness guarantee from §5.1, made concrete and testable).
**Risks:** none significant on the OG/creator-page work; the badge's cache-TTL choice is the one real design decision — too long risks staleness after a challenge, too short adds unnecessary load for a mostly-static artifact.
**Success criteria:** a creator or maintainer can put a badge in a newsletter footer or README and it renders as real, checkable, *currently accurate* proof — not a bare URL, and not a stale claim.
**What not to build yet:** a searchable public directory of all clearances — that's Phase 6 territory and premature before there's real volume worth searching.

### Phase 4 — Recovery engine (and CitePay Watch)
**Goal:** already substantially built — `/recover` + `POST /api/clear/recover/audit` + `POST /api/clear/recover/settle` exist and are tested. This phase is hardening, reach, and turning one-time recovery into the scheduled version described in §5.2.
**Features:** accept a URL in addition to pasted text (fetch and extract the answer text server-side before running the existing extraction pipeline) — the extraction and evaluation logic (`matchAndEvaluateCandidate` in `src/lib/clear/recover.ts`) doesn't need to change, only the input path. **CitePay Watch v1** (§5.2): a creator submits a URL list, a scheduled cron job (reusing the existing `src/app/api/cron/*` pattern) re-runs the recovery evaluator against that list periodically, surfacing new findings since the last run — explicitly not autonomous discovery.
**Files:** extend `src/app/api/clear/recover/audit/route.ts` to accept `{ url }` as an alternative to `{ answer }`; new `src/app/api/cron/watch/route.ts` (scheduled) and a `watch_lists` table (creator wallet → submitted URLs) following the exact same SQLite-local/Neon-durable pattern as every other Clear table.
**Tests:** a test confirming URL-sourced text runs through the identical evaluator as pasted text — no separate/relaxed logic, matching the existing discipline stated in the route's own docstring; a test confirming a scheduled Watch run only surfaces genuinely new findings, not re-flagging the same ones every cycle.
**Risks:** fetching arbitrary external URLs server-side is a real SSRF-class risk surface — needs an allowlist or at minimum strict timeout/size/redirect limits before shipping, not after. Watch specifically must stay bounded to creator-submitted lists — do not let scope drift toward autonomous crawling under this feature's name.
**Success criteria:** pasting a real, published AI-generated article URL correctly identifies at least one recoverable or unsupported citation from real, non-CitePay-generated content; a Watch list correctly surfaces a new finding on a scheduled re-run without manual re-submission.
**What not to build yet:** browser-extension or automatic-discovery versions of recovery/Watch — manual paste/URL/submitted-list is the right scope until there's real demand for automation beyond it.

### Phase 5 — Challenge/dispute workflow
**Goal:** creators and users can challenge a clearance they believe is wrong.
**Features:** the `clearance_challenges` table already exists in `src/lib/db.ts` with no functions wired to it — this phase builds `insertClearanceChallenge`/`getClearanceChallengesByClearanceId` (matching the exact pattern every other Clear table already uses, including the Neon durable mirror), a `POST /api/clear/[id]/challenge` route, and objective-only challenge types resolved in code (quote-not-present, license-mismatch, wrong-source-hash — all deterministically checkable, matching the "no LLM resolves a challenge" rule already binding on every other part of this system). The Clear Badge (§5.1/Phase 3) must reflect `challengeStatus === "OPEN"` immediately once this ships.
**Files:** `src/lib/db.ts` (new functions), `src/lib/neon.ts` (new durable mirror functions, matching every existing pattern), `src/app/api/clear/[id]/challenge/route.ts` (new), a challenge-status section on `/clearance/[id]` (partially exists — the page already reads `challengeStatus`/`challengeDeadline`, just has no way to actually file one yet).
**Tests:** a test proving an objectively-checkable challenge (quote genuinely absent) resolves UPHELD deterministically, and a genuinely-supported clearance's challenge resolves REJECTED — no subjective/LLM-judged path.
**Risks:** this is the highest-scope-risk phase in the roadmap — resist building a full dispute UI; a single objective-check-and-resolve endpoint is the entire Phase 5 scope.
**Success criteria:** a real challenge against a real UNSUPPORTED clearance resolves correctly and updates the public receipt and its badge.
**What not to build yet:** subjective/human-adjudicated disputes, an appeals process, or any UI beyond a status display plus one action.

### Phase 6 — Network and marketplace
**Goal:** searchable licensed evidence assets for agents to discover, not just clear — and, if real usage supports it, a public Trust Score (§5.5) surface.
**Features:** explicitly the last phase — a discovery layer over the creator base built in Phases 1–3.
**Files:** not specified here — premature to design before Phases 1–5 have real usage data to design against.
**Tests:** not specified here.
**Risks:** this is exactly the kind of broad surface that turned a competitor's otherwise-strong hackathon entry into its biggest weakness (verified independently this cycle: the one project with the most feature breadth also scored worst on scope discipline in a structured competitive comparison). Do not start this phase until Phases 1–5 are live with real, non-CitePay-employee users.
**Success criteria:** N/A until scoped against real Phase 1–5 usage.
**What not to build yet:** all of it, until there's a real creator/agent base to build a marketplace for — including any public Trust Score leaderboard, per §5.5's scope boundary.

---

## 11. Technical Architecture (post-hackathon)

**Database model:** keep the dual local-SQLite/Neon-durable pattern exactly as it exists — it's proven, it's cheap, and it's already correctly applied everywhere in the Clear surface except `clearance_challenges` (Phase 5 must apply the identical pattern, not a new one). New §5 tables (`watch_lists` for Phase 4) follow the same pattern from day one. Do not migrate off SQLite-for-local/Neon-for-durable before there's a concrete reason tied to real load, not aesthetics.

**Clearance API:** `evaluateClaimClearance()` (`src/lib/clear/evaluate.ts`) is the API's real engine and should remain the single call site for every clearance decision — `demo-run`, `recover/settle`, and the new Phase 2 `check`/`settle` routes all call the same function. Never fork it; if a new caller needs slightly different behavior, add a parameter, don't duplicate the evaluator.

**License policy engine:** currently a single `requiredLicenseClass` string match inside `evaluateClaimClearance`. Post-hackathon, this should grow into a small, structured policy object (allowed license classes plural, not singular; §5.4's policy-file ingestion as an alternative source to the manually-registered field) — but stays inside the same evaluator function, not a new service.

**Quote verification engine:** `verifyQuoteSpan()` (`src/lib/clear/quote-verify.ts`) — deterministic, NFKC-normalized substring match, offset-preserving. This is the least negotiable piece of architecture in the whole system. Any future change to it requires the exact adversarial regression test already in `tests/quote-verify.test.ts` and `tests/clear-evaluate.test.ts` to keep passing: a high advisory score must never override a failed match.

**Payment and payout flow:** `createPaidReceipt()` (`src/lib/clear/settle.ts`) is already the single shared real-settlement path across all callers — keep it that way as Phase 2 adds a third caller. Proof-only mode (§5.3) is not a variant of this function — it's the code paths that never call it at all, which already exists in `recover/audit` and will exist in `clear/check`.

**Receipt hashing/signing:** `sha256`/`buildEvidencePreimage`/`hashEvidence` (`src/lib/evidence.ts`) plus `signReceiptHash` (`src/lib/signature.ts`) — unchanged, reused as-is.

**Public proof pages and the Badge:** `/clearance/[id]` — extend with Phase 3's OG metadata and Phase 5's challenge UI; the core page structure (Clearance Summary checklist, Claim-Level Evidence, Mandate and Policy Trace, Creator Payout, Hash Integrity) stays as the template for anything new. The Badge route (`src/app/api/clear/[id]/badge/route.ts`) is a read-only renderer over the same `GET /api/clear/[id]` data — it must never independently re-derive a decision; if the underlying clearance changes (a challenge resolves), the badge reflects it on next fetch, governed by its cache-TTL, not by re-evaluation.

**Policy-file resolver (§5.4):** a new, narrow module (`src/lib/clear/policy-file.ts`) that fetches `{sourceDomain}/.well-known/citepay.json` at registration time only, with the same fetch-safety constraints as Phase 4's URL input (timeout, size cap, no following unbounded redirects), parses a small fixed schema, and writes the result into the existing `sources` license/price fields — it is a registration-time ingestion path, not a runtime dependency of `evaluateClaimClearance`.

**Watch scheduling (§5.2):** reuses the existing `src/app/api/cron/*` pattern and Vercel's cron trigger mechanism already configured for this project — a new scheduled route, not new scheduling infrastructure.

**Trust Score computation (§5.5):** a pure aggregation over existing `claim_clearances`/`clearance_challenges` rows for a given creator or mandate — no new source of truth, and gated by the minimum-sample threshold before any rate/percentage is exposed, only raw counts below it.

**Neon/Vercel durability:** every new persisted, later-referenced entity needs the same checklist applied every time this cycle: (1) is its ID stable across a cold serverless instance, or does something regenerate it (matching `sources.id`'s known instability — always prefer `onChainId`-style stable identifiers for anything referenced across requests); (2) does every lookup function have a Neon fallback (`local(id) ?? await getNeon(id)`); (3) is the fallback actually wired into the route, not just defined and unused (this happened once already — `getNeonRecoveryReportById` existed but wasn't called for weeks before an audit caught it). This checklist applies to `watch_lists` and `clearance_challenges` exactly as it applies to everything already shipped.

**Rate limits:** every payment-triggering or LLM-calling route gets `createRateLimiter` from `src/lib/rate-limit.ts` — no exceptions, applied at route creation, not retrofitted after an incident. This includes Phase 4's Watch cron endpoint and Phase 1's policy-file fetch path, both of which touch external network resources.

**Anti-abuse protections:** budget caps enforced by `evaluateClaimClearance`'s price/budget gate (never trust a caller's claimed remaining budget — always recompute from `getSpentMicroByMandateConfigId` + its Neon-max-of-both-stores counterpart); replay protection via `src/lib/replay-guard.ts` for time-bound signatures, plus a permanent `hasSettledClaim`-style check for anything that needs non-expiring idempotency (settle's real fix this cycle — the lesson generalizes to any future "this exact thing must never happen twice" requirement).

**Observability:** currently `console.error` on failure paths throughout `neon.ts`/`replay-guard.ts`/etc. — sufficient for current scale; a structured logging/alerting layer is explicitly a "should build" item, not a blocker (see backlog).

**Key security risks to close before real external traffic:** (1) Phase 4's URL-fetch path (and §5.4's policy-file fetch, and §5.2's Watch fetches) needs SSRF protection before shipping (allowlist or strict fetch constraints — one shared utility, not three separate implementations); (2) Phase 2's new public API needs its own API-key/auth layer, not just IP-based rate limiting, before any paying integration depends on it; (3) `clearance_challenges` (Phase 5) must inherit the exact "objective checks only, no LLM adjudication" discipline already proven everywhere else, or the whole system's core credibility claim weakens.

---

## 12. Business Model

Realistic options, in the order they should actually be tested:

1. **Small platform fee per cleared citation** (test this first). Reasoning: it's the closest thing to already working — a cleared claim already moves real money through `createPaidReceipt`; a platform fee is a percentage skim on a transaction that already happens, requiring the least new infrastructure and the fastest path to a real revenue number to show a partner or investor.
2. **API usage pricing for agents/agent frameworks** (test second, once Phase 2 ships). A per-call or metered price for `POST /api/clear/check` — the natural pricing model once external, non-CitePay-generated traffic exists to charge for. Proof-only-mode calls should be priced lower than paid-clearance calls, or free up to a threshold — the whole point of §5.3 is removing payment as an adoption barrier, and pricing the verification-only path the same as the full loop would undo that.
3. **Verification/recovery fee.** A fee on `/recover/settle` specifically, separate from the base clearance fee — recovery is a distinct, higher-intent action (someone found real, provable unpaid value) and can bear a higher take.
4. **SaaS for publishers** (defer). A flat monthly fee for the Phase 1 creator console. Don't charge for this until there's a real console worth paying for — right now it would be charging for a registration form.
5. **Enterprise publisher plan** (defer significantly). Custom terms for a large publisher wanting dedicated support, custom license classes, or SLA guarantees. Not a Phase 0–3 conversation.
6. **Dispute/challenge fee** (defer to Phase 5). A small fee to file a challenge, refunded if upheld — discourages frivolous disputes without blocking legitimate ones. Can't exist before Phase 5 does.
7. **Hosted clearance pages as a paid tier** (probably never a primary line — public proof pages are a trust asset for the whole platform; gating them behind payment undermines the "verify without trusting us" pitch that's CitePay's actual differentiator).
8. **Analytics dashboard** (defer to well after Phase 6, if ever — see §16 on why a dashboard this early is a distraction, not a moat).

**The Clear Badge is explicitly not a revenue line — it's the free distribution mechanism that makes the paid lines above worth building.** Every embed is inbound marketing CitePay doesn't pay for; charging for the badge itself would remove the reason it spreads.

**Why platform fee first, explicitly:** every other option requires either new infrastructure (API metering), new users at real volume (SaaS, enterprise), or a feature that doesn't exist yet (dispute fee, analytics). A platform fee needs nothing new — it's a percentage added to a payment flow that already runs in production today.

---

## 13. Social Value

Stated plainly, without grandstanding:

- **Preserves the economic reason to write anything original.** If AI citation never pays and never proves correct use, the rational response for any individual creator is to stop publishing openly — CitePay makes "keep writing publicly" a viable choice instead of a subsidy to systems that don't compensate for it.
- **Lets small creators participate without needing a negotiated deal.** The current AI-licensing market (per the Brookings coverage cited in this document's references) is visibly consolidating around whoever can negotiate a direct deal with a lab — CitePay's registration flow requires no negotiation, which is the only realistic path for the long tail of independent writers, documentation maintainers, and small publications.
- **Reduces the real-world cost of fabricated citations.** A refused clearance is a public record that a specific AI-generated claim didn't hold up — useful to the creator (someone tried to misattribute something to them), to the reader (a claim was caught before it was trusted), and to the agent builder (a concrete signal their retrieval or generation step produced a bad citation).
- **Gives AI users something to actually inspect**, instead of a vendor's assurance — every clearance's hashes are independently recomputable and `/proof` reads on-chain events directly rather than from CitePay's own database, and the Clear Badge (§5.1) puts that inspectability one click away from wherever the citation appears, not buried in an API a reader will never call.
- **Gives publishers a real third option.** Today it's block AI entirely or let it scrape for free. CitePay is neither — content stays reachable, but every use is checked and compensated, and proof-only mode (§5.3) means "checked" doesn't even require opting into payment first.
- **Makes AI knowledge use auditable after the fact**, not just at the moment of generation — the recovery engine and CitePay Watch (§5.2, §10 Phase 4) mean a citation's correctness can be checked and *monitored over time* even in content CitePay had no part in producing.

---

## 14. Competitive Moat

**What's genuinely defensible:**
- **Claim-level receipts with an adversarial-proven guarantee.** The specific, tested fact that a high-confidence AI score cannot override a failed deterministic quote check is hard to fake in a demo and hard to retrofit onto a system not built around it from the start.
- **Clearance history as a compounding asset.** Every real clearance — paid or refused — is a permanent, public record. A competitor starting later has zero history to point to; CitePay's history only grows.
- **A licensed-evidence graph, once Phase 1/6 mature.** The combination of registered sources + their license terms (including §5.4's domain-declared policy files) + their real clearance outcomes is a dataset nobody else has, because nobody else checks claims at this granularity.
- **Trust Score, once real volume exists (§5.5).** A creator or agent's clearance/refusal/challenge history, honestly gated by sample size, is a real signal a competitor starting later cannot manufacture — it can only be earned over time, which is exactly what makes it defensible rather than copyable.
- **A visible badge network effect (§5.1).** Every embedded badge is both proof and advertisement — a competitor entering later isn't just behind on engineering, they're behind on the number of places their name already appears next to a citation.
- **Integrations with agent frameworks, MCP, and x402 rails**, compounding with each real integration — every agent framework that adopts CitePay as its citation-check step makes the next one's decision easier.
- **A public audit trail and real dispute-outcome history**, once Phase 5 exists — a system that's been challenged and held up is more credible than one that's never been tested.
- **A publisher onboarding network effect** — once creators expect AI answer engines to check with CitePay before citing them, agent builders face pressure to integrate, and vice versa.

**What is explicitly NOT a moat, and shouldn't be treated as one:**
- Basic x402 payment integration — this is now commodity infrastructure any competitor gets by using the same SDK.
- The demo UI — polish is not defensible; it's table stakes.
- Generic receipts (a hash and a timestamp) without a real check behind them — a receipt is only as strong as the verification step that produced it.
- A badge with no revocation/staleness discipline behind it (§5.1) — a badge that can lie after a challenge is worse than no badge, not a moat.
- A trust score computed on too little data (§5.5) — false confidence is a liability, not a signal.
- Broad claims about "the creator economy" — vague positioning is the opposite of a moat; it's what a project says when it doesn't have one yet.

---

## 15. Demo Strategy

**90-second demo** (exists today — `/clear/demo`): a fabricated quote gets refused despite a high AI confidence score → a real quote gets cleared and paid → both produce a public receipt. Message, spoken exactly: *"Access payment is not enough. CitePay proves correct use."*

**3-minute demo** (extends the 90-second version, mostly assembling what already exists plus Phase 3's badge): creator registers content on `/register` → an agent clears a citation against it live → the creator's payout appears on the resulting `/clearance/[id]` → the Clear Badge for that citation is shown embedded in a mock newsletter/docs page → the public receipt link is shown working in a fresh, unauthenticated browser tab.

**10-minute partner demo** (the one genuinely new assembly — depends on Phase 2 and Phase 5 landing first): publisher sets license policy, including a `/.well-known/citepay.json` file on their own domain (Phase 1/§5.4) → an external API call clears a citation through the general-purpose Clearance API in proof-only mode first, then paid mode (Phase 2/§5.3) → the resulting receipt, creator payout, and badge are shown → `/recover` audits a real external article and finds an unpaid citation (exists today) → a CitePay Watch list surfaces the same finding automatically on its next scheduled run (Phase 4/§5.2) → a challenge is filed and resolved against a real refused clearance, and the badge updates to reflect it (Phase 5). This demo should not be attempted until Phase 2 and Phase 5 are both real — a partner demo with a simulated step anywhere in it undermines the entire pitch.

---

## 16. Hard Truths

- **What's weak today:** the creator-facing side is thin. A creator can register content and see a payout on a specific clearance, but there's no "my earnings over time" view yet (Phase 1), no visible badge yet (Phase 3), and no way to be notified of new citations without manually checking (Phase 4/Watch). Every competitor with a creator-economics story (per this cycle's own competitive analysis) currently beats CitePay here.
- **What would stop adoption:** if the first external, non-CitePay-controlled integration hits the rate limits or the SSRF-unprotected URL-fetch path (Phase 4, and now also §5.2's Watch and §5.4's policy-file fetch) before those are hardened, that's a bad first impression that's hard to undo. Harden before broad outreach, not after.
- **What needs legal caution:** any language implying CitePay makes a citation "legally licensed" needs a lawyer's eyes before it ships anywhere formal — CitePay checks and receipts a claim's *technical* support and a registered or self-declared license term; it does not adjudicate copyright law, and marketing copy must never imply it does. This applies with extra force to the Clear Badge (§5.1) — a badge is a compact, high-visibility claim, and compact claims are exactly where overclaiming is easiest to slip in and hardest to walk back once embedded on someone else's page.
- **What should not be claimed:** never say "on-chain enforced" about the retrospective `CitationMandate.sol` attestation (see §6's architectural note) — the real pre-payment enforcement is in application code, and overclaiming here is exactly the kind of gap a technical partner or investor's engineer will find in five minutes.
- **What must be production-hardened before real external traffic:** Phase 2's public API needs real authentication, not just IP rate limiting; every URL-fetch path (Phase 4, §5.2, §5.4) needs SSRF protection, ideally as one shared utility rather than three separate ones; every new persisted entity needs the full Neon-fallback-plus-stable-ID checklist from §11 applied *before* it ships, not discovered live in production a third time; the badge's cache-TTL and challenge-reflection behavior needs to actually be tested against a real overturned clearance before the badge is presented to any partner as trustworthy.
- **Why broad dashboards or a marketplace this early would hurt, not help:** this project's own competitive analysis this cycle found that the single project with the most feature breadth (dashboard, proof explorer, creator earnings page, multi-mode settlement, public attestations, extensive CI checks) also scored worst on scope discipline — and CitePay's own scope discipline was one of exactly two categories where it led outright. Trading that lead for premature breadth would be a strategic mistake, not progress. This applies to §5's additions too: Watch must stay a submitted-list scheduler, not crawling infrastructure; Trust Score must stay gated by sample size and never become a public leaderboard, until Phase 6, if ever.

---

## 17. Final Prioritized Backlog

### Must build next (5–8 items)
1. **`POST /api/clear/check`** — general-purpose, non-scripted clearance endpoint calling `evaluateClaimClearance` directly, in both proof-only and paid-clearance mode (§5.3). *Why:* this is the actual product; everything external depends on it existing, and proof-only mode is the cheapest real adoption unlock in this entire plan. *Direction:* new route in `src/app/api/clear/`, reuse the evaluator, add rate limiting from day one. *Success check:* a request with a real claim/quote/source combination not in the fixed demo script returns a correct decision in both modes.
2. **Clear Badge (§5.1).** *Why:* the single highest-leverage addition for making CitePay legible and spreadable beyond developers — every other item in this plan is invisible without it. *Direction:* new SVG-generating route reading from `GET /api/clear/[id]`, short cache TTL, labels mapped 1:1 to real `ClaimDecision`/`ChallengeStatus` values, click-through carries a distribution CTA. *Success check:* a badge embedded in a real page correctly flips state within its cache window after the underlying clearance is challenged and overturned.
3. **Auth/API-key layer for the new public API.** *Why:* IP rate limiting alone isn't enough once a real paying integration depends on this. *Direction:* a simple issued-key check on `check`/`settle`, stored alongside existing creator/mandate data — not a full developer-portal build. *Success check:* an unauthenticated call is rejected; a keyed call succeeds.
4. **Creator "my clearances" view (Phase 1).** *Why:* the single most-repeated competitive gap identified this cycle. *Direction:* reuse the existing Creator Payout aggregation logic from `/clearance/[id]`, scoped to one wallet. *Success check:* a real creator sees their real, non-zero clearance history.
5. **`/.well-known/citepay.json` policy-file ingestion (§5.4).** *Why:* turns CitePay from an app a creator has to trust into infrastructure a creator's own domain declares — the concrete RSL-alignment move. *Direction:* registration-time fetch and parse into existing `sources` fields, one shared SSRF-safe fetch utility (reused by Phase 4 and §5.2 too). *Success check:* registering a domain with a real policy file correctly populates license/price without manual form entry.
6. **Challenge workflow, objective-checks-only (Phase 5, minimal scope).** *Why:* "challengeable" is part of the core product claim (§1) and currently has no way to actually file one — and the badge's credibility (§5.1) depends on this existing. *Direction:* wire the already-modeled `clearance_challenges` table with insert/read functions matching every existing Neon-durable pattern, one route, one deterministic resolution path. *Success check:* a real challenge against a real UNSUPPORTED clearance resolves correctly and the badge reflects it.
7. **MCP tools for the Clear surface (`clear_claim`, `get_clearance`).** *Why:* MCP is the natural integration surface for agent-framework adoption, and the scaffold already exists. *Direction:* extend `src/app/api/mcp/route.ts` and the `citepay-mcp` npm package alongside the existing tools. *Success check:* a Claude Code session can call `clear_claim` and get a correct decision.
8. **Sharpen all outward-facing GTM material to the docs-maintainer wedge (§8/§9).** *Why:* a broad "publishers and agent builders" pitch converts slower than a sharp one, and this audience specifically needs the least non-crypto onboarding friction to start. *Direction:* rewrite outreach copy, pick the first 4–5 real docs-maintainer targets, do the outreach. *Success check:* at least one real, non-CitePay-team docs maintainer completes a real clearance.

### Should build next (5–8 items)
1. **CitePay Watch v1 (§5.2)** — scheduled recovery against a creator-submitted URL list, reusing existing cron infrastructure.
2. Structured logging/alerting beyond `console.error` on the failure paths already present.
3. OG metadata for `/clearance/[id]` so shared receipt links render well (Phase 3).
4. Per-creator public clearance history page, distinct from the private "my clearances" view (Phase 3).
5. A documented curl/HTTP example for the new Clearance API, separate from the MCP tool (developer-facing, not a full portal).
6. RSL-format ingestion as an optional license source alongside CitePay's own `licenseClass` field and §5.4's policy file (§7/§11).
7. A metered pricing implementation for the Phase-2 API (§12, priced option #2), once real external callers exist to price for — proof-only mode priced lower or free per §5.3's adoption logic.
8. A platform-fee skim on cleared-citation settlement (§12, priced option #1) — the first monetization to actually turn on.

### Later
1. Trust Score (§5.5), gated by the minimum-sample-size threshold — build once there's real clearance volume to compute it honestly from.
2. Full analytics dashboard for creators/publishers.
3. Enterprise publisher plan with custom terms/SLA.
4. Bulk/RSS-based content import beyond what already exists.
5. Searchable public directory of all clearances (Phase 6).
6. SDKs beyond MCP + documented HTTP examples.
7. Automated/browser-extension recovery, or autonomous (non-submitted-list) discovery for Watch.
8. Groth16 or other succinct-proof upgrades to receipt anchoring (explicitly a stretch, never a dependency, per this project's own established discipline).

### Avoid for now
- A general-purpose creator dashboard before Phase 1's minimal "my clearances" view has real users.
- A marketplace, discovery layer, or public Trust Score leaderboard (Phase 6) before Phases 1–5 have real, non-CitePay-employee usage.
- Autonomous web-scale crawling under the CitePay Watch name — v1 is submitted-list scheduling only (§5.2).
- Multiple settlement modes (escrow, direct-transfer, x402) beyond what already exists — flexibility here is scope risk, not a feature, per this cycle's own competitive analysis.
- Any subjective or LLM-adjudicated challenge resolution — every challenge type must stay objectively, deterministically checkable.
- A Trust Score rendered as a percentage before a real minimum sample size exists (§5.5) — raw counts only until then.
- A static, cacheable-forever Clear Badge with no staleness/revocation behavior (§5.1) — this would actively undermine the product's core credibility claim, not just be an unfinished feature.
- Rebuilding or replacing any of the base platform (`policy.ts`, `x402.ts`, `anchor.ts`, `payments.ts`, `evidence.ts`, `signature.ts`) — every one of these is working, tested, and load-bearing; extend, never replace.
- Claiming legal/copyright enforcement CitePay does not actually provide (§16), especially in Clear Badge copy where the claim is compact and highly visible.

---

*This document should be updated at the start of each phase with what actually shipped versus what was planned — the same discipline this project has already applied to its build logs and audit trail throughout the hackathon cycle.*
