"use client";

import { Component, Fragment, type ReactNode } from "react";
import { track } from "@/lib/analytics";

/**
 * An error boundary the size of ONE BAND, not one route.
 *
 * WHY GRANULARITY IS THE BUG
 * ==========================
 * app/dashboard/error.tsx already exists and already catches these throws. It is not enough, and
 * the measurement that proves it is the Home Overview band: Momentum, Tracker and Emails are three
 * columns of a single grid, so a throw inside Momentum unmounts the grid, and
 * section[aria-labelledby="applications-summary"] never appears. The student loses the count of
 * applications waiting on them because a DIFFERENT panel's sparkline had no data. The route
 * boundary then replaces the entire page, so the job feed underneath goes too. One malformed
 * response, three unrelated features dark.
 *
 * A route boundary is the right floor and the wrong ceiling. This is the ceiling: a failing panel
 * loses its own column and nothing else.
 *
 * WHAT IT RENDERS, AND WHY IT IS NOT A BLANK BOX
 * ==============================================
 * Catching and rendering nothing would contain the crash and introduce a quieter defect in its
 * place. An empty column under a heading asserts "there is nothing here", and this audit filed
 * ISSUE-014 on exactly that class of claim: never print a figure, or the absence of one, that was
 * not measured. A student with forty applications would read a blank Momentum as "no activity".
 *
 * So the fallback keeps the band's own heading, says plainly that THIS panel could not be loaded
 * while the rest of the page is fine, and offers a retry. It states no quantity of any kind. It is
 * deliberately the same sentence shape the panels use for a failed fetch, so a student cannot tell
 * a render crash from a network failure, and does not need to.
 *
 * WHAT IT DOES NOT DO
 * ===================
 * It does not swallow. Every catch fires `render_error` with the band's name, the same event the
 * route boundary sends, so a backend outage that trips ten boundaries is ten events rather than a
 * page that merely looks fine, and it re-throws nothing only because React has already unmounted
 * the subtree. It also logs to the console in non-production so the throw is visible while
 * developing rather than absorbed.
 *
 * Retry is a remount, not a reload: the counter drives a `key` on the subtree, so the child's
 * effects run again from scratch. Resetting `failed` alone would re-render the same crashed tree
 * with the same state and fail again on the same line.
 */
type Props = {
  /** Stable, lowercase, no personal data. Goes out on the analytics event as `surface`. */
  band: string;
  /** The heading the band renders when it is healthy, repeated so the page keeps its shape. */
  title: string;
  children: ReactNode;
};

type State = { failed: boolean; attempt: number };

export class SectionBoundary extends Component<Props, State> {
  state: State = { failed: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: Error & { digest?: string }) {
    /* Same two fields as app/dashboard/error.tsx: which surface, and Next's message-free digest.
       `band:` prefixes the surface so these are separable from route-level failures in the funnel
       without needing a second event name. */
    track("render_error", { surface: `band:${this.props.band}`, digest: error.digest ?? "none" });
    if (process.env.NODE_ENV !== "production") {
      console.error(`[rq:section-boundary:${this.props.band}]`, error);
    }
  }

  render() {
    if (!this.state.failed) {
      /* A keyed Fragment, NOT a keyed wrapper element. The Overview band is a CSS grid whose
         columns are these children, styled with `divide-x` (a `> * + *` rule) and hidden with
         `empty:hidden` when every column opts out. Any real element here becomes the grid item
         instead of the panel, breaks both of those, and draws a bordered card around nothing on a
         brand new account, where Momentum renders null by design. */
      return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
    }
    return (
      /* The same padded column the healthy panels render, so a degraded band keeps its share of the
         grid instead of collapsing and letting its neighbours widen. */
      <section className="flex flex-col gap-3 p-5">
        <h2 className="text-base font-medium text-ink">{this.props.title}</h2>
        {/* No number, no zero, no "none yet". Only what is known: this panel did not load, and the
            rest of the page did. */}
        <p className="text-small text-muted">
          Could not load this just now. Everything else on this page is up to date.{" "}
          <button
            type="button"
            onClick={() => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }))}
            className="font-medium text-ink underline underline-offset-4"
          >
            Try again
          </button>
        </p>
      </section>
    );
  }
}
