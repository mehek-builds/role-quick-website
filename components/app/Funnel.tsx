"use client";

import { useEffect, useState } from "react";
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
export function Funnel() {
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
        <p className="text-small text-faint">
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
  if (f.resumes_tailored === 0 && f.applications_submitted === 0) return null;

  const peak = Math.max(1, ...f.days.map((day) => day.submitted));

  return (
    /* A column of the shared overview card, not a card of its own. The card chrome, the border and
       the surface all belong to the parent now, so Momentum, Applications and Emails read as three
       readings of one instrument rather than three separate reports. */
    <section className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-medium text-ink">Momentum</h2>
        <span className="font-mono text-label uppercase tracking-[0.08em] text-faint">Last 14 days</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat value={f.applications_submitted} label="all time counter" />
        <Stat value={f.submitted_this_week} label="in the last 7 days" />
        {/* "prepared for you", not "you tailored": the dashboard prewarms resumes for the day's
            top matches before the student opens any of them, so this count grows just by visiting.
            Calling it their own throughput would be the one thing this panel must not do. */}
        <Stat value={f.resumes_tailored} label="resumes prepared for you" />
      </div>

      {!f.too_early && (
        <div className="mt-4">
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
          {f.fields_filled > 0 && <p className="mt-2 text-label text-faint">{f.fields_filled} questions filled for you</p>}
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
