# Litos guest mode QA report

Date: 2026-07-26

## Result

Health score: 10/10

Guest mode passed three complete, isolated Chrome runs. Each run started in a fresh browser context and completed the controlled application submission flow without contacting an employer.

## Acceptance results

| Check | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| First-visit guest entry visible | Pass | Pass | Pass |
| Guest session created | Pass | Pass | Pass |
| Seven-day Pro-level trial active | Pass | Pass | Pass |
| Same guest resumes idempotently | Pass | Pass | Pass |
| First name filled | Pass | Pass | Pass |
| Last name filled | Pass | Pass | Pass |
| Email filled from application identity | Pass | Pass | Pass |
| Resume uploaded | Pass | Pass | Pass |
| Final approval required | Pass | Pass | Pass |
| Submission completed | Pass | Pass | Pass |
| Receipt reference verified | Pass | Pass | Pass |
| Pro offer shown after trial expiry | Pass | Pass | Pass |
| Guest entry hidden on returning browser | Pass | Pass | Pass |

All three receipts used the controlled reference `LITOS-QA-2027`.

## What was implemented

- A server-owned guest identity with no required email.
- A seven-day reverse trial using the existing Pro entitlements.
- Guest JWT validation, expiry, revocation epoch checks, and database ownership.
- Idempotent guest creation with an hourly IP anti-abuse limit.
- A first-visit browser history marker that remains after sign-out.
- In-place workspace claiming when a guest verifies a new email.
- Existing-account protection: an existing email opens its existing account and does not merge the guest workspace or extend its trial.
- Guest-aware account deletion and nullable-email handling.
- Guest workspace labels and a save-workspace action.
- Pro upsell only after the trial expires.
- Claim-before-checkout behavior for guests.
- A controlled browser submission portal and reproducible QA harness.

## Defects found and fixed during testing

1. The controlled fill result reported separate `first_name` and `last_name` fields. The assertion was corrected to require both fields individually.
2. The first controlled portal used a client-only submit handler. Chrome could reach it before hydration, causing the form to reset without a receipt. The portal now uses a native GET submission and server-rendered confirmation, which is deterministic without JavaScript timing.
3. The post-expiry Pro control is a link, not a button. The UI assertion now checks its correct semantic role.
4. Existing nullable-email assumptions in profile and token paths caused compile failures. Those paths now preserve resume-derived guest identity and use verified email only when present.
5. Reopening the same guest originally consumed another IP creation slot. Idempotent resumes now happen before the new-identity rate limit.

## Information unavailable until claim

A guest has no verified account email. Until they claim the workspace, Litos cannot provide cross-device recovery, account email notifications, or direct billing identity. Submission identity can still come from the uploaded resume or application profile. A submission safely stops if full name or email is missing.

Browser storage is only the first-time UI signal. The backend does not trust it for identity, trial timing, quotas, or entitlement enforcement.

## Verification

- Backend typecheck: pass
- Backend tests: 480 passed
- Backend production build: pass
- Web tests: 45 passed
- Changed-file web lint: pass
- Web production build with webpack: pass
- Controlled Chrome submission suite: 3 passed
- Visual inspection of submission receipt: pass
- Visual inspection of post-trial Pro offer: pass

No real employer received an application.
