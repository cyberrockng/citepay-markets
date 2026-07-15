# CitePay Stage 2 — GitHub Issue List (2026-07-15)

Source plan: `CITEPAY_FOUR_STAGE_EXECUTION_PLAN_2026-07-15.md`

Scope: Stage 2 only — turn CitePay Clear from hackathon proof into a callable integration product. Do not start Stage 3 outreach until Issue 12 audit is closed.

---

## Issue 1 — Build API-Key Auth And Ownership Foundation

**Labels:** `stage-2`, `P0`, `backend`, `security`, `auth`

**Description:**
Add the authentication layer required by every mutating Clear endpoint. Keys must be generated manually for Stage 2, hashed at rest, revocable, and tied to ownership for mandates and clearances.

**Implementation Notes:**
- Add `src/lib/clear/auth.ts`.
- Add a manual key issuance script, e.g. `scripts/issue-clear-api-key.mjs`.
- Add durable storage for API key records: key hash, prefix, owner label, tier, created/revoked timestamps.
- Add owner storage for Stage 2 objects, either via explicit columns or a compatible ownership table:
  - mandate owner
  - clearance owner
- Never store or log plaintext API keys.
- Auth header format: `Authorization: Bearer cpk_...`.

**Acceptance Criteria:**
- Valid key authenticates.
- Missing, malformed, unknown, or revoked key returns `401`.
- Logs show only a key prefix, never the full key.
- Mandates and clearances can be associated with the creating key/owner.

**Tests:**
- Valid key passes.
- Missing key returns `401`.
- Revoked key returns `401`.
- Malformed prefix returns `401`.
- Key A cannot access or settle key B-owned resources.

**Dependencies:** none
**Priority:** P0

---

## Issue 2 — Add `POST /api/clear/check`

**Labels:** `stage-2`, `P0`, `backend`, `api`, `clear`

**Description:**
Create the primary callable product endpoint. A caller submits a claim, quote, source, and policy; CitePay returns a clearance decision and receipt URL without settlement.

**Implementation Notes:**
- Add `src/app/api/clear/check/route.ts`.
- Reuse `evaluateClaimClearance()` from `src/lib/clear/evaluate.ts`.
- Do not duplicate demo logic where a shared helper can be extracted.
- Supported source inputs:
  - `{ "onChainId": "..." }`
  - `{ "text": "...", "label": "..." }`
- Do not accept arbitrary `sourceUrl` in Stage 2.
- Supported policy inputs:
  - `{ "mandateConfigId": "..." }`
  - inline policy for check-only use.
- Add `visibility: "public" | "private_hash_only"`.
- Default API calls to `private_hash_only` unless explicitly public.
- Clarify support scoring:
  - quote verification is deterministic
  - support score may be model-assisted
  - support score can block a weak citation
  - support score can never override a missing quote

**Acceptance Criteria:**
- A valid API key can call `/api/clear/check`.
- A real quote/source returns `CLEARED`.
- A fabricated quote returns `UNSUPPORTED` even with a high support score.
- Response includes `clearanceId`, `decision`, `checks`, `settlement: null`, `receiptUrl`, `contentHash`, `visibility`, and `createdAt`.
- Private-hash receipts do not expose full claim/quote text publicly.

**Tests:**
- Happy `CLEARED` path.
- Fabricated quote plus high score returns `UNSUPPORTED`.
- Both `source.onChainId` and `source.text` set returns `400`.
- Neither source field set returns `400`.
- Arbitrary `sourceUrl` returns `400`.
- Unknown `onChainId` returns `404`.
- Unknown `mandateConfigId` returns `404`.
- Oversized claim/quote/source returns `413`.
- Burst requests return `429`.
- Private-hash receipt redaction works.

**Dependencies:** Issue 1
**Priority:** P0

---

## Issue 3 — Add `POST /api/clear/mandate`

**Labels:** `stage-2`, `P0`, `backend`, `api`, `mandate`

**Description:**
Create the public mandate endpoint so external callers can create the policy/budget object required for a full check-to-settle flow.

**Implementation Notes:**
- Add `src/app/api/clear/mandate/route.ts`.
- Request:
  ```json
  {
    "name": "standard docs policy",
    "requiredLicenseClass": "standard",
    "maxPricePerCitationMicro": 100000,
    "totalBudgetMicro": 5000000
  }
  ```
