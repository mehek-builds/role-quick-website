import { createHash } from "node:crypto";
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
export const BACKEND_ORIGIN = "https://api.trylitos.com";

/** Fabricated. Seeded into localStorage so the dashboard's auth guard lets the page render. */
export const SESSION_TOKEN = "fixture-token-not-a-real-credential";

/** Statuses grouped exactly as features/applications/domain/application-filter.ts groups them. */
const NEEDS_YOU_STATUSES = ["needs_attention", "needs_attention", "needs_attention", "ready_for_final_approval", "failed"];
const READY_STATUSES = ["resume_ready", "questions_ready"];
const SENT_STATUSES = ["submitted", "submitted", "submitted", "submitted"];

export const COUNTS = { action: NEEDS_YOU_STATUSES.length, ready: READY_STATUSES.length, submitted: SENT_STATUSES.length };
export const REVIEWABLE_TOTAL = COUNTS.action + COUNTS.ready + COUNTS.submitted;

/**
 * A job description of a length a real posting actually has.
 *
 * The narrow-viewport spec needs the review screen to be TALLER THAN THE VIEWPORT, or it proves
 * nothing: a one-line description fits on a phone with room to spare, the primary action is
 * trivially on screen, and the case stays green against the very layout defect it exists to catch.
 * ~4,500 characters is the middle of the range for the postings Litos actually opens.
 */
const REALISTIC_JD_PARAGRAPH =
  "Fixture Company is hiring an engineer to build TypeScript workflow systems and accessible React interfaces. " +
  "You will partner with product teams, automate operational handoffs, write tested code, and improve application performance. " +
  "Experience with Node.js, PostgreSQL, and customer-facing product engineering is preferred. ";
export const REALISTIC_JD = REALISTIC_JD_PARAGRAPH.repeat(14).trim();

/* Ids are UUIDs, and each packet carries a submission-authority envelope.
 *
 * The dashboard stopped trusting a bare `_review.status`. `packetForSubmissionDisplay` parses an
 * envelope and routes the review through `reviewForSubmissionProjection`, which downgrades any
 * review CLAIMING sent to `needs_attention` unless the projection is confirmed for that exact
 * identity, and quarantines a packet whose envelope does not parse. Three rules bite here:
 *   1. the id must match /^[0-9a-f]{8}-.../i, so it is hashed rather than spelled;
 *   2. a confirmed projection needs a UUID canonical_application_id, never null;
 *   3. a "none" projection is only valid beside a no_evidence or safe_not_sent retry verdict.
 * Miss any one and the packet renders the needs-attention screen while its review looks fine. */
