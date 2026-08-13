"use client";

import { API_URL } from "./config";
import { identifyUser, resetAnalytics } from "./analytics";
import { SESSION_TOKEN_KEY, userIdFromToken } from "./session-identity";
import { litosClientHeaders, type ProductMeta } from "./product";
import { requestShareKey, shareInFlight } from "./in-flight";
import { apiErrorMessage } from "./api-error-message";
import { clearExtensionSession } from "./extension-bridge";
import { MAX_COUNTRY_ELIGIBILITY_RECORDS } from "./work-eligibility-limit";

/* Defined in session-identity, not here, so this module and the instrumentation
 * entry point read the same constant instead of two copies of the string. */
const TOKEN_KEY = SESSION_TOKEN_KEY;
const EMAIL_KEY = "rq_email";
const SESSION_MODE_KEY = "litos_session_mode_v1";
const HISTORY_KEY = "litos_has_history_v1";
const GUEST_KEY = "litos_guest_idempotency_v1";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredEmail(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(EMAIL_KEY);
}

export function hasLitosHistory(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(HISTORY_KEY) === "true";
}

export function isGuestSession(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SESSION_MODE_KEY) === "guest";
}

export function getOrCreateGuestKey(): string {
  const existing = window.localStorage.getItem(GUEST_KEY);
  if (existing) return existing;
  const created = window.crypto.randomUUID();
  window.localStorage.setItem(GUEST_KEY, created);
  return created;
}

export function setSession(token: string, email?: string | null, isGuest = false) {
  const normalizedEmail = email?.trim().toLowerCase() || null;
  const previousEmail = getStoredEmail()?.trim().toLowerCase() || null;
  if ((isGuest && previousEmail) || (normalizedEmail && previousEmail && normalizedEmail !== previousEmail)) {
    resetAnalytics();
  }
  window.localStorage.setItem(TOKEN_KEY, token);
  if (normalizedEmail) window.localStorage.setItem(EMAIL_KEY, normalizedEmail);
  else window.localStorage.removeItem(EMAIL_KEY);
  window.localStorage.setItem(SESSION_MODE_KEY, isGuest ? "guest" : "verified");
  window.localStorage.setItem(HISTORY_KEY, "true");
  if (!isGuest) window.localStorage.removeItem(GUEST_KEY);

  /* Name the PostHog person after the account, so the anonymous pageviews that
   * led here stop being a separate stranger.
   *
   * Placed at the end of setSession rather than next to each
   * `track("authentication_completed")` call, because there are five of those
   * (password, email verification, email code, Google, guest) and a sixth auth
   * method would silently miss one. Every path already funnels through here.
   *
   * Order matters: this must come AFTER the reset above. identify() then reset()
   * would throw the association away in the one case that needs it most, a
   * guest who signs up for a real account on the same browser. */
  identifyUser(userIdFromToken(token));
}

export function clearSession() {
  resetAnalytics();
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(EMAIL_KEY);
  window.localStorage.removeItem(SESSION_MODE_KEY);
  window.localStorage.removeItem(GUEST_KEY);
  /* The extension now takes its session from this one (lib/extension-bridge), so it has to be told
     when this one ends. Placed here rather than beside each Sign out button for the same reason
     identifyUser lives in setSession: there are several exits, including the 401 handler and the
     recovery flow, and a sign-out that leaves the extension applying as the previous account is
     exactly the failure this pairing has to not introduce. */
  clearExtensionSession();
}

export class ApiError extends Error {
  status: number;
  issues: string[];
  constructor(status: number, message: string, issues: string[] = []) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

const inFlightGets = new Map<string, Promise<unknown>>();

/** Authenticated fetch against the Litos backend. On 401 the session is
 *  cleared and the caller is bounced to /login. */
export function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const dedupeKey = requestShareKey(path, token, init);
  return shareInFlight(inFlightGets, dedupeKey, () => requestApi<T>(path, init, token));
}

async function requestApi<T>(
  path: string,
  init: RequestInit,
  token: string | null,
): Promise<T> {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(litosClientHeaders())) {
    headers.set(name, value);
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, "Signed out");
  }
  let data: unknown = null;
  if (res.status !== 204) {
    data = await res.json().catch(() => null);
  }
  if (!res.ok) {
    const { message, issues } = apiErrorMessage(data, res.status);
    throw new ApiError(res.status, message, issues);
  }
  return data as T;
}

// ---- response shapes (mirror student-outreach-backend/src/routes) ----

export type Usage = { used: number; limit: number };

export type Me = {
  email: string | null;
  is_guest: boolean;
  tier: string;
  trial_ends_at: string | null;
  guest_expires_at?: string | null;
  usage: { contacts: Usage; drafts: Usage; resumes: Usage };
  upgrade_url?: string;
  billing_provider?: "litos" | "lemonsqueezy";
  checkout_available?: boolean;
  billing_status?: string | null;
  billing_renews_at?: string | null;
  billing_ends_at?: string | null;
  billing_portal_url?: string | null;
};

export function createCheckout() {
  return api<{
    provider: "litos" | "lemonsqueezy";
    url: string;
    checkout_intent_id?: string;
    interval?: "monthly" | "annual";
    amount_cents?: number;
    currency?: string;
  }>("/billing/checkout", { method: "POST" });
}

export type OutreachContact = {
  id: string;
  full_name: string | null;
  title?: string | null;
  persona?: string | null;
  company_domain?: string | null;
  linkedin_url?: string | null;
};

export type OutreachEvent = {
  id: string;
  channel: string | null;
  subject: string | null;
  draft_text: string | null;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  bounced: boolean | null;
  follow_up_count: number | null;
  status: "drafted" | "sent" | "replied" | "bounced";
  contact: OutreachContact | null;
};

/** One first-screen read model. Versioned separately from the write-oriented resource APIs. */
export type DashboardBootstrap = {
  schema_version: 1;
  me: Me;
  jobs: JobsPage;
  targeting: Targeting;
  profile: Partial<ParsedProfile>;
  resume_history: { resumes: GeneratedResume[] };
  application_profile: ApplicationProfile;
  outreach: OutreachEvent[];
  onboarding: Pick<OnboardingState, "automatic_submission_enabled">;
  warnings: Array<
    | "targeting"
    | "profile"
    | "resume_history"
    | "application_profile"
    | "outreach"
    | "onboarding"
  >;
};

