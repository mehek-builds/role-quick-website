"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ResumeSpec, ResumeEntry } from "@/lib/api";
import { resumeContactLine } from "@/lib/resumeContact";
import { startsWithStrongVerb } from "@/lib/strong-verbs";
import { RequirementText } from "@/components/app/RequirementText";

/* Read-only text that can carry requirement marks. `hideMissing` for the same reason the
   dashboard's resume pane sets it: a missing requirement cannot legitimately appear on the resume,
   and if the words happen to be there anyway the scorer counted them covered, so an amber mark
   would contradict the number beside it. With no RequirementProvider above, the index is empty and
   this renders a plain span: the paper stays monochrome wherever nothing supplies marks. */
function PaperText({ text }: { text: string }) {
  return <RequirementText text={text} hideMissing />;
}

/* The base resume, drawn as paper.
 *
 * This mirrors engine/resumeRender.ts section for section, because it is a PREVIEW of a PDF and a
 * preview that composes differently from the artifact is worse than no preview: the student
 * approves one document and receives another. Everything here traces to the renderer:
 *
 *   order      EDUCATION (when top) -> EXPERIENCE -> PROJECTS -> LEADERSHIP -> EDUCATION (when
 *              after_experience) -> SKILLS                        [drawEducation / drawEntrySection]
 *   entry      org bold left, date_range right, title italic beneath, bullets at an indent
 *                                                                  [drawSplitLine + drawEntrySection]
 *   type       Tinos, a Times metric-compatible serif. Tinos itself is not loaded on the site, so
 *              the stack falls through to Times New Roman, which shares its metrics - the preview
 *              wraps where the PDF wraps.                          [RESUME_FONT_PATHS]
 *   page       612x792pt at 36pt margins, expressed here as an aspect ratio and a percentage inset
 *              so the sheet scales with the column instead of pinning to a pixel size.
 *                                                                  [RESUME_DESIGN.compact.page]
 *
 * IT IS ONE PAGE AND IT FILLS THE PAGE. Not "one page at most" - a resume that stops two thirds
 * down reads as a thin candidate no matter how good the content is, and it is the single most
 * common way a strong student's resume looks weak. `useFittedGap` below solves for the exact
 * vertical rhythm that closes the page, from a real measurement rather than an estimate.
 *
 * BLACK AND WHITE, NO EXCEPTIONS, WITH ONE PROVIDER-GATED OVERLAY. The DOCUMENT is monochrome
 * (hard rule, 2026-07): nothing this paper prints may take a brand color, a status color, or a
 * tint, and the PDF the student sends is untouched by anything in this file. The arriving-line
 * animation is opacity and transform only, for exactly this reason.
 *
 * The one sanctioned exception (Mehek, 2026-09-01): when a surface wraps this paper in a
 * RequirementProvider, the read-only text renders through RequirementText and carries the same
 * requirement marks as the job description beside it, in the same colours, so a term reads as one
 * meaning across both panes (ISSUE-047, the colour with no support, closed from the support side).
 * The marks are comparison UI drawn OVER the preview, not part of the document: no provider, no
 * hue, and every surface that renders the paper alone stays exactly as monochrome as before.
 */

export type ContactHeader = {
  full_name: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
};

const PAPER_FONT = '"Tinos", "Times New Roman", Times, serif';

/* How much of the usable page the content should occupy. Not 1.0: a resume printed hard against
 * its own bottom margin looks like it was cut off, and the last line needs somewhere to sit. */
const FILL_TARGET = 0.96;

/* The gap multipliers each element contributes, in units of --rq-gap. Declared once because two
 * things must agree exactly: what the JSX renders, and what useFittedGap solves for. If they ever
 * disagree, the fit is wrong by however much they differ. */
const GAP_UNITS = {
  headerSpacer: 0.8,
  sectionHeader: 1.5,
  splitLine: 0.62,
  bullet: 0.3,
} as const;

