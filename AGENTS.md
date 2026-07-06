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
manual deploy rule (git push does NOT deploy; run
`npx vercel deploy --prod --yes` after pushing).
