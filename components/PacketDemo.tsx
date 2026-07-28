"use client";

import { useEffect, useRef, useState } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";

/* The product, shown working (hero demo, second thing on the page): a job
   posting in a browser with the Litos extension panel assembling the
   packet live. Finished artifacts become actionable Review rows that jump
   to their pillar section. Reduced-motion users get the finished scene. */

/* The application on the left. This used to be four grey skeleton bars and a
   dead "Apply for this job" pill, which meant the demo showed the packet being
   built and never showed the thing it was being built FOR: a viewer could not
   tell what "application filled" actually filled.

   It is now the real form, and it fills in step with the panel on the right.
   The phases line up one to one, so the left side is the evidence for the
   right side's claims rather than decoration beside them:

     phase 0  "Rewriting your resume"  -> the Resume/CV field takes the
                                          generated file (uploading, then
                                          attached with a real filename)
     phase 1  "Filling application"    -> every text field and both dropdowns
                                          populate, staggered
     phase 2  "Writing the email"      -> nothing here; outreach is not part
                                          of the employer's form, and pretending
                                          otherwise would misdescribe the product

   The field set is the generic one that appears on essentially every posting
   (Greenhouse, Lever and Ashby all ask this same core), so a viewer recognises
   their own last application rather than a form invented for a demo. No
   free-text essay question: Mehek's call, and it earns its removal twice over,
   since one paragraph box was taller than four real fields and "why do you
   want to work here" is the least generic thing an application asks.

   Nothing here is a demographic or EEO question, deliberately. Litos declines
   those by default, so autofilling one in a demo would advertise a behaviour
   the product does not have.

   Field values are John Doe's, the sample applicant the rest of the site
   already uses, and match the resume rendered in #formats down to the contact
   line. QUESTION_COUNT is derived from these lists rather than typed as a
   number: the panel row says how many questions were filled, and a hand-typed
   count silently becomes a lie the first time someone adds a field here. */
const APPLICATION = [
  { q: "First name", v: "John" },
  { q: "Last name", v: "Doe" },
  { q: "Email", v: "john@vmail.com" },
  { q: "Phone", v: "213-555-0148" },
  { q: "Location", v: "Los Angeles, CA" },
  { q: "LinkedIn", v: "in/john-doe" },
  { q: "Portfolio", v: "johndoe.dev" },
  { q: "Current company", v: "Freelance" },
  { q: "School", v: "USC" },
  { q: "Degree", v: "Computer Science" },
] as const;

const SELECTS = [
  { q: "Graduation year", v: "2027" },
  { q: "Heard about us", v: "Company site" },
] as const;

/* +1 for the resume upload, which is a question the form asks and a thing
   Litos answers. */
const QUESTION_COUNT = APPLICATION.length + SELECTS.length + 1;

const RESUME_FILE = "John_Doe_Notion_Resume.pdf";

const ARTIFACTS: {
  t: string;
  label: string;
  sub: string;
  working: string;
  orb: OrbState;
  action: string;
  thread: string;
  ink: string;
  hover: string;
  target: string;
}[] = [
  {
    t: "19:42:11",
    label: "Resume rewritten",
    sub: RESUME_FILE,
    working: "Rewriting your resume",
    orb: "composing",
    action: "Review",
    thread: "bg-brand",
    ink: "text-brand-ink",
    hover: "hover:bg-brand-soft/60",
    target: "documents",
  },
  {
    t: "19:42:14",
    label: "Application filled",
    sub: `${QUESTION_COUNT} questions · nothing sent yet`,
    working: "Filling application",
    orb: "solving",
    action: "Review",
    thread: "bg-teal",
    ink: "text-teal-ink",
    hover: "hover:bg-teal-soft/60",
    target: "autofill",
  },
  {
    t: "19:42:16",
    label: "Email written",
    sub: "To Priya Nair · USC alum",
    working: "Writing the email",
    orb: "shaping",
    action: "Open",
    thread: "bg-coral",
    ink: "text-coral-ink",
    hover: "hover:bg-coral-soft/60",
    target: "outreach",
  },
];



const DETECT_MS = 1100;
const PROCESS_MS = 1000;
const GAP_MS = 350;
const HOLD_MS = 5000;

