/**
 * The fabricated account the click-path spec drives.
 *
 * Nothing here is real: no account, no posting, no token, no database row. It is kept in its own
 * module so the spec beside it reads as a list of clicks and assertions rather than as a wall of
 * JSON, and so the counts can be stated once.
 *
 * THE COUNTS ARE DISTINCT ON PURPOSE. 5 needs you, 2 ready, 4 sent, 11 reviewable in total, plus
 * one legacy packet with no review that must never be counted at all. Every filtered view therefore
 * has a unique row count, so a list that merely rendered SOMETHING cannot be mistaken for a list
 * that rendered the RIGHT something. An earlier verification on this audit used exactly this shape
 * and it is what made its results trustworthy.
 */

/** The default backend in lib/config.ts. Recognised by the spec's catch-all, never contacted. */
export const BACKEND_ORIGIN = "https://student-outreach-backend.vercel.app";

/** Fabricated. Seeded into localStorage so the dashboard's auth guard lets the page render. */
export const SESSION_TOKEN = "fixture-token-not-a-real-credential";

/** Statuses grouped exactly as features/applications/domain/application-filter.ts groups them. */
const NEEDS_YOU_STATUSES = ["needs_attention", "needs_attention", "needs_attention", "ready_for_final_approval", "failed"];
const READY_STATUSES = ["resume_ready", "questions_ready"];
const SENT_STATUSES = ["submitted", "submitted", "submitted", "submitted"];

export const COUNTS = { action: NEEDS_YOU_STATUSES.length, ready: READY_STATUSES.length, submitted: SENT_STATUSES.length };
export const REVIEWABLE_TOTAL = COUNTS.action + COUNTS.ready + COUNTS.submitted;

function packet(key, status) {
  return {
    id: `fixture-packet-${key}`,
    job_context: { company: `Fixture Company ${key}`, role: `Fixture Role ${key}`, jd_hash: `hash-${key}` },
    resume_object_key: `fixture/${key}`,
    created_at: "2026-07-21T12:00:00.000Z",
    download_url: "#",
    spec: {
      school: "Fixture University",
      degree: "B.S. Fixture Studies",
      grad_date: "May 2027",
      education_position: "top",
      experience: [],
      skills: [],
      _review: {
        jd_text: `Fixture job description ${key}.`,
        portal_url: "https://jobs.example.com/fixture",
        ats_name: "Greenhouse",
        status,
        edited_terms: [],
        questions: [],
        skipped_reasons: [],
        updated_at: "2026-07-21T12:00:00.000Z",
        ...(status === "submitted" ? { submitted_at: "2026-07-21T12:30:00.000Z" } : {}),
      },
    },
  };
}

export const RESUMES = [
  ...NEEDS_YOU_STATUSES.map((status, i) => packet(`needs-${i}`, status)),
  ...READY_STATUSES.map((status, i) => packet(`ready-${i}`, status)),
  ...SENT_STATUSES.map((status, i) => packet(`sent-${i}`, status)),
  /* No _review, so reviewablePackets drops it. Present so "11 of 11" on an unfiltered board is a
     real filter result rather than "everything the fixture returned". */
  {
    id: "fixture-packet-legacy",
    job_context: { company: "Fixture Legacy", role: "Legacy Role" },
    resume_object_key: "fixture/legacy",
    created_at: "2026-06-01T12:00:00.000Z",
    download_url: "#",
    spec: { school: "Fixture University", experience: [], skills: [] },
  },
];

export const ME = {
  email: "fixture@example.invalid",
  is_guest: false,
  tier: "pro",
  trial_ends_at: null,
  usage: { contacts: { used: 0, limit: 100 }, drafts: { used: 0, limit: 100 }, resumes: { used: REVIEWABLE_TOTAL, limit: 100 } },
  checkout_available: false,
};

const TARGETING = {
  categories: ["software"],
  titles: ["Software Engineer Intern"],
  role_types: null,
  locations: null,
  remote_only: false,
  primary_period: null,
  backup_period: null,
};

const PROFILE = { full_name: "Fixture Student", skills: [], target_roles: [] };

export const BOOTSTRAP = {
  schema_version: 1,
  me: ME,
  /* Zero matched jobs on purpose. The Overview band this spec is about does not need any, and an
     empty feed keeps company-logo lookups (the one server-side external fetch this page can make)
     out of the run entirely. */
  jobs: { jobs: [] },
  targeting: TARGETING,
  profile: PROFILE,
  resume_history: { resumes: RESUMES },
  application_profile: {},
  outreach: [],
  onboarding: { automatic_submission_enabled: false },
  warnings: [],
};

/**
 * What the stubbed backend answers, by pathname.
 *
 * Exhaustive for the two routes this spec drives. A path arriving here that is not listed is
 * recorded and fails the last case, so the stub can never silently start answering `{}` to
 * something the pages actually depend on.
 */
export const STUB = {
  "/dashboard/bootstrap": BOOTSTRAP,
  "/me": ME,
  "/v1/meta": { product: "litos" },
  /* Momentum renders this directly and maps over `days`. An empty object here crashes the Overview
     band into its error boundary, which is how the first run of this spec failed. */
  "/metrics/funnel": {
    resumes_tailored: REVIEWABLE_TOTAL,
    applications_submitted: COUNTS.submitted,
    fields_filled: 0,
    submitted_this_week: COUNTS.submitted,
    too_early: false,
    days: Array.from({ length: 14 }, (_, i) => ({ day: `d-${13 - i}`, submitted: 0, tailored: 0 })),
  },
  "/resume/history": { resumes: RESUMES },
  "/resume/base": {},
  "/jobs": { jobs: [] },
  "/profile": PROFILE,
  "/profile/application": {},
  "/profile/targeting": TARGETING,
  /* Two arrays, not one. The Tracker's board reads `stages` and `cards` separately and filters both
     on render, so an object with either key missing takes the whole route into its error boundary. */
  "/applications/board": { stages: [], cards: [] },
  "/track/events": [],
  "/onboarding/state": { automatic_submission_enabled: false },
};
