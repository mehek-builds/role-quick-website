# Litos website

The public site + in-browser product dashboard for **Litos**: open a job posting and it
tailors your resume, fills the application, and drafts the outreach.

- **Live:** https://trylitos.com
- **Vercel fallback:** https://role-quick-website.vercel.app
- **Stack:** Next.js 16 (App Router, Turbopack) + Tailwind v4 + GSAP
  ScrollTrigger + Lenis
- **This repo is frontend only.** All data comes from the separately
  deployed Litos backend (`student-outreach-backend.vercel.app`, its own
  repo). Base URL lives in `lib/config.ts` (`NEXT_PUBLIC_API_URL`
  override). Backend changes belong in that repo, never here.

## Read these before editing

| doc | what it owns |
| --- | --- |
| `DESIGN.md` | every visual law + the decision log. Non-negotiable. |
| `ACCESSIBILITY.md` | WCAG target, contrast contracts, interaction annotations, and smoke-test checklist |
| `FILM.md` | the scroll film: layer model, all generated clips, exact Higgsfield prompts + job ids, regeneration pipeline, the blend-isolation gotcha |
| `PLAN.md` | the phased product plan (marketing site → account → workspace → billing) |
| `ARCHITECTURE.md` | feature boundaries, dependency direction, and extension rules |
| `AGENTS.md` | agent ground rules (Next.js 16 caveats, DESIGN.md supremacy) |
| `CHANGELOG.md` | user-facing release history |
| `CHECKLIST-EXTERNAL-VERIFICATION.md` | claims that still require infrastructure, provider, paid-account, or assistive-technology evidence |

## Map

```
app/
  page.tsx            the homepage: one continuous scroll film (see FILM.md)
  login/              passwordless authentication
  dashboard/          7-view product dashboard backed by the live API
    applications/     packet review + one employer question at a time,
                      with Previous/Next navigation that preserves drafts
  privacy/            dated privacy policy
components/
  cinema/             the film system: CinematicHero (fixed stage + scrub +
                      sting), CinematicPage (grain + rail), BRoll (shots
                      printed into the film), Wash, SmoothScroll (Lenis)
  Mockups.tsx         the product's visual vocabulary: resumes, forms,
                      inbox, packet receipt. Single source of the demo
                      content; the film's resume shots are rendered FROM it.
  Motion.tsx          Reveal / CountUp (scroll-settle; isolates blend modes,
                      so BRoll shots stay outside it)
lib/                  config + typed API client for the Litos backend
features/             feature-owned domain, application, and infrastructure code
public/film/          121-frame base film (webp, canvas-scrubbed)
public/broll/         7 generated clips + 6 posters (lazy, blended into film)
scripts/
  render-stills.mjs   renders the real-resume reference frames for the two
                      start/end-locked b-roll shots (see FILM.md)
  render-film.mjs     no-credits local fallback for the base film
```

## Develop

```bash
npm run dev     # localhost:3000
npm run build   # always run before shipping; trust it over the preview
```

Google sign-in uses the checked-in public OAuth web client ID by default. Either
deployment can override it when rotating the client:

```env
# Website project
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

# Backend project
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Add `https://trylitos.com` and the Vercel preview origin to that client's authorized JavaScript origins.

PostHog browser analytics requires these public deployment variables:

```env
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=your-project-token
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Set both variables in Vercel Production and Preview. The project token is public by design and must never be replaced with a PostHog personal API key.

### The QA fixture gate

Everything under `/qa/` is a test fixture: fabricated Greenhouse/Lever/Ashby application forms and
dashboard harnesses fed invented data. Until 2026-08-09 the whole directory answered 200 to the
open internet, protected only by a `robots.txt` disallow, which is a request made of crawlers and
not access control. It is now behind a shared secret:

```env
LITOS_QA_PORTAL_SECRET=32-to-128-chars-of-A-Za-z0-9_-
```

Generate one with `openssl rand -base64 48 | tr -d '=+/' | cut -c1-48`.

- Send it as `?litos_qa_key=<secret>` or as the `x-litos-qa-key` header. The query parameter is the
  one that matters: the trial harness drives these pages through a remote managed browser that
  navigates to a URL and cannot set headers.
- Anything else gets `notFound()`. Unset or malformed, the gate is CLOSED on every Vercel runtime
  including Preview, and open only under `next dev` off Vercel, so `npm run dev` is unaffected.
- The local production-build config (`litos-website-prod`, :3501) sets `NODE_ENV=production`, so it
  needs the variable in `.env.local` to reach `/qa/`.
- **Set it in Vercel Production and Preview before merging a change that relies on it, and set the
  same value in the backend project.** The backend's `scripts/trial-portal-shapes.mts` reads
  `LITOS_QA_PORTAL_SECRET` and appends it to every fixture URL; if the two do not match, every
  managed trial case 404s.

The whole argument, including what a secret in a query string does and does not buy, is in
`lib/qa-gate.ts`.

Registered launch configs (vault `.claude/launch.json`):
`litos-website` (dev, :3500) and `litos-website-prod`
(build + start, :3501).

## Deploy

**Production builds from `main`.** The Vercel project is connected to this
GitHub repo (reconnected 2026-07-27), so merging or pushing to `main` is the
deploy. Every production deployment now carries the commit SHA that built
it, which a CLI upload does not.

Do not run `vercel deploy --prod`. It ships the working directory rather
than `main`, and this repo regularly has a dozen worktrees open across
sessions; one stale tree deploying would overwrite the live site with no
record of where it came from.

After a push, verify the live HTML actually changed (curl for a new
string), and check the deployment in `vercel ls role-quick-website`.

For an exact post-deploy canary, request `https://trylitos.com/api/revision`
with cache bypass. The response must have `identity_complete: true`, its
40-character `revision` must equal the commit merged to `main`, and its
`build_time` must be the expected new build. The endpoint sends no-store
headers at the browser, CDN, and Vercel CDN layers. A local build reports
`revision: "local"` and `identity_complete: false`, so it cannot be accepted as
production proof. Repository-backed Vercel builds fail before deployment when
their complete Git revision is unavailable or malformed.

## Open items

- trylitos.com purchased on Porkbun and attached to the Litos Vercel project.
- Pricing is OFF the site entirely (2026-07-27, Mehek's call) while the plan
  is reworked. No surface quotes a price; `components/PricingCards.tsx` was
  deleted. Unresolved: $49.99 is Pro's current monthly price and cannot also
  be the Premium price, Premium's volume is unset, and "free trial" vs the
  old "Free forever" promise are opposite products.
- Publish the prepared Litos name, copy, icon, and screenshots to the existing
  Chrome Web Store listing.
