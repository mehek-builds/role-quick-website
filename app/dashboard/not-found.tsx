import Link from "next/link";

/**
 * A 404 under /dashboard, for someone who is already signed in.
 *
 * WITHOUT THIS FILE the root app/not-found.tsx answers, and it renders the marketing <Header/> with
 * a "Get started" button. Measured on 2026-08-08: /dashboard/account 404s (the real page is
 * /dashboard/settings, which is what the sidebar links to, and nothing in the codebase links to
 * /dashboard/account) and a signed-in student was shown a signup call to action and a "Back to
 * Litos" link out to the marketing home. That reads as having been logged out.
 *
 * A route-segment not-found renders inside that segment's layout, so this one keeps the dashboard
 * chrome: the sidebar, the mobile tab bar and every real destination stay one tap away, which is
 * the same reason SectionBoundary exists rather than letting the route boundary take the shell.
 */
export default function DashboardNotFound() {
  return (
    <div className="flex flex-col items-start gap-4 py-16">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">404</p>
      <h1 className="text-section font-[450] tracking-[-0.02em] text-ink">This page does not exist.</h1>
      <p className="max-w-prose text-sm leading-6 text-muted">
        You are still signed in. Everything in your account is in the menu.
      </p>
      <div className="mt-2 flex flex-wrap gap-3">
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Go to Home
        </Link>
        {/* Named because it is the page most often reached for under a wrong URL: /dashboard/account
            is not a route and never has been. */}
        <Link
          href="/dashboard/settings"
          className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-medium text-ink"
        >
          Account settings
        </Link>
      </div>
    </div>
  );
}
