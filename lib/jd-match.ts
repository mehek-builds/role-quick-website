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

export type JobContext = { company?: string; role?: string };

export async function fetchJdMatch(
  jdText: string,
  resumeText: string,
  jobContext?: JobContext,
): Promise<JdMatchResponse> {
  return api<JdMatchResponse>("/jd-match", {
    method: "POST",
    body: JSON.stringify({ jd_text: jdText, resume_text: resumeText, job_context: jobContext }),
  });
}

// ---- F2: what to do about a gap ----

export type GapEvidence = {
  term: string;
  entry_id: string;
  org: string;
  title: string | null;
  /** The student's own phrasing, verbatim. Never generated. */
  variant: string;
  already_on_resume: boolean;
};

export type GapAnswer = {
  term: string;
  display: string;
  evidence: GapEvidence[];
  /** Nothing in their experience bank mentions this. The UI says so and offers nothing. */
  unsupported: boolean;
};

/**
 * Ask what the student has actually done about each missing requirement.
 *
 * Separate from fetchJdMatch on purpose: the score recomputes as they type, this reads the whole
 * experience bank, and the question is only asked once, when they look at the gap list.
 */
export async function fetchGapEvidence(
  terms: { term: string; display: string }[],
  resumeText: string,
): Promise<{ answers: GapAnswer[] }> {
  return api<{ answers: GapAnswer[] }>("/jd-match/evidence", {
    method: "POST",
    body: JSON.stringify({ terms, resume_text: resumeText }),
  });
}

// ---- F3: the resume health check ----

export type HealthFinding = {
  rule: string;
  severity: "fix" | "consider";
  title: string;
  action: string;
  org?: string;
  bullet?: string;
};

export type ResumeHealth = {
  findings: HealthFinding[];
  bullet_count: number;
  quantified_count: number;
};

/** Checks the spec ON SCREEN, not the last one saved, so the panel describes what they can see. */
export async function fetchResumeHealth(spec: ResumeSpec): Promise<ResumeHealth> {
  return api<ResumeHealth>("/resume/health", {
    method: "POST",
    body: JSON.stringify({ spec }),
  });
}

// ---- F4: the student's own funnel ----

export type FunnelWeek = { week_start: string; submitted: number; tailored: number };

export type FunnelSummary = {
  resumes_tailored: number;
  applications_submitted: number;
  fields_filled: number;
  submitted_this_week: number;
  weeks: FunnelWeek[];
  too_early: boolean;
};

/** Sends the browser's UTC offset so the weeks are the student's weeks, not the server's. */
export async function fetchFunnel(): Promise<FunnelSummary> {
  const offset = -new Date().getTimezoneOffset(); // getTimezoneOffset is minutes WEST of UTC
  return api<FunnelSummary>(`/metrics/funnel?tz_offset=${offset}`);
}

// ---- F5: the pipeline board ----

export type Stage = "saved" | "applied" | "interview" | "offer" | "closed";

export type BoardCard = {
  id: string;
  company: string;
  role: string;
  created_at: string | null;
  moved_at: string | null;
  reviewable: boolean;
  submission_status: string | null;
  stage: Stage;
};

export async function fetchBoard(): Promise<{ stages: Stage[]; cards: BoardCard[] }> {
  return api<{ stages: Stage[]; cards: BoardCard[] }>("/applications/board");
}

export async function moveCard(id: string, stage: Stage): Promise<void> {
  await api(`/applications/${id}/stage`, { method: "PATCH", body: JSON.stringify({ stage }) });
}

// ---- F7: interview prep ----

export type PrepItem = {
  term: string;
  display: string;
  question: string;
  weight: number;
  answer?: { org: string; bullet: string };
  unanswered: boolean;
};

export type InterviewPrep = {
  items: PrepItem[];
  answered: number;
  unanswered: number;
  reason?: string;
};

export async function fetchInterviewPrep(
  jdText: string,
  spec: ResumeSpec,
  jobContext?: JobContext,
): Promise<InterviewPrep> {
  return api<InterviewPrep>("/interview-prep", {
    method: "POST",
    body: JSON.stringify({ jd_text: jdText, spec, job_context: jobContext }),
  });
}
