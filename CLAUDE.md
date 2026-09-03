@AGENTS.md

## Deploy Configuration

- **Platform:** Railway
- **Primary service:** litos-web
- **Production branch:** main
- **Custom domains:** trylitos.com, www.trylitos.com
- **Production API:** https://api.trylitos.com (DNS cutover complete). The former https://student-outreach-backend.vercel.app name proxied to this same Railway service and is being retired; nothing in this repo may point at it.
- **Build:** Dockerfile, `npm run build`
- **Runtime:** Node 22, standalone Next.js server on Railway's `PORT`
- **Health check:** `/`
- **Required public variables:** `NEXT_PUBLIC_API_URL=https://api.trylitos.com`, `NEXT_PUBLIC_SITE_URL=https://trylitos.com`
- **These `NEXT_PUBLIC_*` variables do NOT currently reach the build.** The Dockerfile declares no build `ARG` for them, so Railway passes them as build args that no stage consumes and `npm run build` sees them undefined. The defaults in `lib/config.ts` are therefore what ships to visitors. Verified on the live bundle 2026-09-03: the deployed chunk still contained the `?? "<default>"` expression rather than an inlined literal. The Railway variable itself is already correct: `railway variables --service litos-web --environment production --kv` returns `NEXT_PUBLIC_API_URL=https://api.trylitos.com` (verified 2026-09-03). Adding the `ARG`/`ENV` wiring to the Dockerfile is therefore safe to do now and is the correct end state, with the `lib/config.ts` defaults kept as defence in depth.
- **`NEXT_PUBLIC_*` is baked at build time and is public.** Changing one requires a redeploy, and its value is readable in the client bundle by anyone. Never put a secret in one.
- **Rollback:** redeploy the previous successful Railway deployment, then restore the previous DNS records if the custom-domain cutover itself is unhealthy
