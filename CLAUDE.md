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
- **Required public variables:** `NEXT_PUBLIC_API_URL=https://api.trylitos.com`, `NEXT_PUBLIC_SITE_URL=https://trylitos.com`, `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Optional: `NEXT_PUBLIC_STATUS_PAGE_URL`.
- **Adding a `NEXT_PUBLIC_*` takes TWO steps: set it on the Railway service AND declare `ARG <NAME>` in the Dockerfile's build stage.** Railway passes service variables to the builder as build args, and a stage only receives the ones it declares. Doing only the first is silent: the build sees the variable as undefined, Next.js inlines nothing, and anything without a code default ships dead. `tests/next-public-build-args.test.mjs` fails the suite if app code reads a `NEXT_PUBLIC_*` the Dockerfile does not declare, so the halfway state cannot merge.
- **Fixed 2026-09-04, and worth knowing because it was invisible for months.** The build stage declared no `ARG` at all, so every `NEXT_PUBLIC_*` was undefined at build time and the defaults in `lib/config.ts` were the real production configuration while reading like fallbacks. Variables with no default simply did not work: on the live bundle 2026-09-03 the deployed chunk read `let u=t.default.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,s=...;if(u&&s)`, both undefined, so **PostHog never initialised and production produced no analytics at all** from the move to Railway until this was repaired. The Railway variables were correct the whole time; nothing was reading them.
- **Never write `ENV NEXT_PUBLIC_X=$NEXT_PUBLIC_X` in the Dockerfile.** A declared ARG that nobody passed expands to the empty string, not to nothing, and `??` is nullish-only, so `""` defeats the `lib/config.ts` defaults that exist to catch a missing variable. Measured 2026-09-04: with `NEXT_PUBLIC_API_URL=""` the build exits 0, `npm test` stays green, and `.next/static` carries `API_URL",0,""` with no occurrence of `api.trylitos.com` anywhere, i.e. every API call aimed at a relative path. The build stage drops empty values before running `npm run build` for exactly this reason.
- **The `lib/config.ts` defaults stay as defence in depth.** They are what a build with nothing set compiles in: every local build, the CI `check` job, and production the day a Railway field is cleared. CI builds that job with no `NEXT_PUBLIC_*` set and asserts on the emitted artifact, not on the source.
- **`NEXT_PUBLIC_*` is baked at build time and is public.** Changing one requires a redeploy, and its value is readable in the client bundle by anyone. Never put a secret in one.
- **Rollback:** redeploy the previous successful Railway deployment, then restore the previous DNS records if the custom-domain cutover itself is unhealthy
