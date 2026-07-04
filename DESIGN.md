# Design System — RoleQuick

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
- **Human voice:** Geist Sans. Sentence case. Display is weight **450, never
  bold** (calm things don't shout). Headlines are short declarative sentences
  ending with a period.
- **Machine voice:** Geist Mono. Every number, timestamp, filename, ATS name,
  status, and label. When the machine speaks, it speaks in mono.
- **Scale (deliberate gap — nothing between 20 and 64):**
  - Display: 64-76px / 450 / -0.03em / 1.02
  - Section: 32px / 450 / -0.02em
  - Body: 16px / 400 / 1.65 (muted color, max-width ~560-660px)
  - Small: 13px / 400
  - Machine: 12.5px mono
  - Label: 11px mono, uppercase, +0.08em, weight 500
- **Loading:** next/font Geist + Geist_Mono (already wired in `app/layout.tsx`).

## Color — 95% ink on white
Palette is the brand deck's, unchanged. The laws below are what changed.

- **Canvas:** `#ffffff` · **Surface-alt:** `#faf9f7` (section striping only)
- **Border:** `#e8e6e1` hairline, always 1px. No `border-2` emphasis anywhere.
- **Ink:** `#12120f` · **Muted:** `#6b6a64` · **Faint:** `#a3a19a`
- **Blue `#6b84e8` (+ ink `#4257b8`, soft `#eef1fe`):** marks **the one action
  a human takes per screen** (primary CTA, focus ring, the Submit-adjacent
  thing). One-accent-moment rule: blue appears on exactly one element per
  viewport. If a second blue thing wants in, one of them is wrong.
- **Coral `#dd9273` / Teal `#68ad95`:** provenance threads only — which pillar
  an artifact came from (coral = outreach, teal = autofill, blue = documents).
  Thin 2px lines, small chips, small text. **Never fills, never section
  theming, never urgency.** Near-invisible on marketing; data-bearing in app.
- **Semantic:** positive `#15803d`, warn `#b45309`, danger `#b91c1c` — status
  facts only, never persuasion.
- **Dark mode:** not shipped. The brand is light. (An exploratory dark token
  set exists in the preview artifact only.)

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

## Motion
- **Approach:** minimal-functional. Nothing moves unless it must.
- **Easing:** enter ease-out, exit ease-in. **Duration:** 150-250ms.
- **Loading:** the `rq-shimmer` sweep only. No scroll choreography, no
  entrance animations on marketing.

## Voice (copy rules that are also design rules)
- Short sentences. Periods. "You hit submit." beats "Empowering your journey."
- No AI-slop vocabulary, no exclamation marks, no urgency framing.
- Social proof only below the fold, and only when real. Zero fake numbers.

## Guardrails (load-bearing, from the brand deck — do not relitigate)
No streaks/badges/daily-login rewards. Scarcity must be real. Every outbound
send is an explicit named button. Canceling takes the same clicks as signing
up. Color encodes what something is, never how urgently to act.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-04 | Initial DESIGN.md via /design-consultation | Live research on Linear/Notion/Stripe/Vercel + independent design voice; memorable thing set to "calm + speed" by Mehek |
| 2026-07-04 | Blue = one human action per viewport; coral/teal demoted to provenance threads | The one-accent restraint is what makes the reference brands read clean; also makes the Guardrails stance visible |
| 2026-07-04 | Receipt motif (mono timestamp log) as the hero artifact | Speed shown as fact, not hype — serves "calm + speed" without violating the no-urgency law |
