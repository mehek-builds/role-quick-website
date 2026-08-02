import { api } from "@/lib/api";
import type { ResumeSpec } from "@/lib/api";
import type { JdMatchResponse } from "../domain/match-model";

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

export type FunnelDay = { day: string; submitted: number; tailored: number };

export type FunnelSummary = {
  resumes_tailored: number;
  applications_submitted: number;
  fields_filled: number;
  submitted_this_week: number;
  days: FunnelDay[];
  too_early: boolean;
};

/** Sends the browser's UTC offset so the days are the student's days, not the server's. */
export async function fetchFunnel(): Promise<FunnelSummary> {
  const offset = -new Date().getTimezoneOffset(); // getTimezoneOffset is minutes WEST of UTC
  return api<FunnelSummary>(`/metrics/funnel?tz_offset=${offset}`);
}

// ---- F5: the pipeline board ----

export type Stage = "saved" | "applied" | "interview" | "offer" | "closed";

export type BoardCard = {
  id: string;
  /* The monitored posting this application was started from, or null. NOT the card's own id.
     Null on every application recorded before 2026-07-28 and on anything generated from the
     extension or a hand-typed link, so readers must keep a path that works without it. */
  job_id: string | null;
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