function fixtureUuid(prefix, key) {
  const h = createHash("sha256").update(`${prefix}:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export const fixturePacketId = (key) => fixtureUuid("packet", key);
const fixtureAttemptId = (key) => fixtureUuid("attempt", key);
const fixtureCanonicalId = (key) => fixtureUuid("canonical", key);

/* One revision for the packets and the board envelope. boardSubmissionAuthorityCollectionIsComplete
 * requires the collection revision on the RESPONSE and every card's authority to match it, so these
 * drifting apart takes fetchBoard into its throw and the whole board renders as failed. */
export const BOARD_AUTHORITY_REVISION = "4";

export function fixtureAuthority(key, status) {
  const packetId = fixturePacketId(key);
  if (status !== "submitted") {
    const projection = { state: "none" };
    const retrySafety = { kind: "no_evidence" };
    return {
      submission_projection: projection,
      retry_safety: retrySafety,
      submission_authority: {
        schema_version: "submission-authority-v1",
        revision: BOARD_AUTHORITY_REVISION,
        state: "none",
        application_id: packetId,
        packet_id: packetId,
        projection,
        retry_safety: retrySafety,
      },
    };
  }
  const attemptId = fixtureAttemptId(key);
  const capturedAt = "2026-07-21T12:30:05.000Z";
  const projection = {
    state: "confirmed",
    attempt_id: attemptId,
    canonical_application_id: fixtureCanonicalId(key),
    packet_id: packetId,
    submitted_at: "2026-07-21T12:30:00.000Z",
    receipt: {
      confirmation_text: "Your application has been received.",
      final_url: "https://jobs.example.com/confirmation",
      captured_at: capturedAt,
      source: "managed_browser",
    },
    source: "managed_browser",
    tracker_stage: "applied",
  };
  const retrySafety = { kind: "blocked_confirmed", attemptId, confirmedAt: capturedAt };
  return {
    submission_projection: projection,
    retry_safety: retrySafety,
    submission_authority: {
      schema_version: "submission-authority-v1",
      revision: BOARD_AUTHORITY_REVISION,
      state: "confirmed",
      application_id: packetId,
      packet_id: packetId,
      projection,
      retry_safety: retrySafety,
    },
  };
}

/* A confirmed envelope for a RESPONSE that reports a landed send, for specs whose stub answers a
 * submit-request. A response that merely sets `status: "submitted"` is downgraded on sight, for
 * the same reason a packet is: `reviewForSubmissionProjection` returns "submitted" only for a
 * confirmed projection of that exact identity. Callers must also copy the returned `attemptId`
 * into `review.submission_claim_id`.
 *
 * The projection receipt is NOT the displayed receipt: it may hold only confirmation_text,
 * final_url, captured_at and an optional source. Any other key (`reference_id`, say) fails
 * `exactProjectionShape` and quarantines the response. `confirmedAt` must repeat `captured_at`
 * exactly; `projectionMatchesContext` compares them. */
export function confirmedAuthorityFor(applicationId, seed, { confirmationText, finalUrl, capturedAt }) {
  const attemptId = fixtureUuid("landed-attempt", seed);
  const projection = {
    state: "confirmed",
    attempt_id: attemptId,
    canonical_application_id: fixtureUuid("landed-canonical", seed),
    packet_id: applicationId,
    submitted_at: capturedAt,
    receipt: {
      confirmation_text: confirmationText,
      final_url: finalUrl,
      captured_at: capturedAt,
      source: "managed_browser",
    },
    source: "managed_browser",
    tracker_stage: "applied",
  };
  const retrySafety = { kind: "blocked_confirmed", attemptId, confirmedAt: capturedAt };
  return {
    attemptId,
    envelope: {
      submission_projection: projection,
      retry_safety: retrySafety,
      submission_authority: {
        schema_version: "submission-authority-v1",
        revision: BOARD_AUTHORITY_REVISION,
        state: "confirmed",
        application_id: applicationId,
        packet_id: applicationId,
        projection,
        retry_safety: retrySafety,
      },
    },
  };
}

function packet(key, status) {
  return {
    id: fixturePacketId(key),
    ...fixtureAuthority(key, status),
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
        jd_text: `Fixture job description ${key}. ${REALISTIC_JD}`,
        portal_url: "https://jobs.example.com/fixture",
        ats_name: "Greenhouse",
        status,
        edited_terms: [],
        /* One unanswered required question on the needs-you packets, so the portal screen offers
           "Check the answers" and the questions screen has something to render. Without it that
           whole branch of the flow is unreachable from the fixture, which is how the questions
           screen went untested while sharing a component with the reported bug. */
        questions: status === "needs_attention"
          ? [{ id: `q-${key}`, question: "Why do you want to work here?", answer: "", kind: "essay", required: true }]
          : [],
        skipped_reasons: [],
        /* THE HARNESS COULD NOT PRESS ITS OWN BUTTON WITHOUT THIS, and had not been able to for a
           while. `previewReady` joined finalApprovalBlocked as `Boolean(previewUrl) && loaded &&
           !failed`, and this fixture had no preview_screenshot_url at all, so `Boolean("")` was
           false, so the Send it button in tests/e2e/approve-resolves.spec.mjs was permanently
           disabled and all five of its cases timed out clicking it. Measured on origin/main
           2026-08-09: 5 tests, 0 pass, 5 fail, every one "element is not enabled".

           That is the previewReady risk playing out on the test suite instead of on a student: the
           term that strands has no timeout and no retry, and the surface that was supposed to guard
           the send button was the first thing it stranded.

           Same-origin on purpose. The spec's route handler continues anything under ORIGIN and
           aborts everything else, so a remote screenshot URL would 404 into `previewFailed` and
           disable the button just as thoroughly. */
        preview_screenshot_url: "/qa/portal-preview.svg",
        updated_at: "2026-07-21T12:00:00.000Z",
        ...(status === "submitted"
          ? { submitted_at: "2026-07-21T12:30:00.000Z", submission_claim_id: fixtureAttemptId(key) }
          : {}),
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
  "/billing/state": {
    account_id: "fixture-account",
    entitlement: {
      schema_version: 2,
      policy_version: "litos-entitlements-v2",
      revision: "click-path-fixture",
      evaluated_at: "2026-08-14T00:00:00.000Z",
      access_class: "plus_paid",
      product: "litos_plus",
      term: "month",
      features: { automatic_submission: true },
      trial: null,
      subscription: { provider: "stripe", status: "active", management_available: true },
    },
  },
  "/billing/plans": {
    checkout_available: true,
    plans: [
      { plan_id: "litos_plus_week", amount_cents: 1999, checkout_available: true },
      { plan_id: "litos_plus_month", amount_cents: 3999, checkout_available: true },
      { plan_id: "litos_plus_quarter", amount_cents: 8999, checkout_available: true },
    ],
  },
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
  "/applications": { applications: [] },
  "/resume/base": {},
  "/jobs": { jobs: [] },
  "/profile": PROFILE,
  "/profile/application": {},
  "/profile/targeting": TARGETING,
  /* Two arrays, not one. The Tracker's board reads `stages` and `cards` separately and filters both
     on render, so an object with either key missing takes the whole route into its error boundary. */
  "/applications/board": {
    schema_version: "submission-authority-v1",
    submission_authority_revision: "4",
    build_revision: "dashboard-browser-fixture",
    stages: [],
    cards: [],
  },
  "/track/events": [],
  /* Resume checks, inside the review screen's right pane. The shape is the one
     features/applications/infrastructure/response-shape.ts insists on: `findings` an array and
     both counts real numbers, since the panel prints the counts in a sentence. Zero findings is a
     real answer and renders the "nothing to fix" line, which is all this spec needs from it. */
  "/resume/health": { findings: [], bullet_count: 1, quantified_count: 0 },
  /* Opening a packet scores it. `{}` here is not harmless: MatchScore reads `matched` and `missing`
     as arrays on the way to the badge, and an object without them takes the whole review screen
     into its error boundary, which is a blank page with no Fill the form button on it. Reported as
     "not scorable" on purpose, the one shape that renders without asserting a fabricated score. */
  "/jd-match": {
    score: null,
    scorable: false,
    reason: "fixture",
    band: null,
    term_count: 0,
    min_scorable_terms: 4,
    matched: [],
    missing: [],
  },
  "/onboarding/state": { automatic_submission_enabled: false },
};
