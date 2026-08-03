"use client";

import { useEffect, useState } from "react";
import { fetchFunnel, type FunnelSummary } from "@/features/applications";

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
      <section className="flex min-h-40 flex-col justify-between rounded-card border border-border bg-surface-alt p-4 shadow-rest lg:min-h-44 lg:p-6">
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
    // Sized to the loaded panel so the feed below does not jump when this resolves.
    return <div className="min-h-40 animate-pulse rounded-card bg-surface-alt lg:min-h-44" aria-hidden="true" />;
  }

  const f = state.data;

  // Nothing has happened yet. A row of zeros is worse than nothing: it is a progress display that
  // reports no progress, on the day someone signs up.
  if (f.resumes_tailored === 0 && f.applications_submitted === 0) return null;

  const peak = Math.max(1, ...f.days.map((day) => day.submitted));

  return (
    <section className="flex min-h-40 flex-col rounded-card border border-border bg-surface-alt p-4 shadow-rest lg:min-h-44 lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-medium text-ink">Momentum</h2>
        <span className="font-mono text-label uppercase tracking-[0.08em] text-faint">Last 14 days</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 lg:mt-8">
        <Stat value={f.applications_submitted} label="applications sent, all time" />
        <Stat value={f.submitted_this_week} label="in the last 7 days" />
        {/* "prepared for you", not "you tailored": the dashboard prewarms resumes for the day's
            top matches before the student opens any of them, so this count grows just by visiting.
            Calling it their own throughput would be the one thing this panel must not do. */}
        <Stat value={f.resumes_tailored} label="resumes prepared for you" />
      </div>

      {!f.too_early && (
        <div className="mt-auto border-t border-border pt-3">
          <div className="flex items-end gap-1" role="img" aria-label={dailyLabel(f)}>
            {f.days.map((day) => (
              <div key={day.day} className="flex flex-1 flex-col items-center gap-1">
                {/* No minimum height on an empty day. A 2px floor made a day with one
                    application look identical to a day with none whenever the peak was high. */}
                <div
                  className={day.submitted === 0 ? "w-full border-t border-border" : "w-full rounded-t-sm bg-brand/70"}
                  style={day.submitted === 0 ? undefined : { height: `${Math.max(4, (day.submitted / peak) * 24)}px` }}
                  title={`${day.day}: ${day.submitted} sent`}
                />
                {/* Every other day, ending on today. Fourteen MM-DD labels in this column ran
                    together into a grey smear, and the last one has to be today's. */}
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

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-mono text-heading leading-none text-ink lg:text-section">{value}</p>
      <p className="mt-1 line-clamp-2 text-label text-muted">{label}</p>
    </div>
  );
}