- Response:
  ```json
  {
    "mandateConfigId": "mnd_...",
    "requiredLicenseClass": "standard",
    "maxPricePerCitationMicro": 100000,
    "totalBudgetMicro": 5000000,
    "spentMicro": 0
  }
  ```
- Persist to SQLite and Neon synchronously.
- Store mandate ownership from the authenticated key.

**Acceptance Criteria:**
- A valid key can create a mandate.
- Created mandate can be used immediately by `/api/clear/check`.
- Created mandate can be used from a cold instance via Neon fallback.
- Invalid enum/budget values are rejected.

**Tests:**
- Valid mandate creation returns `201`.
- Invalid `requiredLicenseClass` returns `400`.
- Non-positive budget/price returns `400`.
- Missing auth returns `401`.
- Mandate owner is recorded.
- Fresh-instance lookup works through Neon fallback.

**Dependencies:** Issue 1
**Priority:** P0

---

## Issue 4 — Add `POST /api/clear/settle`

**Labels:** `stage-2`, `P0`, `backend`, `api`, `payments`, `security`

**Description:**
Generalize the guarded `/recover/settle` pattern for normal check-to-settle usage. Settlement must re-evaluate before paying, enforce ownership, and prevent double spend across serverless instances.

**Implementation Notes:**
- Add `src/app/api/clear/settle/route.ts`.
- Reuse `createPaidReceipt()` from `src/lib/clear/settle.ts`.
- Reuse the defensive pattern from `src/app/api/clear/recover/settle/route.ts`.
- Request:
  ```json
  {
    "clearanceId": "clr_...",
    "mandateConfigId": "mnd_...",
    "idempotencyKey": "client-key-123",
    "confirm": true
  }
  ```
- Re-evaluate against the current mandate before payment.
- Enforce same-owner clearance/mandate/key relationship.
- Enforce idempotency in Neon, not only local SQLite.
- Return original successful result for repeated identical settle calls.

**Acceptance Criteria:**
- `mandate -> check -> settle` completes on preview.
- Settlement creates one payment/receipt only.
- Replayed settle request returns original result without double payment.
- Cross-key settle attempt is rejected.
- Budget race cannot overspend the mandate.

**Tests:**
- Missing `confirm: true` returns `400`.
- Unknown ids return `404`.
- Re-evaluation failure returns `422` or appropriate blocked verdict.
- Same settle request twice returns original result.
- Same idempotency key with different clearance returns `409`.
- Key A attempting to settle key B resource returns `403`.
- Concurrent budget race allows only one payment.

**Dependencies:** Issues 1, 2, 3
**Priority:** P0

---

## Issue 5 — Add `GET /api/clear/[id]/badge`

**Labels:** `stage-2`, `P1`, `backend`, `api`, `badge`

**Description:**
Create a public SVG badge endpoint that renders the current clearance state without making unsupported claims.

**Implementation Notes:**
- Add `src/app/api/clear/[id]/badge/route.ts`.
- SVG states:
  - `Cleared`
  - `Cleared·Paid`
  - `Not cleared: <verdict>`
  - `Not found`
- `Cache-Control: public, max-age=300`.
- Unknown ids should return a usable `Not found` SVG with status `200`.
- Never render `Paid` unless a real settlement transaction exists.

**Acceptance Criteria:**
- Badge renders for cleared unpaid, cleared paid, blocked/refused, and missing ids.
- Badge links or is documented to link back to `/clearance/[id]`.
- No badge state invents a status not present in the clearance record.

**Tests:**
- Cleared unpaid renders `Cleared`.
- Settled clearance renders `Cleared·Paid`.
- Unsupported/block verdict renders actual verdict.
- Missing id renders `Not found`.
- No paid label without transaction evidence.

**Dependencies:** Issue 4 for paid state
**Priority:** P1

---

## Issue 6 — Extend `GET /api/clear/[id]` And Clearance Receipt Page

**Labels:** `stage-2`, `P1`, `backend`, `frontend`, `receipt`

**Description:**
Make public clearance receipt data easier for agents, badges, and reviewers to consume while respecting private-hash visibility.

