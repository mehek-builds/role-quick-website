"use client";

import { useEffect } from "react";
import { Header } from "@/components/Header";
import { track } from "@/lib/analytics";

/* The marketing site's error boundary.
 *
 * Until 2026-08-03 the App Router had none anywhere: `find app -name error.tsx`
 * returned nothing, and the only recovery surface in the whole product was
 * app/not-found.tsx. In the App Router that is not a missing nicety, it is a
 * blank white document. Any throw during render, from a marketing page or from
 * the film's own client work, unmounted the tree and left nothing behind: no
 * message, no way back, and the visitor's only remaining control is the Back
 * button. Every acquisition dollar that lands on that page is spent.
 *
 * What is deliberately NOT on this screen:
 *
 * - error.message and error.stack. A student cannot act on "Cannot read
 *   properties of undefined", and framework internals on a public page are an
 *   invitation to go looking. lib/user-facing-error.ts exists for exactly this
 *   class of leak on the API side; here the answer is simpler, which is that the
 *   error text never reaches the markup at all.
 * - A reload. reset() re-renders the boundary's subtree, which is what fixes a
 *   transient throw without throwing away the scroll position or a form.
 *
 * `digest` is shown because it is the opposite of a stack trace: a hash Next
 * generates on the server with the message stripped out. It is the one string a
 * student can quote to /contact that makes the report findable. */
export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    track("render_error", { surface: "marketing", digest: error.digest ?? "none" });
  }, [error.digest]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          Something broke
        </p>
        <h1 className="mt-4 text-section font-[450] tracking-[-0.02em] text-ink">
          This page did not load.
        </h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-muted">
          It is our problem, not yours. Try again, and if it keeps happening the
          rest of the site still works.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center rounded-full bg-brand px-7 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Try again
          </button>
          {/* A plain anchor, not next/link, on purpose: this is the escape
              hatch for a client tree that just threw, so it wants a fresh
              document rather than a client transition out of a broken one. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="inline-flex min-h-11 items-center rounded-full px-7 py-3 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            Back to Litos
          </a>
        </div>
        {error.digest && (
          <p className="mt-10 font-mono text-[11px] text-faint">
            Reference {error.digest}
          </p>
        )}
      </main>
    </div>
  );
}
