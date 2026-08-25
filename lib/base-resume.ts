"use client";

import { API_URL } from "./config";
import {
  getToken,
  clearSession,
  ApiError,
  LOGIN_REDIRECT_REASON,
  loginRedirectPath,
  type ResumeSpec,
  type ResumeEntry,
} from "./api";
import { litosClientHeaders } from "./product";
import {
  BASE_RESUME_BUILD_DEADLINE_MS,
  readBaseResumeFrames,
  withBuildDeadline,
} from "./base-resume-stream";

/* Client for the base-resume build stream.
 *
 * fetch + a ReadableStream reader, NOT EventSource. EventSource cannot set an Authorization header
 * and this API authenticates with a bearer token from localStorage, so EventSource would force the
 * token into a query string - into proxy logs, browser history and the Referer header, for a
 * credential that grants full account access. The manual reader costs about twenty lines and keeps
 * the token where it belongs.
 */

export type BuildStage =
  | "reading"
  | "selecting"
  | "writing"
  | "polishing"
  | "fitting"
  // Rendering the PDF and putting it through the ATS check. Every resume goes through this, and a
  // build that fails it is not saved.
  | "checking"
  | "done"
  | "failed";

export type AtsVerdict = {
  passed: boolean;
  issues: string[];
  pages: number;
  extractable_chars: number;
  keyword_coverage_pct: number;
  scored_against: string;
};

/* org, title and dates travel with the gap so the ask can SAY which role it means: two stints at
 * one employer can carry the same duty line, and two unlabelled identical prompts give the student
 * no way to tell which is which. */
export type MetricGap = { org: string; title: string; date_range: string; bullet: string };

export type BuildFrame =
  | { event: "stage"; stage: BuildStage; detail?: string }
  | { event: "source"; bank_entries: number; source_pages: number; declared_skills: number }
  // The build is rewriting weak openers: clear what is painted so the retry's pass, which may
  // be shorter, cannot leave stale entries behind.
  | { event: "restart" }
  | { event: "piece"; type: "education"; education_position: "top" | "after_experience" }
  | { event: "piece"; type: "entry"; index: number; entry: ResumeEntry }
  | { event: "piece"; type: "skills"; skills: string[] }
  // The ATS verdict, sent on every build whether it passed or not. A build that fails it is not
  // saved, so the student sees the reason rather than a resume that quietly will not parse.
  | ({ event: "ats" } & AtsVerdict)
  | {
      event: "done";
      spec: ResumeSpec;
      warnings: string[];
      ats: AtsVerdict;
      // Bullets carrying no number, worst first. The student is the only person who knows these.
      metrics: MetricGap[];
      built_at: string;
    }
  | { event: "error"; message: string };

export type StoredBaseResume = {
  spec: ResumeSpec;
  built_at: string | null;
  source_pages: number;
};

export async function getBaseResume(): Promise<StoredBaseResume | null> {
  const token = getToken();
  const res = await fetch(`${API_URL}/resume/base`, {
    headers: { ...litosClientHeaders(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (res.status === 404) return null;
  if (res.status === 401) {
    clearSession();
    const reason = token ? LOGIN_REDIRECT_REASON.SESSION_EXPIRED : LOGIN_REDIRECT_REASON.SIGNIN_REQUIRED;
    if (typeof window !== "undefined") window.location.href = loginRedirectPath(reason);
    throw new ApiError(401, "Signed out");
  }
  if (!res.ok) throw new ApiError(res.status, `Could not load your main resume (${res.status})`);
  return (await res.json()) as StoredBaseResume;
}

export async function putBaseResume(spec: ResumeSpec): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_URL}/resume/base`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...litosClientHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ spec }),
  });
  if (!res.ok) throw new ApiError(res.status, `Could not save the resume (${res.status})`);
}

/**
 * Build the base resume, calling `onFrame` for every frame as it arrives.
 *
 * Resolves only after a terminal `done` or `error` frame and the stream closes. A transport that
 * hangs or closes early rejects with a retryable error instead of leaving the caller building
 * forever. Once the stream is open, an ordinary server-side build failure still arrives as an
 * `error` frame, because by then the UI has state on screen that a thrown exception would discard.
 */
export async function buildBaseResume(
  onFrame: (frame: BuildFrame) => void,
  signal?: AbortSignal,
  deadlineMs = BASE_RESUME_BUILD_DEADLINE_MS,
): Promise<void> {
  return withBuildDeadline(async (deadlineSignal) => {
    const token = getToken();
    const res = await fetch(`${API_URL}/resume/base/stream`, {
      method: "POST",
      headers: {
        ...litosClientHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: deadlineSignal,
    });

    if (res.status === 401) {
      clearSession();
      const reason = token ? LOGIN_REDIRECT_REASON.SESSION_EXPIRED : LOGIN_REDIRECT_REASON.SIGNIN_REQUIRED;
      if (typeof window !== "undefined") window.location.href = loginRedirectPath(reason);
      throw new ApiError(401, "Signed out");
    }
    if (!res.ok || !res.body) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new ApiError(res.status, data?.error ?? `Could not start the build (${res.status})`);
    }

    await readBaseResumeFrames<BuildFrame>(res.body, onFrame);
  }, deadlineMs, signal);
}
