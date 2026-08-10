# Checklist external verification

The local UI contracts are implemented and covered by the repository suite. The
following claims require infrastructure, provider configuration, a paid account,
or assistive technology that is not present in this worktree. They remain open
until a human records evidence.

## Status service

- Create an independently hosted status service covering website, API, managed
  application runs, application email, and billing.
- Configure `NEXT_PUBLIC_STATUS_PAGE_URL` in Preview and Production.
- Verify incident history, scheduled maintenance, measured uptime, and update
  subscriptions on that host. The local `/status` route intentionally claims none
  of these while the environment value is absent.

## Billing provider

- Configure hosted checkout success and cancel redirects to `/billing/return`.
- With a paid test account, verify active, failed-payment, and canceled states.
- Confirm the hosted portal shows the masked payment method, charged amount,
  discounts, next billing date, downloadable invoice, and receipt.
- Confirm the cancellation return refreshes `/me` and exposes the exact
  `billing_ends_at` access-through date.

## Security evidence

- Independently verify any future encryption-at-rest, data-residency, access-control,
  certification, incident, or penetration-test statement before adding it to
  `/security`.
- Route a harmless vulnerability-report test through Contact and confirm ownership,
  response handling, and secret-safe intake.

## Accessibility smoke tests

- Run the routes in `ACCESSIBILITY.md` with VoiceOver and Safari on macOS.
- Run the named routes with NVDA and Firefox on Windows.
- Record browser, assistive-technology version, route, result, and any exception in
  the pull request. Automated semantics tests do not substitute for these checks.

## Worktree build note

`npm run build` uses Turbopack and rejects this isolated worktree because its
`node_modules` symlink points to the primary checkout outside Turbopack's filesystem
root. `npm run build -- --webpack` completes successfully against the same source.
Re-run the ordinary command in CI or in the primary checkout, where dependencies are
inside the project root.
