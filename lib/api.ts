"use client";

import { API_URL } from "./config";
import { litosClientHeaders, type ProductMeta } from "./product";

const TOKEN_KEY = "rq_token";
const EMAIL_KEY = "rq_email";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredEmail(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(EMAIL_KEY);
}

export function setSession(token: string, email: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(EMAIL_KEY, email);
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(EMAIL_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Authenticated fetch against the Litos backend. On 401 the session is
 *  cleared and the caller is bounced to /login. */
export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getToken();
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
    const message =
      (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

// ---- response shapes (mirror student-outreach-backend/src/routes) ----

export type Usage = { used: number; limit: number };

export type Me = {
  email: string;
  tier: string;
  trial_ends_at: string | null;
  usage: { contacts: Usage; drafts: Usage; resumes: Usage };
  upgrade_url?: string;
};

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

export type GeneratedResume = {
  id: string;
  job_context: { company?: string; role?: string; jd_hash?: string };
  spec: ResumeSpec & {
    _quality?: Record<string, unknown>;
    _contact?: Record<string, string | undefined>;
    _review?: ApplicationReview;
  };
  resume_object_key?: string;
  download_url?: string;
  created_at: string | null;
};

export type ResumeEntry = {
  type?: "job" | "project" | "leadership";
  org: string;
  title: string;
  date_range: string;
  bullets: string[];
};

export type ResumeSpec = {
  school: string;
  degree: string;
  grad_date: string;
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
  handoff_expires_at?: string;
  final_approved_at?: string;
  submission_authorization?: {
    source: "standing_consent" | "per_application_approval";
    authorized_at: string;
    consented_at?: string;
    consent_version?: string;
  };
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
    screenshot_url: string;
    captured_at: string;
    reference_id?: string;
  };
};

export type ExperienceEntry = {
  id?: string;
  type: "job" | "project";
  org: string;
  title?: string | null;
  date_range?: string | null;
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
  projects: { name: string; description: string }[];
  school: string;
  grad_year: number;
  target_roles: string[];
  // How many experience_bank rows the parse seeded. Zero here on a first upload means
  // resume-gen will 400 later, so /start surfaces it rather than letting it fail at apply time.
  bank_seeded?: number;
};

export type OnboardingStep = "focus" | "resume" | "install" | "apply" | "gaps" | "targeting" | "done";

export type OnboardingState = {
  step: OnboardingStep;
  completed_at: string | null;
  has_focus: boolean;
  has_resume: boolean;
  has_applied: boolean;
  has_targeting: boolean;
  learned: string[];
  gaps: string[];
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
  primary_period: string | null;
  backup_period: string | null;
};

export function getOnboardingState() {
  return api<OnboardingState>("/onboarding/state");
}

export type AutomationSettings = {
  automatic_submission_enabled: boolean;
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
