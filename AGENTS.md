<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## The scroll film
Always read FILM.md before touching components/cinema/, public/film/,
public/broll/, or scripts/render-*.mjs. It holds the layer model, every
generated clip's prompt and job id, the regeneration pipeline, and the
blend-isolation gotcha that silently breaks the seamless look.

## Repo map and workflow
README.md is the entry point: doc map, dev/prod launch configs, and the
deploy rule.

**Do not run `vercel deploy` for production.** As of 2026-07-27 the Vercel
project is connected to this GitHub repo and production builds from `main`.
Pushing to `main` deploys it. Manual CLI deploys ship your *working
directory*, not `main`, so with several worktrees open on this repo one
stale tree could silently overwrite the live site, and Vercel records no
commit for a CLI upload, so nothing would say which code shipped.

## Company logos on the jobs board

**Take the mark from the ATS board, never from the company's name.** We poll each
employer by a token recorded in the backend's `src/lib/jobSources.ts`, so the page
at that token is that company's by construction. Guessing a domain from the name
is how `block.co` (an NFT company) nearly landed on Block's jobs, `imply.com`
(LED panels) on Imply's, and `suki.com` (a German DIY supplier) on Suki's.

- `/api/company-logo?c=<name>&board=<career_url>` resolves it at request time, so
  a company the job monitor added an hour ago is dressed on the next request and
  one that left the board is simply never asked for again.
- **`parseBoardUrl` is an SSRF gate**, not tidiness: the board URL is a query
  parameter our server fetches. Exact-hostname allowlist, https only, plain-slug
  token. Do not loosen it to a regex or a suffix match.
- Name-guessing is the last resort only, and keeps its own rules: `.com` only,
  the site must name the company, and a denylist of names whose obvious `.com`
  belongs to someone else.
- A miss returns the company's initial as an SVG with a 200 — never a 404, because
  the board carries no client JavaScript to swap in a fallback.

If you change any of this, run `npm run verify:logos https://trylitos.com`. It
exits non-zero and checks the whole chain end to end, including that the API is
still sending `career_url`.
