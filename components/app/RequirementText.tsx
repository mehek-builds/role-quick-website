"use client";

import { createContext, memo, useContext, useMemo, useState } from "react";
import {
  segmentText,
  type RequirementIndex,
  type MarkTone,
  EMPTY_REQUIREMENT_INDEX,
} from "@/features/applications";
import { decodeHtmlEntities } from "@/lib/html-entities";

/**
 * Hover link between the job description and the resume.
 *
 * The two panes sit side by side but had nothing tying them together: a student could see that
 * "PostgreSQL" was blue in the JD and blue in their resume and still have to hunt for it. Pointing
 * at a term anywhere on the screen now lifts every instance of that term in BOTH panes and fades
 * the rest, so the answer to "where does my resume actually say this?" is one hover away.
 *
 * The state lives in context rather than in props because the resume side renders through
 * ResumeEditor -> section -> EditableHighlight, and threading a hover handler through three layers
 * that do not otherwise care about it would put the coupling in the wrong place.
 */

type HoverState = { active: string | null; setActive: (term: string | null) => void };
const TermHoverContext = createContext<HoverState>({ active: null, setActive: () => {} });

const RequirementContext = createContext<RequirementIndex>(EMPTY_REQUIREMENT_INDEX);

export function useTermHover() {
  return useContext(TermHoverContext);
}

