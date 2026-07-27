"use client";

import { createContext, memo, useContext, useMemo, useState } from "react";
import {
  segmentText,
  type RequirementIndex,
  type TermTone,
  EMPTY_REQUIREMENT_INDEX,
} from "@/lib/requirement-terms";

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
      onMouseEnter={() => setActive(term)}
      onMouseLeave={() => setActive(null)}
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
  const segments = useMemo(
    () => segmentText(text, index, editedTerms),
    [text, index, editedTerms],
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

/** The legend. Three swatches, stated as what the colour means rather than as a colour name. */
function Swatch({ tone, label }: { tone: TermTone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded-sm ${TONE_CLASS[tone].split(" ")[0]}`} />
      <span className="text-[11px] text-muted">{label}</span>
    </span>
  );
}

export function MatchLegend({ missingCount }: { missingCount: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <Swatch tone="covered" label="asked for, and on your resume" />
      <Swatch tone="missing" label={`asked for, not on your resume (${missingCount})`} />
      <Swatch tone="edited" label="wording Litos changed for this job" />
    </div>
  );
}
