"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import type { ResumeSpec, ResumeEntry, ApplicationProfile, ParsedProfile } from "@/lib/api";
import {
  buildBaseResume,
  getBaseResume,
  putBaseResume,
  type AtsVerdict,
  type BuildFrame,
  type BuildStage,
  type MetricGap,
} from "@/lib/base-resume";
import { track } from "@/lib/analytics";
import { ResumePaper, type ContactHeader } from "./ResumePaper";
import { SourceResume } from "./SourceResume";
import { LaterLink, PrimaryButton, SkipLink, StartShell } from "./ui";
import { ErrorNote, PendingLabel } from "@/components/app/ui";
import { humanizeBuildNote } from "@/lib/buildNotes";

/* ─────────────────────────────────────────────────────────────────────────────
 * The base resume screen. Paper on the left, the build on the right.
 *
 * This is the payoff screen for the upload. The student has just handed over a document they spent
 * hours on, and every other product answers that with a spinner and a "profile created!" toast.
 * Here they watch their own resume get rebuilt into the one-page ATS format, line by line, and the
 * thing being built is the actual artifact the product will use - not an illustration of one.
 *
 * WHY THE MOTION IS ALLOWED TO BE THE POINT HERE, given DESIGN.md bans attention loops:
 * it is not a loop. It runs once, it is driven by real server events rather than a timer, and it
 * ends. The receipt on the homepage is the only PERPETUAL motion in the product and that is still
 * true. This is closer to the receipt's other half: speed and work shown as fact.
 *
 * THREE THINGS IT DELIBERATELY DOES NOT DO (Guardrails, DESIGN.md):
 *   - no percentage and no progress bar. The entry count is not known until the model has chosen
 *     them, so any percentage would be a guess dressed as a measurement.
 *   - no confetti, no celebration on completion. The resume appearing IS the completion.
 *   - no color on the paper. Resumes in this product are black and white, without exception.
 * ───────────────────────────────────────────────────────────────────────────── */

/* The stage line, in the student's words rather than the pipeline's.
 *
 * Each is a claim about work that really happened - `reading` is emitted after the bank read
 * returns, `writing` on the first completed entry, `fitting` after the model closes the JSON and
 * the deterministic policy pass runs. Nothing here is on a timer. */
const STAGE_COPY: Record<BuildStage, { label: string; orb: "searching" | "solving" | "composing" | "shaping" }> = {
  reading: { label: "Reading what you uploaded", orb: "searching" },
  selecting: { label: "Choosing what earns a place", orb: "solving" },
  writing: { label: "Writing it so a robot can read it", orb: "composing" },
  polishing: { label: "Sharpening how each line opens", orb: "composing" },
  fitting: { label: "Fitting it to one page", orb: "shaping" },
  checking: { label: "Checking a robot can read every word", orb: "shaping" },
  done: { label: "Done", orb: "shaping" },
  failed: { label: "Stopped", orb: "shaping" },
};

const STAGE_ORDER: BuildStage[] = ["reading", "selecting", "writing", "polishing", "fitting", "checking"];

/* Sheet width caps, which set the sheet HEIGHT: the page is 612/792, so a width of N svh renders
 * about 1.29N svh tall. Capping width rather than height keeps the ratio honest on narrow screens,
 * where `min(100%, ...)` has to hand control back to the column.
 *
 * The two phases get different budgets because they are competing for different amounts of room.
 * Comparing, two sheets sit under a two-line heading and above a button row, so each gets 44svh
 * (about 57svh tall) and both stay whole on screen - which matters, because a comparison you have
 * to scroll to complete is not a comparison. Alone in the detail view the sheet can take 62svh. */
const SHEET_CAP = {
  compare: "max-w-[min(100%,44svh)]",
  detail: "max-w-[min(100%,62svh)]",
} as const;

type LogRow = { t: string; text: string };