/* Solve for the vertical rhythm that fills the page.
 *
 * Rendered height is LINEAR in the gap: height = baseline + gap * units, where baseline is
 * everything that does not scale (type, leading, rules) and units is the fixed total above. So one
 * measurement of the current height is enough to recover baseline and jump straight to the right
 * answer - no search, and it settles in a single extra render.
 *
 * MEASURED BY ResizeObserver, NOT IN useLayoutEffect, and this is not a style preference.
 * The sheet sizes itself from `aspect-ratio` and its type from `cqw` against a container query.
 * Inside useLayoutEffect neither is resolved yet: the frame reports clientHeight 0 and the font
 * measures roughly 4x its final size, so every solve bailed on `available <= 0` and the gap sat at
 * its initial value forever. A ResizeObserver fires once layout has actually settled, with real
 * numbers. It also re-fires when the window or the column changes, so the page re-fits on resize
 * instead of keeping a rhythm solved for a viewport that no longer exists.
 */
/* `contentKey` is a fingerprint of everything rendered, and it is load-bearing rather than
 * defensive. Keying the solver on gapUnits alone looks sufficient and is not: the education block
 * contributes the same gap units whether or not it has a degree and coursework line, so when the
 * final frame filled those in, the page grew by two lines while gapUnits did not move. The effect
 * never re-ran, and the resume sat 4% over the page - clipped - with the solver convinced it was
 * done. Any change to what is on the paper has to re-open the fit. */
function useFittedGap(gapUnits: number, contentKey: string) {
  const contentRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [gapEm, setGapEm] = useState(0.9);
  const passes = useRef(0);
  const lastAvailable = useRef(0);

  // A new document is a new fit. Without this the pass budget stays spent from the previous
  // content and the next resume never gets corrected.
  useEffect(() => {
    passes.current = 0;
  }, [gapUnits, contentKey]);

  useEffect(() => {
    const content = contentRef.current;
    const frame = frameRef.current;
    if (!content || !frame || gapUnits <= 0) return;

    const measure = () => {
      const styles = getComputedStyle(frame);
      const fontSize = parseFloat(getComputedStyle(content).fontSize);
      const available =
        frame.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom);
      if (!(available > 0) || !(fontSize > 0)) return;

      // A resized sheet is a new fit problem, so it gets a fresh pass budget. Without this, a
      // sheet that changes size after the budget is spent (the compare-to-detail move, a window
      // resize) keeps whatever rhythm was solved for the old size.
      if (Math.abs(available - lastAvailable.current) > 1) {
        lastAvailable.current = available;
        passes.current = 0;
      }

      /* getBoundingClientRect, not scrollHeight. scrollHeight is rounded up to whole pixels, which
       * at this type size reads ~6px taller than the content really is - enough to report a fill
       * of 1.002 on a page that is genuinely at 0.988 and send the solver chasing an overflow that
       * does not exist. The content box is `flow-root` so child margins are contained rather than
       * collapsing through it, which makes this rect the true rendered height.
       *
       * DIVIDED BY THE ACTIVE SCALE, which is not optional. getBoundingClientRect reports the
       * VISUAL box, so any CSS transform on an ancestor is baked into it, while frame.clientHeight
       * stays layout-based and ignores transforms entirely. The two disagree the moment anything
       * animates the sheet - and something does: /start slides this element between columns with a
       * scaled FLIP transform. Mid-flight the solver compared a shrunken content box against a
       * full-size page, concluded the resume was tiny, and drove the gap into its 3.2em ceiling,
       * leaving the page 25% overflowing once the animation ended. offsetWidth is the untransformed
       * layout width, so their ratio recovers the scale exactly. */
      const rect = content.getBoundingClientRect();
      const scale = content.offsetWidth > 0 ? rect.width / content.offsetWidth : 1;
      if (!(scale > 0)) return;
      const height = rect.height / scale;
      const fill = height / available;
      // Overflow is the one error that is never acceptable: the sheet clips, so a resume that
      // measures over the page has silently lost its last line. It always gets a correction, pass
      // budget or not.
      const overflowing = fill > 0.995;
      if (!overflowing && Math.abs(fill - FILL_TARGET) < 0.012) return;
      if (!overflowing && passes.current >= 6) return;

      /* Correct from the MEASURED height rather than solving once from an inferred baseline.
       * Both are the same Newton step on a linear model, but this form feeds real measurements
       * back in, so it converges despite the model being slightly wrong in practice: line boxes
       * round to whole pixels, and at small type those roundings accumulate enough to overshoot
       * the page (measured 1.012 fill from a single-shot solve at a 343px sheet). */
      const correction = (available * FILL_TARGET - height) / (fontSize * gapUnits);
      // Floor keeps a dense resume readable rather than letting lines touch; ceiling stops a
      // nearly empty one from drifting into a poster.
      const next = Math.max(0.32, Math.min(3.2, gapEm + correction));
      if (Math.abs(next - gapEm) < 0.004) return;
      passes.current += 1;
      setGapEm(next);
    };

    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(content);
    measure();
    return () => observer.disconnect();
  }, [gapUnits, gapEm, contentKey]);

  return { contentRef, frameRef, gapEm };
}

