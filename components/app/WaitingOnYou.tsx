"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/app/ui";
import { describeRemainingWork, describeWait, type HandoffFill, type WaitingApplication } from "@/lib/captcha-queue";
import { getToken, isGuestSession } from "@/lib/api";
import { armHandoffs, ensureExtensionSession } from "@/lib/extension-bridge";

/**
 * Applications stopped on a human-verification check.
 *
 * Given its own block above the summary rather than folded into "Needs you", because it is a
 * different kind of debt. Every other reason an application needs attention is a decision only the
 * applicant can make - an answer, an attestation, a missing fact. This one is a door that opens in
 * a few seconds once they are standing in front of it, and the only thing between them and it is
 * knowing which page to open. A count buried in a tracker column does not do that.
 *
 * Litos does not and will not solve these. The check exists to establish that the person applying
 * is a person, and answering it on their behalf would defeat the thing the employer is asking for.
 * What this can do is remove every other obstacle: which application, how long it has waited, what
 * will actually be filled in when they get there, and one click to the exact page.
 *
 * "what will actually be filled in when they get there" is doing real work in that sentence. The
 * earlier fill lived in a managed browser session on a server and does not survive the click, so
 * the only thing that can fill the employer's form is the extension, in this browser. That is why
 * this component talks to it: it asks whether the extension is there and signed in before making
 * any claim about the form, and it tells the extension which pages the applicant is about to open
 * so the fill starts on arrival instead of waiting to be asked a question they already answered.
 */
export function WaitingOnYou({ items }: { items: readonly WaitingApplication[] }) {
  /* Rendered from a client-side clock, set after mount. Formatting a duration during SSR produces
     markup that disagrees with the first client render the moment the two clocks differ, and React
     replaces the whole subtree. Starting from null renders the label only once there is a real
     clock to render it from. */
  const [now, setNow] = useState<number | null>(null);
  const waiting = items.length;
  useEffect(() => {
    // Guarded on the count, not just returned early below: without this every dashboard session -
    // and the overwhelming majority have nothing stalled - re-rendered this component once a minute
    // forever to produce nothing.
    if (waiting === 0) return;
    setNow(Date.now());
    // A wait that reads "3 hours" for the rest of the session is worse than no duration at all.
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [waiting]);

  /* What will actually happen when they click through, measured rather than assumed.
     Starts at "none" and only becomes "extension" once the extension has answered and holds a
     session for this account. Defaulting the other way would put the old overpromise back on the
     screen for everyone whose extension is missing, signed out, or slow to wake. */
  const [fill, setFill] = useState<HandoffFill>("none");
  useEffect(() => {
    if (waiting === 0) return;
    let live = true;
    void ensureExtensionSession({ token: getToken(), guest: isGuestSession() }).then((state) => {
      if (live) setFill(state.signedIn ? "extension" : "none");
    });
    return () => {
      live = false;
    };
  }, [waiting]);

  /* Armed when the queue renders, not when a link is clicked. The click navigates immediately, so
     arming from its handler is a race against the employer's page load; arming everything up front
     has no race to lose. Each arming is handed out once and expires on its own. */
  useEffect(() => {
    if (fill !== "extension") return;
    void armHandoffs(items.map((item) => ({ id: item.id, portalUrl: item.portalUrl })));
  }, [fill, items]);

  if (items.length === 0) return null;

  return (
    <Card aria-labelledby="waiting-on-you-heading" role="region" className="shadow-rest">
      <div className="border-b border-border px-5 py-4">
        {/* aria-live because the count changes in place as applications resolve, and a heading that
            silently goes from 3 to 2 is a change a screen reader user never learns about. */}
        <h2 id="waiting-on-you-heading" aria-live="polite" className="text-base font-semibold text-ink">
          {items.length === 1
            ? "1 application is waiting on you"
            : `${items.length} applications are waiting on you`}
        </h2>
        <p className="mt-1 text-sm text-muted">
          These companies ask you to prove you are human. That check is yours to pass, so Litos
          stopped rather than send anything.
        </p>
      </div>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0 sm:flex-1">
              <p className="truncate text-sm font-medium text-ink">
                {item.role} at {item.company}
              </p>
              <p className="mt-0.5 text-sm text-muted">
                {now === null ? "Waiting" : describeWait(item.stalledAt, now)}
                {". "}
                {describeRemainingWork(item.stage, fill)}
              </p>
            </div>
            {item.portalUrl ? (
              <a
                className="inline-flex min-h-11 shrink-0 items-center justify-center self-start rounded-full bg-brand px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:self-auto"
                href={item.portalUrl}
                target="_blank"
                /* noopener is the load-bearing half: these are third-party employer pages and an
                   opened tab can otherwise reach back through window.opener. The url itself is
                   https-checked in safePortalUrl; rel does nothing against a javascript: href. */
                rel="noopener noreferrer"
                /* Every one of these links reads "Finish this one", so without a label a screen
                   reader's link list is N identical entries with no way to tell them apart. */
                aria-label={`Finish ${item.role} at ${item.company}, opens in a new tab`}
              >
                Finish this one
              </a>
            ) : (
              /* No stored portal url, which happens on packets built before the field existed and
                 on anything created from a pasted description. Saying so is better than rendering a
                 button that goes nowhere. */
              <span className="shrink-0 self-start text-sm text-muted sm:self-auto">Open it from your applications list</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
