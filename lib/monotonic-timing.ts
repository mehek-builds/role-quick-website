/**
 * Elapsed-time measurements must use the browser's monotonic clock.
 *
 * Date.now() is calendar time and can jump when the device synchronizes its clock. performance.now()
 * is monotonic within the page lifetime, so it is the right source for active-page durations.
 */
function monotonicNow(): number {
  return performance.now();
}

export type ElapsedMeasurement = {
  monotonicStartedAtMs: number;
  wallStartedAtMs: number;
};

export type ElapsedMeasurementEnd = {
  monotonicEndedAtMs: number;
  wallEndedAtMs: number;
};

const CLOCK_DIVERGENCE_TOLERANCE_MS = 1_000;

export function startElapsedMeasurement(): ElapsedMeasurement {
  return { monotonicStartedAtMs: monotonicNow(), wallStartedAtMs: Date.now() };
}

/**
 * Return a receipt-safe duration, or null when the browser clocks disagree.
 *
 * A calendar adjustment can inflate wall time, while browser suspension can pause the monotonic
 * clock on some platforms. In either case there is no honest client-side duration to print. One
 * second of tolerance absorbs sampling and scheduling jitter without hiding a meaningful jump.
 */
export function reliableElapsedSecondsSince(
  started: ElapsedMeasurement,
  ended: ElapsedMeasurementEnd = { monotonicEndedAtMs: monotonicNow(), wallEndedAtMs: Date.now() },
): number | null {
  const monotonicElapsedMs = Math.max(0, ended.monotonicEndedAtMs - started.monotonicStartedAtMs);
  const wallElapsedMs = Math.max(0, ended.wallEndedAtMs - started.wallStartedAtMs);
  if (Math.abs(monotonicElapsedMs - wallElapsedMs) > CLOCK_DIVERGENCE_TOLERANCE_MS) return null;
  return monotonicElapsedMs / 1_000;
}

export function elapsedClockStamp(
  started: ElapsedMeasurement | null,
  ended?: ElapsedMeasurementEnd,
): string {
  if (!started) return "--:--";
  const elapsed = reliableElapsedSecondsSince(started, ended);
  if (elapsed === null) return "--:--";
  const wholeSeconds = Math.floor(elapsed);
  return `${String(Math.floor(wholeSeconds / 60)).padStart(2, "0")}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

export async function measureElapsed<T>(operation: () => Promise<T>): Promise<{ value: T; seconds: number | null }> {
  const started = startElapsedMeasurement();
  const value = await operation();
  return { value, seconds: reliableElapsedSecondsSince(started) };
}

export function resumeReadyTiming(seconds: number | null | undefined): { time: string; label: string } {
  return typeof seconds === "number"
    ? { time: `${seconds.toFixed(1)}s`, label: "Ready in" }
    : { time: "", label: seconds === null ? "Ready" : "Ready in" };
}