/**
 * One document the EMPLOYER'S OWN FORM asks for, measured off the run that filled it.
 *
 * The dashboard keys the transcript row on this and never on
 * `attention_categories.includes("required_document")`, and that is not a style choice. The
 * category is written by two things that are not documents: the classifier's pattern has no word
 * boundaries, so `file` matches inside `profile` and "LinkedIn Profile" is required and is still
 * empty lands in it; and a lead-experience alignment failure writes the same category outright. A
 * screen keying on the category asks a student for a transcript because the posting wanted a
 * LinkedIn URL.
 *
 * `label` is the employer's own words, captured at the 120-char clip and NOT at the 60-char one the
 * blocker sentence goes through. It is a paraphrase-free quote of a truncated string, which is why
 * the modal says "Their wording" rather than promising the whole sentence.
 */
export type RequiredDocumentAsk = {
  /** "transcript" today. A string, not a union, so a second document type is a value not a release. */
  kind: string;
  /** The employer's own field label, as far as it survived truncation. */
  label: string;
  /** The employer asked for an OFFICIAL copy, which Litos cannot produce. Drives screen 06. */
  official_requested: boolean;
};

/**
 * What one application already carries for one document kind.
 *
 * `attached_at` and `ordered_at` are separate on purpose and only the first one unblocks a send.
 * Litos can attach a file the student uploads; it cannot make a registrar mail a sealed transcript,
 * so "I have ordered it" records an acknowledgement and leaves the application with her.
 */
export type AttachedDocument = {
  kind: string;
  document_id: string | null;
  file_name: string | null;
  attached_at: string | null;
  ordered_at: string | null;
  employer_label: string | null;
  official_requested: boolean;
};

/** One file in the student's own document library, as a response is allowed to describe it. */
export type DocumentSummary = {
  id: string;
  kind: string;
  file_name: string;
  byte_size: number;
  reusable: boolean;
  created_at: string;
  last_used_at: string | null;
  deleted_at: string | null;
};

export type GeneratedResume = {
  id: string;
  /* job_id is the monitored posting this packet was built for. Absent on everything generated
     before 2026-07-28 and on anything from the extension, which has no posting to point at, so
     every reader needs a path that works without it. */
  job_context: { company?: string; role?: string; location?: string | null; jd_hash?: string; job_id?: string | null };
  spec: ResumeSpec & {
    _quality?: Record<string, unknown>;
    _contact?: Record<string, string | undefined>;
    _review?: ApplicationReview;
    _cover_letter?: CoverLetter;
    /* What this packet already carries, keyed by document kind. The read-only packet viewer reads
       it so a revisited application does not still ask for a transcript that went out with it.

       Typed WITHOUT `object_key`, which the server DOES write into this record and which
       /resume/history therefore puts on the wire. A Vercel Blob object is public-read forever to
       anyone holding its URL, so that key is the whole of the access control on a student's
       transcript. Leaving it out of the type is what keeps it from being one autocomplete away from
       a log line or a link this app builds. */
    _documents?: Record<string, Omit<AttachedDocument, "kind">>;
  };
  resume_object_key?: string;
  download_url?: string;
  cover_letter_download_url?: string;
  created_at: string | null;
};

