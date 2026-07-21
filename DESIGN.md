# Design System — Litos

Source of truth for every visual decision on this site (marketing + dashboard).
Derived from the brand guidelines v1.0 deck (vault:
`1-ventures/products/student-outreach/brand-guidelines.html`), pushed toward
the restraint of the cleanest brands (Linear, Notion, Stripe, Vercel — live
captures reviewed 2026-07-04). The deck stays canon for palette and shape;
this file adds the usage laws that make the site feel like those brands.

## Product Context
- **What this is:** Chrome extension + web dashboard. One detection event on a
  job posting produces a tailored resume, a fully-filled application (never
  auto-submitted), and a drafted outreach email.
- **Who it's for:** College students mid-job-hunt. Stressed, busy, 19-22.
- **Space:** Career tools (Wonsulting, Offerloop, Simplify) — a category that
  is badge-heavy, testimonial-stuffed, and urgency-colored. We are the opposite.
- **Project type:** Marketing site + logged-in web app, one Next.js codebase.

## The Memorable Thing (every decision serves this)
**Calm + speed.** The one calm place in a chaotic job hunt, and you remember
how fast the packet appeared. Calm comes from restraint (whitespace, one
accent, nothing moving). Speed is shown as a receipt (mono timestamps, bare
numbers), never claimed with hype.

## Aesthetic Direction
- **Direction:** Brutally minimal, warmed. "The quiet instrument."
- **Decoration level:** Minimal — typography does all the work.
- **Mood:** Swiss lab notebook that happens to be fast. Library-quiet.
- **References:** linear.app (restraint, one accent moment), notion.com
  (declarative headlines with periods, warm light canvas), stripe.com (bare
  stats, hairline dividers), vercel.com (mono microcopy, type-first).

