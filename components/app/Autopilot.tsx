"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getOnboardingState, setAutomationSettings } from "@/lib/api";
import { CompanyLogo } from "@/components/app/CompanyLogo";

/**
 * Sending without being asked, on the page where it happens.
 *
 * THE SWITCH IS STILL THE ONE IN ACCOUNT. Both read and write the same server field
 * (`automatic_submission_enabled`) through the same endpoint, and the server keeps the same lock:
 * it refuses to turn it on until the student has personally approved `required` real submissions.
 * This copy exists here as well because Applications is where the consequence is visible, and a
 * consent switch two screens from its effect is a switch nobody connects to what they are seeing.
 *
 * THE COUNTDOWN IS THE CANCEL WINDOW, NOT A PROGRESS BAR. Nothing is happening during those
 * seconds. They exist so that "without asking" still has a moment in it where the student can say
 * no, which is the difference between an automation and a thing that happens to you. Cancelling
 * holds that application; it does not turn the setting off.
 */

const HOLD_SECONDS = 15;

export type ConsentEligibility = {
  eligible: boolean;
  reviewed_submits: number;
  required: number;
  remaining: number;
};

export function useAutopilot() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [eligibility, setEligibility] = useState<ConsentEligibility | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getOnboardingState()
      .then((state) => {
        if (cancelled) return;
        setEnabled(state.automatic_submission_enabled);
        setEligibility(state.standing_consent_eligibility ?? null);
      })
      // Unknown, not off. Rendering a confident "off" for a setting we failed to read would tell a
      // student their autopilot had been switched off when it may well be running.
      .catch(() => !cancelled && setEnabled(null));
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(
    async (next: boolean) => {
      const previous = enabled;
      setEnabled(next);
      setSaving(true);
      setError(null);
      try {
        const result = await setAutomationSettings({ automatic_submission_enabled: next });
        setEnabled(result.automatic_submission_enabled ?? next);
      } catch (reason) {
        setEnabled(previous ?? false);
        setError(reason instanceof Error ? reason.message : "Could not save that change.");
      } finally {
        setSaving(false);
      }
    },
    [enabled],
  );

  return { enabled, eligibility, saving, error, toggle };
}

export function AutopilotToggle({
  enabled,
  eligibility,
  saving,
  onToggle,
}: {
  enabled: boolean | null;
  eligibility: ConsentEligibility | null;
  saving: boolean;
  onToggle: (next: boolean) => void;
}) {
  const locked = !enabled && eligibility?.eligible === false;
  const id = "autopilot-switch";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2.5">
        <label htmlFor={id} className={`text-sm ${enabled ? "font-medium text-brand-ink" : "text-muted"}`}>
          Send without asking
        </label>
        {/* A real checkbox under a drawn switch: the frames show a switch, and a student's
            keyboard, screen reader and browser autofill all still see the input. */}
        <span className="relative inline-flex">
          <input
            id={id}
            type="checkbox"
            role="switch"
            checked={Boolean(enabled)}
            // Never disabled while it is ON: a safety gate the student cannot re-arm is not one.
            disabled={saving || locked}
            onChange={(event) => onToggle(event.target.checked)}
            className="peer h-6 w-10 cursor-pointer appearance-none rounded-full bg-surface-alt transition-colors checked:bg-brand disabled:cursor-not-allowed disabled:opacity-40"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4"
          />
        </span>
      </div>
      {locked && (
        <p className="max-w-[19rem] text-right text-[11px] leading-4 text-warn">
          Available after you have approved {eligibility?.required} applications yourself.{" "}
          {eligibility?.remaining} to go.
        </p>
      )}
    </div>
  );
}

/** The banner that only ever shows while it is actually on. */
export function AutopilotStrip() {
  return (
    <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-brand-ink">
      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
      Sending for you · cancel any time
    </span>
  );
}

/** What was actually sent since midnight. Independent of the switch: the day's count is the one
 *  number worth keeping on screen whether or not anything is sending itself right now. */
export function AppliedToday({ count }: { count: number | null }) {
  if (count === null) return null;
  return (
    <span className="font-mono text-[11px] text-faint">
      <span className="text-ink">{count}</span> applied today
    </span>
  );
}

