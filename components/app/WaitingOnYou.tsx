"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/app/ui";
import { ButtonLink } from "@/components/app/Button";
import { describeRemainingWork, describeWait, type WaitingApplication } from "@/lib/captcha-queue";

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
 * What this can do is remove every other obstacle: which application, how long it has waited, and
 * one click to the right place.
 *
 * That place is Litos's own review screen for the application, not the employer's page. Reopening
 * it there (`/dashboard/applications?application={id}`) lands on `SubmissionScreen`, which already
 * knows how to rerun the fill and put a live view of that run in front of the applicant - the same
 * mechanism a normal Send already uses, just entered from this queue instead of mid-session. So
 * this component no longer needs to know anything about the browser extension: it used to be the
 * only thing that could refill a form the applicant reached in a fresh tab, and that is no longer
 * how this queue sends anyone anywhere.
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
                {describeRemainingWork(item.stage)}
              </p>
            </div>
            {/* `id` is on every row this queue can produce - waitingApplications reads it straight
                off the packet, with no external URL involved - so unlike the old portalUrl link,
                this control never has a "nothing to click" fallback state. */}
            <div className="flex shrink-0 flex-col items-start gap-1 self-start sm:items-end sm:self-auto">
              <ButtonLink
                href={`/dashboard/applications?application=${encodeURIComponent(item.id)}`}
                size="sm"
                /* Every one of these links reads "Continue in Litos", so without a label a screen
                   reader's link list is N identical entries with no way to tell them apart. */
                aria-label={`Continue ${item.role} at ${item.company} in Litos`}
              >
                Continue in Litos
              </ButtonLink>
              {item.portalUrl ? (
                <a
                  className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
                  href={item.portalUrl}
                  target="_blank"
                  /* noopener is the load-bearing half: this is a third-party employer page and an
                     opened tab can otherwise reach back through window.opener. The url itself is
                     https-checked in safePortalUrl; rel does nothing against a javascript: href. */
                  rel="noopener noreferrer"
                  aria-label={`Open the employer's page for ${item.role} at ${item.company} directly, opens in a new tab`}
                >
                  Or open it yourself
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