## Typography — two voices
- **Human voice:** Hanken Grotesk. Sentence case. Display is weight **450, never
  bold** (calm things don't shout). Headlines are short declarative sentences
  ending with a period.
- **Machine voice:** Azeret Mono. Every number, timestamp, filename, ATS name,
  status, and label. When the machine speaks, it speaks in mono.
- **Scale (deliberate gap — nothing between 20 and 64):**
  - Display: 64-76px / 450 / -0.03em / 1.02
  - Section: 32px / 450 / -0.02em
  - Body: 16px / 400 / 1.65 (muted color, max-width ~560-660px)
  - Small: 13px / 400
  - Machine: 12.5px mono
  - Label: 11px mono, uppercase, +0.08em, weight 500
- **Loading:** `next/font` Hanken Grotesk + Azeret Mono, wired in
  `app/layout.tsx` and self-hosted by the production build.

## Color v1.1 — tonalities with jobs
Palette is the brand deck's, unchanged. Revised 2026-07-04 (second pass) after
Mehek rejected strict one-accent scarcity and a Simplify teardown (home +
Copilot pages captured live): Simplify repeats ONE action color on every CTA
and gives each feature row a pale tinted band. The law is **consistency of
meaning**, not scarcity. Three tonal families, each with a job:

- **Blue family** `#6b84e8` / ink `#4257b8` / soft `#eef1fe` — **action +
  documents pillar + Pro.** Solid blue may repeat on every true CTA on a page
  (never on anything that isn't an action). Blue-soft surfaces carry the
  documents pillar, selected states, the closing band, and **Pro emphasis**
  (pricing card, dashboard upsell) — the upgrade is allowed to be the
  strongest moment on its screen.
- **Teal family** `#68ad95` / ink `#457f6c` / soft `#eaf5f0` — **autofill
  pillar.** Its feature section sits on a whisper band (`teal-soft/50`);
  chips, threads, and "filled/done" states in app.
- **Coral family** `#dd9273` / ink `#a35f3f` / soft `#fbefe8` — **outreach
  pillar.** Same deployment: whisper band, chips, threads.
- **Pillar band rule (marketing):** each pillar's feature section sits on its
  soft tint at ~50%, with its colored thread + mono eyebrow. Tint = identity,
  structural, never decorative elsewhere.
- **Headline color rule:** at most one colored phrase in the hero (e.g. "in
  minutes." in blue-ink). Section headlines stay ink.
- **Neutrals:** canvas `#ffffff`, surface-alt `#faf9f7` (neutral striping for
  non-pillar sections), border `#e8e6e1` hairline always 1px, ink `#12120f`,
  muted `#6b6a64`, faint `#a3a19a`.
- **Semantic:** positive `#15803d`, warn `#b45309`, danger `#b91c1c` — status
  facts only, never persuasion.
- **Unchanged hard law:** color never encodes urgency. Emphasis states what
  something is or what you get; it never pushes how fast to decide. Meters
  stay ink (a meter is a quantity, not a pillar).
- **Dark mode:** not shipped. The brand is light.

## Spacing
- **Base unit:** 8px. **Density:** spacious on marketing, comfortable in app.
- **Marketing sections:** 128-160px vertical (`py-32`/`py-40`). App: `py-10`.
- **Text column:** max ~660px. Page shell: max 1060-1152px.

## Layout
- **Approach:** grid-disciplined. One idea per viewport on marketing.
- **Section headers:** short declarative sentence + period, centered or left,
  preceded by an 11px mono label eyebrow when context is needed.
- **Imagery:** real product UI only (the mockup components). One visual per
  section, max. No stock, no illustration, no icons-in-colored-circles.
- **Radius:** cards 20px, controls/pills 999px, inner blocks 12px. (Deck rule.)
- **Numbers:** stats appear as bare mono numerals (Stripe style), no badge.
- **Signature motifs:**
  1. **The receipt:** a packet card with a mono timestamp gutter
     (`19:42:07 POSTING DETECTED → 19:42:16 PACKET READY`). Speed as fact.
  2. **The refusal list:** Guardrails set like terms of service in mono
     ("What we refuse to do."). Ethics as brand furniture.

## Motion v1.1 — things settle, one thing loops
Revised 2026-07-04 (Mehek: "the website's too static, have moving parts").
Calm motion, not decoration:
- **Scroll reveal:** every marketing section settles in once (`Reveal` in
  `components/Motion.tsx`): 14px rise + fade, 700ms, `cubic-bezier(.16,1,.3,1)`.
  Never replays. Reveals must never gate content: they pre-trigger half a
  viewport early, elements already in view at mount appear instantly (deep
  links, scroll restoration), and the initial viewport (hero + receipt) uses
  the pure-CSS `rq-enter` entrance so the headline exists at first paint,
  before hydration.
- **The receipt is live and interactive** (`components/PacketDemo.tsx`): a
  JS state machine assembles the packet row by row with a terminal cursor,
  the footer flips from ASSEMBLING to READY + 9 SECONDS, holds, restarts.
  The ONLY perpetually-moving element — it is the product demo, not an
  attention device. Completed rows are buttons that jump to their pillar
  section (the receipt doubles as the page's table of contents), with
  pillar-soft hover tints.
- **Numbers count up** once on first view (`CountUp`, ~1.2s, cubic ease-out).
- **Reactive hero backdrop** (`components/HeroBackdrop.tsx`), three layers:
  a low-opacity Gmail inbox of application confirmations (the problem as
  texture — the top rows are meant to be READ, 45% opacity, wash center
  sits below them; bottom-masked before the demo), a white radial clarity
  wash that keeps the headline/CTAs fully legible, and one brand glow at 7%
  opacity that lerps toward the cursor. Reactive-to-you, never looping;
  touch devices get the glow centered and static. Clarity beats decoration:
  if the inbox ever competes with the headline, lower its opacity, never
  the wash — but never below glance-readable on the top rows.
- **Micro:** 150-250ms transitions on hover/state. Loading = `rq-shimmer`.
- **Hard rules:** no parallax, no marquees, no attention loops beyond the
  receipt, and everything respects `prefers-reduced-motion` (instant, static).

## Voice (copy rules that are also design rules)
- Short sentences. Periods. "You hit submit." beats "Empowering your journey."
- **Say each point once, in its strongest spot.** Submit-ownership lives in
  the hero and the refusal list, nowhere else. The free-tier claim lives in
  the pricing headline. The cancel-easy line lives on the pricing card and in
  Settings. Repetition reads as insecurity.
- No AI-slop vocabulary, no exclamation marks, no urgency framing.
- Social proof only below the fold, and only when real. Zero fake numbers.

## Guardrails (load-bearing, from the brand deck — do not relitigate)
No streaks/badges/daily-login rewards. Scarcity must be real. Every outbound
send is an explicit named button. Canceling takes the same clicks as signing
up. Color encodes what something is, never how urgently to act.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-21 | Global typography moved to Hanken Grotesk for the human voice and Azeret Mono for the machine voice | Keeps the Swiss lab-notebook system while avoiding the default type choices that make product sites feel generated or interchangeable |
| 2026-07-04 | Initial DESIGN.md via /design-consultation | Live research on Linear/Notion/Stripe/Vercel + independent design voice; memorable thing set to "calm + speed" by Mehek |
| 2026-07-04 | Blue = one human action per viewport; coral/teal demoted to provenance threads | The one-accent restraint is what makes the reference brands read clean; also makes the Guardrails stance visible |
| 2026-07-04 | Receipt motif (mono timestamp log) as the hero artifact | Speed shown as fact, not hype — serves "calm + speed" without violating the no-urgency law |
| 2026-07-04 | Color v1.1: one-accent scarcity replaced by tonalities-with-jobs (pillar bands, repeating action blue, Pro emphasis surfaces) | Mehek's call + Simplify teardown: their system repeats one action color everywhere and tints feature bands; meaning-consistency beats scarcity |
| 2026-07-04 | Pro emphasis allowed as the strongest moment per screen (blue-soft surface + solid CTA + caps chip) | Emphasis is honest when it states what you get; urgency mechanics stay banned |
| 2026-07-04 | Say-each-point-once voice rule | Mehek: "get rid of all the repetitive stuff" — submit-ownership was stated 5x on one page |
| 2026-07-04 | Copy floor: one line where one line works (feature rows went 3 bullets → 1 line; refusal whys → ≤5 words) | Mehek: "too much text, as simplistic as possible" |
| 2026-07-04 | Motion v1.1: scroll-settle reveals + looping receipt + count-up, reduced-motion safe | Mehek: "too static, have moving parts" — movement added without violating calm (nothing loops for attention except the demo) |
| 2026-07-04 | Refusal-list section REMOVED from the homepage (Mehek's call) | The Guardrails stance itself is unchanged and still load-bearing; it now shows up in the product surfaces themselves (blank essay field, EEO decline default, waiting-on-you submit) instead of a dedicated section |
| 2026-07-04 | Yearly plan added with a Grammarly-style billing toggle; REVISED same day to $39.99/mo billed annually ($479.88/yr, save $120 = 20%), superseding the initial $399/yr | Mehek's pricing calls; savings math is real and the billed amount is stated plainly per Guardrails. NOTE: backend/Stripe only has monthly today — a $479.88/yr payment link must exist before in-app yearly upgrade works |
| 2026-07-04 | Hero headline is "Apply in seconds." (imperative), superseding "Applying, in minutes." then "Applying, in seconds." same day | Mehek's calls; the 9-second packet makes "seconds" the honest claim |
| 2026-07-04 | Plan limits are expressed as JOBS PER MONTH everywhere (Free = 20, bound by resumes; Pro = 500, bound by contacts), with the raw caps listed beneath | Mehek: users think in jobs applied to, not in resource caps; the caps stay visible per Guardrails |
| 2026-07-04 | Submit-ownership language softened from absolutes ("You hit submit", "submit stays yours", "never submitted for you") to "You get the final say" / "You review before anything is submitted" | Opt-in auto-submit exists with a 9-second cancelable countdown, so "always yours" was technically false; privacy policy states the countdown explicitly |
| 2026-07-04 | ATS platform names removed from the autofill section copy (subhead is now a benefit line) | Mehek: users care that it autofills, not which portal; names remain in the SEO meta description and the privacy policy's scope statement |
| 2026-07-04 | Reveals made non-gating (CSS `rq-enter` for the initial viewport, instant-show when already in view, 50% pre-trigger margin) and ghost inbox raised to 45% opacity with the wash center moved off the top rows | Cold-visitor flow audit gap 3: hero was blank for 1-2s pre-hydration, End-key/anchor jumps landed on unrevealed white, and the problem-mirror inbox was too faint to register as "your inbox" |
| 2026-07-05 | Simplify-audit pass (vault: simplify-vs-rolequick-competitive-audit-2026-07-05.md), no-scale items only: header CTA goes action blue (v1.1 law, primary reads primary); hero subhead names the mechanism/trigger/audience ("free Chrome extension for students and new grads"); permissions + no-data-sale caption under hero CTA; pain named in ATS + autofill copy; pillars numbered 01/02/03; "defaults are yours to change" caption; source citations promoted faint→muted 11px; 5-item FAQ (details/summary, surface-alt band); pricing toggle shows the $39.99-vs-$49.99 math, "Free forever, no card required" moved to the Free button; footer becomes 4-column sitemap with founder line, X/GitHub, build-date stamp, keyboard-navigation line | Scale-dependent audit items (testimonials, trust logos, install counts, blog) deliberately skipped per the audit's own sequencing: add once the underlying data exists, never faked |
| 2026-07-05 | Simplify design-deep-dive pass (vault: simplify-design-deep-dive-2026-07-05.md, §10 adoptions): (1) the brand deck's three pillar pictograms become the site's one icon primitive — `PillarChip` (pill, pillar-soft bg, pillar-ink, mono label) replaces the dash-thread eyebrow on all three feature sections; (2) hero gets a three-chip table-of-contents bridge (Resume/Autofill/Outreach anchor links, foot-in-the-door first click) below the CTA + trust caption; (3) section hairline dividers removed — background alternation is now the only section separator (every adjacent band already differs, deep-dive pacing rule); (4) close-section proof line ("Posting detected → packet ready · 9 seconds") moved to directly beneath the CTA buttons, proof-at-arm's-length-from-the-ask. NOT adopted, per brand playbook: the teal squiggle underline (decoration; typography does the work), shadowed-white testimonial cards / trust logos / user counts (zero fake numbers — still gated on real data), manufactured urgency (banned), and per-section CTA buttons (one ask per page, Mehek's say-once voice rule) | Deep dive §10: pick few primitives, repeat everywhere; proof never lets a CTA stand alone; alternation over dividers |
| 2026-07-04 | Official logo suite cut from the brand's own ingredients: Geist glyph outlines (R at wght 700 for the badge, wordmark at 600 with tracking-tight), signature blue circle mark, ink/blue/reversed lockups. Masters in `public/brand/`; header, login, favicon (static `app/icon.png`), and the extension icons all use the same drawing | One drawing of the R everywhere the brand appears; per the deck's color law the wordmark stays blue/ink and coral/teal never lead |
| 2026-07-06 | Scroll film hero (Mehek's call: scroll-driven cinematic site, brand deck as starting point only). The homepage opens on a 420svh pinned canvas that scrubs a 121-frame generated film (scattered application pages converging into one packet, pillar light washes blue → teal → coral) with six composed effects: frame scrub, film grain, paper-dust particles, vignette, frosted glass chapter cards, chapter tints; Lenis paces the whole page and anchor jumps. SUPERSEDES the "no parallax / nothing moves" motion law for the homepage opener only — everything below the film keeps Motion v1.1. The film stays light-canvas, mono machine voice (progress rail, receipt line), color still never encodes urgency. Reduced motion / no JS: collapses to one static viewport, hero card server-rendered. Film source: `scripts/render-film.mjs` (local render, deterministic); frames contract is `public/film/frame-0000..0120.webp` so a Higgsfield-generated film can replace it with zero code change (blocked today: free plan gates generation) | The film IS the pitch: chaos in, one packet out — "calm + speed" told as cinema instead of claimed |
| 2026-07-06 | One-scroll pass (Mehek: no blank papers, integrate the site's real information into the film with sparse text; whole site reads as one strong scroll). (1) Film props: three small glass artifacts ride the film opposite each chapter card, carrying the canon story in crisp HTML text — Alex_Rivera_Notion_Resume.pdf mini-resume with skill chips + "ATS coverage 92%" (01), the filling Notion application with teal checks + "27 fields · nothing sent yet" (02), the Priya Nair USC '22 draft + "~120 words · in your voice" (03); mono captions over the opening frame (posting URL, "19:42:07 · Posting detected"). Props are lg-only (collide with chapter cards below 1024px); mobile keeps cards alone. (2) Page-wide cinema (`components/cinema/CinematicPage.tsx`): site-wide grain one tone quieter than the film's, a single fixed rail tracking film chapters then every section (The receipt → The odds → ATS formats → 01/02/03 → Pricing → Questions → Your move) with whole-page fill, and whisper parallax on every `[data-parallax]` mockup. (3) The close section reuses film frame-0120 as a faint masked backdrop: the page ends on the packet the film built. Film footage itself regenerated via Higgsfield seedance_2_0 (10s 1080p, soft-focus illegible print on the papers) extracted to the same frame contract | Sparse REAL text belongs to the props/HTML layer (crisp, brand-voiced), never to AI footage (gibberish); the rail + grain + returning packet are what make one scroll read as one film |
| 2026-07-06 | Full-page reel (Mehek: the entire website must be one clear reel, not a film hero over an unedited page). Every section below the film became a `.rq-chapter` panel: rounded 36px top lip, -36px overlap, lifted shadow, scrubbed 44px rise on entry — the next card of the reel sliding over the last. Each chapter sits on a washed still FROM the film (`FilmStill` component: frame img + white feather veil + parallax): receipt=104, odds=8, formats=24, documents=30, autofill=55, outreach=80, pricing=112, faq=116, close=120. Pillar text blocks became rq-glass cards (film-card rhyme) carrying receipt timestamps as eyebrows (19:42:11 / :14 / :16, receipt canon); the receipt chapter opens with "19:42:07 → 19:42:16". Pillar flat tint bands became tint overlays OVER their stills (bg-{pillar}-soft/40), same layering as the film's chapter tints. All copy, demos, pricing, FAQ content unchanged | One reel = one continuous surface: the studio never leaves, chapters stack like frames, and the 9-second receipt timeline is the page's clock |
| 2026-07-06 | Fixed-stage pass (Mehek: sections must be ingrained IN the animation, scroll smoother/less erratic, no white header bar). (1) The film canvas + tint + dust + vignette became a FIXED full-viewport stage behind the entire page; frame index is now whole-page scroll progress (frame 0 at top, the packet completes at the footer). Every chapter panel became translucent (bg-white/70-85 + backdrop-blur-md) so the film reads through and around every section; per-section FilmStill snapshots removed (live film replaced them). (2) Smoothness: ScrollTrigger snap REMOVED (it yanked the scroll), Lenis lerp 0.09 → 0.07 and wheelMultiplier 0.85, hero card scrub 0.85 → 1, chapter-rise scrub removed (whole-section transforms wobbled), canvas imageSmoothingQuality high. (3) Header is a floating rounded-full rq-glass pill (fixed, top-3, max-w-5xl), no border-b, no full-width white band | The animation IS the page: one fixed stage, panels float on it, and nothing ever snaps or bands white |
| 2026-07-06 | Paper-storm pass (Mehek: content must sit ON the flying-papers animation itself, papers consistent start to finish, collating into the single book ONLY at the end). (1) Section panels REMOVED entirely (no bg, no blur, no rounded lips — .rq-chapter CSS deleted): every section is transparent and its content sits on a feathered radial `Wash` (white / warm / pillar-soft tints, ~93% center → 0% edges), so flying papers stay visible around and between every section; FilmStill deleted. (2) Film pacing curve: page 0→0.86 plays only frames 0→74 (the swirl — papers never settle mid-page), page 0.86→1 compresses frames 75→120 (collation + washes) so the book assembles exactly at the close + footer. (3) FAQ list got an rq-glass card (only small cards get glass — panels never). Readability floor: text sits on wash centers; demos/mockups are already white cards | The page IS the storm: content floats in it, and the story resolves — one book — only where the page ends |
| 2026-07-07 | The Dart logo cut into production (approved 2026-07-05, was pending). `public/brand/litos-mark.svg` replaced with the paper-dart tile (two blue triangles on a `#eef1fe` tile), so the header, footer, and login mark all update from one file; favicon (`app/icon.png`) and the mark/tile PNGs (16→512) regenerated from the same SVG; the OG card (`opengraph-image.tsx`) now inlines the Dart as a data-URI instead of the CSS "R" circle. Wordmark kept as single-ink "Litos" text (the decision's lowercase two-tone treatment left for a later brand pass). The dart doubles as brand rhyme: the mark is itself a flying paper, echoing the storm | One drawing of the mark everywhere the brand appears; the paper-dart ties the logo to the film's flying-paper language |
