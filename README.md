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
| `FILM.md` | the scroll film: layer model, all generated clips, exact Higgsfield prompts + job ids, regeneration pipeline, the blend-isolation gotcha |
| `PLAN.md` | the phased product plan (marketing site → account → workspace → billing) |
| `AGENTS.md` | agent ground rules (Next.js 16 caveats, DESIGN.md supremacy) |

## Map

```
app/
  page.tsx            the homepage: one continuous scroll film (see FILM.md)
  login/ dashboard/   passwordless auth + 5-view product dashboard (real backend)
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
public/film/          121-frame base film (webp, canvas-scrubbed)
public/broll/         6 generated clips + posters (lazy, blended into film)
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

## Open items

- trylitos.com purchased on Porkbun and attached to the Litos Vercel project.
- Pricing is OFF the site entirely (2026-07-27, Mehek's call) while the plan
  is reworked. No surface quotes a price; `components/PricingCards.tsx` was
  deleted. Unresolved: $49.99 is Pro's current monthly price and cannot also
  be the Premium price, Premium's volume is unset, and "free trial" vs the
  old "Free forever" promise are opposite products.
- Publish the prepared Litos name, copy, icon, and screenshots to the existing
  Chrome Web Store listing.
