"use client";

import { API_URL } from "./config";
import { identifyUser, resetAnalytics } from "./analytics";
import { userIdFromToken } from "./session-identity";
import { litosClientHeaders, type ProductMeta } from "./product";
import { requestShareKey, shareInFlight } from "./in-flight";
import { apiErrorMessage } from "./api-error-message";

const TOKEN_KEY = "rq_token";
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
  billing_provider?: "lemonsqueezy";
  checkout_available?: boolean;
  billing_status?: string | null;
  billing_renews_at?: string | null;
  billing_ends_at?: string | null;
  billing_portal_url?: string | null;
};

export function createCheckout() {
  return api<{ provider: "lemonsqueezy"; url: string }>("/billing/checkout", { method: "POST" });
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

export type GeneratedResume = {
  id: string;
  /* job_id is the monitored posting this packet was built for. Absent on everything generated
     before 2026-07-28 and on anything from the extension, which has no posting to point at, so
     every reader needs a path that works without it. */
  job_context: { company?: string; role?: string; jd_hash?: string; job_id?: string | null };
  spec: ResumeSpec & {
    _quality?: Record<string, unknown>;
    _contact?: Record<string, string | undefined>;
    _review?: ApplicationReview;
    _cover_letter?: CoverLetter;
  };
  resume_object_key?: string;
  download_url?: string;
  cover_letter_download_url?: string;
  created_at: string | null;
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
};

export type ApplicationReview = {
  jd_text: string;
  portal_url?: string;
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
  handoff_expires_at?: string;
  final_approved_at?: string;
  submission_authorization?: {
    source: "standing_consent" | "per_application_approval";
    authorized_at: string;
    consented_at?: string;
    consent_version?: string;
  };
  submission_authorized_at?: string;
  cover_letter_supported?: boolean;
  /** Whether Litos can fill in this posting's page at all. Derived from portal_url by the backend,
   *  so it is known before the first send rather than discovered after a multi-minute run. */
  portal_supported?: boolean;
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
  eeo_prefs?: Record<string, string> | null;
  availability_date?: string | null;
  desired_salary?: string | null;
  desired_salary_currency?: string | null;
  gpa?: string | null;
  gpa_scale?: string | null;
  major?: string | null;
  /** Language names the student is fluent in, stored as a jsonb array of strings. */
  languages?: string[] | null;
  referral_source_default?: string | null;
};

// ---- onboarding ----

export type ParsedProfile = {
  full_name: string;
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
  /** Page count of the uploaded file, measured at parse time. 0 when never measured. */
  source_pages: number;
  /** The original upload, for the side-by-side. NULL is normal: storing it is best-effort. */
  source_resume_url: string | null;
  harvest_active: boolean;
  automatic_submission_enabled: boolean;
  automatic_submission_consented_at: string | null;
  automatic_submission_consent_version: string | null;
  automatic_verification_enabled: boolean;
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
};

export function completeOnboarding(settings: AutomationSettings) {
  return api<{ ok: true } & AutomationSettings>("/onboarding/complete", {
    method: "POST",
    body: JSON.stringify(settings),
  });
}

export function setAutomationSettings(settings: Partial<AutomationSettings>) {
  return api<AutomationSettings & { automatic_submission_consent_version: string | null }>("/onboarding/automation", {
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