/* ── Editing ──────────────────────────────────────────────────────────────────
 * The resume is edited ON THE PAPER, not in a form beside it. A form would ask the student to
 * hold two models in their head at once - the fields and the document those fields produce - when
 * the document is right there and is the thing they actually care about. Typing straight into it
 * also means the one-page fit re-solves live as they type, so the cost of a longer bullet is
 * visible while they are writing it rather than after they save.
 *
 * Context rather than prop drilling: every level of this tree (education, sections, entries,
 * bullets) needs the same two things, and threading them through six components would bury the
 * layout code that is the point of the file.
 */
type EditApi = {
  editing: boolean;
  /** Replace the whole spec. Callers hand back a new object; the paper never mutates in place. */
  update: (next: ResumeSpec) => void;
  spec: ResumeSpec;
};

const EditContext = createContext<EditApi | null>(null);

/* An editable run of text.
 *
 * React deliberately renders NO children here, and the text is written by the effect below. That
 * is the whole trick, and it is not optional: this component re-renders constantly while the
 * student types, because the fit solver adjusts --rq-gap on every keystroke's reflow. If React
 * owned the text, each of those re-renders would replace the text node under the caret, wiping
 * the word in progress and throwing the cursor to the start. The effect syncs only when the span
 * is NOT focused, so React can never touch text the student is in the middle of.
 *
 * Committing on blur rather than on input is the matching half: the spec updates once, when they
 * are done with the field, instead of once per character.
 */
function Editable({
  value,
  onCommit,
  className = "",
  block = false,
}: {
  value: string;
  onCommit: (next: string) => void;
  className?: string;
  block?: boolean;
}) {
  const edit = useContext(EditContext);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    if (el.textContent !== value) el.textContent = value;
  }, [value, edit?.editing]);

  if (!edit?.editing) return <span className={className}>{value}</span>;

  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      tabIndex={0}
      onBlur={(e) => onCommit(e.currentTarget.textContent?.replace(/\s+/g, " ").trim() ?? "")}
      onKeyDown={(e) => {
        // Enter commits instead of inserting a line break: a resume field is one line, and a
        // stray <br> inside contentEditable would survive into the saved text.
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          if (ref.current) ref.current.textContent = value;
          e.currentTarget.blur();
        }
      }}
      /* Monochrome, per the hard rule: a dotted black underline at low opacity to show the field
         is live, going solid on focus. No hue anywhere, including for focus. */
      className={`${className} ${block ? "block" : "inline-block"} min-w-[1ch] cursor-text border-b border-dotted border-black/30 outline-none focus:border-solid focus:border-black`}
    />
  );
}

/** A monochrome remove control, shown only in edit mode. */
function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="ml-1 inline-flex h-[1.3em] w-[1.3em] shrink-0 items-center justify-center rounded-full border border-black/25 text-[0.75em] leading-none text-black/50 transition-colors hover:border-black hover:text-black"
    >
      ×
    </button>
  );
}

/* One arriving line. `index` staggers the entrance so a section reads as settling in rather than
 * flashing in as a block: 45ms apart is fast enough not to feel like a queue and slow enough to
 * see. Under prefers-reduced-motion the CSS animation is dropped entirely (globals.css), so this
 * renders instantly and statically - the delay variable is simply unused. */
