"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/app/ui";
import { ButtonLink } from "@/components/app/Button";
import { describeRemainingWork, describeWait, type WaitingApplication } from "@/lib/captcha-queue";
import { armHandoffs } from "@/lib/extension-bridge";

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
 * That place is Litos's own review screen for the application, not the employer's page - reopening
 * it there (`/dashboard/applications?application={id}`) hands the decision of HOW to finish to
 * `SubmissionScreen`, which knows more than this list does: whether a live in-dashboard fill is
 * available, whether an ATS family still needs the extension, whether the honest answer is just "try
 * again". This component does not claim to know which of those it will be, on purpose - see
 * describeRemainingWork's own comment for why that used to be wrong.
 *
 * The one thing still worth arming is the fallback link below, since it can send the applicant to
 * the employer's page directly, bypassing SubmissionScreen entirely - the same reason armHandoffs
 * existed here before. `sendToExtension` is a silent no-op with no extension present, so arming
 * unconditionally on render costs nothing when there is nothing listening.
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

  /* Arms the fallback link, not the primary one. The primary control navigates inside Litos, where
     SubmissionScreen owns its own arming (openAttendedHandoff) for the cases that need it. The
     fallback link below skips Litos entirely and opens the employer's page directly, which is the
     one case this queue can still put in front of the extension ahead of time - the same reason this
     effect existed before this component stopped tracking extension state. Armed on render rather
     than on click for the same reason as before: arming from the click handler races the new tab's
     page load, and arming everything up front has no race to lose. */
  useEffect(() => {
    if (waiting === 0) return;
    void armHandoffs(items.map((item) => ({ id: item.id, portalUrl: item.portalUrl })));
  }, [waiting, items]);

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
              {/* intent=apply named explicitly, matching jobApplicationHref's own convention
                  (features/jobs/domain/job-rows.ts) rather than relying on a bare link defaulting to
                  the same behavior - this queue's applications are not job-rows-shaped, so that
                  helper does not fit directly, but its URL contract does. */}
              <ButtonLink
                href={`/dashboard/applications?application=${encodeURIComponent(item.id)}&intent=apply`}
                size="sm"
                /* Every one of these links reads "Continue in Litos", so without a label a screen
                   reader's link list is N identical entries with no way to tell them apart. */
                aria-label={`Continue ${item.role} at ${item.company} in Litos`}
              >
                Continue in Litos
              </ButtonLink>
              {item.portalUrl ? (
                <ButtonLink
                  href={item.portalUrl}
                  variant="quiet"
                  size="sm"
                  target="_blank"
                  /* noopener is the load-bearing half: this is a third-party employer page and an
                     opened tab can otherwise reach back through window.opener. The url itself is
                     https-checked in safePortalUrl; rel does nothing against a javascript: href. */
                  rel="noopener noreferrer"
                  aria-label={`Open the employer's page for ${item.role} at ${item.company} directly, opens in a new tab`}
                >
                  Or open it yourself
                </ButtonLink>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
