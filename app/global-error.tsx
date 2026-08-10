"use client";

import "./globals.css";

/* Last resort. This one replaces the root layout, so it is the only thing that
 * catches a throw in app/layout.tsx itself or in app/error.tsx's own render.
 *
 * Worth having even though both are close to unfailable today: layout.tsx is
 * fonts and metadata, and app/error.tsx is static markup. The argument for it is
 * not likelihood, it is that it is the only boundary with no boundary behind it.
 * Without this file, a throw in either place is once again the blank document
 * ISSUE-015 is about, and the two files most likely to acquire that bug are the
 * two nobody re-reads: the layout everything renders through, and the error
 * screen nobody sees in normal use.
 *
 * Deliberately thin. It renders its own <html> and <body>, so it cannot lean on
 * the layout, the font variables or any shared component, and every dependency
 * added here is another thing that can throw inside the handler for a throw.
 * That is also why it does not report to analytics: at this depth the recovery
 * screen rendering at all is worth more than the event.
 *
 * globals.css is imported for the colour tokens only. Type falls back to the
 * browser default because next/font cannot run in a client component and the
 * root layout that normally defines --font-hanken-grotesk is the thing that
 * just failed. A last-resort screen in the wrong typeface is a fine trade for a
 * last-resort screen that renders.
 *
 * No message, no stack, same as the other two. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col items-center justify-center bg-bg px-6 py-24 text-center text-ink">
        <h1 className="text-section font-[450] tracking-[-0.02em]">
          Litos did not load.
        </h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-muted">
          It is our problem, not yours. Try again in a moment.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-8 inline-flex min-h-11 items-center rounded-full bg-action px-7 py-3 text-sm font-medium text-action-ink transition-colors hover:bg-brand-ink"
        >
          Try again
        </button>
        {error.digest && (
          <p className="mt-10 font-mono text-[11px] text-muted">
            Reference {error.digest}
          </p>
        )}
      </body>
    </html>
  );
}