function Line({
  children,
  index = 0,
  className = "",
  style,
}: {
  children: React.ReactNode;
  index?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rq-paper-line ${className}`}
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms`, ...style }}
    >
      {children}
    </div>
  );
}

/* `first` is passed explicitly rather than handled with a `first:` variant. Each section renders
   inside its own wrapper element, so a CSS first-child rule would match EVERY section header and
   silently delete the space between all of them - and the gap-unit total would then over-count by
   one header per section, throwing off the page fit too. */
function SectionHeader({
  children,
  index,
  first = false,
}: {
  children: string;
  index: number;
  first?: boolean;
}) {
  return (
    <Line
      index={index}
      style={{ marginTop: first ? 0 : `calc(var(--rq-gap) * ${GAP_UNITS.sectionHeader})` }}
    >
      <div className="text-[1.35em] font-bold uppercase tracking-[0.02em] leading-[1.3]">
        {children}
      </div>
      {/* The rule under a section header: 0.65pt in the PDF, hairline here. */}
      <div className="mt-[0.35em] h-px w-full bg-black" />
    </Line>
  );
}

function SplitLine({
  left,
  right,
  index,
  onLeft,
  onRight,
  after,
  italic = false,
}: {
  left: string;
  right: string;
  index: number;
  onLeft?: (v: string) => void;
  onRight?: (v: string) => void;
  after?: React.ReactNode;
  /* The second line of an entry: same columns, italic on the left. One component with a flag
     rather than two that must not drift, exactly as drawSplitLine takes a leftFont. */
  italic?: boolean;
}) {
  return (
    <Line index={index}>
      <div
        className="flex items-baseline justify-between gap-4"
        style={{ marginTop: `calc(var(--rq-gap) * ${GAP_UNITS.splitLine})` }}
      >
        <span className={`flex min-w-0 items-baseline leading-[1.35] ${italic ? "italic" : "font-bold"}`}>
          {onLeft ? <Editable value={left} onCommit={onLeft} /> : left}
          {after}
        </span>
        {(right || onRight) && (
          <span className="shrink-0 leading-[1.35]">
            {onRight ? <Editable value={right} onCommit={onRight} /> : right}
          </span>
        )}
      </div>
    </Line>
  );
}

/** Bullets are capped at the house maximum, so "add" disappears rather than silently no-opping. */
const MAX_BULLETS = 3;

