import { api } from "@/lib/api";
import type { ResumeSpec } from "@/lib/api";
import type { JdMatchResponse } from "../domain/match-model";
import { ACTIVE_BOARD_STAGES } from "../domain/board-stages";
/* Every response below that a component MAPS OVER goes through response-shape.ts on the way out.
   That file is the single parse boundary for this feature: it is the only place a wire shape is
   checked, so a `?? []` is never needed at a call site and the next component to read one of these
   fields inherits the guard instead of having to remember it. See its header for which fields are
   required, which are defaulted, and why the difference matters. */
import {
  normalizeBoard,
  normalizeFunnel,
  normalizeGapEvidence,
  normalizeInterviewPrep,
  normalizeRequirements,
  normalizeResumeHealth,
  setPartialPayloadReporter,
} from "./response-shape";
import { track } from "@/lib/analytics";

/* Wired here rather than inside response-shape.ts so that module stays dependency-free. Runs once
   on import, and `track` is a no-op without a window, so this is safe on the server too. */
setPartialPayloadReporter((endpoint, fields) => {
  track("api_payload_incomplete", { endpoint, fields: fields.join(",") });
});

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

/**
 * What the backend already knows about the posting, and so must not score the student against.
 *
 * `job_id` earns its place here: the backend excludes the posting's own offices from the
 * requirement set, and a packet stores no location, so without the id the review screen scores
 * with the employer's cities in the denominator and on the missing list. Sending the id lets the
 * backend read the live job row, which also covers every packet built before this existed.
 * Absent for packets from the extension or a hand-typed link, which point at no monitored posting.
 */
export type JobContext = { company?: string; role?: string; job_id?: string | null };

/**
 * `jdText` is NULL when the caller wants the server to read the posting itself.
 *
 * GET /jobs sends `left(description, 600)`, a preview sized for a list row, and a caller that
 * scores the preview is scoring six hundred characters of company blurb: two or three requirement
 * terms, under MIN_SCORABLE_TERMS, unscorable. That shipped on 2026-08-04 and the dashboard drew no
 * number at all until a check on a real account caught it. A list must therefore pass null and let
 * the route load the full description from the job row (it needs `job_context.job_id` to do so).
 *
 * Pass a STRING only when you hold text the server does not: the review screen, whose packet
 * carries the JD captured when the resume was tailored to it. The live row may have been edited
 * since, and that screen's number has to be about the document the resume was written against.
 */
export async function fetchJdMatch(
  jdText: string | null,
  resumeText: string,
  jobContext?: JobContext,
): Promise<JdMatchResponse> {
  return api<JdMatchResponse>("/jd-match", {
    method: "POST",
    body: JSON.stringify({
      // Omitted entirely rather than sent as null: the route's schema treats absent as "read the
      // posting yourself" and would reject an explicit null.
      ...(jdText === null ? {} : { jd_text: jdText }),
      resume_text: resumeText,
      job_context: jobContext,
    }),
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
  return normalizeGapEvidence(
    await api<unknown>("/jd-match/evidence", {
      method: "POST",
      body: JSON.stringify({ terms, resume_text: resumeText }),
    }),
  );
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
  return normalizeResumeHealth(
    await api<unknown>("/resume/health", {
      method: "POST",
      body: JSON.stringify({ spec }),
    }),
  );
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
  return normalizeFunnel(await api<unknown>(`/metrics/funnel?tz_offset=${offset}`));
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
  /* The client's own canonical stage list is the fallback when the backend omits `stages`. See
     normalizeBoard for why deriving the columns from the cards was worse than useless. */
  return normalizeBoard(await api<unknown>("/applications/board"), ACTIVE_BOARD_STAGES);
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
  return normalizeInterviewPrep(
    await api<unknown>("/interview-prep", {
      method: "POST",
      body: JSON.stringify({ jd_text: jdText, spec, job_context: jobContext }),
    }),
  );
}

/**
 * The requirement-by-requirement breakdown, for the REVIEW SCREEN ONLY.
 *
 * Costs one model call the first time a posting is read against a resume and nothing on every read
 * after, because the backend caches on (clause, bullets). Never called from a list: putting it on a
 * surface that fans out to 24 rows is the cost mistake the split exists to avoid.
 *
 * Answers what the score alone cannot. Measured over 600 live postings, the term scorer sees only
 * the 34.6% of requirement clauses that name a technology; the rest - a degree in the right field,
 * years of experience, communicating with partners - were invisible, and they are
 * disproportionately the ones a student MEETS.
 */
export type RequirementVerdict = "met" | "unmet" | "unscoreable";

export type RequirementClauseView = {
  text: string;
  verdict: RequirementVerdict;
  basis: "terms" | "degree" | "graduation" | "experience-years" | "competency" | "none";
  /** The student's own bullet when met, or what is missing when not. */
  evidence: string | null;
  missing_terms: string[];
};

export type RequirementsResponse = {
  /**
   * True when the model could not be reached, so competency clauses are unscoreable because we
   * never got an answer rather than because nothing could decide them.
   *
   * The backend cannot express that in `verdict` alone: `unscoreable` already means "no test a
   * resume can pass", which is right for "you stay curious" and a lie about "communicate nuance to
   * partners" when a rate limit stopped us asking. Told, not inferred: a null score also happens on
   * a perfectly healthy posting whose every clause is a disposition.
   */
  degraded?: boolean;
  score: number | null;
  scored: number;
  met: number;
  clauses: RequirementClauseView[];
  /** How many clauses needed a model call this time. Zero on a repeat view. */
  judged: number;
  from_cache: number;
  /** Verdicts the backend threw out for not quoting a real bullet. Non-empty means a bad run. */
  rejected: string[];
};

export async function fetchRequirements(
  jdText: string | null,
  spec: ResumeSpec | undefined,
  jobContext?: JobContext,
): Promise<RequirementsResponse> {
  return normalizeRequirements(
    await api<unknown>("/jd-match/requirements", {
      method: "POST",
      body: JSON.stringify({
        ...(jdText === null ? {} : { jd_text: jdText }),
        ...(spec ? { spec } : {}),
        job_context: jobContext,
      }),
    }),
  );
}
