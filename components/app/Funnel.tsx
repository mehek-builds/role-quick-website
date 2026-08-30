"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchFunnel, type FunnelSummary } from "@/features/applications";
import { isQaRender } from "@/lib/qa-mode";

/* A QA render has no session, and fetchFunnel goes through api(), which answers a 401 by clearing
   the session and sending the browser to /login. This component was the last unguarded caller on
   the dashboard: it bounced every QA render of Home off the screen the harness exists to show, and
   it did it fast enough to look like the harness was simply broken. The layout documents this exact
   trap for the account footer; nobody checked Momentum for it.

   Fourteen days ending today, so the sparkline draws a real shape rather than a flat line. */
const QA_FUNNEL: FunnelSummary = {
  resumes_tailored: 22,
  applications_submitted: 5,
  fields_filled: 84,
  submitted_this_week: 5,
  too_early: false,
  days: Array.from({ length: 14 }, (_, i) => {
    const submitted = [0, 0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 3, 1, 2][i];
    return { day: `d-${13 - i}`, submitted, tailored: submitted * 2 };
  }),
};

/**
 * The student's own throughput.
 *
 * The teardown found this in every product with real retention: Simplify's users quote going from
 * 3-5 applications a day to 10-15, and that self-evident progress is why they open it again. Litos
 * had the data and showed none of it.
 *
 * EVERY NUMBER HERE IS OBSERVED. There is no interview rate and no response rate, because nothing
 * tells Litos when a company replies; Jobright, AIApply and LoopCV all headline those, and the only
 * honest versions would be self-reported. There is no "time saved" either: the field count is real,
 * and multiplying it by a made-up minutes-per-application constant would not be.
 */
/**
 * The one number a student comes here to watch, and the reason it can be zero.
 *
 * "79 resumes prepared for you" beside "0 sent since you started" is two measured facts and no
 * account of the gap between them, and on 2026-08-08 the gap was the whole story: 49 of those
 * applications had stopped on a question the applicant could answer in seconds, and nothing on
 * Home said so or led anywhere. Both figures were true and the panel was still misleading.
 *
 * `stopped` is passed in rather than fetched because Home already counts it, from the same packets
 * its Tracker tile counts, so the sentence here and the tile beside it are one number. Null, or a
 * count of zero, prints nothing: this line exists to explain a gap, and inventing one on an account
 * that simply has not started yet would be worse than silence.
 */
export type FunnelStopped = { count: number; href: string };

