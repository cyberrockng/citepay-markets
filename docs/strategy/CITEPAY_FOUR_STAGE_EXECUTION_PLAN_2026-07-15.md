# CitePay — Four-Stage Execution Playbook (2026-07-15)

Supersedes/absorbs `CITEPAY_CLEAR_PRODUCTIZATION_PLAN_2026-07-15.md` as Stage 2's detail. Grounded in current repo (`/home/dell/citepay-markets`): `src/lib/clear/{evaluate,quote-verify,settle,recover,hash,source-text,types}.ts` live; routes `demo-run`, `[id]`, `recover/audit`, `recover/settle` live; single `/api/mcp`; contracts `CitePayMarket.sol 0x396cf1646EbAeF85ee8428C2d9239C46Ae956085` on Arc testnet (chainId 5042002); known gap: no public mandate-creation endpoint, so a full external happy-path settle isn't reachable yet.

**Standing rule for this plan (per your instruction):** blocking **AUDIT GATES** are placed at the end of Stage 2, end of Stage 4, and after the Launch Readiness Checklist (§7). No work proceeds past a gate until that audit is done and its findings are closed — **unless you explicitly type "proceed without audit."** This overrides normal default-to-action behavior at those three points only.

---

## 1. One-page strategic summary

CitePay proves whether a specific AI citation deserved payment — not by trusting the AI, but by running a deterministic check: does the exact quote exist in the source, does the source support the claim, does policy/license allow use, does budget allow payment. The result is a permanent, hash-verified receipt.

**The path:**
- **Stage 1 (done):** Prove the mechanism in a demo. Fake quote refused, real quote cleared, USDC settles on Arc, receipt is public. This is complete and submitted.
- **Stage 2 (now):** Turn the demo into a callable product — an API + MCP surface anyone can integrate against without you running it for them by hand. This is the actual bottleneck between "impressive demo" and "real infrastructure."
- **Stage 3 (later):** Get 5–20 real external publishers and agent builders using it, with real feedback replacing your own assumptions about what the API needs.
- **Stage 4 (later):** Become the default expectation — mainnet, stronger attestations, framework integrations, a dispute protocol — the layer other things are built around rather than a product people opt into.

Each stage only starts once the previous one's exit condition is met and its audit gate (where present) is closed. Stage 3 and 4 content in this doc is directional, not a build spec — it will be re-planned with real Stage 2 usage data in hand, per your explicit instruction not to jump ahead.

---

## 2. North-star goal

**Every AI citation should be checkable, in one deterministic call, for whether it deserves payment — and that check should leave behind a receipt nobody has to trust, only verify.**

**Stage 2 clarifications before implementation:**
- **Deterministic vs model-assisted:** quote verification, license checks, policy checks, budget checks, and receipt hashing are deterministic. Semantic claim-support scoring may be model-assisted and must be labeled as such. A support score can block a weak citation, but it can never override a missing exact quote.
- **Receipt visibility:** public proof is a product strength, but external agents may submit private claim/quote text. `POST /api/clear/check` must support `visibility: "public" | "private_hash_only"`. Public receipts show claim/quote text. Private-hash receipts expose verdict, hashes, timestamps, policy metadata, and settlement status without exposing the full claim/quote body.
- **Ownership:** API keys own the mandates and clearances they create. A key can only settle a clearance against a mandate owned by that same key unless an explicit admin override is added later.
- **Source intake scope:** Stage 2 `/api/clear/check` accepts only a registered `source.onChainId` or caller-provided inline `source.text`. It does **not** fetch arbitrary `sourceUrl` values. URL fetching is limited to the hardened `/.well-known/citepay.json` registration path.
- **Audit gate distinction:** the Stage 2 audit gate is a code/security correctness gate. The Launch Readiness audit is a production proof/docs/onboarding gate. Both are required before external outreach.

---

## 3. Stage-by-stage execution plan

### Stage 1 — Hackathon Proof