/* One labelled field on the employer's form.
 *
 * The value fades in on a per-field delay so the autofill reads as something
 * moving down the form rather than as every box flipping at once, which looked
 * like a state swap instead of work being done.
 *
 * 40ms apart, and the number is set by the phase length rather than picked for
 * feel. Twelve fields at 70ms put the last one at 770ms plus a 500ms fade, so
 * it was still visibly filling while the panel opposite had already marked
 * "Application filled" done and moved on to the email. At 40ms the last field
 * starts at 440ms and finishes at 940ms, inside the 1000ms the phase runs, so
 * the two sides land together.
 *
 * The label and the box are always rendered, empty or not. An empty labelled
 * box is what makes the filled version legible as an answer: if the fields
 * appeared only once populated, the left side would be growing rather than
 * being completed, and the point is that the form was already there.
 */
function Field({
  label,
  value,
  filled,
  index,
  select = false,
}: {
  label: string;
  value: string;
  filled: boolean;
  index: number;
  select?: boolean;
}) {
  const delay = filled ? `${index * 40}ms` : "0ms";
  return (
    <div>
      <p className="truncate font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-faint">
        {label}
      </p>
      <div
        className={`mt-1 flex h-[28px] items-center justify-between gap-1.5 rounded-[8px] border px-2.5 transition-colors duration-500 ${
          filled ? "border-teal/40 bg-teal-soft/40" : "border-border bg-surface-alt/50"
        }`}
        style={{ transitionDelay: delay }}
      >
        <span
          className={`min-w-0 truncate text-[9px] text-ink transition-opacity duration-500 ${
            filled ? "opacity-100" : "opacity-0"
          }`}
          style={{ transitionDelay: delay }}
        >
          {value}
        </span>
        {select && (
          <span className="shrink-0 text-[8px] leading-none text-faint">▼</span>
        )}
      </div>
    </div>
  );
}

