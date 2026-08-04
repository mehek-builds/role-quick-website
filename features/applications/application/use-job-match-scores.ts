"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MonitoredJob } from "@/lib/api";
import { getBaseResume } from "@/lib/base-resume";
import { fetchJdMatch } from "../infrastructure/applications-api";
import { resumeSpecText } from "../domain/match-model";

/**
 * THE NUMBER ON A JOB CARD, EVERYWHERE: the resume against the posting's requirement terms.
 *
 * ISSUE-014, and this is the second answer to it. The first was to make Home and Jobs agree on
 * PREFERENCE FIT, which fixed the contradiction the audit found (fit 40 on Home, 0% match on Jobs,
 * same Databricks posting, same session) by moving Jobs onto the number Home already showed. That
 * was coherent and it shipped. Mehek's call, 2026-08-03, is the other way round: the number a
 * student reads next to a job is how much of what the posting asks for is on their resume, on every
 * surface. Preference fit answers "did we pick this for you", which is a question about our
 * ranking, not about them.
 *
 * THE TWO OBJECTIONS THE FIRST ANSWER RAISED ARE REAL, AND ARE ANSWERED HERE RATHER THAN DROPPED:
 *
 *  1. "The score contradicted the line beneath it." It did: "0% match" sat over "Matches your
 *     product, San Francisco, CA, internship". That was one card printing two metrics in one
 *     vocabulary. Fixed by taking the word "match" away from the preference line, which then read
 *     "You asked for ..." on both screens; that line has since been removed from both, because it
 *     repeated the same saved search on every result. The badge is the resume and is now the only
 *     fit statement on a card. Nothing may borrow its words.
 *  2. "A bare percentage in a list has no band, no denominator, no refusal state." Also true, so
 *     this hook carries all three. The band label and the "N of M requirements" count ride along in
 *     the tooltip, and an unscorable posting resolves to `null`, which renders nothing.
 *
 * TWO RULES:
 *
 *  - NEVER PRINT A ZERO WE DID NOT MEASURE. Unscorable and request-failed both resolve to `null`.
 *    A zero says the resume matched none of the requirements; "we could not ask" is a different
 *    statement, and printing the first when the second is true is the original ISSUE-014 defect in
 *    miniature.
 *  - SCORE SEQUENTIALLY. A page holds up to 24 jobs. Firing them in parallel is a self-inflicted
 *    burst on a scoring endpoint, and top-down arrival is the order they get read in.
 */

export type JobMatch = {
  score: number;
  /** "Strong match" / "Solid match" / "Some overlap" / "Not much overlap", from the backend. */
  band: string | null;
  matched: number;
  total: number;
};

/** `null` once we know there is no number to show; absent while the request is still open. */
export type JobMatchState = Record<string, JobMatch | null>;

/** How many of the visible jobs get scored on load. Each score is one POST. */
export const SCORE_BATCH = 8;

export function useJobMatchScores(
  jobs: MonitoredJob[] | null,
  /** `false` for QA fixture renders, which have no session and must stay self-contained. */
  enabled: boolean = true,
  batchSize: number = SCORE_BATCH,
) {
  const [scores, setScores] = useState<JobMatchState>({});
  /* Ids with a request open. `scores` cannot serve as this: it is only written when a request
     SETTLES, so two overlapping loops both read "not scored yet" and both POST. The job list gets a
     new identity on every committed keystroke on Jobs and on every dismissal on Home, so
     overlapping loops are the normal case rather than the edge one. */
  const inFlight = useRef<Set<string>>(new Set());
  /* STATE, not a ref. As a ref this lost a race it lost most of the time: the scoring effect keys
     off the job list, and the resume request usually finished second, so the effect read null and
     no job on the page ever showed a number. */
  const [resumeText, setResumeText] = useState<string | null>(null);

  /* The base resume, once. Every score on a page is the same resume against a different posting,
     so fetching it per job would be the same document 24 times.

     THE BASE RESUME, NOT THE TAILORED PACKET, and that is deliberate: a list is read by comparing
     rows to each other, so every row has to be scored against the same document. The review screen
     scores the packet in front of you instead, because a number about a document you cannot see
     would be worse than no number. Same metric, stated denominator, different subject. */
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void getBaseResume()
      .then((stored) => {
        if (!cancelled && stored?.spec) setResumeText(resumeSpecText(stored.spec));
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const scoreJobs = useCallback(async (batch: MonitoredJob[], resume: string, alive: () => boolean) => {
    const wanted = batch.filter(
      (job) => scores[job.id] === undefined && !inFlight.current.has(job.id) && job.description,
    );
    if (wanted.length === 0) return;
    for (const job of wanted) inFlight.current.add(job.id);
    try {
      for (const job of wanted) {
        if (!alive()) return;
        try {
          /* job_id, not just company and role. The backend reads the posting's own offices off the
             live job row and excludes them from the requirement set; without the id a student is
             scored against the employer's cities, and the review screen (which does send it) would
             return a different number for the same posting. One definition of the number means one
             job context too. */
          /* null jd_text: the list only holds `left(description, 600)`, a preview, and scoring
             that made every posting unscorable. The route reads the full description off the job
             row via job_id. See fetchJdMatch. */
          const result = await fetchJdMatch(null, resume, {
            company: job.company_name,
            role: job.title,
            job_id: job.id,
          });
          if (!alive()) return;
          setScores((current) => ({
            ...current,
            [job.id]:
              result.scorable && result.score !== null
                ? {
                    score: result.score,
                    band: result.band?.label ?? null,
                    matched: result.matched.length,
                    total: result.term_count,
                  }
                : null,
          }));
        } catch {
          if (!alive()) return;
          setScores((current) => ({ ...current, [job.id]: null }));
        }
      }
    } finally {
      for (const job of wanted) inFlight.current.delete(job.id);
    }
  }, [scores]);

  useEffect(() => {
    if (!enabled || !jobs || !resumeText) return;
    let alive = true;
    /* react-hooks/set-state-in-effect fires on the call, not on a real synchronous setState: every
       setScores in scoreJobs sits behind `await fetchJdMatch`, so nothing is set during the effect
       body and there is no cascading render to avoid. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void scoreJobs(jobs.slice(0, batchSize), resumeText, () => alive);
    return () => {
      alive = false;
    };
    // scoreJobs closes over `scores`, which it also sets; depending on it here would re-enter on
    // every score. The batch is decided by the job list and the resume alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, resumeText, batchSize, enabled]);

  return scores;
}