function Entry({
  entry,
  index,
  onChange,
  onRemove,
}: {
  entry: ResumeEntry;
  index: number;
  onChange?: (next: ResumeEntry) => void;
  onRemove?: () => void;
}) {
  const edit = useContext(EditContext);
  const editing = Boolean(edit?.editing && onChange);
  const set = (patch: Partial<ResumeEntry>) => onChange?.({ ...entry, ...patch });

  return (
    <>
      {/* Org and place, then role and dates: the two-split-line shape drawEntrySection() emits.
          The location is not editable here for the same reason the GPA is not - applyResumePolicy
          re-copies it from the experience bank on every generation, so an edit would survive this
          screen and silently revert on the first tailored resume. */}
      <SplitLine
        left={entry.org}
        right={entry.location ?? ""}
        index={index}
        onLeft={editing ? (v) => set({ org: v }) : undefined}
        after={
          editing && onRemove ? (
            <RemoveButton onClick={onRemove} label={`Remove ${entry.org}`} />
          ) : undefined
        }
      />
      {(entry.title || entry.date_range || editing) && (
        <SplitLine
          left={entry.title ?? ""}
          right={entry.date_range ?? ""}
          index={index}
          italic
          onLeft={editing ? (v) => set({ title: v }) : undefined}
          onRight={editing ? (v) => set({ date_range: v }) : undefined}
        />
      )}
      {entry.bullets.map((bullet, i) => (
        // Keyed by position, not by text: keying on content would remount the span the moment a
        // commit changes the text, stealing focus mid-edit.
        <Line key={i} index={index + i}>
          {/* The PDF prints "•  " into an indented text box; grid reproduces that hang exactly
              rather than relying on list-style, which would wrap under the marker. */}
          <div
            className="grid grid-cols-[1.1em_minmax(0,1fr)] leading-[1.4]"
            style={{ marginTop: `calc(var(--rq-gap) * ${GAP_UNITS.bullet})` }}
          >
            <span aria-hidden="true">•</span>
            <span className="flex items-baseline">
              {/* The hard rule, shown while they type. Advisory, never blocking: a marker in the
                  margin, monochrome like everything else on the sheet, that says this line opens
                  weakly. It is the same rule the server enforces on what it generates, so a bullet
                  the student writes by hand is held to the bullets around it. */}
              {editing && bullet.trim() && !startsWithStrongVerb(bullet) && (
                <span
                  title="Start with a strong action verb, like the other bullets"
                  aria-label="Weak opening verb"
                  className="mr-1 shrink-0 select-none font-bold text-black/40"
                >
                  !
                </span>
              )}
              {editing ? (
                <Editable
                  value={bullet}
                  onCommit={(v) => {
                    const bullets = [...entry.bullets];
                    // An emptied bullet is a deletion. Saving "" would render a lone dot.
                    if (v.trim()) bullets[i] = v;
                    else bullets.splice(i, 1);
                    set({ bullets });
                  }}
                />
              ) : (
                <PaperText text={bullet} />
              )}
              {editing && (
                <RemoveButton
                  onClick={() => set({ bullets: entry.bullets.filter((_, j) => j !== i) })}
                  label="Remove this bullet"
                />
              )}
            </span>
          </div>
        </Line>
      ))}
      {editing && entry.bullets.length < MAX_BULLETS && (
        <Line index={index}>
          <div
            className="grid grid-cols-[1.1em_minmax(0,1fr)] leading-[1.4]"
            style={{ marginTop: `calc(var(--rq-gap) * ${GAP_UNITS.bullet})` }}
          >
            <span />
            <button
              type="button"
              onClick={() => set({ bullets: [...entry.bullets, "New bullet"] })}
              className="text-left text-black/45 underline decoration-dotted underline-offset-2 hover:text-black"
            >
              Add a bullet
            </button>
          </div>
        </Line>
      )}
    </>
  );
}

function Education({ spec, index, first }: { spec: ResumeSpec; index: number; first: boolean }) {
  const edit = useContext(EditContext);
  const editing = Boolean(edit?.editing);
  const set = (patch: Partial<ResumeSpec>) => edit?.update({ ...edit.spec, ...patch });

  return (
    <>
      <SectionHeader index={index} first={first}>EDUCATION</SectionHeader>
      <SplitLine
        left={spec.school}
        right={spec.school_location ?? ""}
        index={index}
        onLeft={editing ? (v) => set({ school: v }) : undefined}
      />
      {(spec.degree || spec.grad_date || editing) && (
        <SplitLine
          left={spec.degree ?? ""}
          right={spec.grad_date ?? ""}
          index={index}
          italic
          onLeft={editing ? (v) => set({ degree: v }) : undefined}
          onRight={editing ? (v) => set({ grad_date: v }) : undefined}
        />
      )}
      {/* READ-ONLY, unlike every other line on this page, and deliberately so. applyResumePolicy
          rewrites `gpa` from the parsed profile on every generation, so an edit made here would
          survive the base resume and then silently revert on the first tailored one. An editable
          control that quietly loses the edit is worse than no control. The GPA is corrected where
          it is stored, not where it is printed. */}
      {spec.gpa && (
        <Line index={index}>
          <div className="mt-[0.2em] leading-[1.4]">GPA: {spec.gpa}</div>
        </Line>
      )}
      {(spec.coursework || editing) && (
        <Line index={index}>
          <div className="mt-[0.2em] leading-[1.4]">
            Relevant coursework:{" "}
            {editing ? (
              <Editable value={spec.coursework ?? ""} onCommit={(v) => set({ coursework: v })} />
            ) : (
              <PaperText text={spec.coursework ?? ""} />
            )}
          </div>
        </Line>
      )}
    </>
  );
}

/* Entries carry `at`, their index in spec.experience, because the sections above are grouped BY
   TYPE and that grouping throws the original position away. Without it an edit to the second
   project would be written back to the second job. */