export function BaseResumeStep({
  parsed,
  profile,
  email,
  sourcePages,
  sourceUrl,
  onDone,
  onLater,
  /* localhost QA (?qa=1&step=base): replay a canned build instead of calling the API, so this
     screen keeps the promise the rest of the flow makes - every step openable and reviewable
     without a live account. Without it this one step would bounce a QA session to /login on the
     first fetch, which is precisely when the animation most needs looking at. */
  demo = false,
}: {
  parsed: ParsedProfile | null;
  profile: ApplicationProfile | null;
  email: string | null;
  sourcePages: number;
  sourceUrl: string | null;
  onDone: () => void;
  onLater: () => void;
  demo?: boolean;
}) {
  const [spec, setSpec] = useState<Partial<ResumeSpec>>({});
  /* Two phases, one screen. `compare` puts the upload beside the rebuild so the difference is an
     observation rather than a claim; `detail` is what they get after choosing. Local state, not a
     server step: choosing is not a fact worth storing, and a refresh landing back on the
     comparison is the right behaviour anyway. */
  const [phase, setPhase] = useState<"compare" | "detail">("compare");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);
  const flipFrom = useRef<DOMRect | null>(null);
  const [stage, setStage] = useState<BuildStage | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [ats, setAts] = useState<AtsVerdict | null>(null);
  const [metricGaps, setMetricGaps] = useState<MetricGap[]>([]);
  const [metricAnswers, setMetricAnswers] = useState<Record<number, string>>({});
  const [metricsDone, setMetricsDone] = useState(false);
  const [savingMetrics, setSavingMetrics] = useState(false);
  // Answers the student typed that no longer matched a bullet, so the panel can say so.
  const [metricsMissed, setMetricsMissed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const started = useRef(false);
  const startedAt = useRef<number>(0);

  const stamp = useCallback(() => {
    const elapsed = Math.max(0, Date.now() - startedAt.current);
    const s = Math.floor(elapsed / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }, []);

  const note = useCallback(
    (text: string) => setLog((rows) => [...rows, { t: stamp(), text }]),
    [stamp],
  );

  const onFrame = useCallback(
    (frame: BuildFrame) => {
      switch (frame.event) {
        case "stage":
          setStage(frame.stage);
          if (frame.stage !== "done" && frame.stage !== "failed") {
            note(STAGE_COPY[frame.stage].label);
          }
          break;
        case "restart":
          // A retry is rewriting weak openers. Clear the painted entries so a shorter second pass
          // cannot leave stale ones behind - the client paints positionally.
          setSpec((s) => ({ ...s, experience: [] }));
          break;
        case "source":
          note(
            `${frame.bank_entries} ${frame.bank_entries === 1 ? "entry" : "entries"} on file` +
              (frame.declared_skills > 0 ? `, ${frame.declared_skills} skills` : ""),
          );
          break;
        case "piece":
          if (frame.type === "education") {
            setSpec((s) => ({ ...s, education_position: frame.education_position, ...educationFrom(parsed) }));
            note(
              frame.education_position === "top"
                ? "Education to the top, you are still enrolled"
                : "Education below experience, you have graduated",
            );
          } else if (frame.type === "entry") {
            // Positional write, not a push: entries can only arrive in order, and indexing by the
            // server's own index means a duplicate frame overwrites rather than doubles.
            setSpec((s) => {
              const experience = [...(s.experience ?? [])];
              experience[frame.index] = frame.entry;
              return { ...s, experience };
            });
            note(`${frame.entry.org}, ${frame.entry.bullets.length} bullets`);
          } else {
            setSpec((s) => ({ ...s, skills: frame.skills }));
            note(`${frame.skills.length} skills selected`);
          }
          break;
        case "ats":
          setAts(frame);
          note(
            frame.passed
              ? `A robot can read every word of this, and it fits one page`
              : `Did not pass the ATS check: ${frame.issues.join("; ")}`,
          );
          break;
        case "done":
          setSpec(frame.spec);
          setWarnings(frame.warnings);
          setMetricGaps(frame.metrics ?? []);
          setFinished(true);
          setStage("done");
          note("One page, ready");
          break;
        case "error":
          setError(frame.message);
          setStage("failed");
          break;
      }
    },
    [note, parsed],
  );

  const run = useCallback(() => {
    started.current = true;
    startedAt.current = Date.now();
    setError(null);
    setLog([]);
    setSpec({});
    setFinished(false);
    /* A rebuild produces a different set of bullets, and the metric answers are keyed by POSITION in
     * the gap list. Carrying them over would attach a number the student wrote about one job to
     * whatever bullet happens to land at that index next time, and a carried-over `metricsDone`
     * would suppress the second build's ask entirely. Reachable from the Try again button, which
     * appears on any save error after a successful build. */
    setAts(null);
    setMetricGaps([]);
    setMetricAnswers({});
    setMetricsDone(false);
    setMetricsMissed(0);
    setWarnings([]);
    if (demo) {
      replayDemo(onFrame);
      return;
    }
    void buildBaseResume(onFrame).catch((e) => {
      setError(e instanceof Error ? e.message : "Could not build your resume.");
      setStage("failed");
    });
  }, [onFrame, demo]);

  // Build on arrival, but only if there is not already one stored: a student who lands here again
  // (a refresh mid-flow, a back button) should see the resume they already have, not burn a second
  // model call rebuilding it into something subtly different.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (demo) {
      startedAt.current = Date.now();
      replayDemo(onFrame);
      return;
    }
    let cancelled = false;
    void getBaseResume()
      .then((stored) => {
        if (cancelled) return;
        if (stored) {
          setSpec(stored.spec);
          setFinished(true);
          setStage("done");
        } else {
          run();
        }
      })
      .catch(() => {
        if (!cancelled) run();
      });
    return () => {
      cancelled = true;
    };
  }, [run, onFrame, demo]);

  /* Choosing the new resume. The rect is captured BEFORE the state change, because after it the
     old position no longer exists anywhere to measure. */
  const choose = useCallback(() => {
    flipFrom.current = paperRef.current?.getBoundingClientRect() ?? null;
    setPhase("detail");
    track("onboarding_base_chosen", {});
  }, []);

  /* FLIP: the sheet moves from the right column to the left one.
   *
   * Animating layout properties directly would relayout the page every frame and drag the fit
   * solver along with it. Instead the element lands in its final position immediately, gets an
   * inverse transform that puts it visually back where it started, and then transitions that
   * transform away - so the browser animates a composited transform over a settled layout.
   *
   * useLayoutEffect is correct HERE, unlike in the fit solver: this reads a box that already has
   * a resolved size, and it must apply the inverse transform before paint or the sheet visibly
   * flashes at its destination for one frame first. */
  useLayoutEffect(() => {
    const el = paperRef.current;
    const from = flipFrom.current;
    flipFrom.current = null;
    if (!el || !from) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const to = el.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const scale = to.width > 0 ? from.width / to.width : 1;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(scale - 1) < 0.01) return;

    const clear = () => {
      el.style.transition = "";
      el.style.transform = "";
      el.style.transformOrigin = "";
      el.style.willChange = "";
    };

    /* Invert, flush, play - with the flush done by reading layout rather than by waiting for
     * requestAnimationFrame.
     *
     * The rAF version of this is the textbook one and it is quietly broken: browsers throttle and
     * can indefinitely defer rAF in a tab that is not visible. The transform is applied
     * synchronously but the callback that animates it away never runs, so a student who switches
     * tabs at the wrong moment comes back to a resume frozen at 71% scale, parked over the panel.
     * Reading offsetHeight forces the browser to commit the inverted state right now, so the two
     * writes land in different style resolutions and the transition plays with no callback needed.
     */
    el.style.transformOrigin = "top left";
    el.style.transition = "none";
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    void el.offsetHeight;
    el.style.transition = "transform 620ms cubic-bezier(0.16, 1, 0.3, 1)";
    el.style.transform = "none";

    // Belt and braces on the same failure: transitionend does not fire if the transition is
    // interrupted or never starts, and a stuck transform is far worse than an unanimated move.
    el.addEventListener("transitionend", clear, { once: true });
    const failsafe = setTimeout(clear, 1200);
    return () => {
      clearTimeout(failsafe);
      el.removeEventListener("transitionend", clear);
      clear();
    };
  }, [phase]);

  /* Edits are held locally and written on leaving edit mode, not per keystroke. A PUT per
     character would be a request storm, and a half-typed bullet is not a state worth persisting. */
  const onSpecChange = useCallback((next: ResumeSpec) => setSpec(next), []);

  /* Writing the student's numbers into their own bullets.
   *
   * Appended as a clause rather than sent back to the model to reword. A number the student typed is
   * the one fact on this screen we did not infer, and handing it to a rewrite pass is how it comes
   * back rounded, relocated or attached to the wrong achievement. Matching on the exact bullet text
   * means an edit made in the editor first simply misses, which is the safe direction: the student's
   * own wording wins over ours. */
  const applyMetrics = useCallback(async () => {
    setSavingMetrics(true);
    /* Answers are CONSUMED as they match, one per occurrence, rather than looked up by value.
     *
     * Two entries can carry the same org and the same bullet: a student with two stints at one
     * employer, or two roles there, whose duty line reads identically. (The policy pass dedupes
     * bullets WITHIN one entry, so this is the only shape that survives to here.) A plain `find`
     * matched the first answer for both bullets, so one number was written twice and the other was
     * silently dropped, which is the worst outcome available: a number attached to work it does not
     * describe, on a resume the student is about to approve. */
    const pending = new Map<string, string[]>();
    /* A NUL delimiter, and the WHOLE role identity, not `${org} ${bullet}`. A plain space is not a
     * reserved character, so ("Google", "Cloud migrated 3 services.") and ("Google Cloud",
     * "migrated 3 services.") produced the SAME key: two distinct gaps sharing one queue, drained by
     * whichever entry came first in document order. That is the same "number attached to work it
     * does not describe" outcome this function exists to prevent, arriving through a different door. */
    const key = (org: string, title: string, dates: string, bullet: string) =>
      [org, title, dates, bullet].join("\u0000");
    metricGaps.forEach((gap, i) => {
      const value = (metricAnswers[i] ?? "").trim();
      if (!value) return;
      const k = key(gap.org, gap.title, gap.date_range, gap.bullet);
      pending.set(k, [...(pending.get(k) ?? []), value]);
    });
    // Counted before any shift(), so it measures what the student typed, not what landed.
    const queued = [...pending.values()].flat().length;
    let applied = 0;
    const next: ResumeSpec = {
      ...(spec as ResumeSpec),
      experience: (spec as ResumeSpec).experience.map((entry) => ({
        ...entry,
        bullets: entry.bullets.map((bullet) => {
          const queue = pending.get(key(entry.org, entry.title, entry.date_range, bullet));
          const value = queue?.shift();
          if (!value) return bullet;
          applied += 1;
          const body = bullet.replace(/\.\s*$/, "");
          return `${body} (${value}).`;
        }),
      })),
    };
    setSpec(next);
    /* An answer only misses when its bullet was edited in the paper on the left after the ask was
       drawn, so the text no longer matches. Missing is the SAFE direction - the student's own wording
       wins over ours - but doing it silently is not: the panel would close, the number would be
       nowhere, and the analytics meant to judge whether this ask earns its place would count it as
       answered. So the panel stays open and says so. */
    const missed = queued - applied;
    setMetricsDone(missed === 0);
    setMetricsMissed(missed);
    track("base_resume_metrics_added", { asked: metricGaps.length, answered: applied, missed });
    try {
      if (!demo) await putBaseResume(next);
    } catch {
      /* The resume is already saved; a failed metric write is not worth blocking the step on. */
    } finally {
      setSavingMetrics(false);
    }
  }, [demo, metricAnswers, metricGaps, spec]);

  const persist = useCallback(async () => {
    if (demo) return;
    await putBaseResume(spec as ResumeSpec);
  }, [demo, spec]);

  const toggleEditing = useCallback(async () => {
    if (!editing) {
      setEditing(true);
      return;
    }
    setEditing(false);
    setSaving(true);
    try {
      await persist();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your changes.");
    } finally {
      setSaving(false);
    }
  }, [editing, persist]);

  const finish = useCallback(async () => {
    if (editing) return;
    setSaving(true);
    try {
      // Save before advancing. Anything they edited has to be on the server before the next step
      // reads it, and "Looks right" is the student asserting this exact document is the one.
      await persist();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your resume.");
      setSaving(false);
    }
  }, [editing, persist, onDone]);

  const contact: ContactHeader = {
    full_name: parsed?.full_name ?? "",
    email: email ?? undefined,
    phone: profile?.phone ?? undefined,
    location: [profile?.address_city, profile?.address_country].filter(Boolean).join(", ") || undefined,
    linkedin_url: profile?.linkedin_url ?? undefined,
    github_url: profile?.github_url ?? undefined,
    portfolio_url: profile?.portfolio_url ?? undefined,
  };

  const entryCount = (spec.experience ?? []).filter(Boolean).length;
  const hasSource = !!sourceUrl;

  return (
    <StartShell step="base" wide>
      {/* The column template changes between phases, and the paper element does NOT: it is the same
          node before and after, which is what lets the FLIP above animate it across rather than
          cross-fading one sheet out and another in. */}
      <div
        className={
          phase === "compare"
            ? hasSource
              ? "grid gap-8 lg:grid-cols-2 lg:gap-x-10"
              : "grid gap-8"
            : "grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-x-10 lg:gap-y-7"
        }
      >
        {/* ── The heading ─────────────────────────────────────────────────── */}
        <div
          key="heading"
          className={`order-1 min-w-0 ${
            phase === "compare" ? (hasSource ? "lg:col-span-2" : "text-center") : "lg:col-start-2 lg:row-start-1"
          }`}
        >
          <h1 className="max-w-full text-section font-normal leading-[1.12] tracking-[-0.02em] text-ink sm:text-section">
            {phase === "compare"
              ? hasSource ? "Same you. One page." : "One page, ready."
              : "This is your resume now."}
          </h1>
        </div>

        {/* ── The original, only while comparing ──────────────────────────── */}
        {phase === "compare" && hasSource && (
          <div key="source" className={`order-2 mx-auto min-w-0 w-full ${SHEET_CAP.compare}`}>
            <PaneLabel>What you uploaded{sourcePages > 0 ? ` · ${sourcePages} ${sourcePages === 1 ? "page" : "pages"}` : ""}</PaneLabel>
            <SourceResume url={sourceUrl} pages={sourcePages} />
          </div>
        )}

        {/* ── The new resume ──────────────────────────────────────────────────
            Width is capped so the DERIVED height fits the viewport: the sheet is 612/792, so a
            62svh cap on width lands it at roughly 80svh tall. Capping width rather than height is
            what keeps the aspect ratio honest - a height cap plus w-auto collapses on the narrow
            screens where `min(100%, ...)` needs to hand control back to the column.

            This matters more here than it looks. The screen's entire claim is "your three pages are
            now one page", and a sheet that runs off the bottom of the window disproves it at a
            glance. The student has to be able to see the whole page at once. */}
        <div
          key="new"
          className={`order-3 mx-auto min-w-0 w-full ${
            phase === "compare"
              ? `${SHEET_CAP.compare} ${hasSource ? "" : "order-2"}`
              : `${SHEET_CAP.detail} lg:order-2 lg:col-start-1 lg:row-start-1 lg:row-span-2`
          }`}
        >
          {phase === "compare" && (
            <PaneLabel>Your Litos resume · 1 page</PaneLabel>
          )}
          {/* The ref wraps ONLY the sheet. Labels and buttons around it differ between phases, so
              including them would make the FLIP measure two different boxes and jump. */}
          <div ref={paperRef} className="relative will-change-transform">
            {phase === "compare" && finished ? (
              <button
                type="button"
                onClick={choose}
                aria-label="Use this resume"
                className="block w-full cursor-pointer rounded-[3px] text-left outline-none ring-offset-4 transition-shadow focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ResumePaper spec={spec} contact={contact} />
              </button>
            ) : (
              <ResumePaper
                spec={spec}
                contact={contact}
                editing={editing}
                onChange={phase === "detail" ? onSpecChange : undefined}
              />
            )}
          </div>

          {phase === "compare" && (
            <div className="mt-5">
              {error && <ErrorNote message={error} />}
              <div className={`${error ? "mt-3 " : ""}flex flex-wrap items-center gap-3`}>
                {error ? (
                  <PrimaryButton onClick={run}>Try again</PrimaryButton>
                ) : (
                  <PrimaryButton onClick={choose} disabled={!finished}>
                    {finished ? "Use this resume" : <PendingLabel onColor>Making...</PendingLabel>}
                  </PrimaryButton>
                )}
                <LaterLink onClick={onLater} />
              </div>
            </div>
          )}
        </div>

        {/* ── The build and edit panel, only after choosing ────────────────── */}
        {phase === "detail" && (
        <div key="panel" className="order-4 min-w-0 lg:order-3 lg:col-start-2 lg:row-start-2 lg:self-start">
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center">
              {finished ? (
                // The orb at rest: same footprint, same circle, no motion. A settled mark rather
                // than a celebration - the Guardrails rule out confetti, and the resume appearing
                // is the reward. Occupying the full 64px keeps the row from reflowing at the exact
                // moment the student looks back at it.
                <div
                  aria-hidden="true"
                  className="h-11 w-11 rounded-full border border-ink/25"
                >
                  <div className="m-auto mt-[18px] h-1.5 w-1.5 rounded-full bg-ink" />
                </div>
              ) : (
                <ThinkingOrb state={STAGE_COPY[stage ?? "reading"].orb} size={64} />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-faint">
                {finished ? "Built" : "Building"}
              </p>
              <p className="mt-1 truncate text-base text-ink">
                {error ? "Stopped" : finished ? "Your Litos resume" : STAGE_COPY[stage ?? "reading"].label}
              </p>
            </div>
          </div>

          {/* Position, not progress: which stage is current, with no fraction attached. */}
          <ol className="mt-6 space-y-0">
            {STAGE_ORDER.map((s) => {
              const currentIndex = stage ? STAGE_ORDER.indexOf(stage) : -1;
              const index = STAGE_ORDER.indexOf(s);
              const passed = finished || (currentIndex > -1 && index < currentIndex);
              const current = !finished && s === stage;
              return (
                <li
                  key={s}
                  className="flex items-baseline gap-3 border-t border-border py-2.5 first:border-t-0"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      passed || current ? "bg-ink" : "bg-border"
                    }`}
                  />
                  <span
                    className={`text-[13px] leading-6 ${
                      current ? "text-ink" : passed ? "text-muted" : "text-faint"
                    }`}
                  >
                    {STAGE_COPY[s].label}
                  </span>
                </li>
              );
            })}
          </ol>

          {/* The receipt motif: a mono timestamp gutter, times measured from the real start of the
              build rather than assigned. */}
          {log.length > 0 && (
            <div className="mt-6 max-h-56 overflow-y-auto rounded-inner border border-border bg-surface-alt py-1">
              {log.map((row, i) => (
                <div
                  key={`${row.t}-${i}`}
                  className="grid grid-cols-[46px_minmax(0,1fr)] items-baseline gap-3 px-3.5 py-1 font-mono text-[11px]"
                >
                  <span className="text-faint">{row.t}</span>
                  <span className="text-ink">{row.text}</span>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="mt-5">
              <ErrorNote message={error} />
              <button
                type="button"
                onClick={run}
                className="mt-3 px-1 py-2.5 text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {/* Surfaced, never hidden: the student is about to approve this document, so anything the
              validator dropped or flagged has to be visible BEFORE they press the button. */}
          {/* The ATS verdict, stated rather than implied. A student has no way to know whether the
              thing they are about to send parses, and "we checked" is the reassurance the whole
              build is for. Numbers, not adjectives: DESIGN.md's Guardrails forbid a claim we cannot
              show the working for. */}
          {finished && ats && (
            <p className="mt-5 text-xs leading-5 text-muted">
              Checked: an applicant tracking system can read this, {ats.extractable_chars} characters
              on {ats.pages === 1 ? "one page" : `${ats.pages} pages`}.
              {ats.scored_against === "target roles" && (
                <> It matches {ats.keyword_coverage_pct}% of the words in the roles you picked.</>
              )}
            </p>
          )}

          {/* The metrics ask. A bullet without a number is not wrong, it is weaker than the same
              bullet with one, and the student is the only person who knows the number. Skippable and
              capped at five: asking about all fifteen on a federal-style resume turns the payoff
              screen into a form, and drop-off is the real risk. */}
          {finished && metricGaps.length > 0 && !metricsDone && (
            <div className="mt-5 rounded-inner border border-border px-4 py-3.5">
              <p className="text-[13px] text-ink">
                {metricGaps.length === 1
                  ? "One line would land harder with a number in it."
                  : `${metricGaps.length} lines would land harder with a number in them.`}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">
                How many, how much, how often, how fast. Leave any blank and we keep it as it is.
              </p>
              <ul className="mt-3 space-y-3">
                {metricGaps.map((gap, i) => (
                  <li key={i}>
                    {/* The role, above the line. Two stints at one employer can carry the same duty
                        line, and two unlabelled identical prompts give the student no way to tell
                        which is which. */}
                    <p className="text-[11px] text-faint">
                      {[gap.title, gap.org, gap.date_range].filter(Boolean).join(" \u00b7 ")}
                    </p>
                    <p className="text-xs leading-5 text-muted">{gap.bullet}</p>
                    <input
                      value={metricAnswers[i] ?? ""}
                      onChange={(e) =>
                        setMetricAnswers((a) => ({ ...a, [i]: e.target.value }))
                      }
                      placeholder="e.g. 12 clients a week"
                      aria-label={`A number for: ${gap.bullet}`}
                      className="mt-1.5 w-full rounded-full border border-border bg-surface px-4 py-2 text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand"
                    />
                  </li>
                ))}
              </ul>
              {metricsMissed > 0 && (
                <p className="mt-3 text-xs leading-5 text-ink">
                  {metricsMissed === 1 ? "One number" : `${metricsMissed} numbers`} could not be added,
                  because {metricsMissed === 1 ? "that line has" : "those lines have"} been edited since
                  we asked. Add {metricsMissed === 1 ? "it" : "them"} straight into the resume on the left.
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void applyMetrics()}
                  disabled={savingMetrics || Object.values(metricAnswers).every((v) => !v?.trim())}
                  className="rounded-full bg-ink px-4 py-2 text-[13px] text-white disabled:opacity-40"
                >
                  {savingMetrics ? "Adding" : "Add these"}
                </button>
                <SkipLink
                  onClick={() => {
                    track("base_resume_metrics_skipped", { asked: metricGaps.length });
                    setMetricsDone(true);
                  }}
                  what="these numbers"
                />
              </div>
            </div>
          )}

          {/* `open`, not a closed disclosure. The comment above says these have to be visible before
              the student presses the button, and a summary they must click to expand is not visible -
              it is one more thing to skip on the way to the button. There are rarely more than two. */}
          {finished && warnings.length > 0 && (
            <details open className="mt-5 rounded-inner border border-border px-4 py-3">
              <summary className="cursor-pointer text-[13px] text-ink">
                {warnings.length === 1 ? "One thing to check" : `${warnings.length} things to check`}
              </summary>
              <ul className="mt-2.5 space-y-1.5">
                {warnings.map((w, i) => (
                  <li key={i} className="text-xs leading-5 text-muted">
                    {humanizeBuildNote(w)}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={() => void finish()} disabled={!finished || saving || editing}>
              {saving ? <PendingLabel onColor>Saving...</PendingLabel> : "Looks right"}
            </PrimaryButton>
            <button
              type="button"
              onClick={() => void toggleEditing()}
              disabled={!finished}
              className="min-h-11 rounded-full border border-border px-5 text-sm font-medium text-ink transition-colors hover:border-ink disabled:opacity-40"
            >
              {editing ? "Done editing" : "Edit"}
            </button>
            <LaterLink onClick={onLater} />
          </div>
          <p className="mt-4 text-[13px] leading-6 text-muted">
            {editing
              ? "Click any line to change it. The page re-fits itself as you type, so you can always see what it costs."
              : `${entryCount} ${entryCount === 1 ? "entry" : "entries"}, up to three bullets each. You can change this any time in Settings.`}
          </p>
        </div>
        )}
      </div>
    </StartShell>
  );
}

/** The small mono caption over each sheet in the comparison. */
function PaneLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.08em] text-faint">{children}</p>
  );
}

/* ── QA fixture ──────────────────────────────────────────────────────────────
 * Reachable only from the localhost ?qa=1 bypass in app/start/page.tsx.
 *
 * The delays here are the ONLY timers in this feature. That is defensible precisely because this
 * path never runs for a student: it is a fixture standing in for a server, so its job is to
 * approximate one. The real path is event-driven end to end, and if this ever became reachable in
 * production it would be a fake progress animation, which the Guardrails forbid.
 */
const DEMO_ENTRIES: ResumeEntry[] = [
  {
    type: "job",
    org: "Jump Trading",
    title: "Software Engineering Intern",
    date_range: "Jun 2026 - Aug 2026",
    bullets: [
      "Rebuilt the market-data replay path in C++, cutting backtest wall time 38% across 1,200 daily runs",
      "Instrumented the order gateway with per-hop latency counters, surfacing a 4ms stall in production",
      "Shipped a regression harness covering 60 exchange edge cases, now gating every deploy",
    ],
  },
  {
    type: "job",
    org: "USC Institute for Creative Technologies",
    title: "Undergraduate Researcher",
    date_range: "Jan 2026 - May 2026",
    bullets: [
      "Trained a 3-model ensemble on 40k annotated clips, raising gesture-recognition F1 from 0.71 to 0.84",
      "Automated the labeling pipeline in Python, removing roughly 12 hours of manual work per week",
    ],
  },
  {
    type: "project",
    org: "Litos",
    title: "Founder",
    date_range: "2026",
    bullets: [
      "Built a Chrome extension that autofills job applications across Greenhouse, Lever and Ashby",
      "Designed a grounding validator that rejects any resume claim absent from the student's own history",
      "Grew to 400 student users with no paid acquisition",
    ],
  },
  {
    type: "leadership",
    org: "USC Society of Women Engineers",
    title: "Technical Workshop Lead",
    date_range: "Sep 2025 - Present",
    bullets: [
      "Ran a 6-week systems workshop for 85 first-year students, with 78% completing every session",
      "Recruited 9 engineers from 4 companies to mentor, doubling the prior year's mentor pool",
      "Rewrote the curriculum around one shipped project, raising end-of-term satisfaction to 4.6 of 5",
    ],
  },
];

function replayDemo(onFrame: (frame: BuildFrame) => void) {
  const script: Array<[number, BuildFrame]> = [
    [200, { event: "stage", stage: "reading" }],
    [500, { event: "source", bank_entries: 7, source_pages: 3, declared_skills: 14 }],
    [1100, { event: "stage", stage: "selecting" }],
    [2300, { event: "piece", type: "education", education_position: "top" }],
    [3200, { event: "stage", stage: "writing" }],
    [3300, { event: "piece", type: "entry", index: 0, entry: DEMO_ENTRIES[0] }],
    [4900, { event: "piece", type: "entry", index: 1, entry: DEMO_ENTRIES[1] }],
    [6400, { event: "piece", type: "entry", index: 2, entry: DEMO_ENTRIES[2] }],
    [7500, { event: "piece", type: "entry", index: 3, entry: DEMO_ENTRIES[3] }],
    [
      8400,
      {
        event: "piece",
        type: "skills",
        skills: ["Python", "C++", "TypeScript", "PyTorch", "SQL", "Docker", "React", "Postgres"],
      },
    ],
    [9100, { event: "stage", stage: "fitting" }],
    [
      10400,
      {
        event: "done",
        built_at: new Date().toISOString(),
        warnings: [],
        ats: {
          passed: true,
          issues: [],
          pages: 1,
          extractable_chars: 2184,
          keyword_coverage_pct: 41,
          scored_against: "target roles",
        },
        metrics: [],
        spec: {
          school: "University of Southern California",
          degree: "Bachelor of Science in Computer Science",
          grad_date: "May 2028",
          coursework: "Data Structures, Algorithms, Machine Learning, Databases",
          education_position: "top",
          experience: DEMO_ENTRIES,
          skills: ["Python", "C++", "TypeScript", "PyTorch", "SQL", "Docker", "React", "Postgres"],
        },
      },
    ],
  ];
  for (const [at, frame] of script) setTimeout(() => onFrame(frame), at);
}

/** School, degree, grad date and coursework come from the parse, not the model. */
function educationFrom(parsed: ParsedProfile | null): Partial<ResumeSpec> {
  if (!parsed) return {};
  const p = parsed as ParsedProfile & { degree?: string; grad_date?: string; coursework?: string[] };
  return {
    school: p.school ?? "",
    degree: p.degree ?? "",
    grad_date: p.grad_date ?? (p.grad_year ? String(p.grad_year) : ""),
    coursework: (p.coursework ?? []).join(", "),
  };
}

export type { ResumeEntry };
