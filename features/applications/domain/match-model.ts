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