- **Goal:** Prove the core mechanism works, end to end, in public.
- **Target user:** Hackathon judges / grant reviewers.
- **Product promise:** "Watch a fake citation get refused and a real one get paid, on-chain, right now."
- **Must-build:** quote verification, clearance evaluation, demo route, public receipt page, USDC settlement on Arc testnet, Circle/Arc alignment visible. **(All exist.)**
- **Must-not-build:** anything Stage 2+ — no public API, no external keys, no billing.
- **Technical scope:** `src/lib/clear/{evaluate,quote-verify,settle}.ts`, `/clear/demo`, `/clearance/[id]`, `/api/clear/demo-run`, `/api/clear/[id]`.
- **Tests:** adversarial quote-fails-despite-high-score regression (exists, live-verified twice: scores 92 and 96).
- **Security:** none beyond existing rate limits — no public write surface yet.
- **Acceptance criteria:** met — 2,119 reconciled decisions, 487 paid, 404 on-chain events at submission time.
- **Exit condition:** submitted, deployed, live-verified. ✅ Complete (2026-07-07).
- **Risks:** none forward-looking; historical risk (unpushed commits, judge-flagged claim language) already remediated.
- **Decision gate to Stage 2:** judging must conclude and the prod-freeze must lift before any Stage 2 work touches production. Preview/branch work can proceed now.

---

### Stage 2 — Post-Hackathon Product

- **Goal:** Make CitePay callable by someone who is not you, without a walkthrough.
- **Target user:** AI agent builders integrating a payment/citation check; publishers registering a policy.
- **Product promise:** "Call one endpoint (or one MCP tool) with a claim, quote, and source — get a deterministic decision and a receipt URL back, in production, with your own API key."
- **Must-build:** `POST /api/clear/check`, `POST /api/clear/mandate`, `POST /api/clear/settle`, API-key auth, `GET /api/clear/[id]/badge`, MCP tools (`clear_claim`, `get_clearance`, `settle_clearance`), `/.well-known/citepay.json`, creator clearances page, reviewer proof path.
- **Must-not-build:** marketplace, leaderboard, trust scores, broad publisher dashboard, autonomous crawling, billing/plans (Stage 3), webhooks (Stage 3), on-chain attestation contract upgrade (Stage 4).
- **Technical scope:** see §4 in full.
- **Tests:** full validation/auth/rate-limit/idempotency matrix per endpoint (§4), cold-start Neon fallback tests, MCP e2e against preview.
- **Security:** hashed API keys, per-key rate limits, replay-guarded settlement, SSRF-guarded well-known fetch, input caps everywhere.
- **Acceptance criteria:** a fresh API key, used by someone other than you, completes mandate → check → settle → Arc tx → badge on a **production** deploy, using only public docs (no live assistance).
- **Exit condition:** the acceptance criterion above is met AND the Stage 2 audit gate (below) is closed.
- **Risks:** demo-run/check logic drift (mitigate: share one internal function); double-spend across cold Vercel instances (mitigate: Neon-enforced idempotency, not SQLite-only — this exact class of bug has bitten this repo before); scope creep into a dashboard (mitigate: one filtered list, no settings/analytics).
- **Decision gate to Stage 3:** real external usage cannot be sought (outreach, onboarding) until the Stage 2 audit gate passes.