**Implementation Notes:**
- Extend `src/app/api/clear/[id]/route.ts`.
- Update `src/app/clearance/[id]/page.tsx`.
- Add top-level fields:
  - `decision`
  - `contentHash`
  - `visibility`
  - `settlement`
- For `private_hash_only`, redact full claim/quote text from public responses/pages while preserving hashes, verdict, policy trace summary, and settlement evidence.
- Add badge embed snippet to the receipt page.

**Acceptance Criteria:**
- Public receipt response is easy to consume without unpacking nested objects.
- Private-hash clearance page does not expose full claim or quote.
- Public clearance page still shows claim and quote when visibility is public.
- Badge embed appears on the receipt page.

**Tests:**
- Public receipt shows claim/quote.
- Private-hash receipt redacts claim/quote.
- Settlement field is `null` before settle and populated after settle.
- Badge embed snippet uses correct clearance id.

**Dependencies:** Issues 2, 4, 5
**Priority:** P1

---

## Issue 7 — Add Clear MCP Tools To `/api/mcp`

**Labels:** `stage-2`, `P1`, `backend`, `mcp`, `agents`

**Description:**
Expose CitePay Clear through MCP so agent builders can integrate without custom REST glue.

**Implementation Notes:**
- Update `src/app/api/mcp/route.ts`.
- Add tools:
  - `clear_claim`
  - `get_clearance`
  - `settle_clearance`
- Keep input/output schemas 1:1 with REST.
- Extract or share handlers so REST and MCP cannot drift.
- Use `CITEPAY_API_KEY` or bearer auth consistently.

**Acceptance Criteria:**
- MCP client can call `clear_claim`.
- MCP client can call `get_clearance`.
- MCP client can call `settle_clearance`.
- MCP and REST produce equivalent decisions and failure codes.

**Tests:**
- Tool schema validation.
- `clear_claim` happy path.
- `clear_claim` fabricated quote path.
- `settle_clearance` idempotency behavior.
- MCP auth failure path.

**Dependencies:** Issues 2, 3, 4
**Priority:** P1

---

## Issue 8 — Publish `citepay-mcp@0.2.0` And Agent Quickstart

**Labels:** `stage-2`, `P1`, `docs`, `mcp`, `agents`, `release`

**Description:**
Update and publish the MCP package so a clean machine can integrate CitePay Clear in under five minutes.

**Implementation Notes:**
- Update `citepay-mcp/`.
- Publish `citepay-mcp@0.2.0`.
- Add `docs/AGENTS.md`.
- Include:
  - install command
  - env var setup
  - MCP config example
  - first `clear_claim`
  - first `settle_clearance`
  - refusal loop guidance: do not cite unless `CLEARED`
- Use granular npm token for `cyberrockng1`.

**Acceptance Criteria:**
- Package is published.
- Quickstart works on a clean machine.
- First `CLEARED` can be reached in <=5 minutes using docs only.
- Docs clearly distinguish check-only vs settle.

**Tests:**
- Clean install test.
- MCP config smoke test.
- `clear_claim` against preview.
- `settle_clearance` against preview.

**Dependencies:** Issue 7
**Priority:** P1

---

## Issue 9 — Add `/.well-known/citepay.json` Fetcher And Publisher Registration Fields

**Labels:** `stage-2`, `P2`, `backend`, `frontend`, `publisher`, `security`

**Description:**
Let publishers declare citation policy from their own domain and use it during registration without creating a broad dashboard.

**Implementation Notes:**
- Add `src/lib/clear/wellknown.ts`.
- Extend `/register` and relevant source registration route(s).
- Supported file:
  ```json
  {
    "version": 1,
    "licenseClass": "standard",
    "pricePerCitationMicro": 10000,
    "payoutAddress": "0x...",
    "contact": "mailto:..."
  }
  ```
- Fetch once at registration or explicit refresh only.
- SSRF protections:
  - HTTPS only
  - resolve then verify IP
  - reject private/link-local IPs
  - re-check redirects
  - max 3 redirects
  - 100KB body cap
  - 5s timeout
  - content-type check

**Acceptance Criteria:**
- A valid well-known file prefills/registers policy fields.
- Invalid files fail with field-specific errors.
- Malicious redirects/private IP attempts are rejected.
- No automatic crawling exists.