export function RequirementProvider({
  index,
  children,
}: {
  index: RequirementIndex;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState<string | null>(null);
  const hover = useMemo(() => ({ active, setActive }), [active]);
  return (
    <RequirementContext.Provider value={index}>
      <TermHoverContext.Provider value={hover}>{children}</TermHoverContext.Provider>
    </RequirementContext.Provider>
  );
}

/**
 * One colour per meaning, and the same colour for the same meaning in both panes:
 *
 *   covered - blue. The posting asks for it and the resume says it.
 *   missing - amber. The posting asks for it and the resume does not. Only ever rendered in the JD,
 *             since a word absent from the resume has nothing there to mark.
 *   edited  - green. Litos changed this wording for this job. Different question, different hue,
 *             kept from the existing tailoring-provenance signal.
 *   unscoreable - grey, dashed. The posting asks for it and Litos could not judge it either way.
 *             Only the packet audit produces this. Before it had a colour it rendered as ordinary
 *             prose, so "we could not check this" and "this sentence asks for nothing" looked
 *             identical, and a student reading an all-blue posting had no way to know a
 *             requirement had gone unexamined. Dashed rather than dotted so it is not mistaken for
 *             `missing` at a glance, and grey rather than amber because it is not a gap: it is an
 *             absence of knowledge, which is a different claim.
 */
const TONE_CLASS: Record<MarkTone, string> = {
  covered: "bg-brand-soft text-brand-ink",
  missing: "bg-warn-soft text-warn underline decoration-dotted underline-offset-2",
  edited: "border-b-2 border-positive bg-positive-soft text-positive",
  unscoreable: "bg-panel-soft text-muted underline decoration-dashed underline-offset-2",
};

/** Spoken meaning of each tone, so the marking is not carried by colour alone. */
const TONE_LABEL: Record<MarkTone, string> = {
  covered: "asked for by this job, and on your resume",
  missing: "asked for by this job, not on your resume",
  edited: "wording Litos changed for this job",
  unscoreable: "asked for by this job, Litos could not check it",
};

export function TermMark({
  term,
  tone,
  children,
}: {
  term: string;
  tone: MarkTone;
  children: React.ReactNode;
}) {
  const { active, setActive } = useTermHover();
  const isActive = active === term;
  // Dim the others only while something is hovered, so the resting state stays readable.
  const dimmed = active !== null && !isActive;
  return (
    <mark
      // Focusable, because the header tells the student to "point at any highlighted term" and a
      // mouse-only affordance excludes keyboard and screen-reader users from the feature entirely.
      // GapChip already does this; the marks were the half that got left behind.
      tabIndex={0}
      role="button"
      aria-label={`${children}, ${TONE_LABEL[tone]}`}
      onMouseEnter={() => setActive(term)}
      onMouseLeave={() => setActive(null)}
      onFocus={() => setActive(term)}
      onBlur={() => setActive(null)}
      className={[
        "rounded px-0.5 transition-opacity",
        TONE_CLASS[tone],
        isActive ? "ring-2 ring-ink/25 font-semibold" : "",
        dimmed ? "opacity-40" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </mark>
  );
}

/**
 * Render text with requirement highlighting.
 *
 * `editedTerms` is the legacy provenance set, passed through for the resume pane only.
 * `hideMissing` is set on the resume side: a "missing" requirement cannot legitimately appear
 * there, and if the text happens to contain the word anyway the scorer would have counted it as
 * covered, so marking it amber would contradict the number.
 */
export const RequirementText = memo(function RequirementText({
  text,
  editedTerms,
  hideMissing = false,
}: {
  text: string;
  editedTerms?: ReadonlySet<string>;
  hideMissing?: boolean;
}) {
  const index = useContext(RequirementContext);
  const decodedText = useMemo(() => decodeHtmlEntities(text), [text]);
  const segments = useMemo(
    () => segmentText(decodedText, index, editedTerms),
    [decodedText, index, editedTerms],
  );
  return (
    <>
      {segments.map((segment, i) =>
        segment.kind === "mark" && !(hideMissing && segment.tone === "missing") ? (
          <TermMark key={i} term={segment.term} tone={segment.tone}>
            {segment.text}
          </TermMark>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
});

/** Swatch fills, spelled out rather than derived from TONE_CLASS. Taking the first class off the
 *  tone string worked for the two tones whose first class is a background and produced a bare
 *  "border-b-2" for the edited tone, which rendered as an unfilled dark blob. */
const SWATCH_CLASS: Record<MarkTone, string> = {
  covered: "bg-brand-soft ring-1 ring-brand/40",
  missing: "bg-warn-soft ring-1 ring-warn/40",
  edited: "bg-positive-soft ring-1 ring-positive/40",
  unscoreable: "bg-panel-soft ring-1 ring-border",
};

/** The legend. Swatches stated as what the colour means rather than as a colour name. */
function Swatch({ tone, label }: { tone: MarkTone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded-[3px] ${SWATCH_CLASS[tone]}`} />
      <span className="text-[11px] text-muted">{label}</span>
    </span>
  );
}

/**
 * missingCount is null when no gap count was measured - the posting was not scorable, or a packet
 * audit came back without a single scored clause. Claiming "(0)" gaps in either case asserts a
 * measurement that never happened, so null carries its own wording rather than a number. A bare
 * "asked for, not on your resume" was still wrong: it is the same sentence a genuine zero would
 * write, so it reads as an all-clear, which is exactly the failure this label exists to avoid.
 * "(not counted)" sits in the same parenthesis the number would have occupied, so the two states
 * are read in the same place rather than by noticing an absence.
 *
 * THE THIRD SWATCH IS CONDITIONAL, because on 83 of 85 production packets there is no green on the
 * page for it to name. Measured 2026-08-09: `_review.edited_terms` exists on all 85 and is non-empty
 * on two, so 97.6% of the time this legend defined a colour the student would never see, next to two
 * that are everywhere. A legend is a promise about what the marks mean, and a swatch for a colour
 * that is not there reads as "you missed something".
 *
 * THE PRODUCER IS NOT BROKEN AND THAT WAS CHECKED, not assumed, before the legend was touched.
 * deriveEditedTerms was re-run over all 85 packets against the live experience bank and reproduced
 * the two stored results exactly. Of 903 rendered bullets, 813 are byte-identical to a stored bank
 * variant and ZERO come from outside the default prefix, which is the only shape a SELECTION edit
 * can be attributed to this job; every bank entry holds at most as many variants as the packet
 * renders, so there was no choice to make. That is the finding applicationReview.ts already records
 * in its own words - "tailoring below the skills line is not rewriting, it is CHOOSING which of the
 * student's own phrasings to put on this page" - and green is therefore rare BY NATURE rather than
 * missing by defect. When a packet does have edits, the swatch appears and means what it says.
 */
/**
 * THE LABELS HAVE TO NAME THE PANE THE COLOUR IS ACTUALLY IN, and that pane changes with the mode.
 *
 * In draft mode both panes are live text and both carry marks, so "on your resume" is literally
 * true: the student can point at a blue term in the posting and watch the matching words light up
 * in their resume beside it.
 *
 * In exact-packet mode the resume pane is a rasterised PDF. A canvas cannot carry a mark, so every
 * colour on the screen is in the job description alone, and "and on your resume" promised a second
 * half that does not exist: the student was invited to look for a blue word in an image. In that
 * mode the marks mean something narrower and more accurate anyway, which is what these labels now
 * say: the audit found frozen evidence in the packet for this requirement, or it did not, or it
 * could not tell. The evidence itself is printed clause by clause in the breakdown below the
 * posting, which is where "where does my resume say this?" is answered in that mode.
 */
export type LegendMode = "draft" | "packet";

const LEGEND_COPY: Record<LegendMode, { covered: string; missing: string; unscoreable: string }> = {
  draft: {
    covered: "asked for, and on your resume",
    missing: "asked for, not on your resume",
    unscoreable: "asked for, Litos could not check it",
  },
  packet: {
    covered: "asked for, and evidenced in your packet",
    missing: "asked for, no evidence in your packet",
    unscoreable: "asked for, Litos could not check it",
  },
};

/** "(3)" when a count was measured, "(not counted)" when it was not. Never a bare label: a bare
 *  label is the same sentence a genuine zero writes. */
function withCount(label: string, count: number | null) {
  return count === null ? `${label} (not counted)` : `${label} (${count})`;
}

export function MatchLegend({
  missingCount,
  editedCount = 0,
  unscoreableCount = 0,
  mode = "draft",
}: {
  missingCount: number | null;
  editedCount?: number;
  unscoreableCount?: number;
  mode?: LegendMode;
}) {
  const copy = LEGEND_COPY[mode];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <Swatch tone="covered" label={copy.covered} />
      <Swatch tone="missing" label={withCount(copy.missing, missingCount)} />
      {/* Conditional for the same reason the edited swatch is: only the packet audit can produce an
          unscoreable verdict, so in draft mode this colour is never on the page to name. */}
      {unscoreableCount > 0 && <Swatch tone="unscoreable" label={withCount(copy.unscoreable, unscoreableCount)} />}
      {editedCount > 0 && <Swatch tone="edited" label="wording Litos changed for this job" />}
    </div>
  );
}
