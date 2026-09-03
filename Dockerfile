FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# THE BUILD STAGE HAS TO DECLARE EVERY NEXT_PUBLIC_* IT WANTS, and until this
# block existed it declared none.
#
# Railway hands the builder its service variables as `--build-arg`s, and a build
# stage only receives the ones it names in an ARG. With no ARG here, every
# `--build-arg` was passed to a stage that consumed nothing, `npm run build` ran
# with all of them undefined, and Next.js inlined nothing. The code defaults in
# lib/config.ts were therefore the values every visitor got, which is not what
# a "default" reads like to anyone changing one.
#
# Measured on the live bundle 2026-09-03, before this change: the deployed chunk
# carried `t.default.env.NEXT_PUBLIC_API_URL??"<default>"` rather than an
# inlined literal, `process.env` is `{}` in the browser, and so the ?? arm won
# every time. PostHog has NO default and was simply dead: its chunk read
# `let u=t.default.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,s=...;if(u&&s)`, both
# undefined, `posthog.init` never called, zero analytics from production since
# the service moved to Railway. The Railway variables were correct the whole
# time; nothing was reading them.
#
# Adding a name here is half of wiring a new NEXT_PUBLIC_*. Set it on the
# Railway service too, or the build still sees nothing.
#
# NEXT_PUBLIC_* IS PUBLIC. Whatever is passed here is inlined into JavaScript
# any visitor can read. Never route a secret through one.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_STATUS_PAGE_URL

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# AN EMPTY VARIABLE IS NOT AN ABSENT ONE, and Next.js treats them completely
# differently. `??` is nullish-only, so a variable set to "" is NOT replaced by
# the default beside it: it wins. Measured on this commit, same command:
#
#   NEXT_PUBLIC_API_URL unset -> API_URL "https://api.trylitos.com"  (default held)
#   NEXT_PUBLIC_API_URL=""    -> API_URL ""                          (default bypassed)
#
# The second build emitted `API_URL",0,""` and zero occurrences of
# api.trylitos.com anywhere in .next/static: every API call in the dashboard
# aimed at a relative path, `npm test` stayed green, and the build exited 0.
#
# Two ways an empty value gets in here, both measured against this Dockerfile
# with docker 29.4.1 on 2026-09-04:
#
#   ARG + `--build-arg NAME=`      -> present, ""      <- a blanked Railway field
#   ARG + ENV NAME=$NAME, no arg   -> present, ""      <- the tempting spelling
#   ARG alone, no --build-arg      -> absent           <- what we want
#
# Railway passes EVERY service variable as a build arg, so a field someone
# clears in the UI arrives as the first row, not as an absent variable. That is
# why the names are stripped here rather than exported through ENV: it collapses
# both "" cases onto the third row, which is the one where the lib/config.ts
# defaults do the job they exist for. tests/next-public-build-args.test.mjs
# refuses the ENV spelling outright so it cannot come back.
#
# This repo has met the same nullish-versus-empty trap once already, on
# BUILD_TIME; next.config.ts records that round.
RUN set -eu; \
    for name in \
      NEXT_PUBLIC_API_URL \
      NEXT_PUBLIC_SITE_URL \
      NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN \
      NEXT_PUBLIC_POSTHOG_HOST \
      NEXT_PUBLIC_GOOGLE_CLIENT_ID \
      NEXT_PUBLIC_STATUS_PAGE_URL \
    ; do \
      eval "value=\${$name-}"; \
      [ -n "$value" ] || unset "$name"; \
    done; \
    npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