export function Funnel({ stopped, sent }: { stopped?: FunnelStopped | null; sent?: number | null } = {}) {
  const [state, setState] = useState<{ data: FunnelSummary | null; failed: boolean }>({
    data: null,
    failed: false,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (isQaRender()) {
      /* Deferred rather than set in the effect body, matching the shell above: a synchronous
         setState here cascades a render before the first paint. */
      queueMicrotask(() => {
        if (!cancelled) setState({ data: QA_FUNNEL, failed: false });
      });
      return () => {
        cancelled = true;
      };
    }
    fetchFunnel()
      .then((data) => !cancelled && setState({ data, failed: false }))
      .catch(() => !cancelled && setState({ data: null, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // A failed request used to render nothing, which is indistinguishable from having no history: a
  // student who saw 40 applications yesterday and blank space today could not tell a 500 from data
  // loss, and had no way to retry short of reloading.
  if (state.failed) {
    return (
      <section className="flex flex-col gap-3 p-5">
        <h2 className="text-base font-medium text-ink">Momentum</h2>
        <p className="text-small text-muted">
          Could not load your activity just now.{" "}
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-medium text-ink underline underline-offset-4">
            Try again
          </button>
        </p>
      </section>
    );
  }
  if (!state.data) {
    // Sized to the loaded column so the row does not jump when this resolves.
    return <div className="m-5 h-24 animate-pulse rounded-inner bg-surface-alt" aria-hidden="true" />;
  }

  const f = state.data;

  // Nothing has happened yet. A row of zeros is worse than nothing: it is a progress display that
  // reports no progress, on the day someone signs up.
  if (f.resumes_tailored === 0 && (sent ?? f.applications_submitted) === 0) return null;

  const peak = Math.max(1, ...f.days.map((day) => day.submitted));

  return (
    /* A column of the shared overview card, not a card of its own. The card chrome, the border and
       the surface all belong to the parent now, so Momentum, Applications and Emails read as three
       readings of one instrument rather than three separate reports. */
    <section className="flex flex-col p-5">
      {/* "Last 14 days" used to sit up here as a card-level eyebrow, and it was false for everything
          under it: buildFunnel windows only `days`, while applications_submitted, resumes_tailored
          and fields_filled are counted over the student's whole history. The card read "LAST 14 DAYS"
          over an all-time 13. The window moved down to caption the bars, the one thing it describes.
          Rescoping the figures to 14 days instead would have meant changing what /metrics/funnel
          returns to make a label true, and would have taken away the running total a student opens
          this panel to watch. The figures keep the wording they carry today; the only change here is
          where the window sits. */}
      <h2 className="text-base font-medium text-ink">Momentum</h2>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {/* "all time counter" shipped here: the name of the variable rather than the name of the
            thing, under a card headed LAST 14 DAYS, so the card argued with itself. The backend
            builds this field as submittedAt.length, every application ever sent with no window on
            it at all, so the label has to say the span out loud or the header speaks for it.

            THE FIGURE COMES FROM THE CALLER WHEN THE CALLER HAS ONE, for exactly the reason stated
            for `stopped` above: Home already counts sent from the merged canonical inventory its
            Tracker tile counts, so the two figures on this row cannot disagree. They did. On
            2026-08-29 this printed the backend's `applications_submitted` (13) six inches from a
            Sent tile reading 12, because /metrics/funnel counts every submission the server ever
            recorded while the tile counts the inventory the dashboard actually holds. One of those
            is the number every other surface on the dashboard uses, so it is the one that prints
            here. The backend figure remains the fallback for any caller that has no inventory to
            count (the QA harness), and it still feeds the bars and the other two stats, which are
            windowed measurements this page does not recompute. */}
        <Stat value={sent ?? f.applications_submitted} label="sent in total" />
        <Stat value={f.submitted_this_week} label="in the last 7 days" />
        {/* Versions, not applications: the dashboard can prewarm and later regenerate a resume for
            the same job, so this count can grow without adding another application to the tracker. */}
        <Stat value={f.resumes_tailored} label="resume versions prepared" />
      </div>

      <p className="mt-3 text-label leading-5 text-muted">
        One job can have more than one resume version, so this number will not match Applications.
      </p>

      {/* Only when the zero needs accounting for: work was prepared, none of it went out, and
          something is actually waiting. Every other combination leaves this off. */}
      {(sent ?? f.applications_submitted) === 0 && f.resumes_tailored > 0 && (stopped?.count ?? 0) > 0 && (
        <p className="mt-3 text-label leading-5 text-muted">
          None sent yet.{" "}
          <Link href={stopped!.href} className="font-medium text-brand-ink underline-offset-2 hover:underline">
            {stopped!.count === 1
              ? "1 is waiting on an answer from you"
              : `${stopped!.count} are waiting on an answer from you`}
          </Link>
          .
        </p>
      )}

      {/* days.length, not just too_early. The parse boundary treats `days` as a SECONDARY field and
          defaults it to an empty array, so a backend that measured the counters but sent no daily
          breakdown degrades to the counters alone rather than taking Home down. What must not
          happen then is this figure rendering anyway: an empty bar row under the caption "Last 14
          days" is a chart asserting fourteen days of no activity, which is the confident-zero
          reading of a fact nobody measured. No bars, no caption. */}
      {!f.too_early && f.days.length > 0 && (
        <div className="mt-4">
          {/* The caption and the bars are one figure, and the field count is deliberately OUTSIDE it.
              fields_filled is an all-time sum like the two figures above, so leaving it under the
              caption inside a shared parent would have put "LAST 14 DAYS" over an all-time number
              again, two lines down instead of four, and a caption binds harder than a card eyebrow.
              Its own wording is left exactly as it shipped: moving the caption is the whole fix.
              The gap under the caption is the caption's own mb-2 rather than a margin on the bar
              row, so the plot box below keeps the exact className the height invariant is pinned
              to. Nothing between them collapses: the figure is a block formatting context whose
              children are adjacent siblings, and the bar row's top margin is zero, so the caption's
              8px bottom margin is the whole gap. */}
          <figure>
            <figcaption className="mb-2 font-mono text-label uppercase tracking-[0.08em] text-muted">Last 14 days</figcaption>
            {/* A fixed plot box. The bars used to be drawn into whatever vertical space the stretched
                card had left over, so a 14-day history with two active days rendered as two marks
                floating in an empty field and read as a rendering fault rather than a chart. */}
            <div className="flex h-8 items-end gap-1" role="img" aria-label={dailyLabel(f)}>
              {f.days.map((day) => (
                <div key={day.day} className="flex h-full flex-1 flex-col justify-end">
                  {/* No minimum height on an empty day. A 2px floor made a day with one
                      application look identical to a day with none whenever the peak was high. */}
                  <div
                    className={day.submitted === 0 ? "w-full border-t border-border" : "w-full rounded-t-sm bg-brand/70"}
                    style={day.submitted === 0 ? undefined : { height: `${Math.max(4, (day.submitted / peak) * 32)}px` }}
                    title={`${day.day}: ${day.submitted} sent`}
                  />
                  <span className="sr-only">{day.day}</span>
                </div>
              ))}
            </div>
          </figure>
          {f.fields_filled > 0 && <p className="mt-2 text-label text-muted">{f.fields_filled} questions filled for you</p>}
        </div>
      )}
    </section>
  );
}

function dailyLabel(f: FunnelSummary): string {
  return f.days.map((day) => `${day.day}: ${day.submitted}`).join(", ");
}

/* One number scale for the whole overview. Momentum used to step up to text-section on desktop
   while the neighbouring panels stayed at text-heading, which made the same kind of figure look
   like two different kinds of fact depending on which third of the row it sat in.

   One zero rule too. Momentum survives its own all-zero check, but a single figure inside it
   still reaches zero on its own: a student who applied five times last month and none this week
   reads 0 under "in the last 7 days". Printing that at full ink while the column across the
   divider prints its zero quiet would put two rules for the same figure on one card. */
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className={`font-mono text-heading leading-none ${value === 0 ? "text-muted" : "text-ink"}`}>{value}</p>
      <p className="mt-1 line-clamp-2 text-label text-muted">{label}</p>
    </div>
  );
}