export type NextMatch = {
  id: string;
  company: string;
  role: string;
  score?: number | null;
};

/**
 * The one application that goes next.
 *
 * Queued when the student is still approving each send themselves; a counting-down cancel window
 * when they are not. One card, never a queue of them: a list of things about to happen without
 * you is a list you cannot read fast enough to act on.
 */
export function NextMatchCard({
  match,
  autopilot,
  appliedToday,
  onSend,
  onOpen,
}: {
  match: NextMatch | null;
  autopilot: boolean;
  appliedToday: number | null;
  onSend: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  /* The tick carries the id it belongs to, so a new match starting its window can never inherit
     the seconds left on the last one. Keyed state rather than a reset-on-change effect: resetting
     state synchronously inside an effect is the cascade this rule exists to stop. */
  const [tick, setTick] = useState<{ id: string; left: number } | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const fired = useRef<string | null>(null);

  const counting = Boolean(match) && autopilot && held !== match?.id;
  const remaining = counting && match ? (tick?.id === match.id ? tick.left : HOLD_SECONDS) : null;

  useEffect(() => {
    if (!counting || !match) return;
    const id = match.id;
    const timer = window.setInterval(() => {
      setTick((current) =>
        current && current.id === id ? { id, left: Math.max(0, current.left - 1) } : { id, left: HOLD_SECONDS - 1 },
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [counting, match?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (remaining !== 0 || !match || fired.current === match.id) return;
    fired.current = match.id;
    onSend(match.id);
  }, [remaining, match, onSend]);

  /* One header row over whatever is below it, so the day's count keeps its place whether there is
     a match waiting, a countdown running, or nothing found yet. The left label is the only part
     that swaps: what this section IS changes when the switch is on. */
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
      {autopilot ? (
        <AutopilotStrip />
      ) : (
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">Next best match</p>
      )}
      <AppliedToday count={appliedToday} />
    </div>
  );

  if (!match) {
    return (
      <div>
        {header}
        <div className="flex items-center gap-3 rounded-card border border-border bg-surface px-5 py-4">
          <span aria-hidden="true" className="h-4 w-4 animate-pulse rounded-full bg-surface-alt" />
          <p className="text-sm text-muted">Looking for your next match...</p>
        </div>
      </div>
    );
  }

  const paused = held === match.id;

  return (
    <div>
      {header}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-surface px-5 py-4">
        <button type="button" onClick={() => onOpen(match.id)} className="flex min-w-0 items-center gap-3 text-left">
          {/* No careers URL on a packet, so this falls back to the initial by design rather
              than painting some other company's icon on the row. */}
          <CompanyLogo company={match.company} careerUrl={null} />
          <span className="min-w-0">
            <span className="flex flex-wrap items-baseline gap-2">
              <span className="truncate text-sm font-medium text-ink">{match.role}</span>
              {typeof match.score === "number" && (
                <span className="font-mono text-[11px] text-muted">{Math.round(match.score)}% match</span>
              )}
            </span>
            <span className="block truncate text-xs text-muted">{match.company}</span>
          </span>
        </button>

        <div className="flex items-center gap-3">
          {counting && remaining !== null && remaining > 0 ? (
            <>
              <button
                type="button"
                onClick={() => setHeld(match.id)}
                className="text-xs text-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
              >
                Cancel
              </button>
              <span className="rounded-full bg-brand-soft px-3.5 py-1.5 font-mono text-[11px] font-medium text-brand-ink">
                Sending {remaining}s
              </span>
            </>
          ) : counting ? (
            /* The window has closed and the request is out. No number and no Cancel: counting on
               past zero printed "Sending 0s" forever whenever the submit did not come back, which
               is a stuck pill insisting a send is one second away. And there is nothing left to
               cancel here — the ask has already left. */
            <span className="rounded-full bg-brand-soft px-3.5 py-1.5 font-mono text-[11px] font-medium text-brand-ink">
              Sending
            </span>
          ) : (
            <span className="rounded-full bg-surface-alt px-3.5 py-1.5 font-mono text-[11px] text-muted">
              {paused ? "Held" : "Queued"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
