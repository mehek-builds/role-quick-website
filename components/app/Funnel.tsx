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
      <p className="text-[13px] text-faint">
        Could not load your activity just now.{" "}
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="underline">
          Try again
        </button>
      </p>
    );
  }
  if (!state.data) {
    // Sized to the loaded panel so the feed below does not jump when this resolves.
    return <div className="h-[150px] animate-pulse rounded-[20px] bg-surface-alt" aria-hidden="true" />;
  }

  const f = state.data;

  // Nothing has happened yet. A row of zeros is worse than nothing: it is a progress display that
  // reports no progress, on the day someone signs up.
  if (f.resumes_tailored === 0 && f.applications_submitted === 0) return null;

  const peak = Math.max(1, ...f.weeks.map((w) => w.submitted));

  return (
    <section className="rounded-[20px] border border-border bg-surface-alt px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
        <Stat value={f.applications_submitted} label="applications sent, all time" />
        <Stat value={f.submitted_this_week} label="in the last 7 days" />
        {/* "prepared for you", not "you tailored": the dashboard prewarms resumes for the day's
            top matches before the student opens any of them, so this count grows just by visiting.
            Calling it their own throughput would be the one thing this panel must not do. */}
        <Stat value={f.resumes_tailored} label="resumes prepared for you" />
        {f.fields_filled > 0 && <Stat value={f.fields_filled} label="questions Litos filled in" />}
      </div>

      {!f.too_early && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex items-end gap-1.5" role="img" aria-label={weeklyLabel(f)}>
            {f.weeks.map((w) => (
              <div key={w.week_start} className="flex flex-1 flex-col items-center gap-1">
                {/* No minimum height on an empty week. A 2px floor made a week with one
                    application look identical to a week with none whenever the peak was high. */}
                <div
                  className={w.submitted === 0 ? "w-full border-t border-border" : "w-full rounded-t-sm bg-brand/70"}
                  style={w.submitted === 0 ? undefined : { height: `${Math.max(4, (w.submitted / peak) * 40)}px` }}
                  title={`${w.submitted} sent`}
                />
                <span className="font-mono text-[9px] text-faint">{w.week_start.slice(5)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-faint">Applications you sent each week.</p>
        </div>
      )}
    </section>
  );
}

function weeklyLabel(f: FunnelSummary): string {
  return f.weeks.map((w) => `week of ${w.week_start}: ${w.submitted}`).join(", ");
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-mono text-[22px] leading-none text-ink">{value}</p>
      <p className="mt-1 text-[11px] text-muted">{label}</p>
    </div>
  );
}
