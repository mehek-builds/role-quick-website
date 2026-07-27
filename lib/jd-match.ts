import { api } from "./api";
import type { ResumeSpec } from "./api";

/**
 * Client side of POST /jd-match.
 *
 * The number this returns REPLACES spec._quality.atsCoverage as the thing labelled "match" in the
 * dashboard. That old value is the engine's ats_keyword_coverage_pct, which
 * student-outreach-backend/src/engine/resumeValidate.ts documents as unusable for exactly this
 * purpose: it counts every non-stopword in the posting, so it reads 12-17% for a genuinely strong
 * resume and separates a matching posting from a mismatched one by about two points. Rendering it
 * in a ring under the word "match" told students their good resume was a 15.
 *
 * See student-outreach-backend/src/engine/jdMatch.ts for the model behind the replacement.
 */

export type JdTermView = {
  term: string;
  display: string;
  weight: number;
};

export type JdMatchResponse = {
  /** null when the posting was not scorable. Never coerce this to 0. */
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
 * Every word the resume puts on the page.
 *
 * Deliberately mirrors resumeSpecText() in the backend's engine/resumeValidate.ts. It is duplicated
 * rather than fetched because the score updates live as the student edits the resume in the
 * dashboard, and the edited spec only exists in the browser. The two copies must list the same
 * fields: if this one omits something, the student loses credit for work that is on their resume.
 *
 * Covered by lib/jd-match.test.mts, which asserts the field list matches the backend's.
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

export async function fetchJdMatch(jdText: string, resumeText: string): Promise<JdMatchResponse> {
  return api<JdMatchResponse>("/jd-match", {
    method: "POST",
    body: JSON.stringify({ jd_text: jdText, resume_text: resumeText }),
  });
}
