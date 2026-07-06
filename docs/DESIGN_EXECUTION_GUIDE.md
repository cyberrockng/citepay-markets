# CitePay — Design Execution Guide (Priority + Top-Professional Craft)
> For Codex. Two parts. PART A ships TODAY (Jul 6, submission day) and is non-negotiable. PART B is the deep-craft push to top-tier — take the time it needs, but never at the cost of A landing first, and never touching demo/payment logic.
> Golden rule that overrides everything: **the /demo flow, /api routes, receipts, hashes, and payment code are judge-critical and working — presentation only, always. Re-run the Playwright demo sanity after every deploy.**
> Deploy rule: git auto-deploy is BROKEN → `npm run build` clean → commit → `vercel --prod --yes` → verify LIVE on citepay-markets.vercel.app before calling anything done.

---

# PART A — PRIORITY (must be live today; blocks submission)

## A1. 🔴 CRITICAL — one source of truth for every stat
Conflicting numbers currently render on the landing (hero "542 CitationPaid events" vs chips "404 paid citations"; "30 sources" vs 10; "762 refusals / 436 skips" vs traction's 304/205). For a product whose pitch is *verifiable* numbers, this is disqualifying — a judge dismisses the whole thesis.
- Create ONE data hook (e.g. `useTraction()`) that fetches `/api/traction` once and shares via context/SWR. Every stat on every page reads from it.
- Map each displayed number to a single canonical field. If two numbers legitimately measure different things (all-time on-chain events vs confirmed paid citations), label them unambiguously — but prefer ONE number per concept.
- Refusals, skips, sources, creators, USDC — all must equal the traction API live. Spot-check against the live endpoint before declaring done.
- Zero-state: if the fetch fails, show a skeleton/loading, never a fabricated or stale hardcoded number.

## A2. Navigation semantics (user requirement)
- The **"CitePay Markets" wordmark (top-left) is the only home nav** → links to `/`.
- Any "back" control is labeled **"Back"** and behaves as browser/route back — never "Home."
- Mobile bottom nav: the wordmark owns home; the bottom "Home" item should be renamed or removed so it doesn't duplicate. Keep 44px touch targets, active-state highlight for the current route.

## A3. /ask UX trap
- Disable "Circle Pay & Ask" until walletStep is `funded`/`circle_ready`; show it visibly disabled with helper copy ("Connect your wallet and sign in above to pay").
- Replace the raw error ("siweAddress required — complete SIWE first") with a friendly inline message; no payment was attempted, say so.
- Top-of-page banner on /ask: "No wallet? Try the one-click demo →" linking /demo.

## A4. Finish the landing IA (from the original brief §4 — verify present, add if missing)
How-it-works 3-step section · "Explore the product" grid (≤6 cards, routes emerge here) · Footer sitemap grouped (Product / Proof / Creators / Agents / Resources) + GitHub + npm citepay-mcp + contract address (mono, truncated).

## A5. Ship gate for Part A
Zero conflicting numbers · wordmark=home & Back correct · /ask guarded · build clean · deployed & verified live · Playwright demo still completes end-to-end.

**When A is live, notify the user for a look before going deep on B.**

---

# PART B — TOP-PROFESSIONAL CRAFT (the push to award-tier)
Reference standard: Linear.app, Stripe.com, Circle.com. Study their actual patterns. The difference between "clean" and "world-class" is craft in these specific areas.

## B1. Brand & visual identity (the missing "soul")
- **Wordmark:** refine beyond a plain CP box. Design a small distinctive mark — e.g. a citation/quote glyph fused with a payment/link motif — as an SVG. Consistent at 24px (nav) and larger (footer/OG).
- **Signature color treatment:** one restrained emerald accent (#34D399) + a subtle brand gradient for hero/accents (e.g. emerald→teal→deep indigo at very low opacity). Define it once as a CSS variable; reuse for glows, the primary button, key numbers.
- **Iconography:** adopt ONE icon set (Lucide, consistent 1.5px stroke). No emoji as UI icons on the landing. Replace ad-hoc glyphs.
- **Depth system:** move beyond flat borders. Layered surfaces (page → surface → raised) + one soft ambient shadow token + hairline top-highlight on cards (border-t-white/5) for the "lit from above" look Linear/Vercel use.

## B2. Hero — SHOW the product, don't just describe it
The single biggest lever. Top sites show the product in the hero.
- Keep the strong headline + one primary CTA. But add a **product visual**: a real, on-brand mock of the core artifact — a **live "Citation Receipt" card** (query hash, content hash, USDC amount, Arcscan link, a green "verified ✓" seal) rendered as an actual component (real data if cheap, else a representative static one clearly styled as a product UI, not fake stats).
- Background: a tasteful **gradient mesh or subtle dot-grid with a soft radial glow** behind the hero — performant CSS only, no heavy libs. Very low contrast; it should feel premium, not busy.
- Headline: display weight, tight tracking (-0.02em), `text-wrap: balance`, generous line-height. This is the typographic moment.

## B3. Layout composition & rhythm
- Adopt a **bento-grid** for the "how it works" / "explore" / proof sections — varied cell sizes, a modern premium pattern (see Linear/Vercel). Not a row of identical boxes.
- **Vary the rhythm:** alternate full-bleed bands (edge-to-edge subtle background) with contained max-w sections. Not everything bordered.
- **8pt spacing system**, consistent section padding (e.g. py-24 md:py-32), generous whitespace. Whitespace is the #1 signal of premium design — be brave with it.
- **Asymmetry** where it earns attention (hero: text left / product visual right, offset).

## B4. Typography craft
- Scale: display 56–72 (hero) / h2 36–40 / h3 22 / body 16–18 / small 13. Clear jumps, not muddy middles.
- Eyebrows: 11–12px, tracking-widest, muted, above each h2.
- Body: max-w-prose, relaxed leading, secondary color — never pure white paragraphs.
- Numbers/hashes: Geist Mono only. Big stat numbers can be display-size mono for impact.
- `text-wrap: balance` on headings, `pretty` on paragraphs.

## B5. Motion & micro-interactions (tasteful, performant — NO heavy libs)
- **Scroll-reveal:** sections fade/translate-up subtly on enter via IntersectionObserver + CSS transitions (write ~30 lines, no framer-motion bundle on the landing — we crashed phones once; measure).
- **Stat count-up:** real numbers animate from 0 on first view (only real data).
- **Hover:** buttons/cards lift subtly (translateY(-1px) + shadow), links underline-grow, 150–200ms ease. Consistent everywhere.
- **Focus-visible** rings on all interactive elements (a11y + polish).
- Respect `prefers-reduced-motion` — disable animations for it.

## B6. Proof & credibility, presented like a fintech
- The live-proof strip: fewer, bigger, animated real numbers + a subtle "live" pulse dot. Link to /proof.
- Cross-network section: turn the Tollgate/Shadow story into a small **visual diagram** (two nodes, arrows both directions, USDC flowing) rather than a paragraph — "two agent networks paying each other" shown, not told.
- Built-on: real logos (Circle, Arc, Claude, x402) in a restrained mono/greyscale strip, not text pills.

## B7. The details that separate pro from amateur
- **OG image** (1200×630, branded — hero mark + tagline + a proof number) so X/WhatsApp/Discord link cards look designed. Set og:title/description/image + twitter:card=summary_large_image.
- **Favicon** matching the mark (multiple sizes).
- **Smooth-scroll** + scroll-margin-top for anchor nav.
- **Active nav state** for current route.
- **Consistent empty/loading/error states** across pages — designed, not default.
- **404 page** on-brand.
- Metadata/title per page.

## B8. Consistency pass across judge-path pages (Phase 2 of original brief)
Apply the tokens, PageHeader, card style, buttons, and the above craft to: /demo, /market, /proof, /traction, /ask, /receipt/:id. Logic untouched. These are what judges click after the landing — they must feel like one product, not six.

## B9. Iteration protocol (this is how craft actually happens)
Codex: don't one-shot it. For the hero and each major section:
1. Build it. 2. Screenshot at 1440px AND 375px. 3. Self-critique against Linear/Stripe: is there enough whitespace? one clear focal point? is anything competing? does it feel premium or busy? 4. Refine. Repeat until it holds up next to the references.
- Test every breakpoint (375 / 768 / 1440). Our history: mobile overflow/clipping and a full crash — guard every component (min-w-0, break-all on hashes, overflow-x safe).
- Keep bundle lean; measure Lighthouse mobile (target ≥90 perf on the landing). Craft that tanks performance isn't craft.

## B10. Hard limits (unchanged)
Zero logic/payment/route changes · real data only (never fabricate to look good) · keep Analytics tag, /demo error boundary, keep-warm workflow · manual deploy + live verify · demo Playwright-verified after each deploy · declare any deviation from this guide before doing it.

---

## Suggested order
A1 → A2 → A3 → A4 → ship A + notify user → B7 OG image (quick marketing win) → B2 hero → B1 brand → B3/B4 layout+type → B5 motion → B6 proof visuals → B8 page consistency → B9 iterate. Ship incrementally; each deploy verified live and demo-sanity-checked.