> ## 🔒 AUDIT GATE — END OF STAGE 2 (BLOCKING)
> **Do not begin Stage 3 work (external outreach, onboarding, integration galleries) until this audit is complete and its findings are closed.**
> **Scope:** code and security correctness for every Stage 2 endpoint against the bug-prevention checklist (§5) — validation, auth, ownership checks, receipt visibility, rate limits, replay/idempotency, SSRF on well-known fetch, receipt integrity, no false claims in copy, testnet labeling. Re-verify the adversarial guarantee live in production (not just on preview). Confirm no plaintext secrets in repo/DB/logs.
> **Method:** self-audit against §5 checklist at minimum; a second-pass cross-check (e.g. Codex or another agent, matching this project's established builder/auditor pattern from the `/recover` and audit-remediation work) is recommended but not mandatory unless you request it.
> **Exit:** all findings closed or explicitly accepted as known/deferred by you in writing.
> **Override:** skip only if you explicitly type "proceed without audit."

---

### Stage 3 — Early Network *(directional — re-plan with real Stage 2 usage data before building)*

- **Goal:** Get real external usage, not synthetic traffic.
- **Target user:** 5–20 real publishers/docs maintainers; a handful of agent builders integrating CitePay into a real agent.
- **Product promise:** "CitePay is the citation trust layer real people already use, not just a proof of concept."
- **Must-build (later, sequenced by actual demand):** structured onboarding for a small named cohort, 2–3 real agent integration examples (code, not slides), a plain integration gallery (logos + links, not rankings), basic per-creator usage counts (extend the existing clearances list, not a new analytics system), webhook notifications for settlement events, simple metered API plans, a versioned/stabilized policy-file spec informed by what real publishers actually needed.
- **Must-not-build:** marketplace, leaderboard, vague trust/reputation scores, autonomous crawling, anything that ranks or scores publishers against each other.
- **Technical scope:** extends Stage 2 surfaces; no new architecture — webhook dispatch off `settle.ts`, plans as a field on the API-key record, gallery as a static/curated page.
- **Tests:** webhook delivery + retry/backoff; plan-limit enforcement; policy-file version negotiation.
- **Security:** webhook signing (HMAC), plan-limit bypass prevention, same key-handling discipline as Stage 2.
- **Acceptance criteria:** ≥5 external, non-affiliated publishers with live `.well-known` files and real clearances; ≥2 agent builders integrated without your direct assistance; real (not fabricated) feedback documented.
- **Exit condition:** acceptance criteria met with evidence (screenshots, tx links, unsolicited feedback), not projections.
- **Risks:** premature scaling before Stage 2 proves stable; onboarding friction if docs aren't self-serve; the temptation to build a dashboard because "publishers keep asking" — hold the line per your avoid-list unless demand is overwhelming and specific.
- **Decision gate to Stage 4:** do not discuss mainnet, framework integrations, or a dispute protocol until Stage 3's acceptance criteria are real and evidenced.

---

### Stage 4 — Infrastructure Standard *(directional only — this is a destination, not a current spec)*

- **Goal:** Become the default others build around, not an app people choose.
- **Target user:** agent framework maintainers, AI search/content-licensing platforms, publisher CMS ecosystems.
- **Product promise:** "AI citations carry a CitePay clearance receipt the way payments carry a transaction hash — check, don't ask."
- **Must-build (later):** mainnet deployment (only after sustained testnet stability and real volume), stronger on-chain attestation (upgrade or replace the retrospective `CitationMandate.sol` pattern with something that actually gates, not just records), integrations with named agent frameworks, publisher CMS/plugin(s), a dispute/challenge protocol (scoped narrowly — not a general moderation system), partnership integrations, possibly a public registry of policy files.
- **Must-not-build still:** anything that turns CitePay into a legal enforcement product, a broad content-licensing marketplace, or a general-purpose reputation system. The core stays deterministic verification, not judgment.
- **Technical scope:** not specified here — depends entirely on which Stage 3 integration proved highest-value.
- **Tests:** mainnet cutover rehearsal on a fork/testnet mirror; dispute-protocol adversarial cases; framework-integration conformance tests.
- **Security:** mainnet key custody, audited contract upgrade (external audit required, not just internal), dispute-protocol spam/griefing resistance.
- **Acceptance criteria:** at least one agent framework or publishing platform treats a CitePay clearance as a first-class citizen (not a bolt-on), with real mainnet volume.
- **Exit condition:** this is the terminal stage — "exit" means sustained operation, not transition to something else.
- **Risks:** mainnet cutover risk (fund loss, contract bugs — irreversible in a way testnet isn't), overreach into legal/enforcement claims under partner pressure, dispute protocol becoming a moderation quagmire.
- **Decision gate:** none forward (terminal), but see the audit gate below before *any* mainnet or attestation-contract work begins.

> ## 🔒 AUDIT GATE — END OF STAGE 4 (BLOCKING)
> **Do not deploy to mainnet, upgrade/replace the attestation contract, or ship the dispute protocol until this audit is complete and closed.**
> **Scope:** full security review of any new/changed contract (external audit strongly recommended — this is real mainnet money, not testnet), dispute-protocol abuse/griefing analysis, mainnet key-custody review, confirmation that no Stage 1–3 honesty commitments (testnet labeling history, no-enforcement-claims, disclosed traction) have quietly eroded under partner or growth pressure.
> **Method:** external/third-party security audit required for contract changes going to mainnet — internal self-audit is not sufficient at this stage given real funds are at stake.
> **Exit:** all findings closed; external audit report retained as evidence for future partners/reviewers.
> **Override:** skip only if you explicitly type "proceed without audit." (Note: for actual mainnet fund-custody changes, an override here carries real financial risk — flagged, not blocked.)

---

## 4. Stage 2 detailed implementation plan

### 4.1 API-key auth
- **Purpose:** gate write endpoints; attribute usage; enable per-key rate limits and mandate ownership.
- **Shape:** key format `cpk_<32 random b62 chars>`; stored as SHA-256 hash + prefix (first 8 chars, for display/lookup) + owner label + tier + created/revoked timestamps. Mandates and clearances store the owning key hash or stable owner id so settlement can enforce ownership.
- **Validation:** `Authorization: Bearer cpk_...` required on all non-GET clear routes and on `[id]` badge is exempt (public); malformed header → 401 with a generic message (no hint whether key exists).
- **Edge cases:** revoked key used mid-request race (check revocation at request start, accept the race — not security-critical at this volume); key reused across environments (fine, no env-binding needed yet).
- **Failure modes:** 401 missing/invalid; no 403 tier distinction yet (single tier in Stage 2).
- **Rate limits:** key issuance itself is manual (you run a script) — no public signup endpoint in Stage 2, so no abuse surface there.
- **Tests:** valid key passes, missing key 401, revoked key 401, malformed prefix 401, key A cannot settle key B's clearance/mandate.
- **Acceptance:** every mutating endpoint rejects unauthenticated calls; a valid key works end to end.

### 4.2 POST /api/clear/check
- **Purpose:** the front-door product — check a claim/quote/source against a policy and get a decision, with or without a stored mandate.
- **Request:**
```json
{
  "claim": "string 1-1000 required",
  "quote": "string 1-2000 required",
  "source": { "onChainId": "string" } | { "text": "string ≤20000", "label": "string ≤200" },
  "policy": { "mandateConfigId": "string" } | { "maxPricePerCitationMicro": 100000, "requiredLicenseClass": "standard" },
  "visibility": "public | private_hash_only",
  "externalRef": "string ≤128 optional"
}
```
- **Response 200:**
```json
{
  "clearanceId": "clr_...",
  "decision": "CLEARED | UNSUPPORTED | BLOCKED_LICENSE | BLOCKED_POLICY | OVER_CAP",
  "checks": { "quoteVerified": true, "supportScore": 92, "licenseClass": "standard", "priceMicro": 10000, "budgetRemainingMicro": 490000 },
  "settlement": null,
  "receiptUrl": "https://.../clearance/clr_...",
  "contentHash": "sha256:...",
  "visibility": "public | private_hash_only",
  "createdAt": "ISO-8601"
}
```
- **Validation:** exactly one of `source.onChainId`/`source.text`, exactly one of `policy.mandateConfigId`/inline policy; reject both-or-neither with 400 naming the field. `sourceUrl` is intentionally unsupported in Stage 2; arbitrary URL fetching belongs only to the hardened well-known registration flow. `visibility` defaults to `private_hash_only` for API calls unless explicitly set to `public`.
- **Edge cases:** unknown `onChainId` → 404; unknown `mandateConfigId` → 404 (retry after Neon fallback resolves cold-start cases — known pattern in this repo); inline `source.text` with no license info → defaults to most restrictive (`BLOCKED_LICENSE` unless inline policy explicitly grants); private-hash receipts still return a `receiptUrl`, but the public page/API response redacts full claim and quote text.
- **Failure modes:** 400 validation, 401 auth, 404 unknown id, 413 over input caps, 429 rate limited, 502 if Claude support-scoring is unreachable — **fail closed, never return a decision without a real score** (the honest-502 lesson already learned in `/recover`).
- **Rate limits:** 30/min/key; inline-source checks count double (heavier compute).
- **Tests:** happy CLEARED path; fabricated quote + artificially high score still UNSUPPORTED (adversarial regression); both-fields-set 400; missing-fields 400; unknown ids 404; arbitrary `sourceUrl` rejected 400; oversized quote 413; burst 429; private-hash receipt does not expose claim/quote text.
- **Acceptance:** all above pass on preview; live-verified once against prod before Stage 2 audit gate.

### 4.3 POST /api/clear/mandate
- **Purpose:** closes the current gap — lets an external caller create a real, license-satisfying mandate so a full check→settle path exists without your manual involvement.
- **Request:** `{ "name": "≤100", "requiredLicenseClass": "standard|open|clear-demo", "maxPricePerCitationMicro": 100000, "totalBudgetMicro": 5000000 }`
- **Response 201:** `{ "mandateConfigId": "mnd_...", ...echoed fields, "spentMicro": 0 }`
- **Validation:** budget/price must be positive integers; `requiredLicenseClass` must be a known enum value.
- **Edge cases:** mandate created then immediately used from a different cold instance before Neon replicates (mitigate: dual-write SQLite+Neon synchronously, not eventually).
- **Failure modes:** 400 invalid enum/values, 401 auth.
- **Rate limits:** 10/min/key (low-volume, low-abuse-risk endpoint).
- **Tests:** create → immediately settle against it on a simulated fresh instance (forces Neon path); invalid enum 400; mandate ownership recorded and enforced.
- **Acceptance:** an externally created mandate with `requiredLicenseClass: "standard"` successfully clears and settles against a real catalog source — this is the concrete proof the gap is closed.

### 4.4 POST /api/clear/settle
- **Purpose:** generalize the already-proven `/recover/settle` guard pattern into the general check→settle path.
- **Request:** `{ "clearanceId": "clr_...", "mandateConfigId": "mnd_...", "idempotencyKey": "≤64 required", "confirm": true }`
- **Response 200:** `{ "txHash": "0x...", "amountMicro": 10000, "receiptUrl": "..." }`
- **Validation:** `confirm` must literally be `true`; re-evaluate the clearance against the **current** mandate state before paying — never trust the stored decision as final.
- **Edge cases:** clearance already settled (return the original result, 200, not an error — idempotent by clearanceId); re-evaluation flips the verdict since the check happened (e.g., budget spent by a concurrent call) → 422 naming which check failed; same `idempotencyKey` reused with different `clearanceId` → 409 conflict; key A tries to settle key B's clearance or mandate → 403.
- **Failure modes:** 400 missing confirm, 402/422 re-evaluation fails (OVER_CAP/BLOCKED_*), 404 unknown ids, 409 idempotency conflict.
- **Rate limits:** 10/min/key.
- **Tests:** double-settle same clearanceId → same tx returned, no double payment; concurrent settle race against shared budget → only one succeeds, verified via Neon-enforced check (not SQLite-only — this exact class of cross-instance bug bit `/recover/settle` before it was fixed); confirm-missing 400; cross-key ownership violation 403.
- **Acceptance:** replay-tested manually (fire the same request twice) confirms no double-spend on a preview deploy before this ships to prod.

### 4.5 GET /api/clear/[id]/badge
- **Purpose:** embeddable, honest proof-of-clearance graphic for publisher pages.
- **Shape:** public SVG, `Cache-Control: public, max-age=300`. Four states only: Cleared / Cleared·Paid (with amount) / Not cleared (names actual verdict) / Not found.
- **Validation:** none beyond a valid id format.
- **Edge cases:** id exists but has no settlement yet → "Cleared" not "Cleared·Paid"; never render "Paid" without a real tx hash present.
- **Failure modes:** unknown id → a "Not found" SVG (200, not 404 — badges shouldn't break page layout on embed).
- **Rate limits:** none (cacheable, public, low-cost).
- **Tests:** all four states render correct visual + text; no state claims payment without `settlement.txHash` present.
- **Acceptance:** embedded on the `/clearance/[id]` page itself as the reference implementation.

### 4.6 MCP tools — clear_claim, get_clearance, settle_clearance
- **Purpose:** give agent builders a zero-glue integration path; publish as `citepay-mcp@0.2.0` (npm account `cyberrockng1`, granular token required — classic tokens 403 on this account, known from Stage 1).
- **Shapes:** 1:1 with the REST bodies above; `clear_claim` output adds a one-line human-readable `reason` string for agent framing.
- **Validation/edge cases/failure modes:** identical to REST — implemented as one shared handler called from both the MCP route and the REST route, not duplicated logic (duplication is the #1 drift risk here).
- **Rate limits:** same per-key limits, enforced once in the shared handler.
- **Tests:** e2e test running the MCP tool against a preview deploy, not just schema validation.
- **Acceptance:** a clean machine with only `citepay-mcp` installed and an env var key can `clear_claim` → `settle_clearance` successfully using only published docs.

### 4.7 Publisher /.well-known/citepay.json
- **Purpose:** lightweight, self-serve domain-control + policy declaration — the entire "publisher registration" story in Stage 2.
- **Shape:** `{ "version": 1, "licenseClass": "standard", "pricePerCitationMicro": 10000, "payoutAddress": "0x...", "contact": "mailto:..." }`
- **Validation:** fetched once at publisher registration time; https-only; must parse as valid JSON matching the schema or registration fails with a specific error naming the field.
- **Edge cases:** file behind a redirect (allow ≤3 hops, re-validate scheme/host at each hop); file >100KB (reject, likely not the intended file); private/link-local IP resolution (reject — SSRF guard, resolve-then-verify, not just hostname-string checks).
- **Failure modes:** 400 unreachable/invalid file at registration time; never crawled automatically after that — re-fetch only when the publisher explicitly asks to refresh.
- **Rate limits:** N/A (one fetch per registration action, not a public endpoint).
- **Tests:** SSRF matrix (private IPs, redirect chains, oversized body, wrong content-type, timeout).
- **Acceptance:** a real domain (e.g., your own docs site) with a real well-known file registers successfully; a malicious redirect-to-localhost file is rejected.

### 4.8 Creator clearances page
- **Purpose:** the entire "publisher dashboard" for Stage 2, deliberately minimal.
- **Shape:** `/creator/[wallet]/clearances` — reverse-chronological list: decision, amount, tx link, receipt link. A filtered query over existing clearance data, no new write path.
- **Validation/edge cases:** empty state (no clearances yet) shown plainly, not hidden.
- **Failure modes:** none beyond standard 404 for unknown wallet.
- **Rate limits:** standard public-GET limits.
- **Tests:** list renders correctly for a wallet with mixed settled/unsettled/refused clearances.
- **Acceptance:** a publisher can see, without asking you, every clearance and payment tied to their wallet.

### 4.9 Reviewer proof path
- **Purpose:** the linear path grant reviewers and technical evaluators follow without a live demo from you.
- **Shape:** `/clear` (refusal-hook-first copy) → `/clear/demo` (judge-triggerable adversarial input) → `/clearance/[id]` (hash + tx link) → contract addresses with explorer links, labeled testnet → GitHub (public, MIT, pushed) → `/proof` (real traction + demo-traffic disclosure, no fabricated claims).
- **Validation:** every claim on this path must be independently verifiable by clicking, not by trusting prose.
- **Edge cases:** reviewer pastes something that breaks extraction (`/recover` path) → must return an honest error, never a fake "0 findings" success (already fixed once in this repo — don't regress it).
- **Failure modes:** N/A (documentation/copy, not a new system).
- **Tests:** manual walk of the entire path on a fresh browser session with no cookies/state.
- **Acceptance:** someone who has never seen CitePay can go from `/clear` to a verified on-chain settlement and back to the GitHub repo in under 5 minutes, unassisted.

---

## 5. Bug-prevention checklist

- [ ] **Input validation:** every field has an explicit type, length cap, and required/optional status enforced server-side (never trust client-side hints); reject with the specific field name, not a generic 400.
- [ ] **Rate limits:** every mutating endpoint has a per-key limit; every public GET has an IP-based limit; limits return `Retry-After`.
- [ ] **API-key handling:** keys hashed at rest (never stored plaintext); shown once at creation; revocable; never logged in full (log prefix only).
- [ ] **Ownership enforcement:** mandates and clearances are tied to the creating key/owner; settlement rejects cross-key attempts unless a deliberate admin override exists.
- [ ] **Replay/idempotency:** settlement requires a client-supplied idempotency key AND is guarded by `(clearanceId, mandateConfigId)`; idempotency check enforced in Neon (cross-instance), not just local SQLite.
- [ ] **Private vs public receipts:** receipt pages never expose caller API-key identity, `externalRef`, or internal ids beyond `clearanceId`/`mandateConfigId`; `private_hash_only` receipts redact full claim/quote text while keeping hashes and verdicts verifiable.
- [ ] **Source-fetch safety:** any URL/well-known fetch is SSRF-guarded — resolve-then-verify against private/link-local ranges, redirect-hop re-verification, size cap, timeout, content-type check.
- [ ] **Settlement double-spend prevention:** budget checks read `Math.max(local, neon)` spend; re-evaluation happens against live mandate state immediately before payment, never against a cached decision.
- [ ] **Testnet/mainnet labeling:** every contract address, every tx link, every settlement UI element is labeled "Arc Testnet" until Stage 4's mainnet cutover; no ambiguous "live" language that implies mainnet.
- [ ] **No false traction/review claims:** any traffic generated by your own scripts is disclosed inline wherever traction numbers appear; no fabricated testimonials, reviews, or "trusted by" claims.
- [ ] **No unsupported legal claims:** copy never claims copyright enforcement, legal clearance, or licensing-law compliance — only "citation payment policy" framing.
- [ ] **Logging without leaking secrets:** no API key, private key, or full request body containing secrets ever hits logs; structured logs redact key/secret-shaped fields by default.

---

## 6. Repository execution order

Numbered, dependency-ordered, each small enough to be one GitHub issue (full issue formatting deferred to your explicit follow-up request).

1. **API-key auth layer** — `src/lib/clear/auth.ts`, manual issuance script. Deps: none. Priority: P0.
2. **POST /api/clear/check** — `src/app/api/clear/check/route.ts`, reusing `evaluate.ts`. Deps: (1). Priority: P0.
3. **POST /api/clear/mandate** — `src/app/api/clear/mandate/route.ts`, Neon dual-write. Deps: (1). Priority: P0.
4. **POST /api/clear/settle** — `src/app/api/clear/settle/route.ts`, generalized from `recover/settle`. Deps: (2), (3). Priority: P0.
5. **GET /api/clear/[id]/badge** — `src/app/api/clear/[id]/badge/route.ts`. Deps: (4) for "Cleared·Paid" state. Priority: P1.
6. **Extend GET /api/clear/[id]** — add `settlement`/`contentHash` fields, wire into `/clearance/[id]` page. Deps: (4). Priority: P1.
7. **MCP tools (clear_claim, get_clearance, settle_clearance)** — `src/app/api/mcp/route.ts`, shared handler extraction. Deps: (2), (3), (4). Priority: P1.
8. **citepay-mcp@0.2.0 publish + agent quickstart docs** — `citepay-mcp/`, `docs/AGENTS.md`. Deps: (7). Priority: P1.
9. **/.well-known/citepay.json fetcher + publisher registration fields** — `src/lib/clear/wellknown.ts`, `/register` extension. Deps: none (parallel-safe with 2–8). Priority: P2.
10. **Creator clearances page** — `/creator/[wallet]/clearances`. Deps: (4) for settlement data. Priority: P2.
11. **Reviewer proof path copy pass** — `/clear`, `/proof` updates. Deps: (5), (6), (10). Priority: P2.
12. **Stage 2 audit gate execution** — full checklist (§5) pass + live-prod re-verification. Deps: all of the above. Priority: P0 (blocking).

---

## 7. Launch readiness checklist

**For grant reviewers:** reviewer proof path (4.9) live; contracts labeled testnet; GitHub pushed and matches prod; no false traction claims; deck/README consistent.

**For agent builders:** `citepay-mcp@0.2.0` published; quickstart gets a clean machine to first `CLEARED` in ≤5 minutes; check/settle documented with real error codes; MCP and REST behavior verified identical.

**For publishers:** `.well-known` spec documented and SSRF-safe; registration accepts a real domain; clearances page shows real data; badge embeds correctly with all four honest states.

**For first external users generally:** rate limits verified live (not just in tests); idempotent settle verified live (fire twice, get one payment); cold-start Neon fallback verified on an actual fresh deployment, not just locally; no plaintext secrets anywhere in repo/DB/logs (grep pass done).

> ## 🔒 AUDIT GATE — AFTER LAUNCH READINESS CHECKLIST (BLOCKING)
> **Do not announce, onboard real external users, or begin any Stage 3 outreach until this audit is complete and closed.**
> **Scope:** production proof, docs, and onboarding readiness. Every box in §7 must be verified with evidence (not "should work" — actually run, screenshotted, or tx-linked), plus a fresh full pass of the §5 bug-prevention checklist against production specifically (not preview).
> **Method:** self-audit minimum; recommended second-pass by another agent given this is the first real external-facing surface.
> **Exit:** written confirmation from you that every §7 item has been personally verified against production.
> **Override:** skip only if you explicitly type "proceed without audit."

---

## 8. Final recommendation

**Exact first task:** build the API-key auth layer (§6 item 1) together with `POST /api/clear/check` (item 2) as one unit of work.

**Why it comes first:** every other Stage 2 item — mandate, settle, MCP tools, badge, publisher registration — depends on a caller being identifiable and rate-limited. `check` is also the one endpoint valuable on its own (with an inline policy) before mandate/settle exist, so it's the fastest path to something externally usable. It wraps `evaluate.ts`, which is already live-proven — no new evaluation logic, only the auth/API surface around it.

**How to know it's complete:** on a Vercel preview deploy, a freshly issued key can `curl` a real quote/source pair and get `CLEARED` with a working receipt URL; a fabricated quote with an artificially inflated support score still returns `UNSUPPORTED`; no key returns 401; an oversized payload returns 413; a burst of requests returns 429; the full validation/auth test matrix is green in CI.

---

**Reminder of standing constraints carried into this doc:** no marketplace/leaderboard/dashboard/trust-score/crawling before Stage 3 evidence demands it; no legal/copyright enforcement language; testnet labeled everywhere until Stage 4; Stage 3/4 content here is directional and will be re-planned against real Stage 2 usage, not built from this document as-is.
