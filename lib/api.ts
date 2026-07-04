"use client";

import { API_URL } from "./config";

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

/** Authenticated fetch against the Volley backend. On 401 the session is
 *  cleared and the caller is bounced to /login. */
export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
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
  spec: Record<string, unknown>;
  resume_object_key: string;
  created_at: string | null;
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
  linkedin_url?: string | null;
  github_url?: string | null;
  portfolio_url?: string | null;
  citizenship?: string | null;
  work_authorized?: boolean | null;
  needs_sponsorship?: boolean | null;
  availability_date?: string | null;
  desired_salary?: string | null;
  referral_source_default?: string | null;
};
