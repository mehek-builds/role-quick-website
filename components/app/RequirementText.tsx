"use client";

import { createContext, memo, useContext, useMemo, useState } from "react";
import {
  segmentText,
  type RequirementIndex,
  type TermTone,
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
 */
const TONE_CLASS: Record<TermTone, string> = {
  covered: "bg-brand-soft text-brand-ink",
  missing: "bg-warn-soft text-warn underline decoration-dotted underline-offset-2",
  edited: "border-b-2 border-positive bg-positive-soft text-positive",
};

/** Spoken meaning of each tone, so the marking is not carried by colour alone. */
const TONE_LABEL: Record<TermTone, string> = {
  covered: "asked for by this job, and on your resume",
  missing: "asked for by this job, not on your resume",
  edited: "wording Litos changed for this job",
};

export function TermMark({
  term,
  tone,
  children,
}: {
  term: string;
  tone: TermTone;
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
const SWATCH_CLASS: Record<TermTone, string> = {
  covered: "bg-brand-soft ring-1 ring-brand/40",
  missing: "bg-warn-soft ring-1 ring-warn/40",
  edited: "bg-positive-soft ring-1 ring-positive/40",
};

/** The legend. Three swatches, stated as what the colour means rather than as a colour name. */
function Swatch({ tone, label }: { tone: TermTone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded-[3px] ${SWATCH_CLASS[tone]}`} />
      <span className="text-[11px] text-muted">{label}</span>
    </span>
  );
}

/**
 * missingCount is null when the posting was not scorable: claiming "(0)" gaps beside a panel that
 * says the posting could not be scored asserts a measurement that never happened.
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
export function MatchLegend({ missingCount, editedCount = 0 }: { missingCount: number | null; editedCount?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <Swatch tone="covered" label="asked for, and on your resume" />
      <Swatch tone="missing" label={missingCount === null ? "asked for, not on your resume" : `asked for, not on your resume (${missingCount})`} />
      {editedCount > 0 && <Swatch tone="edited" label="wording Litos changed for this job" />}
    </div>
  );
}
