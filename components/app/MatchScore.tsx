"use client";

import { useEffect, useState } from "react";
import { fetchJdMatch, fetchGapEvidence, resumeSpecText, MATCH_WEIGHTING_NOTE, type JdMatchResponse, type GapAnswer, type JobContext } from "@/features/applications";
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
    return <p className="text-[11px] leading-4 text-muted">We could not work out how well you fit this one</p>;
  }
  if (!result) {
    return <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-surface-alt" aria-hidden="true" />;
  }

  if (!result.scorable || result.score === null) {
    return (
      <p className="max-w-[220px] text-[11px] leading-4 text-muted">
        {result.reason ?? "We could not work out how well you fit this one."}
      </p>
    );
  }

  /* Hoisted rather than interpolated inline, because the aria-label below is read by
     match-caption-weighting and match-metric-coherence as SOURCE: both extract the template literal
     and check that every string stating the count carries MATCH_WEIGHTING_NOTE, and a nested
     template inside it defeats their parsers. Keeping the label a flat template keeps those two
     guards working, which matters more here than saving a line. */
  const unreadCount = result.clauses_unread ?? 0;
  const unreadPlural = unreadCount === 1 ? "" : "s";
  const unreadSentence = unreadCount > 0
    ? ` At least ${unreadCount} further line${unreadPlural} in this posting could not be read, so this score is drawn over part of it.`
    : "";

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
            two do not track each other exactly. See scoreBand in that file.

            THAT LAST PARAGRAPH USED TO BE TRUE ONLY IN THIS COMMENT. This is the one surface where
            a sighted student reads the count and the number at the same time without hovering
            anything: "Strong match / 2 of 4 requirements we counted" beside a ring reading 54.
            ISSUE-041. The words are unchanged, because they are correct and because this line is an
            11px column that cannot take a sentence; what is added is MATCH_WEIGHTING_NOTE on hover
            and in the ring's accessible name, which is the same affordance Jobs, Home and the
            Tracker row already use for it.

            TWO KNOWN LIMITATIONS OF THE `title` BELOW, recorded rather than solved, because solving
            either is an inline info affordance and that is a design change, not an audit fix:

              1. `title` is a NATIVE TOOLTIP THAT WAS NOT HERE BEFORE, and it is unreachable for
                 keyboard-only and touch users. So on the single surface where the count and the
                 number are both visible at once, a touch user still gets no correction. Nothing
                 shown is untrue without it - the caption is a count and says so - but the student
                 who is most able to notice the gap is the least able to reach the explanation.
              2. "that fraction", inside this attribute, DANGLES. Everywhere else the clause is
                 appended to a sentence that just stated the count, so the referent is right there;
                 alone in a title it has no antecedent. Kept anyway rather than given a second
                 wording, because two versions of one clause is the drift this constant exists to
                 prevent, and the fraction it refers to is the line the tooltip is attached to. */}
        {/* "we counted" was always literally true and was still being read as "the posting asks for
            three things". On a prose-heavy posting it is not: the extractor recognises a fraction of
            what the employer wrote, and because an unrecognised requirement leaves the numerator and
            the denominator together, failing to read one could only ever raise the score. Measured
            live 2026-08-26: this exact Databricks posting states roughly eight things and rendered
            "3 of 3 requirements we counted" beside a ring reading 100.

            So the count now says what it is drawn over, and only when there is something to say.
            "at least" is load-bearing and not hedging: splitClauses ignores lines under four words,
            so clauses_unread is a floor on what was missed rather than a total, and a caption that
            printed it as a total would be making the same kind of claim this line exists to stop. */}
        <p className="text-[11px] leading-4 text-muted" title={MATCH_WEIGHTING_NOTE}>
          {result.matched.length} of {result.term_count} requirements we counted
        </p>
        {unreadCount > 0 && (
          <p className="text-[11px] leading-4 text-muted" title={MATCH_WEIGHTING_NOTE}>
            at least {unreadCount} more line{unreadPlural} we could not read
          </p>
        )}
      </div>
      {/* The word "match" under the number, same as the Home and Jobs rings. Without it this was
          the one ring on the product that rendered a bare figure: the review header showed "8"
          beside the verdict with nothing naming what the 8 was a score of. */}
      <div className="shrink-0 text-center">
        <div
          className="relative h-12 w-12"
          role="img"
          aria-label={`${result.score} out of 100. Your resume covers ${result.matched.length} of the ${result.term_count} requirements Litos counted in this job posting.${unreadSentence} ${MATCH_WEIGHTING_NOTE}`}
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
        <p aria-hidden="true" className="mt-0.5 text-[10px] leading-3 text-muted">match</p>
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
    /* "REQUIREMENT LITOS COUNTED", not "requirement this posting lists". ISSUE-023's banned
       overclaim was shipping here in the SINGULAR, which is why every ban regex in three test
       files walked straight past it: they all matched the plural. Live on origin/main before this
       branch, and found while auditing the caption two hundred lines up that says the right thing.

       It is wrong for the reason ISSUE-023 was filed. `missing.length === 0` means every term THE
       EXTRACTOR COUNTED is covered, and that set is capped at EMPHASIS_LIMIT (12) in
       volley-backend's engine/jdMatch.ts. A posting can state requirements the extractor never
       counted, so "every requirement this posting lists" claims more than the product can know.

       AND THIS IS THE WORST PLACE IN THE PRODUCT TO OVERCLAIM, which is why it is worth copy rather
       than a comment. Every other overclaim shades a number the student keeps working against.
       This one is the state where they stop: no chips below it, nothing left to fix, so the
       sentence is the whole basis for concluding the resume is done for this posting. It has to be
       the narrower, true claim. */
    return (
      <p className="text-sm text-muted">
        Every requirement Litos counted in this posting already appears on your resume.
      </p>
    );
  }

  const byTerm = new Map((answers ?? []).map((a) => [a.term, a]));
  const supported = (answers ?? []).filter(hasOwnWording).length;

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
 * Does this answer actually carry the student's own wording?
 *
 * THREE READERS, ONE ANSWER. `unsupported` is the backend's verdict and an empty evidence list is
 * the same fact arriving a different way, now a reachable one: the parse boundary defaults a
 * missing per-answer `evidence` to [], which is right, because an answer must not be dropped
 * because its evidence list went missing, but it left three places claiming something that is not
 * there. A printed count of how many gaps their experience covers, a filled dot promising the chip
 * is worth opening, and a heading reading "This is your own wording:" over an empty list. Each is a
 * claim, and all three now ask the same question.
 */
function hasOwnWording(answer: GapAnswer): boolean {
  return !answer.unsupported && answer.evidence.length > 0;
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
  if (!hasOwnWording(answer)) {
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
            <p className="text-[11px] uppercase tracking-[0.06em] text-muted">
              {e.org}
              {e.title ? ` · ${e.title}` : ""}
            </p>
            <p className="mt-1 text-[13px] leading-5 text-ink">{e.variant}</p>
            {e.already_on_resume ? (
              <p className="mt-1.5 text-[11px] text-muted">Already on this resume.</p>
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
  const hasEvidence = answer !== undefined && hasOwnWording(answer);
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
