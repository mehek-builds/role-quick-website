"use client";

import { useEffect, useState } from "react";
import { fetchJdMatch, fetchGapEvidence, resumeSpecText, type JdMatchResponse, type GapAnswer, type JobContext } from "@/features/applications";
import type { ResumeSpec } from "@/lib/api";
import { useTermHover } from "./RequirementText";
import type { ApplyOutcome } from "@/features/applications";

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
  jobContext,
  onResult,
  disabled = false,
}: {
  jdText: string;
  spec: ResumeSpec;
  /** The posting's own company, role and id, all excluded from its requirements. The id is what
   *  lets the backend read the posting's offices off the live job row: a packet stores no location,
   *  so without it this screen scores the student against the employer's cities. */
  jobContext?: JobContext;
  /** Hands the whole result up so the parent can drive both panes' highlighting and the gap list
   *  from ONE request. Passing only `missing` meant the JD pane had no way to know which terms
   *  were covered, and it fell back to highlighting every word of the resume. */
  onResult?: (result: JdMatchResponse | null) => void;
  /** Local fixture renders do not have a backend session and must stay self-contained. */
  disabled?: boolean;
}) {
  const [result, setResult] = useState<JdMatchResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    const resumeText = resumeSpecText(spec);
    if (!jdText.trim() || !resumeText.trim()) return;
    fetchJdMatch(jdText, resumeText, jobContext)
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
  }, [disabled, jdText, spec, jobContext?.company, jobContext?.role, jobContext?.job_id]);

  if (failed) {
    return <p className="text-[11px] leading-4 text-faint">We could not work out how well you fit this one</p>;
  }
  if (!result) {
    return <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-surface-alt" aria-hidden="true" />;
  }

  if (!result.scorable || result.score === null) {
    return (
      <p className="max-w-[220px] text-[11px] leading-4 text-faint">
        {result.reason ?? "We could not work out how well you fit this one."}
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
        {/* "REQUIREMENTS WE COUNTED", not "the requirements" and not "top requirements".
            ISSUE-023 capped the denominator (volley-backend, src/engine/jdMatch.ts,
            EMPHASIS_LIMIT), because scoring against every term a 6k posting mentions measured the
            employer's word count rather than the student's fit. A long posting therefore lists more
            than term_count, so "the requirements" overclaimed and had to go.

            "Top requirements" was the first replacement and it overclaims too, just more quietly.
            It asserts these twelve are what the posting emphasises MOST, which the extractor cannot
            support on every posting. On 107 of 398 scorable postings (27%) there is no stated
            requirements section at all, so the twelve are ranked body prose. And even where a
            section IS found, what fills it can be geography: Flexport's Sales Manager yields
            `china, eu, japan, southeast asia` from a preferred block plus `ae, air, am, kansai,
            kobe, kyoto, osaka, today` from prose. Calling those top requirements is a claim about
            the employer; calling them what we counted is exactly true on every posting.

            Also note term_count is an UNWEIGHTED count while `score` is weighted coverage, so the
            two do not track each other exactly. See scoreBand in that file. */}
        <p className="text-[11px] leading-4 text-faint">
          {result.matched.length} of {result.term_count} requirements we counted
        </p>
      </div>
      <div
        className="relative h-12 w-12 shrink-0"
        role="img"
        aria-label={`${result.score} out of 100. Your resume covers ${result.matched.length} of the ${result.term_count} requirements Litos counted in this job posting.`}
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
  lastApply,
  onUndo,
}: {
  missing: JdMatchResponse["missing"];
  /** The resume as currently tailored, so evidence already in use can be marked. */
  resumeText: string;
  /** Called when the student accepts one of their own stored bullets. */
  onUseVariant?: (evidence: { org: string; variant: string }) => void;
  lastApply?: { outcome: ApplyOutcome } | null;
  onUndo?: () => void;
}) {
  // Answers are stored WITH the term list they describe, rather than cleared in the effect.
  // Clearing there is a synchronous setState inside an effect, which cascades a render on every
  // rescore; comparing keys during render gets the same staleness guarantee for free. A stale
  // answer set previously kept the detail panel open for a gap that had just been closed, still
  // offering accepts for it.
  const [state, setState] = useState<{ key: string; answers: GapAnswer[] | null; failed: boolean }>({
    key: "",
    answers: null,
    failed: false,
  });
  const [open, setOpen] = useState<string | null>(null);

  const key = missing.map((m) => m.term).join("|");
  const fresh = state.key === key;
  const answers = fresh ? state.answers : null;
  const failed = fresh && state.failed;

  useEffect(() => {
    let cancelled = false;
    if (missing.length === 0) return;
    fetchGapEvidence(
      missing.map((m) => ({ term: m.term, display: m.display })),
      resumeText,
    )
      .then((r) => !cancelled && setState({ key, answers: r.answers, failed: false }))
      // A failure is NOT the same as "no evidence". Left as null, the panel said it was still
      // checking forever and every chip lost its dot, which reads as "you have never done any of
      // this" when the truth is that we do not know.
      .catch(() => !cancelled && setState({ key, answers: null, failed: true }));
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
        {failed
          ? "We could not check your saved work just now."
          : answers === null
          ? "Checking what you have already written."
          : supported > 0
            ? `You have already written about ${supported} of them somewhere else.`
            : "Nothing in your saved work covers these."}
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
      {/* Only while the term is still a gap: after an accept closes one, its panel must go too. */}
      {open && missing.some((m) => m.term === open) && byTerm.get(open) && (
        <GapDetail answer={byTerm.get(open)!} onUseVariant={onUseVariant} />
      )}
      {lastApply && <ApplyReceipt outcome={lastApply.outcome} onUndo={onUndo} />}
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
      <div className="mt-4 rounded-card border border-border bg-surface-alt px-4 py-3">
        <p className="text-sm text-ink">
          Nothing in your saved work mentions {answer.display}.
        </p>
        <p className="mt-1 text-[13px] leading-5 text-muted">
          Litos will not write a bullet claiming you have. If you have done it, add it to your
          experience first and it will show up here.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-card border border-border bg-surface-alt px-4 py-3">
      <p className="text-sm text-ink">
        You have written about {answer.display} before. This is your own wording:
      </p>
      <ul className="mt-2 space-y-2">
        {answer.evidence.slice(0, 3).map((e, i) => (
          <li key={`${e.entry_id}-${i}`} className="rounded-inner border border-border bg-surface px-3 py-2">
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
                className="mt-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-ink transition-colors hover:border-brand"
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

/**
 * What the accept actually did, in words, with a way back.
 *
 * Accepting used to mutate the resume with no feedback: a swap removed a bullet the student never
 * saw leave, and an accept for a role not on this version of the resume did nothing at all and said
 * nothing about it. Every outcome is now stated, and the destructive one is reversible.
 */
function ApplyReceipt({ outcome, onUndo }: { outcome: ApplyOutcome; onUndo?: () => void }) {
  const body = () => {
    switch (outcome.kind) {
      case "appended":
        return `Added to your ${outcome.org} experience.`;
      case "replaced":
        return `Replaced a bullet in your ${outcome.org} experience.`;
      case "already_present":
        return `That bullet is already on this resume.`;
      case "role_not_on_resume":
        return `${outcome.org} is not on this version of your resume, so there was nowhere to put it. Add the role first.`;
      case "ambiguous_role":
        return `You have more than one role at ${outcome.org}, so Litos did not guess which one this belongs to.`;
    }
  };
  return (
    <div role="status" className="mt-4 rounded-inner border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-[13px] leading-5 text-ink">{body()}</p>
        {outcome.kind === "replaced" && onUndo && (
          <button
            type="button"
            onClick={onUndo}
            className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium text-ink transition-colors hover:border-brand"
          >
            Undo
          </button>
        )}
      </div>
      {outcome.kind === "replaced" && (
        <>
          <p className="mt-1.5 text-xs leading-5 text-muted">Removed: {outcome.removed}</p>
          {outcome.dropped.length > 0 && (
            <p className="mt-1 text-xs leading-5 text-warn">
              Your resume no longer mentions {outcome.dropped.slice(0, 5).join(", ")}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
