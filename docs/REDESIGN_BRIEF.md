# CitePay Web Redesign Brief — for Codex
> Owner: Codex executes; Claude audits after; user approves final look.
> Deadline pressure: submission is **end of Jul 6 (11:59 PM ET)**. Phase 1 must be live by Jul 6 morning. Scope is presentation-layer ONLY — the demo/payment/proof logic is judge-critical and working; breaking it is the only unforgivable failure.

## 1. Honest critique of the current design (what's wrong and why)

1. **No real landing page.** The homepage dumps stats, live feeds, and feature fragments in one scroll. A first-time visitor (or judge) cannot answer "what is this product?" in 5 seconds. Award-winning sites open with ONE clear statement + ONE primary action, then progressively disclose.
2. **No information architecture.** ~18 routes exist as a flat sprawl (judge table is the only map). Professional products group routes into a navigable hierarchy that *emerges from the landing page* — nav sections, footer sitemap, in-page CTAs. Right now pages are islands.
3. **Color system reads "hacker terminal," not "payments infrastructure."** Neon green `#00ff88` as the dominant accent on near-black, with heavy neon borders everywhere, is dated and amateurish. Reference-grade dark UIs (Linear, Vercel, Stripe dark) use: restrained neutral surfaces, ONE desaturated accent, and color reserved for meaning (success/error), not decoration.
4. **Typography misuse.** Monospace is used for body copy and labels everywhere. Mono belongs ONLY on hashes, addresses, and amounts. Headings/body need a proper hierarchy (size/weight/color), not uniform terminal text.
5. **Card/border noise.** Every element is boxed with a visible border, same weight, same radius. No visual hierarchy — nothing is more important than anything else, so everything is noise.
6. **No brand moment.** No logo/wordmark treatment, no hero, no social-proof section, no "trusted by / integrated with" strip (we HAVE Tollgate + Shadow + Circle/Arc — unused credibility).
7. **CTA chaos.** Multiple competing buttons of equal weight. There must be exactly one primary CTA per view.

## 2. Design references (steal patterns, not pixels)
- **Stripe.com** — IA and restraint: hero → problem → how it works → proof → CTA.
- **Linear.app** — THE reference for dark-theme done right: neutral surfaces, subtle borders, one accent.
- **Vercel.com** — typography scale, spacing rhythm, black-background elegance.
- **Circle.com** — fintech tone: trust-first, calm color, real numbers presented cleanly.
Do not import flashy animation libraries; subtle CSS transitions only (mobile performance history: we crashed phones once already).

## 3. New visual system (design tokens — implement in globals.css/Tailwind theme)
- **Backgrounds:** page `#0B0D12`, surface `#12151C`, raised surface `#171B24`.
- **Borders:** `#1E2330` at full use; prefer `border-white/5`–`white/10` subtlety. Kill neon borders.
- **Text:** headings `#F5F7FA`, body `#A6ADBB`, muted `#6B7280`.
- **Accent (ONE):** emerald `#34D399` (desaturated money-green; replaces neon `#00ff88`). Used for: primary CTA, success/proof states, key numbers. NOTHING else is green.
- **Secondary accent:** indigo `#6366F1` stays ONLY for links/interactive highlights. Never both accents in the same component.
- **Semantic:** success `#34D399`, error `#F87171`, warn `#FBBF24`.
- **Type:** Geist (already loaded) for all UI; `Geist Mono` strictly for hashes/addresses/USDC amounts. Scale: h1 48–56/tight, h2 32, h3 22, body 16, small 13–14.
- **Buttons:** primary (emerald fill, dark text), secondary (surface + border), ghost (text only). One primary per view.
- **Radius:** 12px cards, 8px buttons. **Shadows:** none or barely-there; borders carry structure.

## 4. New information architecture