type PlacedEntry = { entry: ResumeEntry; at: number };

type Block =
  | { kind: "education" }
  | { kind: "section"; title: string; entries: PlacedEntry[] }
  | { kind: "skills"; skills: string[] };

export function ResumePaper({
  spec,
  contact,
  /** Drawn dimmed, for the "this is what you uploaded" ghost stack. */
  muted = false,
  /** Turns the paper into a live document. Omit for a read-only preview. */
  editing = false,
  onChange,
}: {
  spec: Partial<ResumeSpec>;
  contact: ContactHeader;
  muted?: boolean;
  editing?: boolean;
  onChange?: (next: ResumeSpec) => void;
}) {
  const full = spec as ResumeSpec;
  const line = resumeContactLine(contact);

  const editApi = useMemo<EditApi>(
    () => ({ editing: editing && Boolean(onChange), update: onChange ?? (() => {}), spec: full }),
    [editing, onChange, full],
  );

  /* The document as a list of blocks, built once. Two things read it: the JSX, and the gap-unit
     total the fit solves against. Deriving both from one structure is what keeps them in step. */
  const { blocks, gapUnits, starts } = useMemo(() => {
    // Index BEFORE filtering, so `at` survives the grouping.
    const entries = (spec.experience ?? [])
      .map((entry, at) => ({ entry, at }))
      .filter((e): e is PlacedEntry => Boolean(e.entry));
    const hasEducation = Boolean(spec.school?.trim());
    const educationTop = spec.education_position !== "after_experience";
    const of = (type: ResumeEntry["type"]) =>
      entries.filter((e) => (e.entry.type ?? "job") === type);

    const list: Block[] = [];
    if (hasEducation && educationTop) list.push({ kind: "education" });
    for (const [title, type] of [
      ["EXPERIENCE", "job"],
      ["PROJECTS", "project"],
      ["LEADERSHIP", "leadership"],
    ] as const) {
      const found = of(type);
      if (found.length > 0) list.push({ kind: "section", title, entries: found });
    }
    if (hasEducation && !educationTop) list.push({ kind: "education" });
    if ((spec.skills?.length ?? 0) > 0) list.push({ kind: "skills", skills: spec.skills ?? [] });

    // Stagger indices, precomputed. A running counter mutated from inside the JSX would be a
    // closure reassigning a variable after render, which is both a lint error and a real hazard.
    const startAt: number[] = [];
    let cursor = 0;
    let units = list.length > 0 ? GAP_UNITS.headerSpacer : 0;
    list.forEach((block, i) => {
      startAt.push(cursor);
      if (i > 0) units += GAP_UNITS.sectionHeader;
      if (block.kind === "education") {
        cursor += 1;
        units += GAP_UNITS.splitLine;
      } else if (block.kind === "section") {
        cursor += block.entries.length + 1;
        units += block.entries.length * GAP_UNITS.splitLine;
        units +=
          block.entries.reduce((n, e) => n + (e.entry.bullets?.length ?? 0), 0) * GAP_UNITS.bullet;
      } else {
        cursor += 1;
      }
    });

    return { blocks: list, gapUnits: units, starts: startAt };
  }, [spec]);

  // Cheap fingerprint of everything the sheet draws. Length rather than the string itself: it
  // changes whenever the rendered text does, and it never holds a copy of the resume in memory.
  const contentKey = `${contact.full_name.length}:${line.length}:${JSON.stringify(spec).length}`;
  const { contentRef, frameRef, gapEm } = useFittedGap(gapUnits, contentKey);

  // containerType goes on the SHEET and the cqw type size on its child: an element cannot query
  // itself, so declaring both on one div would silently pin the type at the clamp minimum.
  return (
    <EditContext.Provider value={editApi}>
    <div
      className={`ph-no-capture aspect-[612/792] w-full overflow-hidden bg-white text-black shadow-[0_1px_2px_rgba(0,0,0,0.06),0_12px_32px_-12px_rgba(0,0,0,0.28)] ${
        muted ? "opacity-40" : ""
      }`}
      style={{ fontFamily: PAPER_FONT, containerType: "inline-size" }}
      aria-label="Your main resume, preview"
    >
      {/* ph-no-capture is PostHog's default block class: session recording renders this whole
          sheet as an opaque box instead of its real content. Every caller draws a real resume
          here (name, email, phone, GPA, work history), so this belongs on the ONE shared
          component, not repeated per caller (Mehek, 2026-08-27). */}
      {/* 36pt margin on a 612pt page = 5.88%. Percentage, not pixels, so the type and the margins
          scale together when the column narrows. */}
      {/* 10.5pt body type on a 612pt-wide page is 1.716% of the page width, so 1.72cqw reproduces
          the PDF's type scale exactly at any sheet size.
          The floor is deliberately LOW (5px, reached only below a ~290px sheet). Whenever the
          clamp bites, type stops scaling with the page while the gaps keep scaling, so the fit
          solver's linear model no longer describes the layout and the measured fill drifts toward
          1.0 - at which point the sheet's overflow-hidden starts silently eating the last line.
          A slightly smaller thumbnail is a much better failure than a clipped resume. */}
      <div
        ref={frameRef}
        className="h-full w-full box-border px-[5.88%] py-[4.5%] text-[clamp(5px,1.72cqw,15px)]"
        style={{ "--rq-gap": `${gapEm.toFixed(3)}em` } as React.CSSProperties}
      >
        {/* flow-root establishes a block formatting context, so the section headers' top margins
            are contained here instead of collapsing out through the wrapper. That is what makes
            the measured rect equal the real rendered height, which the fit solver depends on. */}
        <div ref={contentRef} className="flow-root">
          {blocks.length > 0 && (
            <>
              {/* The header, matching drawHeader() in resumeRender.ts: the name centered, a full
                  width rule beneath it, then the contact details centered below the rule. Identity
                  above the line, ways to reach that person below it. */}
              <Line index={0}>
                <div className="text-[2.1em] font-bold leading-[1.15] text-center">
                  {contact.full_name}
                </div>
              </Line>
              {line && (
                <Line index={0}>
                  <div className="mt-[0.3em] h-px w-full bg-black" />
                  <div className="mt-[0.3em] text-[0.95em] leading-[1.3] text-center">{line}</div>
                </Line>
              )}
              <div style={{ marginTop: `calc(var(--rq-gap) * ${GAP_UNITS.headerSpacer})` }} />
              {blocks.map((block, i) =>
                block.kind === "education" ? (
                  <Education key="education" spec={full} index={starts[i]} first={i === 0} />
                ) : block.kind === "section" ? (
                  <div key={block.title}>
                    <SectionHeader index={starts[i]} first={i === 0}>
                      {block.title}
                    </SectionHeader>
                    {block.entries.map(({ entry, at }, j) => (
                      <Entry
                        // Keyed by position in spec.experience, which is stable across edits.
                        // Keying on org would remount the entry the moment its name is edited.
                        key={at}
                        entry={entry}
                        index={starts[i] + j}
                        onChange={
                          onChange
                            ? (next) => {
                                const experience = [...(full.experience ?? [])];
                                experience[at] = next;
                                onChange({ ...full, experience });
                              }
                            : undefined
                        }
                        onRemove={
                          onChange
                            ? () =>
                                onChange({
                                  ...full,
                                  experience: (full.experience ?? []).filter((_, k) => k !== at),
                                })
                            : undefined
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div key="skills">
                    <SectionHeader index={starts[i]} first={i === 0}>
                      SKILLS
                    </SectionHeader>
                    <Line index={starts[i]}>
                      <div className="mt-[0.2em] leading-[1.4]">
                        {/* Skills are edited as the one comma-separated line the resume actually
                            prints, not as a list of chips. The student is correcting a sentence
                            they can see, and splitting on commas at commit is the whole
                            conversion. */}
                        {editApi.editing ? (
                          <Editable
                            value={block.skills.join(", ")}
                            block
                            onCommit={(v) =>
                              onChange?.({
                                ...full,
                                skills: v
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                          />
                        ) : (
                          <PaperText text={block.skills.join(", ")} />
                        )}
                      </div>
                    </Line>
                  </div>
                ),
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </EditContext.Provider>
  );
}
