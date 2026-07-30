# Litos web architecture

## Goal

The codebase uses feature-first clean architecture. Business decisions are grouped by the user
capability they serve, then separated by responsibility inside that feature. Next.js remains the
delivery framework, not the place where business rules live.

This is an incremental boundary around the dashboard's most connected behavior. Existing marketing
and onboarding code stays in its current location until it needs material change. Moving it only
for symmetry would add risk without reducing coupling.

## Folder structure

```text
app/                         Next.js routes and route handlers
components/                  Shared React presentation
features/
  applications/
    domain/                  Pure application-review and tailoring rules
    infrastructure/          Calls to application-related backend endpoints
    index.ts                 Stable public feature API
  dashboard/
    application/             Dashboard orchestration and response normalization
    index.ts                 Stable public feature API
  jobs/
    domain/                  Pure job-row and compensation rules
    index.ts                 Stable public feature API
lib/                         Cross-cutting legacy modules and backend contracts
public/                      Static assets
scripts/                     Build and verification scripts
tests/                       Cross-feature and presentation contract tests
```

Tests for a feature's pure behavior live beside that behavior. Cross-feature contract tests remain
in `tests/`.

## Layers

### Domain

Domain modules contain deterministic rules and types. They do not render React, read browser state,
or call the network. Examples include deciding whether an application is reviewable, matching a
packet to a job, formatting published compensation, and building requirement-highlight segments.

### Application

Application modules coordinate a use case. The dashboard loader accepts a requester function
instead of importing a transport, which keeps response normalization testable and allows the
versioned bootstrap endpoint to fall back without coupling the use case to `fetch`.

### Infrastructure

Infrastructure modules translate feature operations into backend requests. The applications
gateway owns endpoint paths and request payloads. It may depend on domain types. Domain code must
not depend on infrastructure.

### Presentation

Files in `app/` and `components/` own Next.js and React concerns. They import feature behavior only
through each feature's `index.ts`. This prevents routes from depending on internal file locations.

## Dependency direction

```text
app and components
        |
        v
feature public API
   |           |
   v           v
application   infrastructure
   |           |
   +-----> domain <-----+
```

Dependencies point toward domain behavior. A domain module may use shared contract types, but it
must not import React, Next.js, browser storage, or an infrastructure module.

## Public API rule

Code outside a feature imports from `@/features/<feature>`, never from a feature's `domain`,
`application`, or `infrastructure` directory. Internal paths are private implementation details.
Tests may import a private pure module directly when the test belongs to that layer.

## Behavior preservation

The refactor keeps function bodies, endpoint paths, payloads, storage behavior, and rendering
behavior unchanged. Tests moved with their domain modules, and the test command now discovers both
legacy and feature-local tests.

## Adding functionality

1. Put business rules and feature types in `domain/`.
2. Put use-case coordination in `application/`.
3. Put backend, browser, and vendor adapters in `infrastructure/`.
4. Export only the supported surface from the feature `index.ts`.
5. Keep React state and rendering in `app/` or `components/`.
6. Add pure tests beside domain or application code, and add route-level contracts in `tests/`.

## Remaining migration seam

`lib/api.ts` still combines shared backend contracts, session storage, and the generic HTTP client.
It is intentionally retained as a compatibility seam because nearly every authenticated route
depends on its wire types. Its next safe extraction is:

```text
shared/
  domain/backend-contracts.ts
  infrastructure/http/litos-client.ts
  infrastructure/session/browser-session.ts
```

That extraction should happen with contract tests for authorization, request deduplication, 401
redirects, multipart uploads, and local-storage keys before changing the module.