### Landing page `/` (complete rebuild — the centerpiece)
Sections, in order:
1. **Hero:** wordmark "CitePay Markets" · h1: "AI agents pay for what they cite." · sub: "Every citation becomes a real USDC payment with a tamper-proof on-chain receipt — settled on Arc via Circle x402." · Primary CTA: **"Run the live demo"** → /demo · Secondary (ghost): "See on-chain proof" → /proof. Optional: small live stat chips under CTAs (404+ paid citations · $0.91 routed · 11 creators paid) pulled from /api/traction, rendered subtly.
2. **Problem → Solution** (two short columns or alternating rows): agents cite without permission/payment/accountability → CitePay makes citation = payment + receipt.
3. **How it works** (3 steps, iconless is fine, numbers): ① Agent pays via x402 (HTTP 402 → USDC on Arc) ② Claude scores sources; PAY/REFUSE decisions mint receipts ③ Anyone can verify hashes on-chain; tampering is challengeable.
4. **Live proof strip:** compact dark band with real numbers from /api/traction + link to /traction. Real data only (I1 discipline — never hardcode fake).
5. **Cross-network credibility:** "Two agent networks paying each other" — Tollgate two-way loop (one paragraph + Arcscan link), Shadow Float sponsor line, built-on badges: Circle · Arc · x402 · Claude.
6. **Explore the product** grid (6 cards max, one line each): Demo · Market · Proof Explorer · Traction · Agent Exchange · Creator Join. Each links out — THIS is where routes emerge from the landing.
7. **Footer:** full sitemap of all routes grouped (Product / Proof / Creators / Agents / Resources), GitHub link, npm `citepay-mcp`, contract address (mono, truncated).

### Global navigation (new component, all pages)
- Top bar: wordmark left · center/right links: **Demo · Market · Proof · Traction** · primary button "Run Demo". Mobile: keep existing bottom nav but restyle to new tokens; top bar collapses to wordmark + "Demo" button.
- Every product page gets a consistent **PageHeader**: breadcrumb "← CitePay", h2 title, one-line description. (PageShell already exists — extend it.)

### Route grouping (labels used in nav/footer; URLS UNCHANGED)
- **Product:** /demo, /ask, /market, /auction
- **Proof:** /proof, /traction, /audit, /receipt/:id, /live
- **Creators:** /join, /register, /estimate
- **Agents:** /agents, /agent-exchange, /orchestrate, /economy
- **Resources:** /mcp, GitHub, docs

## 5. Phasing (strict — deadline is real)

**Phase 1 — MUST land by Jul 6 morning:**
1. Design tokens (section 3) applied globally (globals.css + tailwind theme), replacing neon greens/borders site-wide via the shared classes.
2. New global top nav + restyled mobile bottom nav + footer sitemap.
3. Landing page complete rebuild per section 4.
4. Deploy + verify live.

**Phase 2 — SHOULD (same day if Phase 1 lands early):**
5. PageHeader/PageShell consistency pass across the 6 judge-path pages: /demo, /market, /proof, /traction, /ask, /receipt/:id. Restyle their cards/buttons to tokens. Do NOT touch their logic/data flow.

**Phase 3 — COULD (only if time truly remains):**
6. Remaining pages token cleanup.

## 6. Hard constraints (breaking these = failed redesign)
- **Zero logic changes.** /demo flow, all /api routes, receipts, hashes, payment code untouched. Presentation only. The demo just survived 3 bug-fixes and 2 real-money verifications — do not disturb it.
- All existing routes keep working at the same URLs (judge quick start + submission link to them).
- Mobile-first: test at 375px. We have a history of mobile crashes and clipped labels — every new component must wrap/scroll safely (`min-w-0`, `break-all` on hashes, overflow guards stay).
- Keep: Vercel Analytics tag, /demo error boundary, keep-warm workflow, stateless-DB honesty note.
- Real data only in stats — fetch from /api/traction; graceful zero-states; never fabricate.
- Performance: no new heavy deps (no framer-motion bundles on landing without measuring; CSS transitions preferred).
- **Deploy rule:** git auto-deploy is BROKEN. After each phase: `npm run build` clean → commit → `vercel --prod --yes` → **verify live on citepay-markets.vercel.app** (hard refresh) before calling it done.
- After Phase 1: run the Playwright sanity (run /demo end-to-end once) to prove the redesign didn't break the flow.

## 7. Acceptance criteria
- A stranger landing on `/` understands the product within 5 seconds and sees exactly one primary CTA.
- No neon `#00ff88` remains as decoration (only semantic success in its desaturated form `#34D399`).
- Mono font appears ONLY on hashes/addresses/amounts.
- Nav + footer expose every route in grouped, professional structure.
- /demo still completes end-to-end (Playwright-verified) after all changes.
- Lighthouse mobile on `/` ≥ 85 performance (no animation bloat).
- Live site verified deployed (not just pushed).

## 8. Process
- Work in small commits per phase; declare any deviation from this brief before doing it (AGENTS.md discipline).
- After Phase 1 deploys, notify the user for a look before starting Phase 2 — the user is the final judge of the aesthetic, and course-correcting after Phase 1 is cheap.
