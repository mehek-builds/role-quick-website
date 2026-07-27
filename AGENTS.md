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