// phase: -2 idle start · -1 detecting · 0..2 artifact i processing · 3 done
export function PacketDemo() {
  const [phase, setPhase] = useState(-2);
  const [reduced, setReduced] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const raf = requestAnimationFrame(() => {
        setReduced(true);
        setPhase(ARTIFACTS.length);
      });
      return () => cancelAnimationFrame(raf);
    }
    let cancelled = false;
    let intersecting = false;
    let pageVisible = document.visibilityState === "visible";
    const active = () => intersecting && pageVisible;
    const stop = () => {
      if (!timer.current) return;
      clearTimeout(timer.current);
      timer.current = null;
    };
    const advance = (next: number) => {
      if (cancelled || !active()) return;
      setPhase(next);
      const delay =
        next === -2 ? 500
        : next === -1 ? DETECT_MS
        : next < ARTIFACTS.length ? PROCESS_MS + GAP_MS
        : HOLD_MS;
      timer.current = setTimeout(
        () => advance(next >= ARTIFACTS.length ? -2 : next + 1),
        delay,
      );
    };
    const restart = () => {
      stop();
      if (active()) {
        advance(-2);
      }
    };
    const observer = new IntersectionObserver((entries) => {
      const latest = entries.at(-1);
      if (!latest) return;
      intersecting = latest.isIntersecting;
      restart();
    }, { rootMargin: "200px 0px" });
    const onVisibility = () => {
      pageVisible = document.visibilityState === "visible";
      restart();
    };
    if (root.current) observer.observe(root.current);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, []);

  const done = phase >= ARTIFACTS.length;

  /* The left form's state, derived from the same phase counter that drives the
     panel rows, so the two sides cannot drift. Deriving rather than storing is
     what makes the loop restart clean: when phase returns to -2 the form empties
     itself with no extra bookkeeping.

       resumeWorking  phase 0 is running: the upload control shows the orb
       resumeAttached phase 0 is behind us: the file is in the control
       filled         phase 1 has STARTED: the answers are going in

     `filled` is >= 1, not > 1, and the difference was a visible desync. At
     > 1 the fields stayed empty for the whole of phase 1 and then appeared
     once phase 2 began, so the panel announced "Application filled" and moved
     on to writing the email while the form beside it was still blank, and the
     answers landed under the email row instead of the application row. The
     resume field has a working state to cover its own phase; the form has no
     equivalent, so its phase has to BE the filling. This is also what the
     40ms field stagger was measured against: twelve fields starting at phase
     1 land by 940ms, inside the 1000ms the phase runs for.

     Both use `done ||` so the reduced-motion render, which jumps straight to
     the finished phase, shows a completed form rather than an empty one. */
  const resumeWorking = phase === 0;
  const resumeAttached = done || phase > 0;
  const filled = done || phase >= 1;

  function jump(target: string) {
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div ref={root} className="mx-auto w-full max-w-4xl overflow-hidden rounded-[20px] border border-border bg-surface shadow-[0_1px_2px_rgba(18,18,15,0.04),0_20px_48px_-24px_rgba(18,18,15,0.18)]">
      {/* Browser chrome */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
        </span>
        <span className="flex-1 rounded-full bg-surface-alt px-3 py-1 text-center font-mono text-[10px] text-faint">
          jobs.lever.co/notion/software-engineer
        </span>
      </div>

      {/* items-stretch (the grid default) with the panel column given no
          padding of its own: the extension now runs the full height of the
          window rather than floating in a 20px margin, which is also how it
          actually sits in a browser.

          The panel keeps 300px and the FORM absorbs the demo's narrowing
          (Mehek's call). Squeezing the panel instead was the wrong end to cut
          from: at 224px its rows truncated the filename and the question count
          down to fragments, and those two strings are the whole claim the
          panel is making. The form degrades gracefully when it gets tighter,
          because a narrow input with a truncated value is what a real narrow
          form looks like; a truncated claim just reads as broken.

          348px is measured, not chosen. The longest row sub is "13 questions
          · nothing sent yet" at 202px and the filename is 189px; the row spends
          about 136px on padding, the pillar thread, the gaps and the Review
          action. 300px gave the sub 164px and clipped both. Anything that
          shortens those two strings shortens a claim, so the width moved
          instead of the copy.

          min-w-0 on both columns because a grid child defaults to min-content
          width, so a long value like the LinkedIn URL would refuse to shrink
          and blow the track out instead of truncating inside it. */}
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_348px] [&>*]:min-w-0">
        {/* The posting and its application, filling as the panel works. */}
        <div className="border-b border-border p-4 sm:border-b-0 sm:border-r">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
            Notion · San Francisco
          </p>
          <p className="mt-1.5 text-base font-semibold tracking-tight text-ink">
            Software Engineer
          </p>
          {/* One line of the posting, down from two. It exists only to say the
              form belongs to a real job; the demo's subject is the packet, and
              every line spent here is height taken from the hero's copy
              column beside it. */}
          <p className="mt-1.5 truncate text-[11px] leading-[1.5] text-muted">
            Our web client and the services behind it.
          </p>

          <div className="my-3 h-px bg-border" />

          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
            Apply for this job
          </p>

          <div className="mt-2.5 space-y-2">
            {/* Short answers, two per row. Each one is a real labelled field
                that is empty until the autofill phase reaches it. */}
            <div className="grid grid-cols-2 gap-2">
              {APPLICATION.map((f, i) => (
                <Field key={f.q} label={f.q} value={f.v} filled={filled} index={i} />
              ))}
            </div>

            {/* The resume slot. This is the one field the FIRST phase answers,
                and the reason the left column exists: "resume rewritten" on
                the right is an assertion until you can see the generated file
                land in the employer's own upload control. */}
            <div>
              <p className="font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-faint">
                Resume / CV
              </p>
              <div
                className={`mt-1 flex h-[34px] items-center gap-1.5 rounded-[8px] border px-2 transition-colors duration-500 ${
                  resumeAttached
                    ? "border-brand/40 bg-brand-soft/50"
                    : "border-dashed border-border bg-surface-alt/50"
                }`}
              >
                {resumeAttached ? (
                  <>
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-brand text-[7px] font-semibold text-white">
                      ✓
                    </span>
                    {/* No "Attached" chip beside this any more. The tick and
                        the filled state already say the file landed, and the
                        chip was spending 55px of a 250px row to repeat it,
                        which pushed the filename itself into an ellipsis. */}
                    <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-brand-ink">
                      {RESUME_FILE}
                    </span>
                  </>
                ) : resumeWorking ? (
                  <>
                    {/* 20, not 16: OrbSize is a union of exactly 64 and 20,
                        so the orb has two legal sizes and this is the small
                        one. Same idiom as the panel rows opposite. */}
                    <ThinkingOrb state="composing" size={20} />
                    <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted">
                      Uploading resume
                    </span>
                  </>
                ) : (
                  <span className="font-mono text-[10px] text-faint">
                    Drop a file or browse
                  </span>
                )}
              </div>
            </div>

            {/* Dropdowns, because a real form is not all free text and the
                autofill has to make choices as well as type. */}
            <div className="grid grid-cols-2 gap-2">
              {SELECTS.map((f, i) => (
                <Field
                  key={f.q}
                  label={f.q}
                  value={f.v}
                  filled={filled}
                  index={APPLICATION.length + i}
                  select
                />
              ))}
            </div>
          </div>

          {/* Submit stays inert and says so. The Guardrail is that nothing is
              sent without the person, and the demo must not imply otherwise
              at the exact moment it is showing the form completed. */}
          {/* whitespace-nowrap on both: in the narrowed form column the pill
              broke "Submit application" over two lines and the note broke
              under it, so the row that is supposed to read as one calm
              statement became a four-line paragraph. */}
          <div className="mt-3 flex items-center gap-2.5">
            <span className="inline-block shrink-0 whitespace-nowrap rounded-full border border-border px-3.5 py-1.5 text-[11px] font-medium text-faint">
              Submit
            </span>
            <span className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.08em] text-faint">
              Waiting on you
            </span>
          </div>
        </div>

        {/* The extension panel (always present; only its rows cycle).
            Full-bleed in its column now: no outer padding, no rounding, no
            drop shadow, and a left hairline instead. It was a floating card
            inside a 20px margin, which read as a card sitting ON a webpage;
            a browser extension panel is docked to the side of the window, and
            filling the column is both truer and gives the rows their height
            back without making the demo taller. */}
        <div className="flex flex-col bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="flex items-center gap-2">
                {/* The Stack, the same drawing the header, favicon and the
                    extension itself use (public/brand/litos-mark.svg,
                    generated by scripts/generate-brand-assets.mjs). This was
                    still a blue circle with an "R" in it: RoleQuick's mark,
                    from before the 2026-07-23 rename, sitting inside a panel
                    labelled Litos. The artwork carries its own white ground,
                    so it takes no tile, no circle and no padding. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/litos-mark.svg" alt="" className="h-[18px] w-[18px]" />
                <span className="text-[13px] font-semibold tracking-tight text-ink">
                  Litos
                </span>
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-faint">
                {phase <= -1 ? (
                  <>
                    <ThinkingOrb state="searching" size={20} />
                    Scanning
                  </>
                ) : done ? (
                  "Ready · 9 seconds"
                ) : (
                  "Job found"
                )}
              </span>
            </div>

            {/* flex-1 so the rows take the slack in a full-height panel and
                the send footer stays pinned to the bottom edge, the way a
                docked panel behaves. */}
            <div className="flex-1 space-y-1 p-2.5">
              {ARTIFACTS.map((a, i) => {
                const state = done || phase > i ? "done" : phase === i ? "active" : "pending";
                if (state === "pending")
                  return (
                    <div key={a.t} className="h-[52px] rounded-xl border border-dashed border-border/70" />
                  );
                if (state === "active")
                  return (
                    <div
                      key={a.t}
                      className="flex h-[52px] items-center gap-3 rounded-xl bg-surface-alt/70 px-3"
                    >
                      <ThinkingOrb state={a.orb} size={20} />
                      <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted">
                        {a.working}
                      </span>
                    </div>
                  );
                return (
                  <button
                    key={a.t}
                    onClick={reduced ? undefined : () => jump(a.target)}
                    title="See how"
                    className={`flex h-[52px] w-full items-center justify-between gap-3 rounded-xl px-3 text-left transition-colors ${a.hover}`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={`h-7 w-0.5 shrink-0 rounded-full ${a.thread}`} />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-ink">{a.label}</span>
                        <span className="block truncate font-mono text-[10px] text-faint">
                          {a.sub}
                        </span>
                      </span>
                    </span>
                    <span className={`shrink-0 font-mono text-[10px] font-medium uppercase tracking-[0.08em] ${a.ink}`}>
                      {a.action} →
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-border px-4 py-3">
              <span
                className={`block w-full rounded-full py-2 text-center text-[13px] font-medium transition-colors duration-500 ${
                  done
                    ? "bg-brand text-white"
                    : "border border-dashed border-border text-faint"
                }`}
              >
                {done ? "Review, then send" : "Making your application…"}
              </span>
            </div>
        </div>
      </div>
    </div>
  );
}
