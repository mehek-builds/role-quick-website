/**
 * How long ago the run last reported a new step, so a live run and a dead one stop looking the same.
 *
 * The backend writes `progress_stage` and `progress_updated_at` together, immediately before each
 * phase of a managed run starts (opening the form, signing in, reading the questions, reading the
 * answer choices, filling a page). Nothing writes them on a timer, so the age of the stamp is an
 * honest reading: a small number means a phase started recently, and a large one means the current
 * phase has been running that long, or the run has stopped.
 */

/**
 * Past this, the panel says the run may be stuck.
 *
 * The longest phase with no stage write of its own is one prepare-path provider call, bounded at
 * 420s by the backend's MANAGED_PREPARE_FILL_DEADLINE_MS. Eight minutes sits past that bound with a
 * margin, so a healthy run that is inside its longest single step is never called stuck.
 */
export const RUN_PROGRESS_QUIET_AFTER_S = 8 * 60;

export type RunProgressFreshness = {
  /** Whole seconds since the last stage write, never negative. */
  secondsSince: number;
  /** True once the gap is past RUN_PROGRESS_QUIET_AFTER_S. */
  quiet: boolean;
};

/**
 * Null when there is no usable stamp. A client clock behind the server's is clamped to zero rather
 * than shown as a negative age.
 *
 * Not compared against the run's start: the backend stamps a fresh stage when it claims a run, so
 * an earlier run's stamp does not survive into this one, and the start the panel is given can fall
 * back to the review's updated_at, which every review write moves forward.
 */
export function runProgressFreshness(
  progressUpdatedAt: string | undefined,
  nowMs: number | null,
): RunProgressFreshness | null {
  if (!progressUpdatedAt || nowMs === null) return null;
  const stampMs = Date.parse(progressUpdatedAt);
  if (!Number.isFinite(stampMs)) return null;
  const secondsSince = Math.max(0, Math.floor((nowMs - stampMs) / 1000));
  return { secondsSince, quiet: secondsSince >= RUN_PROGRESS_QUIET_AFTER_S };
}

function formatGap(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/** "Last update just now", "Last update 12s ago", "Last update 3m 04s ago". */
export function lastUpdateLabel(freshness: RunProgressFreshness): string {
  return freshness.secondsSince < 5 ? "Last update just now" : `Last update ${formatGap(freshness.secondsSince)} ago`;
}

/** The sentence shown once the run has gone quiet. Written to be true whether it is slow or stopped. */
export function quietRunNotice(freshness: RunProgressFreshness): string {
  return `No new step for ${formatGap(freshness.secondsSince)}. A single step normally finishes within 7 minutes, so this run may have stopped.`;
}
