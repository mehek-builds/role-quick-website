import type { ResumeSpec } from "@/lib/api";

export type JdTermView = {
  term: string;
  display: string;
  weight: number;
};

export type JdMatchResponse = {
  /** Null when the posting was not scorable. Never coerce this to zero. */
  score: number | null;
  scorable: boolean;
  reason?: string;
  band: { label: string; tone: "strong" | "fair" | "weak" } | null;
  term_count: number;
  min_scorable_terms: number;
  matched: JdTermView[];
  missing: JdTermView[];
};

/**
 * Why the badge is not `matched` divided by `total`, said once so four surfaces cannot drift.
 *
 * ISSUE-041. Measured live on 2026-08-04: Databricks' "Product Management Intern (Summer 2027)"
 * rendered a `54% match` badge whose own tooltip read "your resume covers 2 of the 4 requirements
 * Litos counted in this posting". Two of four is fifty. A student who divides gets a different
 * number from the one they are looking at, and the sentence is positioned as the explanation OF
 * that number.
 *
 * THE TWO ARE DIFFERENT ARITHMETIC, and both are true. volley-backend's engine/jdMatch.ts scores
 * WEIGHTED coverage: every extracted requirement carries its section's weight (1 under a
 * requirements heading, 0.7 under responsibilities, 0.6 under a preferred block, 0.4 in unlabelled
 * prose) and the score is covered weight over total weight. The caption is an UNWEIGHTED count of
 * the same terms. That posting extracts four terms of total weight 3.7, so two weight-1 terms give
 * 2 / 3.7 = 54 beside a caption of 2 of 4. The scorer's own docblock has said this in the negative
 * since ISSUE-023 ("the caption cannot be used to predict the band, and neither number is wrong");
 * what it never did was say it to the student.
 *
 * HOW FAR APART THEY CAN GET, because a four-point gap would not have been worth copy. Weights run
 * 1 down to 0.4 and the term set runs 4 to 12 (MIN_SCORABLE_TERMS to EMPHASIS_LIMIT), so the worst
 * case is every covered term at 1 and every missed one at 0.4, or the reverse: "5 of 12" is a
 * caption reading 42% beside a badge of 64, and "7 of 12" is a caption reading 58% beside a badge
 * of 36. Brute-forced over every n from 4 to 12, the maximum gap is 22.67 points, reached at n of
 * 6, 9 and 12. "4 of 12" beside a badge of 56 is reachable AND can be labelled Strong match: four
 * covered terms all `required` gives required_coverage 4/4, clear of REQUIRED_COVERAGE_GATE, and 56
 * clears BAND_STRONG.
 *
 * A NARROWER MIX IS STILL WORTH COPY. Where a posting only mixes 1 with 0.7, which is the common
 * shape (a requirements block plus a responsibilities block), the badge-versus-caption gap maxes at
 * 9.3 points. Do not confuse that quantity with the backend docblock's "5 of 12 is 46 or 32", which
 * is the spread between two possible BADGES for one caption, not the gap between a badge and its
 * caption. Both matter and they are different measurements. (That 32 is quoted as the source
 * writes it and is itself wrong: on its own fixture of eight terms at weight 1 and four at 0.7,
 * total 10.8, the lowest "5 of 12" is 3.8 / 10.8 = 35. Pre-existing over there, not corrected here,
 * because that file belongs to another session this round.)
 *
 * WHY A CLAUSE RATHER THAN A NEW NUMBER. Restating the weighted share in words would print the
 * badge twice, and the count is the fact the student can act on: it is the size of the gap list
 * below it. So both facts stay and the relationship between them stops being left to inference.
 *
 * IT MAY NOT SAY "requirements this posting lists". That wording is ISSUE-023's overclaim, banned
 * and pinned, because the extractor's set is capped at EMPHASIS_LIMIT and is not the employer's
 * stated set. This clause talks about how the counted set is weighted, never about its completeness.
 *
 * IT IS ALSO HELD TO tests/vocabulary.js's BAR, which is a ten-year-old with intermediate English
 * who understands the job market. The first draft ended "so the score is weighted coverage rather
 * than that fraction", and "weighted coverage" is a modeling noun doing the half of the work that
 * actually explains the thing. It passed the gate only because it was not on the RETIRED list,
 * which is not the same as meeting the bar. "Counts for more" carries it at the reading level.
 *
 * THE FOUR WEIGHT TIERS ARE COMPRESSED TO TWO on purpose. A tooltip that enumerated 1, 0.7, 0.6 and
 * 0.4 would be a spec, and the student's question is only ever "why is that not the fraction".
 */
export const MATCH_WEIGHTING_NOTE =
  "Requirements the posting listed as required count for more than ones it only mentions in passing, so the score is not that fraction.";

