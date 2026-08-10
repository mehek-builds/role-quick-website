"use client";

import { useEffect, useState } from "react";
import { fetchInterviewPrep, type InterviewPrep as Prep } from "@/features/applications";
import type { ResumeSpec } from "@/lib/api";

/**
 * What they are going to ask, and where your answer already is.
 *
 * Every competitor ships an interview layer and every one of them generates the questions from the
 * job title, which is why reviewers of all of them describe the output as generic. These are
 * derived from requirements this posting actually states, and every answer is a bullet the student
 * actually wrote. Nothing is generated, so nothing can be invented about their life.
 *
 * THE UNANSWERED ONES ARE THE POINT. A requirement the resume does not answer is shown as a
 * question with no answer, said plainly. The night before an interview, the useful thing is not a
 * script: it is knowing which question is going to be the hard one.
 *
 * Collapsed by default. It is preparation for later, not part of reviewing the application, and
 * expanding it is the student saying they are at that stage.
 */
export function InterviewPrep({
  jdText,
  spec,
  jobContext,
}: {
  jdText: string;
  spec: ResumeSpec;
  jobContext?: { company?: string; role?: string };
}) {
  const [open, setOpen] = useState(false);
  // The request key travels WITH the answer, so staleness is derived during render rather than
  // reset from inside the effect (a synchronous setState there cascades a render).
  const [state, setState] = useState<{ prep: Prep | null; failed: boolean; key: string }>({
    prep: null,
    failed: false,
    key: "",
  });

  // Keyed on the resume's CONTENT, so the panel refetches when a bullet is edited but not on every
  // object identity change. The previous version depended on [open, jdText] only, and justified it
  // by saying the questions do not depend on a bullet's wording. They do not, but the ANSWER does:
  // the panel prints the bullet verbatim, so an edited or deleted bullet kept showing its old text
  // as "your answer", and the sibling match panel (which does recompute) disagreed with it on
  // screen.
  const specKey = JSON.stringify(spec.experience);
  const requestKey = `${jdText}::${specKey}`;
  // Anything from a previous posting or a previous edit is not this posting's answer.
  const fresh = state.key === requestKey;
  const prep = fresh ? state.prep : null;
  const failed = fresh && state.failed;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Cleared before the request. Nothing reset it, so switching to another application rendered
    // the PREVIOUS posting's questions under the new posting's text, and a failure stuck.
    fetchInterviewPrep(jdText, spec, jobContext)
      .then((prep) => !cancelled && setState({ prep, failed: false, key: requestKey }))
      .catch(() => !cancelled && setState({ prep: null, failed: true, key: requestKey }));
    return () => {
      cancelled = true;
    };
    // spec is covered by specKey; depending on the object itself would refire on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jdText, specKey, jobContext?.company, jobContext?.role]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="text-sm font-medium text-ink transition-colors hover:text-brand-ink"
      >
        {open ? "Hide interview questions" : "What they are likely to ask"}
      </button>

      {open && failed && (
        <p className="mt-3 text-[13px] text-muted">Could not prepare questions just now.</p>
      )}

      {open && !failed && !prep && (
        <div className="mt-3 h-20 animate-pulse rounded-inner bg-surface-alt" aria-hidden="true" />
      )}

      {open && prep && (
        <div className="mt-3">
          {prep.items.length === 0 ? (
            <p className="text-[13px] text-muted">
              {prep.reason ?? "This posting does not state enough requirements to prepare from."}
            </p>
          ) : (
            <>
              <p className="text-[13px] text-muted">
                {prep.unanswered > 0
                  ? `Your resume answers ${prep.answered} of these. ${prep.unanswered} it does not, and those are the hard ones.`
                  : "Your resume answers every one of these."}
              </p>
              <ul className="mt-3 space-y-2">
                {prep.items.map((item) => (
                  <li key={item.term} className="rounded-inner border border-border bg-surface px-4 py-3">
                    <p className="text-[13px] font-medium leading-5 text-ink">{item.question}</p>
                    {item.answer ? (
                      <p className="mt-1.5 border-l-2 border-brand/40 pl-2.5 text-xs leading-5 text-muted">
                        {item.answer.bullet}
                        <span className="ml-1.5 text-muted">{item.answer.org}</span>
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs leading-5 text-warn">
                        Nothing on your resume answers this. Decide what you would say before they ask.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
