# Role Quick website: build plan

Working name for the product's marketing + web-app surface. The Chrome
extension and backend remain branded **Volley** internally for now (repos
`mehek-builds/volley-extension`, `mehek-builds/volley-backend`); Role Quick is
the public-facing name until a full rename is decided.

## Design system (locked 2026-07-03)

Structural family borrowed from Letterstory's console
(`~/Documents/letterstory-outreach/web`), re-themed for Role Quick:

- **Palette:** white canvas (`--color-bg`), warm off-white section striping
  (`--color-surface-alt`), hairline borders (`--color-border` `#e8e6e1`),
  near-black ink (`#12120f`), Role Quick blue as the single accent
  (`--color-brand` `#2b4bf2`), soft blue tint for badges (`--color-brand-soft`).
  Traffic-light tiers (`positive`/`warn`/`danger`) reused for contact
  confidence (Verified/Likely/LinkedIn), same semantics as the PRD.
- **Shape:** rounded, not sharp. `20px` card radius, full-pill buttons and
  badges. No angular corners anywhere.
- **Type:** Geist Sans for UI, Geist Mono for structured data (emails,
  numbers, resume mockup), same stack as Letterstory.
- **Structure:** Grammarly's marketing pattern (typography-first hero, no
  hero screenshot, then alternating text/mockup feature rows, stat callout,
  numbered how-it-works, comparison pricing) crossed with Wonsulting's
  checkmark feature lists and product-mockup-in-card visual language.
- Tokens live in `app/globals.css` under `@theme inline` (Tailwind v4,
  CSS-based config, no `tailwind.config.ts`). Change tokens there to re-theme
  everything at once.
- Reusable mockup components in `components/Mockups.tsx`
  (`ContactListMockup`, `DraftMockup`, `ResumeMockup`) are the visual
  vocabulary for "what the product does", reuse them (don't screenshot the
  real extension) anywhere the site needs to show product behavior, including
  in the future dashboard's empty states.

## Current state (this repo)

Marketing site only: `/` (home), `/privacy` (placeholder). Static, no auth,
no data. Deployed as a plain Next.js app, no backend calls yet.

## Where this is going: the robust web app

The extension (Volley/Role Quick) is the capture surface; this website is
where account, billing, and the resume/outreach data the extension produces
should eventually live and be reviewable. Phased so each phase ships
independently and the marketing site never breaks while later phases build.

### Phase 1: Marketing site (DONE)
`/`, `/privacy`. Static. Goal: drive Chrome Web Store installs.

### Phase 2: Auth + account shell
- `/login`, `/signup`: auth against `student-outreach-backend`'s existing
  user model (see `users` table in the PRD's Postgres schema). Reuse
  whatever session mechanism the extension already uses (JWT) so a logged-in
  extension user and a logged-in website user are the same account.
- `/dashboard`: empty shell + nav (Contacts, Resume, Settings). No real data
  yet, just proves the auth round-trip against the live backend.

### Phase 3: Resume workspace
- `/dashboard/resume`: upload/replace resume (hits the existing
  `/profile` backend endpoint), preview the parsed profile, and a **live
  version of the `ResumeMockup` visual** rendering the user's actual parsed
  data instead of placeholder text. This is the "what would resume creation
  look like" question made real, not just a marketing mockup.
- Per-posting tailored resume preview (ties to PRD-v2 resume-autofill):
  show the keyword diff between the base resume and the tailored version
  before the extension fills a form with it.

### Phase 4: Outreach dashboard
- `/dashboard/contacts`: the same `ContactListMockup` visual, live: every
  resolved contact across all captured postings, filterable by tier/company,
  with the draft text and sent/replied/bounced status (mirrors
  `outreach_events` in the backend schema). This is the "track + follow up"
  step from the PRD (Section 6, Step 6) that the extension popup is too small
  to do well.
- One-tap follow-up drafting from here, calling the same `/draft` endpoint
  the extension uses.

### Phase 5: Billing
- `/dashboard/settings/billing`: Stripe checkout for the $19.99/mo tier,
  usage meter against the free-tier cap (25-40 verified contacts/mo), pause
  (not cancel) flow per the PRD's anti-churn design (Section 10).
- Requires deciding the billing provider account and webhook target before
  starting; flag to Mehek when this phase is picked up.

### Not planned yet (explicitly out of scope until asked)
- LinkedIn DM automation of any kind (the PRD forbids this outright).
- Reading the user's inbox for auto reply-tracking (CASA-gated, deferred
  per PRD Section 9.9).
- Multi-tenant/team accounts.

## Open decisions to revisit before Phase 2

1. **Naming:** does "Role Quick" become the permanent brand (extension +
   backend repos renamed too), or does the website stay Role Quick while the
   extension stays Volley? Affects the Chrome Web Store listing name and
   OAuth app verification (which is tied to a brand name).
2. **Auth provider:** roll our own JWT (matches the backend's existing
   session model) vs. an off-the-shelf auth provider (Clerk/Auth.js). Backend
   already has a lightweight JWT session for the extension (PRD Section
   9.11, step 1); reusing it avoids a second auth system, but a hosted
   provider is faster if the account surface grows past just contacts +
   resume.
3. **Data fetching:** does the website call `student-outreach-backend`
   directly (same API the extension uses), or does it need its own
   BFF/API routes? Direct calls are simpler and there's no reason yet to add
   a layer, but revisit if the website needs data shapes the extension API
   doesn't already return.
