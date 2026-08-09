"use client";

/* The welcome and the walkthrough: the two things the first screen of /start opened without.
 *
 * A student reaching this screen has come either from the homepage film or straight out of the
 * login gate, and what met them was a file picker. Nothing on the screen said what the next few
 * minutes were for, and nothing said what Litos does with a resume once it has one. The welcome
 * line is that statement. It appears once, on the first screen, and nowhere else: the say-once
 * rule in DESIGN.md is why it is not repeated at the top of every step.
 *
 * The highlights are the walkthrough, and they collapse. Anyone returning to setup, and anyone who
 * would rather learn by doing, gets one click to put them away, and the choice is remembered. A
 * tour that cannot be dismissed is the dark pattern the Guardrails exist to prevent; a tour that
 * has to be re-dismissed on every visit is the same thing with better manners.
 *
 * Copy note on the third highlight: it says "you review before anything is submitted", which is
 * the exact softening approved on 2026-07-04 and re-affirmed as constraint (a) on 2026-07-27.
 * Opt-in auto-submit ships with a 15-second cancelable countdown, so "nothing is ever sent without
 * you" would be false here, and this screen is the first place a student would believe it.
 */

import { useSyncExternalStore } from "react";

/* Matches the persisted-preference convention in lib/api.ts (litos_session_mode_v1,
   litos_has_history_v1, litos_guest_idempotency_v1) rather than inventing a third key style.
   The _v1 suffix is what those keys use to leave a migration path open. */
const SKIP_KEY = "litos_start_highlights_skipped_v1";

/** The region both disclosure buttons control, named once so the two can never point apart. */
const BODY_ID = "how-litos-works-body";

/* The skip preference, read as what it is: an external store.
 *
 * Both of the obvious alternatives have a real defect. A lazy useState initializer reads storage
 * during render, which is a hydration mismatch the moment this subtree ever server-renders. It
 * does not today, because /start shimmers until its onboarding state resolves in an effect, but
 * that is the PARENT's property and not this component's, and a component that silently depends on
 * its parent staying async breaks the day someone gives /start a server-rendered first paint. An
 * effect that setStates on mount is the other option, and it costs a frame of the wrong UI, which
 * is what react-hooks/set-state-in-effect exists to reject.
 *
 * useSyncExternalStore has neither problem: getServerSnapshot is what hydration uses, the client
 * snapshot takes over immediately after it, and subscribing means a skip in one tab settles in the
 * others rather than leaving two tabs disagreeing about a stored preference. */
const listeners = new Set<() => void>();

/* The session's answer when localStorage cannot hold one.
 *
 * Without it the Skip button is a DEAD CONTROL in any browser that throws on write (Safari and
 * Firefox with all cookies blocked, a sandboxed iframe, a full quota): `skipped` is derived only
 * from `readSkipped()`, so a swallowed write means the re-read still returns false and the panel
 * never folds. ui.tsx states the rule this would break, about a different control, in the repo's
 * own words: "A control that visibly does nothing is worse than no control."
 *
 * `null` means "storage is authoritative". Set only when a write actually fails, so the normal
 * path keeps reading real storage and cross-tab updates still win. */
let sessionSkip: boolean | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Fires for OTHER tabs only, which is exactly the half `writeSkipped` cannot cover itself.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readSkipped() {
  try {
    // The in-memory answer wins only where it exists, i.e. only after a write we could not persist.
    return sessionSkip ?? window.localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    // Private mode, or storage disabled. Showing the walkthrough is the right way to fail.
    return sessionSkip ?? false;
  }
}

/** Never skipped on the server. The walkthrough is the default, and a first paint that hid it
 *  would be wrong for every visitor whose browser has not yet said otherwise. */
const readSkippedOnServer = () => false;

function writeSkipped(next: boolean) {
  try {
    if (next) window.localStorage.setItem(SKIP_KEY, "1");
    else window.localStorage.removeItem(SKIP_KEY);
    // Persisted, so storage is authoritative again and any stale session answer must stop winning.
    sessionSkip = null;
  } catch {
    // Could not persist. Hold the answer in memory so the control still does the visible thing it
    // promises for this visit; it simply will not survive a reload.
    sessionSkip = next;
  }
  for (const listener of [...listeners]) listener();
}

/* Three, because the product is three things. Each value is one sentence and states a mechanism
   rather than a benefit: the copy floor says one line where one line works, and a mechanism is the
   thing a student cannot already guess from the word "Litos". */
const HIGHLIGHTS: { what: string; how: string }[] = [
  {
    what: "One page",
    how: "Litos rewrites the resume you upload into a single page, tailored to the job you are applying to.",
  },
  {
    what: "Your matches",
    how: "It watches the job boards and picks out the postings that fit the roles you pick in a moment.",
  },
  /* Names the dashboard, NOT the Chrome extension, and that correction matters.
   *
   * Setup never installs, links to, or mentions the extension: InstallStep is exported from
   * steps.tsx but imported by no route, and page.tsx says outright that the extension "is a
   * secondary path for jobs found elsewhere, so it is not an onboarding gate". Promising here that
   * an extension fills the forms would sell a student a mechanism this flow never hands them, and
   * the last screen of the same flow already names the real one ("Open a match on your dashboard
   * and Litos builds the application for you to review"). Two screens, one story. */
  {
    what: "The forms",
    how: "Open a match and Litos fills the application in from what it already knows. You review before anything is submitted.",
  },
];

/** One sentence saying where the student is and what the product does. First screen only. */
export function WelcomeNote() {
  return (
    <p className="text-[15px] leading-7 text-muted">
      This is setup. Litos reads your resume, finds the jobs that match it, and fills in the
      applications for you.
    </p>
  );
}

/** The walkthrough. Same furniture as the refusal list, because it is the same kind of object: a
 *  short table of claims set like terms rather than sold like features. */
export function Highlights() {
  const skipped = useSyncExternalStore(subscribe, readSkipped, readSkippedOnServer);

  /* Both states are the SAME disclosure, so both carry aria-expanded and point at the same
     controlled region. Without that a screen reader hears two unrelated buttons and gets no signal
     that anything appeared or disappeared, which is the one thing a collapse has to announce. */
  if (skipped) {
    return (
      <button
        type="button"
        aria-expanded={false}
        aria-controls={BODY_ID}
        onClick={() => writeSkipped(false)}
        className="min-h-11 px-1 text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
      >
        How Litos works
      </button>
    );
  }

  return (
    <section aria-labelledby="how-litos-works" className="overflow-hidden rounded-inner border border-border">
      <div className="flex items-center justify-between gap-4 border-b border-border bg-surface-alt py-1.5 pl-4 pr-1.5">
        <h2
          id="how-litos-works"
          className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted"
        >
          How Litos works
        </h2>
        {/* The skip route. Not the shared SkipLink: that one advances a step, and this one only
            folds a panel away, so giving them the same word in the same flow would make one of the
            two lie about what it does. */}
        <button
          type="button"
          aria-expanded={true}
          aria-controls={BODY_ID}
          onClick={() => writeSkipped(true)}
          title="Hide this. You can open it again from this screen."
          className="min-h-11 px-2.5 text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          Skip
        </button>
      </div>
      <div id={BODY_ID}>
        {HIGHLIGHTS.map((h) => (
          <div
            key={h.what}
            className="grid grid-cols-1 gap-1 border-t border-border px-4 py-3 text-[13px] first:border-t-0 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4"
          >
            <span className="text-ink">{h.what}</span>
            <span className="leading-6 text-muted">{h.how}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
