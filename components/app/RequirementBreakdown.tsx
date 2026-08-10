"use client";

import { useEffect, useState } from "react";
import { fetchRequirements, type RequirementClauseView, type RequirementsResponse } from "@/features/applications";
import type { ResumeSpec } from "@/lib/api";
import type { JobContext } from "@/features/applications";

/**
 * Every requirement this posting states, and whether the resume answers it.
 *
 * WHY THIS EXISTS BESIDE THE SCORE. The number is one figure over a denominator the student cannot
 * see. Measured over 600 live postings, the term scorer can only see the 34.6% of requirement
 * clauses that name a technology, so the other two thirds - a degree in the right field, five years
 * of something, communicating with partners - never appeared anywhere on this screen. They are also
 * disproportionately the ones a student MEETS, so their absence made the number read low in one
 * direction with nothing on screen explaining it.
 *
 * A LIST OF SENTENCES, not a second score. The student already has a number. What they cannot get
 * from it is which specific thing to fix, and the honest answer to that is the employer's own
 * sentence with the student's own bullet under it.
 *
 * MET ROWS QUOTE THE RESUME. That is not decoration: a competency verdict comes from a model, and
 * the backend rejects any verdict that cannot quote a real bullet. Showing the quote is what lets
 * the student check the judgement rather than take it. A row they disagree with is a row they can
 * argue with, which is the only reason it is safe to put a model in this path at all.
 */
export function RequirementBreakdown({
  jdText,
  spec,
  jobContext,
  disabled = false,
}: {
  /** null lets the server read the posting itself, which is what the list does. */
  jdText: string | null;
  spec: ResumeSpec;
  jobContext?: JobContext;
  /** QA fixture renders have no session, so they must not fire a scoring request. */
  disabled?: boolean;
}) {
  const [result, setResult] = useState<RequirementsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (disabled || !open || result) return;
    let cancelled = false;
    fetchRequirements(jdText, spec, jobContext)
      .then((r) => !cancelled && (setResult(r), setFailed(false)))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
    // spec is deliberately absent: re-judging on every keystroke would spend a model call per
    // character. The breakdown describes the resume as it was when the student asked for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, disabled, jdText, jobContext?.job_id]);

  if (disabled) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-brand-ink underline-offset-2 hover:underline"
      >
        What this job asks for
      </button>
    );
  }

  if (failed) {
    return <p className="text-[11px] leading-4 text-muted">We could not read this posting&apos;s requirements just now.</p>;
  }
  if (!result) {
    return <p className="text-[11px] leading-4 text-muted">Reading what this job asks for...</p>;
  }

  const scored = result.clauses.filter((c) => c.verdict !== "unscoreable");
  const met = scored.filter((c) => c.verdict === "met");
  const unmet = scored.filter((c) => c.verdict === "unmet");
  // Clauses nothing can check ("you stay curious") are counted nowhere. Saying so is better than
  // letting a student wonder why the list is shorter than the posting.
  const dropped = result.clauses.length - scored.length;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
          What this job asks for
        </p>
        <p className="text-[11px] text-muted">
          {met.length} of {scored.length} met
        </p>
      </div>

      <ul className="mt-2.5 space-y-2.5">
        {[...unmet, ...met].map((c, i) => (
          <ClauseRow key={`${c.verdict}-${i}`} clause={c} />
        ))}
      </ul>

      {/* TWO REASONS A LINE IS UNCOUNTED, and only one of them is about the posting.
          "You stay curious" is a disposition no resume can answer, which is what this copy was
          written for. But a model outage also leaves clauses uncounted, and calling those
          "about attitude" tells the student something false about the job. The backend says which
          it is; this must not guess from the count. */}
      {result.degraded ? (
        <p className="mt-3 text-[11px] leading-4 text-warn">
          We could not check {dropped === 1 ? "one requirement" : `${dropped} of these requirements`} just
          now. That is a problem on our side, not something about you or this job. Open this again in
          a minute and it should be here.
        </p>
      ) : (
        dropped > 0 && (
          <p className="mt-3 text-[11px] leading-4 text-muted">
            {dropped} more {dropped === 1 ? "line is" : "lines are"} about attitude rather than
            experience, so {dropped === 1 ? "it is" : "they are"} not counted either way.
          </p>
        )
      )}
      {/* Only when the run OTHERWISE succeeded. `rejected` now carries three different things:
          a verdict that could not be tied to a real bullet, a question the model skipped, and
          "judge unavailable". Printing "could not be traced to a line on your resume" for the last
          one blames the resume for an outage, and the degraded line above already says the true
          thing. */}
      {!result.degraded && result.rejected.length > 0 && (
        <p className="mt-2 text-[11px] leading-4 text-warn">
          {result.rejected.length} judgement{result.rejected.length === 1 ? "" : "s"} could not be
          traced to a line on your resume and {result.rejected.length === 1 ? "was" : "were"} discarded.
        </p>
      )}
    </div>
  );
}

function ClauseRow({ clause }: { clause: RequirementClauseView }) {
  const met = clause.verdict === "met";
  const priority = typeof clause.weight === "number" && clause.weight < 1 ? "Preference" : "Required";
  return (
    <li className="flex gap-2.5">
      <span
        aria-hidden="true"
        className={`mt-1.5 size-1.5 shrink-0 rounded-full ${met ? "bg-positive" : "bg-faint"}`}
      />
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">{priority}</p>
        <p className="text-xs leading-5 text-ink">
          <span className="sr-only">{met ? "Met: " : "Not met: "}</span>
          {clause.text}
        </p>
        {clause.evidence && (
          <p className="mt-0.5 text-[11px] leading-4 text-muted">
            {clause.evidence}
          </p>
        )}
        {!met && clause.missing_terms.length > 0 && (
          <p className="mt-0.5 text-[11px] leading-4 text-muted">
            missing: {clause.missing_terms.join(", ")}
          </p>
        )}
      </div>
    </li>
  );
}