**Tests:**
- Valid file accepted.
- Missing required field rejected.
- Oversized body rejected.
- Private IP target rejected.
- Redirect-to-localhost rejected.
- Timeout handled cleanly.

**Dependencies:** none, can run parallel with P0 API work
**Priority:** P2

---

## Issue 10 — Add Creator Clearances Page

**Labels:** `stage-2`, `P2`, `frontend`, `publisher`, `receipt`

**Description:**
Create the minimal publisher-facing page: a reverse-chronological list of clearances and payments for a creator wallet. This is not a dashboard.

**Implementation Notes:**
- Add route such as `src/app/creator/[wallet]/clearances/page.tsx`.
- Add or reuse DB query for clearances by creator/payout wallet.
- Display:
  - decision
  - amount paid
  - tx link when available
  - receipt link
  - created time
- Include a plain empty state.
- No charts, settings, reputation, rankings, or marketplace functions.

**Acceptance Criteria:**
- Wallet with mixed clearances shows all relevant rows.
- Wallet with none shows an empty state.
- Settled rows link to transaction/receipt evidence.
- Refused rows explain no payment moved.

**Tests:**
- Render wallet with settled clearance.
- Render wallet with refused clearance.
- Render wallet with no clearances.
- Links point to expected receipt/tx pages.

**Dependencies:** Issue 4 for settlement data
**Priority:** P2

---

## Issue 11 — Refresh Reviewer Proof Path

**Labels:** `stage-2`, `P2`, `frontend`, `docs`, `grant-review`

**Description:**
Make the grant-reviewer path linear, honest, and self-serve: `/clear` -> `/clear/demo` -> `/clearance/[id]` -> contracts/proof/GitHub.

**Implementation Notes:**
- Update `/clear` copy if route exists, or add a minimal page if missing.
- Update `/proof`.
- Confirm `/clear/demo` still demonstrates adversarial refusal.
- Ensure testnet labels are visible near contract addresses and tx links.
- Keep claims evidence-first:
  - no legal/copyright enforcement claims
  - no false traction
  - no fake testimonials
  - no "trusted by" without real external evidence

**Acceptance Criteria:**
- A reviewer can verify the product path in under 5 minutes without a walkthrough.
- Every contract/tx is labeled Arc Testnet.
- Demo traffic disclosure remains visible wherever traction is shown.
- GitHub/proof/deck links are consistent.

**Tests:**
- Manual fresh-browser walkthrough.
- Verify receipt link resolves.
- Verify tx/explorer link resolves.
- Search copy for forbidden claims.

**Dependencies:** Issues 5, 6, 10
**Priority:** P2

---

## Issue 12 — Execute Stage 2 Audit Gate

**Labels:** `stage-2`, `P0`, `audit`, `security`, `blocking`

**Description:**
Run the blocking Stage 2 audit before any Stage 3 outreach, onboarding, or integration gallery work. This is a code/security correctness gate.

**Implementation Notes:**
- Audit against the bug-prevention checklist in the four-stage plan.
- Cover:
  - input validation
  - auth
  - ownership checks
  - rate limits
  - private/public receipt behavior
  - replay/idempotency
  - settlement double-spend prevention
  - SSRF protection
  - testnet labeling
  - no false claims
  - no leaked secrets in repo/DB/logs
- Re-run adversarial guarantee in production.
- Run live check/mandate/settle/badge path in production after prod freeze is lifted.

**Acceptance Criteria:**
- All Stage 2 endpoints pass audit.
- All findings are closed or explicitly accepted/deferred in writing.
- Production adversarial test confirms fabricated quote returns `UNSUPPORTED`.
- Production settle replay returns one payment only.
- Written confirmation exists that the gate is closed.

**Tests:**
- Full CI test suite.
- Manual live production smoke tests.
- Secret grep.
- Rate-limit live test.
- Idempotent settle live test.

**Dependencies:** Issues 1-11
**Priority:** P0, blocking

---

## Non-Issue Standing Rule

Do not begin Stage 3 external outreach, publisher onboarding, integration gallery work, billing, webhooks, marketplace, leaderboard, broad dashboards, autonomous crawling, mainnet, or contract upgrades until Issue 12 is closed unless the user explicitly types:

```text
proceed without audit
```
