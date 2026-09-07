"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/app/ui";
import { ButtonLink } from "@/components/app/Button";
import { describeRemainingWork, describeWait, type WaitingApplication } from "@/lib/captcha-queue";

/**
 * Applications with unresolved human-verification notices.
 *
 * The legacy notice is enough to surface an application, but it is not submission or retry
 * authority. The application screen owns current status and action eligibility. This component only
 * identifies the affected application and links to that screen.
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
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    // A wait that reads "3 hours" for the rest of the session is worse than no duration at all.
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [waiting]);

  if (items.length === 0) return null;

  return (
    <Card aria-labelledby="waiting-on-you-heading" role="region" className="shadow-rest">
      <div className="border-b border-border px-5 py-4">
        <h2 id="waiting-on-you-heading" className="text-base font-semibold text-ink">
          Human verification
        </h2>
        {/* aria-live because the count changes in place as notices resolve. */}
        <p aria-live="polite" className="mt-1 text-sm text-muted">
          {items.length === 1
            ? "This application has a human-verification notice. Open it in Litos to see its current status and available steps."
            : "These applications have human-verification notices. Open each application in Litos to see its current status and available steps."}
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
                {describeRemainingWork()}
              </p>
            </div>
            {/* `id` is on every row this queue can produce - waitingApplications reads it straight
                off the packet, with no external URL involved - so unlike the old portalUrl link,
                this control never has a "nothing to click" fallback state. */}
            <div className="flex shrink-0 self-start sm:self-auto">
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
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
