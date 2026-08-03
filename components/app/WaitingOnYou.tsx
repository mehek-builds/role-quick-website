"use client";

import { useEffect, useState } from "react";
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
 * What this can do is remove every other obstacle: which application, how long it has waited, what
 * is already filled in, and one click to the exact page.
 */
export function WaitingOnYou({ items }: { items: readonly WaitingApplication[] }) {
  /* Rendered from a client-side clock, set after mount. Formatting a duration during SSR produces
     markup that disagrees with the first client render the moment the two clocks differ, and React
     replaces the whole subtree. Starting from null renders the label only once there is a real
     clock to render it from. */
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    // A wait that reads "3 hours" for the rest of the session is worse than no duration at all.
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="waiting-on-you-heading" className="rounded-card border border-border bg-surface shadow-rest">
      <div className="border-b border-border px-5 py-4">
        <h2 id="waiting-on-you-heading" className="text-base font-semibold text-ink">
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
            {item.portalUrl ? (
              <a
                className="inline-flex min-h-11 shrink-0 items-center justify-center self-start rounded-full bg-brand px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:self-auto"
                href={item.portalUrl}
                target="_blank"
                /* noopener is the load-bearing half: these are third-party employer pages and an
                   opened tab can otherwise reach back through window.opener. */
                rel="noopener noreferrer"
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
    </section>
  );
}