export type ApplicationEmailAlias = {
  alias: string;
  forward_to: string;
  status: string;
  generated_resume_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ApplicationEmailStatusResponse = {
  /** An environment variable is set. Says nothing about whether any mail arrives. */
  configured: boolean;
  /* Employer replies really do come back through Litos, from the live deliverability probe rather
     than from the presence of configuration. Optional because a backend that predates it sends
     neither field, and lib/application-email-status.ts treats that as "cannot tell" rather than
     guessing in either direction. On 2026-08-08 these two disagreed for the whole day: configured
     true, tracking_active false, and the Automation tab was reading only the first. */
  tracking_active?: boolean;
  tracking_blocked_reason?: string | null;
  domain: string | null;
  forward_to?: string | null;
  aliases: ApplicationEmailAlias[];
};

export type CoverLetter = {
  body: string;
  word_count: number;
  warnings: string[];
  generated_at: string;
  approved_at?: string;
  object_key: string;
  file_name: string;
};

export type MonitoredJob = {
  id: string;
  company_name: string;
  title: string;
  location: string | null;
  department: string | null;
  employment_type: string | null;
  /** What the employer published about pay, or null. All four move together. See lib/pay.ts. */
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  salary_interval?: string | null;
  description: string;
  apply_url: string;
  posting_url: string;
  remote: boolean;
  posted_at: string | null;
  first_seen_at: string;
  ats_name: "greenhouse" | "lever" | "ashby" | "workable";
  is_active?: boolean;
  /** The company's own careers page. Every other URL here belongs to the job board. */
  career_url?: string | null;
  /** The employer's own domain, resolved server-side. Null when we have no verified one. */
  company_domain?: string | null;
  /**
   * 0-100, how much of what this posting asks for is on your main resume.
   *
   * NULL IS NOT ZERO and must never be rendered as one. The scorer refuses to score a posting that
   * lists too few real requirements, and it is also null for everyone signed out or without a main
   * resume yet. In all of those cases the honest row shows no number at all.
   */
  match_score?: number | null;
  /**
   * 0-100 fit against the account's saved role, type, and location preferences.
   *
   * NULL WHEN THE ACCOUNT HAS SAVED NO PREFERENCES, and null is not zero here either. The backend
   * scorer floors at 0 and returns 0 both for "you asked for nothing" and for "you asked, and this
   * posting has none of it"; only GET /jobs holds the targeting row, so only GET /jobs can tell
   * those apart, and it sends null for the first. Clients render no number for null.
   *
   * It is NOT match_score. This one never reads the resume.
   */
  preference_score?: number | null;
  /** Human-readable preference signals behind `preference_score`, from the same metric. Empty when
   *  there is no preference score, and empty when nothing matched. A score printed without one of
   *  these beside it is the defect ISSUE-014 was filed for. */
  preference_reasons?: string[];
  /**
   * Why this posting is safe to show someone who needs a visa sponsored, or null when nothing
   * confirms it.
   *
   *   "posting_offers"        this job description says sponsorship is available
   *   "employer_h1b_filings"  the employer has approved H-1B petitions on file with USCIS
   *
   * NULL IS THE DEFAULT AND MEANS NOTHING IS KNOWN, which is not the same as "will not sponsor" and
   * must never be rendered as one. Most postings say nothing at most companies, and a badge reading
   * "no sponsorship" off the back of silence would be the product inventing an employer's policy.
   */
  sponsorship_evidence?: "posting_offers" | "employer_h1b_filings" | null;
};

/**
 * What GET /jobs answers. `ranked` is false whenever there was no resume to rank against.
 *
 * Everything past `jobs` is optional because a deployed backend that predates the ranking work
 * omits it, and declaring it required would be the type asserting a guarantee the wire does not
 * make. Every reader treats absent as the unranked case, which is the correct thing to say against
 * an older backend, so the two repos can ship in either order.
 */
export type JobsPage = {
  jobs: MonitoredJob[];
  /** Total rows matching the current filters. Older backends may omit it. */
  total?: number;
  has_more?: boolean;
  ranked?: boolean;
  /** How many postings were scored to produce this ordering, or null when nothing was ranked. */
  ranked_pool?: number | null;
  /** How many resume-ranked postings were hidden because their match score was below the board floor. */
  match_hidden?: number;
  /** Minimum visible match score for resume-ranked boards, or null for preference-only ranking. */
  minimum_match_score?: number | null;
  /** True when postings matched that were never ranked, so the list can say why it stopped. */
  pool_exhausted?: boolean;
  /** True when this list only holds employers whose sponsorship Litos could confirm. */
  sponsor_only?: boolean;
};

/**
 * VISA SPONSORSHIP: what the account declared, and what the board is doing about it.
 *
 * `locked` is the part worth reading twice. Someone who said during setup that they need
 * sponsorship has the filter on permanently, and the settings screen has to SAY that rather than
 * render a switch that quietly refuses - the server rejects turning it off either way, so a control
 * that looks live would just be a lie the page repeats.
 */
export type SponsorshipState = {
  declared_at_onboarding: boolean | null;
  declared_at: string | null;
  answer: SponsorshipAnswer | null;
  setting_enabled: boolean;
  sponsor_only_board: boolean;
  locked: boolean;
  evidence?: {
    source: string;
    fiscal_years: number[];
    /** The second, more current source. Absent on a backend that predates it. */
    lca_source?: string;
    lca_quarters?: string[];
    confirmed_employers: number;
    checked_employers: number;
  };
};

/** Three of these four mean "filter the board". Only "no" leaves it whole. */
export type SponsorshipAnswer = "needs_now" | "needs_future" | "not_authorized" | "no";

export function getSponsorship() {
  return api<SponsorshipState>("/sponsorship");
}

export function declareSponsorship(answer: SponsorshipAnswer) {
  return api<SponsorshipState>("/onboarding/sponsorship", {
    method: "POST",
    body: JSON.stringify({ answer }),
  });
}

export function putOnboardingWorkEligibility(records: CountryWorkEligibility[]) {
  if (records.length > MAX_COUNTRY_ELIGIBILITY_RECORDS) {
    throw new Error(`Add no more than ${MAX_COUNTRY_ELIGIBILITY_RECORDS} countries.`);
  }
  return api<{ records: CountryWorkEligibility[] }>("/onboarding/work-eligibility", {
    method: "PUT",
    body: JSON.stringify({ records }),
  });
}

export function setSponsorFilter(enabled: boolean) {
  return api<SponsorshipState>("/sponsorship/filter", {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
}

export type ResumeEntry = {
  /** Where the work happened, printed right of the organisation. Copied from the experience bank,
   *  never written by the model, and only when the organisation matches exactly. */
  location?: string;
  type?: "job" | "project" | "leadership";
  org: string;
  title: string;
  date_range: string;
  bullets: string[];
};

/**
 * THIS TYPE CONTAINS NO NAME, AND THAT HAS CAUSED THE SAME BUG THREE TIMES.
 *
 * The applicant is not here. They live on `GeneratedResume["spec"]._contact.full_name`, and
 * `stripMetadata` strips `_contact` on the way into any editable copy. So a component typed
 * `{ spec: ResumeSpec }` - the natural signature for something that renders a resume - is
 * STRUCTURALLY unable to draw a header, and `school` below, being the first printable field,
 * floats into the empty name slot.
 *
 * Three surfaces shipped exactly that way: ApplicationPacket's ResumePaper, the deleted dashboard
 * ResumePreview, and the review screen's ResumeEditor. Every one looked correct in review, type
 * checked, and rendered a plausible resume. The PDF was right throughout, which is what made it
 * so hard to see: the file was correct and the preview of the file was wrong.
 *
 * IF YOU ARE WRITING A NEW RESUME SURFACE: take the name and the contact line as their own props,
 * the way ResumePaper and ResumeEditor do, and fill them with `contactName(packet.spec)` and
 * `contactLine(packet.spec)` from components/app/ApplicationPacket. Do not read `_contact` by
 * hand; its key names have already been got wrong once and they fail silently.
 * tests/packet-resume-header.test.mjs finds every resume surface and will fail yours until it
 * names the applicant.
 */
export type ResumeSpec = {
  /** Targeting headline, not a claim the candidate held the role. Mirrors the backend's ResumeSpec;
   *  needed here so the JD match score reads the same text the rendered resume shows. */
  target_role?: string;
  school: string;
  degree: string;
  grad_date: string;
  /** Already formatted for print, e.g. "3.8/4.0" or "3.8". Optional and usually absent: a resume
   *  that never stated a GPA is not missing one. Mirrors the backend's ResumeSpec. */
  gpa?: string;
  /** The place printed beside the school. Transcribed from the resume, never inferred. */
  school_location?: string;
  coursework: string;
  education_position?: "top" | "after_experience";
  experience: ResumeEntry[];
  skills: string[];
  skill_source?: Record<string, string>;
};

export type ApplicationQuestion = {
  id: string;
  question: string;
  answer: string;
  kind: "essay" | "required";
  required: boolean;
  /* ---- present only on a question that came from the Apply-time pre-script ----
   *
   * All three are display-only and none of them is sent back: submit-request accepts
   * id/question/answer/kind/required and nothing else, deliberately. They exist so the answers
   * editor can show the employer's real option list instead of an empty box, and can say in one
   * line why a question is hers rather than leaving her to guess. */
  options?: string[] | null;
  /** One line under the label saying why Litos did not answer this. */
  explanation?: string;
  /** True when the answer shown is one she gave on an earlier posting. */
  remembered?: boolean;
};

/** One question from GET /postings/:jobId/questions that needs the applicant. */
export type PostingPrescriptQuestion = {
  question: string;
  input_type: string;
  options: string[] | null;
  required: boolean;
  max_length: number | null;
  answer: string;
  reusable: boolean;
  remembered: boolean;
  reason?: "self_declaration" | "choice_for_you" | "nothing_on_file" | "needs_your_words";
  explanation?: string;
};

/**
 * What a posting's application form asks, known before she clicks Apply.
 *
 * `ask` is only the questions that need her; `already_answered` counts the ones Litos fills from
 * her profile, and is the honest counterweight that makes a four-question screen read as progress.
 */
export type PostingPrescript = {
  job_id: string;
  company: string;
  role: string;
  apply_url: string;
  portal: string | null;
  discovery_status: "ok" | "form_not_reached" | "failed";
  discovered_at: string | null;
  scanned_now: boolean;
  question_count: number;
  ask: PostingPrescriptQuestion[];
  already_answered: number;
};

export type PacketAuditEvidence = {
  source: "resume_spec" | "applicant_snapshot";
  path: string;
  sha256: string;
  quote: string;
};

export type PacketAuditClause = {
  text: string;
  start: number;
  end: number;
  verdict: "covered" | "missing" | "unscoreable";
  evidence?: PacketAuditEvidence[];
  highlight_terms: PacketAuditHighlightTerm[];
};

export type PacketAuditTerm = {
  text: string;
  key: string;
  start: number;
  end: number;
  clauseIndex: number;
  evidence?: PacketAuditEvidence;
};

export type PacketAuditHighlightTerm = PacketAuditTerm & {
  tone: "covered" | "missing" | "edited";
};

export type PacketAudit = {
  version: "packet_audit_v1";
  status: "passed";
  complete: true;
  degraded: false;
  rejectedCount: 0;
  packet_version: string;
  audit_digest: string;
  bindings: {
    ownerSha256: string;
    applicationId: string;
    jdSha256: string;
    specSha256: string;
    jobContextSha256: string;
    questionsSha256: string;
    applicantSnapshotSha256: string;
    resumeContactEmailSha256: string;
    applicantEmailSha256: string;
    pdf: { objectKey: string; sha256: string; sizeBytes: number };
  };
  identities: {
    resume_email: string;
    applicant_email: string;
  };
  clauses: PacketAuditClause[];
  editedTerms: string[];
  terms: {
    covered: PacketAuditTerm[];
    missing: PacketAuditTerm[];
    edited: PacketAuditTerm[];
  };
};

export type PacketAuditResponse = {
  packet_audit: PacketAudit;
  pdf: {
    object_key: string;
    sha256: string;
    size_bytes: number;
    download_url: string;
  };
};

export type ManualHandoffResponse = {
  manual_handoff: {
    url: string;
    audit_digest: string;
    packet_version: string;
    pdf_sha256: string;
    size_bytes: number;
  };
};

export type ApplicationReview = {
  jd_text: string;
  portal_url?: string;
  /** Exact company form authorized for an attended extension retry. It is distinct from the
   *  posting URL and from a managed-browser live-view URL. */
  extension_handoff_url?: string;
  /** Server-owned proof for the exact JD, saved resume, answers, and stored PDF. */
  packet_audit?: PacketAudit;
  ats_name?: string;
  status:
    | "resume_ready"
    | "questions_ready"
    | "ready_to_submit"
    | "submit_requested"
    | "preparing"
    | "filling"
    | "needs_attention"
    | "ready_for_final_approval"
    /** Submitted once, not filed, waiting on a code the employer emailed. Greenhouse answers an
     *  unauthenticated submit by emailing an 8-character code and rendering a code field, and files
     *  nothing until that code is entered and the form is sent again. Three packets sat at
     *  ready_for_final_approval in this condition on 2026-08-08, behind a green "Send it" button
     *  that would only have issued another code. */
    | "awaiting_security_code"
    | "submitting"
    | "submission_claimed"
    | "submitted"
    | "failed";
  edited_terms: string[];
  questions: ApplicationQuestion[];
  skipped_reasons: string[];
  updated_at: string;
  submitted_at?: string;
  submission_error?: string;
  submission_run_id?: string;
  browser_context_id?: string;
  browser_session_id?: string;
  attention_reason?: string;
  attention_categories?: Array<
    | "captcha"
    | "security_code"
    | "required_document"
    | "sensitive_attestation"
    | "required_field"
    | "evidence_gap"
    | "cover_letter"
    | "unknown"
  >;
  /* The typed half of attention_reason. Written by the backend when an application stops on a
     human-verification check; nothing here is rendered as prose. `stalled_at` is the queue's sort
     key and is deliberately not `updated_at`, which moves on unrelated writes. A stall is closed
     with `resolved_at` rather than deleted, so a submitted application keeps its history while
     dropping out of the queue. */
  stall?: {
    kind: "human_verification";
    stalled_at: string;
    surface: "server_run" | "extension";
    provider: "recaptcha_v2" | "recaptcha_v3" | "hcaptcha" | "turnstile" | "arkose" | "unknown";
    stage: "before_fill" | "at_submit";
    source: "observed" | "assumed";
    resolved_at?: string;
  };
  /** When a submit provably reached the employer, whatever made it. Separate from submitted_at,
   *  which means "filed, with a receipt". */
  submission_attempted_at?: string;
  /** What the employer is holding this application behind. `digits` is read off the code control on
   *  the page, so 0 means the page did not say how long the code is and the field must not claim a
   *  length. `sent_to` is the address the employer said it mailed. */
  security_code?: {
    digits: number;
    sent_to?: string;
    requested_at: string;
    submit_was_authorized: boolean;
    attempts?: Array<{ at: string; fingerprint: string; outcome: "accepted" | "rejected" | "not_entered" | "no_control" | "error" }>;
  };
  handoff_expires_at?: string;
  final_approved_at?: string;
  submission_authorization?: {
    source: "standing_consent" | "per_application_approval";
    authorized_at: string;
    consented_at?: string;
    consent_version?: string;
  };
  submission_authorized_at?: string;
  /** Whether the form has a cover-letter file control Litos can attach to. A capability of the
   *  portal, never a requirement of the employer. See cover_letter_required. */
  cover_letter_supported?: boolean;
  /** Whether the employer MARKED the cover letter required, measured by the run off their own
   *  form. Tri-state: undefined means no run has measured it, and undefined must never block a
   *  send. Only true blocks. */
  cover_letter_required?: boolean;
  /** Whether the run that filled this form actually carried a cover letter. Only an approved letter
   *  is attached, so a generated draft she has not read is stored and deliberately not sent. */
  cover_letter_attached?: boolean;
  /** The documents this employer's form asks for, measured off the run rather than guessed from the
   *  attention category. Same tri-state discipline as cover_letter_required: absent means no run has
   *  measured this form, and an unmeasured ask must never block a send. Only a present, non-empty
   *  list does. */
  required_documents?: RequiredDocumentAsk[];
  /** Whether the form has a document file control Litos can attach to. A capability of the portal,
   *  never a requirement of the employer, exactly like cover_letter_supported. */
  transcript_supported?: boolean;
  /** Whether Litos can fill in this posting's page at all. Derived from portal_url by the backend,
   *  so it is known before the first send rather than discovered after a multi-minute run. */
  portal_supported?: boolean;
  applicant_email?: {
    address: string;
    source: "litos_alias" | "contact_email" | "account_email";
    reason: string;
    tracked: boolean;
    decided_at: string;
  };
  submission_claimed_at?: string;
  filled_fields?: string[];
  preview_screenshot_url?: string;
  verification?: {
    status: "not_needed" | "searching" | "completed" | "handoff";
    provider?: "gmail" | "outlook";
    completed_at?: string;
  };
  receipt?: {
    confirmation_text: string;
    final_url: string;
    screenshot_url?: string;
    captured_at: string;
    reference_id?: string;
    source?: "managed_browser" | "chrome_extension" | "email_fallback" | "ats_api" | "attended_handoff";
  };
};

export type ExperienceEntry = {
  id?: string;
  /* "leadership" was stored and accepted by the API (experienceBank.ts enum) but missing from this
     union, so the account page rendered a Type select with no matching option for a third of a
     typical bank. A controlled <select> with no matching option shows the first one, so opening
     that dropdown on a club presidency and picking anything reclassified it as a job - silently,
     because the value looked wrong from the moment the card painted. Clubs, societies and
     volunteering are not work experience and should not be offered to employers as if they were. */
  type: "job" | "project" | "leadership";
  org: string;
  title?: string | null;
  date_range?: string | null;
  /** Where the work happened. Must be round-tripped on save: PUT /profile/experience-bank replaces
   *  the whole bank, so a field the client omits is erased rather than left alone. */
  location?: string | null;
  bullet_variants: string[];
  tags?: string[] | null;
};

export type ApplicationProfile = {
  phone?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  address_country?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  portfolio_url?: string | null;
  citizenship?: string | null;
  work_authorized?: boolean | null;
  needs_sponsorship?: boolean | null;
  /** One applicant declaration per ISO-3166 alpha-2 country. This is the editable authority. */
  work_eligibility_by_country?: CountryWorkEligibility[] | null;
  availability_date?: string | null;
  /** A duration such as "14 weeks". Separate from the date availability begins. */
  availability_term?: string | null;
  desired_salary?: string | null;
  desired_salary_currency?: string | null;
  /** Applicant-provided date only. Never inferred from education or employment dates. */
  date_of_birth?: string | null;
  gpa?: string | null;
  gpa_scale?: string | null;
  major?: string | null;
  /** Language names the student is fluent in, stored as a jsonb array of strings. */
  languages?: string[] | null;
  /** Optional answers for questions about race and gender, used exactly as written. */
  eeo_prefs?: Record<string, string> | null;
  referral_source_default?: string | null;

  /* ---- application facts, asked once in /start ----
   *
   * Questions employers keep asking that nothing on file could answer, so every application
   * stalled on them. Measured across the 25 most recent packets; see the backend's schema.ts for
   * the per-field counts and db/apply-application-facts-schema.mjs for the migration.
   *
   * null everywhere means NEVER ANSWERED, and the submission runner leaves those questions for the
   * applicant rather than filling something adjacent. That is deliberate: these are declarations
   * about a person and consents given to an employer, and a default for any of them would be Litos
   * saying something on her behalf that she never said.
   */
  /** Typed exactly as it should appear on a form, e.g. "she/her". "Prefer not to say" is an answer. */
  pronouns?: string | null;
  /** Only for the person whose legal first name is not the name on their resume. */
  legal_first_name?: string | null;
  preferred_first_name?: string | null;
  /** Month and year, e.g. "June 2024". Not the university graduation date. */
  high_school_grad_date?: string | null;
  /**
   * Month and year the CURRENT degree started, e.g. "August 2024".
   *
   * Not the graduation date and not derivable from it: a high school class of 2023 graduating in
   * 2028 fits both a five-year programme and a gap year, and those start in different Augusts.
   */
  education_start_date?: string | null;
  /** Employers applied to before. [] is the answer "none", which is not the same as null. */
  prior_application_employers?: string[] | null;
  has_outstanding_offers?: boolean | null;
  outstanding_offer_details?: string | null;
  /** "Yes" / "No" / "Prefer not to say", as declared. Never inferred. */
  military_service?: string | null;
  /** Politically exposed person, self and immediate family. Never inferred. */
  politically_exposed?: string | null;
  politically_exposed_family?: string | null;
  advanced_study_plan?: "no" | "considering" | "committed" | null;
  /** The only two things an automated submission may ever tick on the applicant's behalf. */
  attest_truthful_information?: boolean | null;
  accept_privacy_notices?: boolean | null;
  /** Server-set when either attestation above is written. Read-only to the client. */
  application_attestations_consented_at?: string | null;

  /* ---- where you will actually work from ----
   *
   * "Are you available to work from our office in San Francisco?" was answered YES by a constant in
   * the backend resolver, with no column behind it, on a packet for an applicant who lives in Dubai
   * and studies in Los Angeles. It is the most-asked question of its kind: 15 distinct labels
   * across 12 employers in the stored corpus.
   *
   * Three fields rather than one boolean, because this is the fact with a LOCATION DIMENSION: yes
   * to Los Angeles and no to New York are both true, and which one an employer gets depends on
   * which office it asked about. Relocating is a separate promise from commuting to an office in a
   * city you already live in.
   *
   * null on any of them means NEVER ANSWERED, and the runner then leaves the employer's question
   * blank and raises it, rather than defaulting.
   */
  onsite_commitment?: "anywhere" | "listed_locations" | "no" | null;
  /** Metros, her own words, most preferred first. Doubles as the preferred-work-location answer. */
  onsite_locations?: string[] | null;
  relocation_willingness?: "yes" | "no" | null;

  /* ---- when an internship could actually run ----
   *
   * Across all 112 stored packets this is the largest cluster of required-and-blank questions: what
   * dates you are available, when the internship would end, the earliest you could start. The old
   * `availability_date` above has held a value the whole time and the backend refuses to answer from
   * it on purpose, because it carries no recruiting cycle and no expiry, so a date typed for one
   * summer would answer the next summer's forms forever.
   *
   * These four are the scoped replacement, and they only work together. The backend answers a dates
   * question ONLY when all four are stored, the expiry has not passed, and the posting's own
   * description names the same cycle. Any one of them missing, and the question goes back to you.
   */
  /** ISO YYYY-MM-DD. The earliest you could begin. */
  availability_window_start?: string | null;
  /** ISO YYYY-MM-DD. The latest you are available through. */
  availability_window_end?: string | null;
  /** The recruiting cycle the window is about, e.g. "Summer 2027". This is what scopes it. */
  availability_cycle?: string | null;
  /** ISO YYYY-MM-DD. After this date the window answers nothing, whatever else is stored. */
  availability_valid_through?: string | null;

  /* Standardized tests. Each blocked 8 distinct packets across the 158-packet corpus (2026-08-11),
   * which is 2 postings at one employer. null means never asked, and the resolver refuses on it
   * rather than defaulting: an invented test score is a checkable false claim about an academic
   * record. */
  standardized_test_type?: "SAT" | "ACT" | "Both" | "None" | null;
  /** As earned. Free text, because "1520 (superscored)" is a real answer and a number is not. */
  sat_score?: string | null;
  act_score?: string | null;
};

export type CountryWorkEligibility = {
  country_code: string;
  authorized_now: boolean;
  needs_sponsorship_now: boolean;
  needs_sponsorship_future: boolean;
  authorization_type?: string | null;
  authorization_expiry?: string | null;
};

// ---- onboarding ----

export type ParsedProfile = {
  full_name: string;
  resume_email?: string;
  experience: { company: string; title: string; start: string; end: string; description: string }[];
  skills: string[];
  /* Spoken languages the resume printed. Separate from skills because the parser used to have
   * nowhere else to put them, so they sorted ahead of the technical skills that drive resume
   * tailoring. NOT the same list as application_profile.languages, which is the fluency the student
   * declares in onboarding and the only list an employer form may be answered from. */
  languages?: string[];
  projects: { name: string; description: string }[];
  school: string;
  grad_year: number;
  currently_enrolled?: boolean;
  target_roles: string[];
  // How many experience_bank rows the parse seeded. Zero here on a first upload means
  // resume-gen will 400 later, so /start surfaces it rather than letting it fail at apply time.
  bank_seeded?: number;
  // Total usable bank rows after reconciliation. Unlike bank_seeded, this stays positive when a
  // replacement upload matches entries already stored for the student.
  bank_total?: number;
  recent_experience_review?: RecentExperienceReview;
};

export type ImpactComponent = "action" | "noun" | "metric_or_scope" | "outcome";

export type RecentExperienceCandidate = {
  entry_id: string;
  type: string;
  org: string;
  title: string;
  date_range: string;
  bullet_variants: string[];
};

export type RecentExperienceReview = {
  status: "ready" | "choose_entry" | "optional_enrichment" | "needs_input" | "continued";
  selected_entry_id: string | null;
  user_selected: boolean;
  impact_candidate: {
    draft: string;
    score: number;
    components: Record<ImpactComponent, { present: boolean; evidence: string | null }>;
  } | null;
  grounded_bullet_count: number;
  missing_bullets: number;
  completed: boolean;
  continue_with_found: boolean;
  candidates: RecentExperienceCandidate[];
};

// Legacy values stay in the response type during the rolling deploy. The new backend no longer
// emits them, and /start treats an older response as ready rather than restoring the removed flow.
export type OnboardingStep = "focus" | "sponsorship" | "resume" | "impact" | "base" | "install" | "apply" | "gaps" | "targeting" | "done";

export type OnboardingState = {
  /** Unattended submission is earned: the server refuses to enable it until the student has
   *  personally approved `required` real submissions. Absent on older backends. */
  standing_consent_eligibility?: {
    eligible: boolean;
    reviewed_submits: number;
    required: number;
    remaining: number;
  };
  step: OnboardingStep;
  completed_at: string | null;
  has_focus: boolean;
  /** Whether the one-time visa-sponsorship question has been answered. Absent on older backends. */
  has_sponsorship_answer?: boolean;
  sponsorship_answer?: SponsorshipAnswer | null;
  sponsorship_required?: boolean | null;
  has_resume: boolean;
  has_impact_review?: boolean;
  has_base_resume: boolean;
  has_applied: boolean;
  has_targeting: boolean;
  learned: string[];
  gaps: string[];
  /** Starting values for gap questions, taken from the student's own resume. A suggestion is never
   *  a stored answer: it is offered only for fields still listed in `gaps`, and only the student
   *  saving it makes it a declaration. */
  gap_suggestions?: { languages?: string[] };
  /** Whether this student's setup flow CONTAINS the gaps screen, which is the step rail's
   *  denominator. Absent on older backends, which never route to that screen at all.
   *
   *  Deliberately not re-derived from `gaps` here. Two states look identical in that list and need
   *  opposite answers: a student who has never been asked (count the screen, they are about to walk
   *  it) and one who was asked and skipped (count it too, they already walked it) both still list
   *  gpa. And a student who was asked and ANSWERED lists nothing, yet the screen must stay counted
   *  or the printed total drops from seven to six on the last screen of setup. Only the server knows
   *  whether the screen was shown, so only the server can answer this. */
  includes_gaps_step?: boolean;
  /** Page count of the uploaded file, measured at parse time. 0 when never measured. */
  source_pages: number;
  /** The original upload, for the side-by-side. NULL is normal: storing it is best-effort. */
  source_resume_url: string | null;
  harvest_active: boolean;
  automatic_submission_enabled: boolean;
  automatic_submission_consented_at: string | null;
  automatic_submission_consent_version: string | null;
  automatic_verification_enabled: boolean;
  /* THE VERSION-CHECKED VERDICT, not the stored column. The API compares the version on the row
     against AUTOMATIC_CAPTCHA_CONSENT_VERSION, the constant naming the wording the applicant was
     shown, and sends the result under this name. Rows granted against superseded wording arrive
     here as false with their original `consented_at` still attached - which is not a hypothetical,
     it is the state of the accounts stamped by the unmerged branch - so nothing on the client may
     re-derive the grant from the date. See lib/captcha-consent.ts.

     Optional, like `includes_gaps_step` above and for the same reason: the two repos deploy
     separately and in either order, and an API that predates this column simply omits it. Absent
     reads as not granted, which is what that API does. */
  automatic_captcha_enabled?: boolean;
  automatic_captcha_consented_at?: string | null;
  automatic_captcha_consent_version?: string | null;
};

export type RoleType = "internship" | "co-op" | "new-grad" | "full-time";

export type Targeting = {
  categories: string[] | null;
  titles: string[] | null;
  role_types: RoleType[] | null;
  locations: string[] | null;
  remote_only: boolean;
  primary_period: string | null;
  backup_period: string | null;
};

export function getOnboardingState() {
  return api<OnboardingState>("/onboarding/state");
}

/* Record that the setup gaps screen was SHOWN. Save and Skip both call it, because both mean asked.
 *
 * Skipping saves no fields, so without this the server would keep deriving 'gaps' from the same
 * missing values and the student could never leave the screen - the exact defect that had the step
 * deleted from the flow in backend #116.
 *
 * `recorded: false` is a success, not a failure: it means the backend deployed ahead of its
 * migration and has nowhere to put the stamp. /start advances on its own in that case rather than
 * re-reading a step it cannot leave. Older backends 404, which is the same situation and is caught
 * the same way. */
export function markGapsAsked() {
  return api<{ recorded: boolean }>("/onboarding/gaps-asked", { method: "POST" })
    .catch(() => ({ recorded: false }));
}

export function getRecentExperienceReview() {
  return api<RecentExperienceReview>("/profile/recent-experience");
}

export function putRecentExperienceReview(body: {
  selected_entry_id: string;
  answers: Partial<Record<ImpactComponent, string>>[];
  continue_with_found: boolean;
}) {
  return api<RecentExperienceReview>("/profile/recent-experience", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export type AutomationSettings = {
  /** Optional: onboarding no longer sends it at all, so finishing setup can never be the thing
   *  that turns unattended submission on. The server refuses to enable it before it is earned. */
  automatic_submission_enabled?: boolean;
  automatic_verification_enabled: boolean;
  /** Standing permission to pick a fill back up after the applicant has cleared a human check.
   *  Optional on both routes: the server reads an omitted field as "leave it alone" and an explicit
   *  false as a revocation, so a writer that has nothing to say about this permission must not name
   *  it. It never licenses a send; see lib/captcha-consent.ts for what it does and does not buy. */
  automatic_captcha_enabled?: boolean;
};

/** What both write routes answer with. `automatic_captcha_enabled` here is the VERSION-CHECKED
 *  VERDICT, matching GET /onboarding/state exactly, so a screen hydrating from a write never shows a
 *  permission the server does not honour. */
export type AutomationSettingsResponse = AutomationSettings & {
  automatic_submission_consent_version: string | null;
  automatic_captcha_consented_at?: string | null;
};

export function completeOnboarding(settings: AutomationSettings) {
  return api<{ ok: true } & AutomationSettings>("/onboarding/complete", {
    method: "POST",
    body: JSON.stringify(settings),
  });
}

export function setAutomationSettings(settings: Partial<AutomationSettings>) {
  return api<AutomationSettingsResponse>("/onboarding/automation", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export type EmailProvider = "gmail" | "outlook";
export type EmailConnection = {
  provider: EmailProvider;
  connected: boolean;
  status: "INITIALIZING" | "INITIATED" | "ACTIVE" | "FAILED" | "EXPIRED" | "INACTIVE" | "REVOKED" | "NOT_CONNECTED";
  connected_at?: string;
};

export type EmailConnectionsResponse = {
  configured: boolean;
  connections: EmailConnection[];
};

export function getEmailConnections() {
  return api<EmailConnectionsResponse>("/email-connections");
}

export function getApplicationEmailStatus() {
  return api<ApplicationEmailStatusResponse>("/application-email");
}

export function createEmailConnection(provider: EmailProvider) {
  return api<{ redirect_url: string }>(`/email-connections/${provider}/connect`, { method: "POST" });
}

export function disconnectEmailConnection(provider: EmailProvider) {
  return api<{ disconnected: true; removed: number }>(`/email-connections/${provider}`, { method: "DELETE" });
}

export function getTargeting() {
  return api<Targeting>("/profile/targeting");
}

export function putTargeting(body: Partial<Targeting>) {
  return api<Targeting>("/profile/targeting", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function getApplicationProfile() {
  // 404 means "never saved", which is a normal state here, not a failure.
  return api<ApplicationProfile>("/profile/application").catch((e) => {
    if (e instanceof ApiError && e.status === 404) return {} as ApplicationProfile;
    throw e;
  });
}

/**
 * The extra questions this posting asks, and which of them only she can answer.
 *
 * Never fatal. Every failure mode here - the posting is gone, the scan could not reach the form,
 * the endpoint is not deployed yet - means the same thing to the Apply flow: there is nothing extra
 * to ask, which is exactly the behaviour that exists today. Failing the whole Apply because a
 * lookahead did not work would trade a stall for a wall.
 */
export function getPostingQuestions(jobId: string): Promise<PostingPrescript | null> {
  return api<PostingPrescript>(`/postings/${jobId}/questions`).catch(() => null);
}

export function putApplicationProfile(body: Partial<ApplicationProfile>) {
  return api<ApplicationProfile>("/profile/application", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/** Resume upload. Multipart, so it cannot go through `api()` (which sets JSON headers). */
export async function uploadResume(file: File): Promise<ParsedProfile> {
  const token = getToken();
  const form = new FormData();
  form.append("resume", file);
  const res = await fetch(`${API_URL}/profile`, {
    method: "POST",
    headers: {
      ...litosClientHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? "Could not read that resume.");
  }
  return data as ParsedProfile;
}

/**
 * THE CAP IS 4 MB, and the number in the modal's copy is this constant.
 *
 * The backend's global multipart limit is two and a half times that, and its number is the one a
 * file picker would naturally promise. It is not a number this product can keep. The managed sandbox
 * carries an upload to the browser as base64 and refuses any file over 6,000,000 characters, about
 * 4.29 MiB decoded, per file, before a browser opens; and there is no request-body limit in front of
 * that check, so a larger body may instead be rejected by the platform with no error envelope at
 * all, which is indistinguishable from an outage. Promising the multipart limit would be true on
 * direct-Playwright portals and false on managed ones, which is the worst of the three available
 * options.
 *
 * The multipart figure is described rather than written out because it is the wrong number for this
 * product to carry in any searchable form: a later grep for it, hunting stale copy, should not find
 * a hit in the comment that exists to say it is not the cap.
 *
 * Checked here as well as server-side so a student who picks a 9 MB scan is told in the modal
 * rather than after an upload she waited through.
 */
export const MAX_APPLICATION_DOCUMENT_BYTES = 4_000_000;

/**
 * Attach a file the student chose to one application, and keep it for the next employer that asks.
 *
 * Multipart, and it still goes through `api()` rather than a bare fetch the way uploadResume does.
 * That is safe because the Content-Type header in requestApi is set only for a STRING body, so a
 * FormData body keeps the boundary the browser generates. Going through `api()` is what buys the
 * 401 handling and apiErrorMessage's `issues` array, both of which uploadResume does without.
 */
export function attachApplicationDocument(
  applicationId: string,
  input: { file: File; kind: string; reuse: boolean; employerLabel?: string | null },
): Promise<{ document: DocumentSummary; attachment: AttachedDocument }> {
  const form = new FormData();
  // The backend multipart handler reads the part named "document" and ignores everything else.
  form.append("document", input.file);
  form.append("kind", input.kind);
  form.append("reuse", input.reuse ? "true" : "false");
  if (input.employerLabel) form.append("employer_label", input.employerLabel.slice(0, 200));
  return api<{ document: DocumentSummary; attachment: AttachedDocument }>(
    `/applications/${applicationId}/documents`,
    { method: "POST", body: form },
  );
}

/** Record that the student has ordered an official copy. This does NOT unblock the send. */
export function recordOrderedApplicationDocument(
  applicationId: string,
  kind: string,
): Promise<{ attachment: AttachedDocument }> {
  return api<{ attachment: AttachedDocument }>(`/applications/${applicationId}/documents/ordered`, {
    method: "POST",
    body: JSON.stringify({ kind }),
  });
}

/** Stop this application carrying the document. The library file itself is untouched. */
export function detachApplicationDocument(applicationId: string, kind: string): Promise<{ attachment: null }> {
  return api<{ attachment: null }>(`/applications/${applicationId}/documents/${kind}`, { method: "DELETE" });
}

/**
 * Every file the student still has stored with Litos, across all of her applications.
 *
 * ACCOUNT LEVEL, and that is the whole reason this exists rather than the per-application reads
 * beside it. A stored document outlives the application it was first attached to: the application
 * reaches a terminal status and its screen stops rendering any document control at all, while the
 * file is still stored and /privacy still says "we keep it until you remove it". Two rounds of
 * fixes tried to keep the delete control reachable from per-application UI and both sprang leaks,
 * because they were binding an account-level object to a screen that goes away.
 *
 * Tombstones are excluded server-side, so a file the student has already removed never comes back
 * as a row she can be asked to remove again.
 */
export function listUserDocuments(): Promise<{ documents: DocumentSummary[] }> {
  return api<{ documents: DocumentSummary[] }>("/documents");
}

/** Delete the stored file itself. This is the endpoint that makes "kept until you remove it" true. */
export function deleteUserDocument(documentId: string): Promise<{ deleted: boolean }> {
  return api<{ deleted: boolean }>(`/documents/${documentId}`, { method: "DELETE" });
}

let productMetaPromise: Promise<ProductMeta> | null = null;

export function getProductMeta(): Promise<ProductMeta> {
  if (!productMetaPromise) {
    productMetaPromise = api<ProductMeta>("/v1/meta").catch((error) => {
      productMetaPromise = null;
      throw error;
    });
  }
  return productMetaPromise;
}
