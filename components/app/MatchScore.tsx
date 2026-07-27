"use client";

import { useEffect, useState } from "react";
import { fetchJdMatch, resumeSpecText, type JdMatchResponse } from "@/lib/jd-match";
import type { ResumeSpec } from "@/lib/api";
import { useTermHover } from "./RequirementText";

/**
 * The single number the review screen leads with: how much of what this posting actually asks for
 * is on this resume.
 *
 * It recomputes as the student edits the resume, which is the behaviour reviewers of Teal and Rezi
 * single out as the reason those products are worth opening. The spec passed in should already be
 * deferred by the caller so typing does not fire a request per keystroke.
 *
 * THREE THINGS THIS DELIBERATELY DOES NOT DO:
 *
 *  - It does not render a number when the backend says the posting is not scorable. A posting with
 *    no listed requirements gets the explanation instead. Showing 0 there would read as "your
 *    resume is a total mismatch" when the truth is "this posting did not say what it wants".
 *  - It does not colour a low score as a failure. The bands come from the backend, which calibrates
 *    them against what this scorer actually produces rather than against Jobscan's 75-80% advice,
 *    which is computed over a completely different denominator.
 *  - It does not claim the score predicts an interview. Jobscan's most common complaint in its own
 *    review corpus is users hitting 80%+ and hearing nothing, because an ATS score is not a
 *    recruiter. The caption says what the number counts, and stops there.
 */
export function MatchScore({
  jdText,
  spec,
  onResult,
}: {
  jdText: string;
  spec: ResumeSpec;
  /** Hands the whole result up so the parent can drive both panes' highlighting and the gap list
   *  from ONE request. Passing only `missing` meant the JD pane had no way to know which terms
   *  were covered, and it fell back to highlighting every word of the resume. */
  onResult?: (result: JdMatchResponse) => void;
}) {
  const [result, setResult] = useState<JdMatchResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const resumeText = resumeSpecText(spec);
    if (!jdText.trim() || !resumeText.trim()) return;
    fetchJdMatch(jdText, resumeText)
      .then((next) => {
        if (cancelled) return;
        // Cleared here rather than before the request: resetting synchronously inside the effect
        // triggers a cascading render on every keystroke-driven recompute.
        setFailed(false);
        setResult(next);
        onResult?.(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // onResult is intentionally not a dependency: callers pass an inline closure, and including it
    // would refire the request on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jdText, spec]);

  if (failed) {
    return <p className="text-[11px] leading-4 text-faint">Match score unavailable</p>;
  }
  if (!result) {
    return <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-surface-alt" aria-hidden="true" />;
  }

  if (!result.scorable || result.score === null) {
    return (
      <p className="max-w-[220px] text-[11px] leading-4 text-faint">
        {result.reason ?? "This posting cannot be scored."}
      </p>
    );
  }

  const tone = result.band?.tone ?? "fair";
  const stroke =
    tone === "strong" ? "var(--color-brand)" : tone === "fair" ? "var(--color-ink)" : "var(--color-faint)";
  const r = 15.9155;

  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <p className="text-[11px] font-medium leading-4 text-ink">{result.band?.label}</p>
        <p className="text-[11px] leading-4 text-faint">
          {result.matched.length} of {result.term_count} requirements
        </p>
      </div>
      <div
        className="relative h-12 w-12 shrink-0"
        role="img"
        aria-label={`${result.score} out of 100. Your resume covers ${result.matched.length} of the ${result.term_count} requirements this job posting lists.`}
      >
        <svg aria-hidden="true" viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
          <circle cx="18" cy="18" r={r} fill="none" stroke="var(--color-surface-alt)" strokeWidth="3.5" />
          <circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={`${result.score} 100`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-semibold text-ink">
          {result.score}
        </span>
      </div>
    </div>
  );
}

/**
 * The gap list, shown under the resume. Ordered by weight, so the first chip is the requirement
 * that costs the most to be missing.
 */
export function MatchGaps({ missing }: { missing: JdMatchResponse["missing"] }) {
  if (missing.length === 0) {
    return (
      <p className="text-sm text-muted">
        Every requirement this posting lists already appears on your resume.
      </p>
    );
  }
  return (
    <div>
      <p className="text-sm text-muted">
        This posting asks for {missing.length} thing{missing.length === 1 ? "" : "s"} your resume does
        not mention. Add only what you have actually done.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {missing.map((term) => (
          <GapChip key={term.term} term={term} />
        ))}
      </ul>
    </div>
  );
}

/** A gap chip is a handle on the term, not a label. Pointing at it scrolls nothing and opens
 *  nothing; it just lights the same word up in the job description so the student can see WHERE
 *  they are being asked for it before deciding whether they have actually done it. */
function GapChip({ term }: { term: JdMatchResponse["missing"][number] }) {
  const { active, setActive } = useTermHover();
  const isActive = active === term.term;
  return (
    <li>
      <button
        type="button"
        onMouseEnter={() => setActive(term.term)}
        onMouseLeave={() => setActive(null)}
        onFocus={() => setActive(term.term)}
        onBlur={() => setActive(null)}
        className={`rounded-full border px-3 py-1 text-[13px] transition-colors ${
          isActive ? "border-warn bg-warn-soft text-warn" : "border-border text-ink"
        }`}
        title={
          term.weight >= 1
            ? "Listed under requirements"
            : "Listed as preferred or in the role description"
        }
      >
        {term.display}
      </button>
    </li>
  );
}