/**
 * What the Tracker's next-best-match row has to ask for, so its number is the SAME number Home and
 * Jobs print beside the same posting.
 *
 * ISSUE-038. Measured live on 2026-08-04: psiquantum's "Intern, Quantum Architecture" read 33 on
 * Home and 42% match on this row, same session, minutes apart. The posting extracts 12 terms, so
 * 4/12 and 5/12 is exactly what the two documents produce: Home scores the BASE RESUME, and this
 * row was scoring the TAILORED PACKET, which by construction covers more of the posting. Databricks
 * agreed across both screens at the time, but only by coincidence: it extracts 4 terms of total
 * weight 3.7, so 1/3.7 = 27 either way until tailoring covers one more term.
 *
 * WHY THE REVIEW SCREEN'S CARVE-OUT DOES NOT REACH HERE. use-job-match-scores.ts scores the packet
 * on the review screen because "a number about a document you cannot see would be worse than no
 * number" - the packet is on screen there. This row shows a logo, a role, a company and a
 * percentage. There is no document, so the only reading available to a student is the one every
 * other job card teaches them: how much of what this posting asks for is on their resume.
 *
 * The same argument answers the requirement-score version of this row (2026-08-04, e8cd657), which
 * aimed the row at the breakdown a student sees on opening the packet. That made the row agree with
 * a collapsed list further down the review screen while disagreeing with the ring at the top of it
 * AND with Home, which is one fewer surface in agreement, not one more.
 *
 * NULL jd_text WHENEVER THERE IS A job_id, which fixes a second, quieter divergence: the packet's
 * jd_text is FROZEN at the moment the resume was tailored, while Home scores the live posting. Once
 * a posting is re-scraped those are different documents. The frozen snapshot stays as the fallback
 * for packets that point at no monitored posting, from the extension or a hand-typed link.
 *
 * WHAT THIS DOES NOT FIX, STATED PLAINLY BECAUSE IT IS A DELIBERATE TRADE AND NOT AN OVERSIGHT.
 * The divergence is RELOCATED, not eliminated. Clicking this row opens the review screen, whose
 * MatchScore ring scores the TAILORED PACKET against the packet's FROZEN jd_text, so a student who
 * clicks through still watches the number change: measured 2026-08-04, the row read 33 and the ring
 * it opened into read "50 out of 100, your resume covers 5 of the 10 requirements".
 *
 * That is a better position than the one before it, and it is chosen rather than settled for. Two
 * surfaces agreed before (Home and Jobs, with the row and the review screen each off on their own);
 * three agree now. The remaining disagreement is also the DEFENSIBLE one: the review screen has the
 * resume it scored on screen beside the number, so the number can be interrogated there. This row
 * has no document at all, which is the whole reason it had to move.
 *
 * Closing the last gap means deciding what the review screen's ring is FOR, which is a product
 * question about whether a student wants "how you compare on the board" or "how this tailored
 * resume reads against this posting", both on one screen. It is not a bug to be fixed quietly here.
 */
export type NextMatchScoreRequest = {
  /** Null asks the server to read the live posting row. See fetchJdMatch. */
  jdText: string | null;
  resumeText: string;
  /* Structural rather than the infrastructure layer's JobContext: domain may not import infra. */
  jobContext: { company?: string; role?: string; job_id?: string | null };
};

export function nextMatchScoreRequest(
  packet: {
    job_context: { company?: string; role?: string; job_id?: string | null };
    spec: { _review?: { jd_text?: string | null } | null };
  } | null | undefined,
  /** The base resume, the same document the list surfaces score against. Null while it loads. */
  baseResumeText: string | null | undefined,
): NextMatchScoreRequest | null {
  if (!packet || !baseResumeText || !baseResumeText.trim()) return null;
  const jobId = packet.job_context.job_id ?? null;
  const snapshot = packet.spec._review?.jd_text?.trim() ? packet.spec._review.jd_text : null;
  // Nothing to score against: no live posting to read and no captured description either.
  if (!jobId && !snapshot) return null;
  return {
    jdText: jobId ? null : snapshot,
    resumeText: baseResumeText,
    jobContext: {
      company: packet.job_context.company,
      role: packet.job_context.role,
      job_id: jobId,
    },
  };
}

/**
 * Every word the resume puts on the page.
 *
 * Deliberately mirrors resumeSpecText() in the backend's engine/resumeValidate.ts. It is duplicated
 * rather than fetched because the score updates live as the student edits the resume in the
 * dashboard, and the edited spec only exists in the browser. The two copies must list the same
 * fields: if this one omits something, the student loses credit for work that is on their resume.
 *
 * Covered by the applications feature tests, which assert the field list matches the backend's.
 */
export function resumeSpecText(spec: ResumeSpec): string {
  return [
    spec.target_role ?? "",
    spec.school,
    spec.degree,
    spec.grad_date,
    spec.coursework,
    ...spec.experience.flatMap((entry) => [entry.org, entry.title, entry.date_range, ...entry.bullets]),
    ...spec.skills,
  ].join(" ");
}
