"use client";

import { useEffect, useState } from "react";
import { fetchJdMatch, fetchGapEvidence, resumeSpecText, type JdMatchResponse, type GapAnswer } from "@/lib/jd-match";
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
  onResult?: (result: JdMatchResponse | null) => void;
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
        if (cancelled) return;
        setFailed(true);
        setResult(null);
        // The parent drives BOTH panes' highlighting from this. Leaving the last good result in
        // place after a failure kept every mark and gap chip lit from a score that no longer
        // stands, next to a panel reading "Match score unavailable".
        onResult?.(null);
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
export function MatchGaps({
  missing,
  resumeText,
  onUseVariant,
}: {
  missing: JdMatchResponse["missing"];
  /** The resume as currently tailored, so evidence already in use can be marked. */
  resumeText: string;
  /** Called when the student accepts one of their own stored bullets. */
  onUseVariant?: (evidence: { org: string; variant: string }) => void;
}) {
  const [answers, setAnswers] = useState<GapAnswer[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const key = missing.map((m) => m.term).join("|");
  useEffect(() => {
    let cancelled = false;
    if (missing.length === 0) return;
    fetchGapEvidence(
      missing.map((m) => ({ term: m.term, display: m.display })),
      resumeText,
    )
      .then((r) => !cancelled && setAnswers(r.answers))
      .catch(() => !cancelled && setAnswers(null));
    return () => {
      cancelled = true;
    };
    // Keyed on the term list, not the array identity, so a rescore that returns the same gaps does
    // not refetch the bank.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (missing.length === 0) {
    return (
      <p className="text-sm text-muted">
        Every requirement this posting lists already appears on your resume.
      </p>
    );
  }

  const byTerm = new Map((answers ?? []).map((a) => [a.term, a]));
  const supported = (answers ?? []).filter((a) => !a.unsupported).length;

  return (
    <div>
      <p className="text-sm text-muted">
        This posting asks for {missing.length} thing{missing.length === 1 ? "" : "s"} your resume does
        not mention.{" "}
        {answers === null
          ? "Checking what you have already written."
          : supported > 0
            ? `You have already written about ${supported} of them somewhere else.`
            : "Nothing in your saved experience covers these."}
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {missing.map((term) => (
          <GapChip
            key={term.term}
            term={term}
            answer={byTerm.get(term.term)}
            expanded={open === term.term}
            onToggle={() => setOpen(open === term.term ? null : term.term)}
          />
        ))}
      </ul>
      {open && byTerm.get(open) && (
        <GapDetail answer={byTerm.get(open)!} onUseVariant={onUseVariant} />
      )}
    </div>
  );
}

/**
 * What Litos will and will not do about a gap.
 *
 * The competitive version of this (Rezi's keyword targeting, the most praised feature in its
 * review corpus) offers to GENERATE a bullet containing the missing keyword. That is a claim the
 * student used the thing, made by a model that cannot know whether they did, and it is the exact
 * defect R-015 exists to prevent.
 *
 * So the supported case offers their OWN stored wording, verbatim, and the unsupported case says
 * plainly that nothing in their experience covers it and offers nothing. The empty state is the
 * feature: it tells them what they would need to have actually done.
 */
function GapDetail({
  answer,
  onUseVariant,
}: {
  answer: GapAnswer;
  onUseVariant?: (evidence: { org: string; variant: string }) => void;
}) {
  if (answer.unsupported) {
    return (
      <div className="mt-4 rounded-[14px] border border-border bg-surface-alt px-4 py-3">
        <p className="text-sm text-ink">
          Nothing in your saved experience mentions {answer.display}.
        </p>
        <p className="mt-1 text-[13px] leading-5 text-muted">
          Litos will not write a bullet claiming you have. If you have done it, add it to your
          experience first and it will show up here.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-[14px] border border-border bg-surface-alt px-4 py-3">
      <p className="text-sm text-ink">
        You have written about {answer.display} before. This is your own wording:
      </p>
      <ul className="mt-2 space-y-2">
        {answer.evidence.slice(0, 3).map((e, i) => (
          <li key={`${e.entry_id}-${i}`} className="rounded-[10px] border border-border bg-surface px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.06em] text-faint">
              {e.org}
              {e.title ? ` · ${e.title}` : ""}
            </p>
            <p className="mt-1 text-[13px] leading-5 text-ink">{e.variant}</p>
            {e.already_on_resume ? (
              <p className="mt-1.5 text-[11px] text-faint">Already on this resume.</p>
            ) : (
              <button
                type="button"
                onClick={() => onUseVariant?.({ org: e.org, variant: e.variant })}
                className="mt-1.5 rounded-full border border-border px-3 py-1 text-[12px] font-medium text-ink transition-colors hover:border-brand"
              >
                Use this bullet
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A gap chip is a handle on the term, not a label. Pointing at it scrolls nothing and opens
 *  nothing; it just lights the same word up in the job description so the student can see WHERE
 *  they are being asked for it before deciding whether they have actually done it. */
function GapChip({
  term,
  answer,
  expanded,
  onToggle,
}: {
  term: JdMatchResponse["missing"][number];
  answer?: GapAnswer;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const { active, setActive } = useTermHover();
  const isActive = active === term.term;
  // A filled dot means their own experience already covers this, so the chip is worth opening.
  const hasEvidence = answer !== undefined && !answer.unsupported;
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded ?? false}
        onMouseEnter={() => setActive(term.term)}
        onMouseLeave={() => setActive(null)}
        onFocus={() => setActive(term.term)}
        onBlur={() => setActive(null)}
        className={`rounded-full border px-3 py-1 text-[13px] transition-colors ${
          expanded
            ? "border-ink text-ink"
            : isActive
              ? "border-warn bg-warn-soft text-warn"
              : "border-border text-ink"
        }`}
        title={
          term.weight >= 1
            ? "Listed under requirements"
            : "Listed as preferred or in the role description"
        }
      >
        {term.display}
        {hasEvidence && <span className="ml-1.5 text-positive" aria-label="you have written about this before">•</span>}
      </button>
    </li>
  );
}
