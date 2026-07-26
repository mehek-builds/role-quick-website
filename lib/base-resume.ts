"use client";

import { API_URL } from "./config";
import { getToken, clearSession, ApiError, type ResumeSpec, type ResumeEntry } from "./api";
import { litosClientHeaders } from "./product";

/* Client for the base-resume build stream.
 *
 * fetch + a ReadableStream reader, NOT EventSource. EventSource cannot set an Authorization header
 * and this API authenticates with a bearer token from localStorage, so EventSource would force the
 * token into a query string - into proxy logs, browser history and the Referer header, for a
 * credential that grants full account access. The manual reader costs about twenty lines and keeps
 * the token where it belongs.
 */

export type BuildStage = "reading" | "selecting" | "writing" | "fitting" | "done" | "failed";

export type BuildFrame =
  | { event: "stage"; stage: BuildStage; detail?: string }
  | { event: "source"; bank_entries: number; source_pages: number; declared_skills: number }
  | { event: "piece"; type: "education"; education_position: "top" | "after_experience" }
  | { event: "piece"; type: "entry"; index: number; entry: ResumeEntry }
  | { event: "piece"; type: "skills"; skills: string[] }
  | { event: "done"; spec: ResumeSpec; warnings: string[]; built_at: string }
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
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, "Signed out");
  }
  if (!res.ok) throw new ApiError(res.status, `Could not load the base resume (${res.status})`);
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
 * Resolves when the stream closes. Rejects only on a failure to START the build (auth, a 400 for
 * an empty bank, a dead network); once the stream is open, a build failure arrives as an `error`
 * frame instead, because by then the UI has state on screen that a thrown exception would discard.
 */
export async function buildBaseResume(
  onFrame: (frame: BuildFrame) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_URL}/resume/base/stream`, {
    method: "POST",
    headers: {
      ...litosClientHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
  });

  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, "Signed out");
  }
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, data?.error ?? `Could not start the build (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // SSE frames are separated by a blank line and a frame can split across chunk boundaries, so
  // anything after the last "\n\n" is an incomplete frame and stays in the buffer for next time.
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        onFrame(JSON.parse(line.slice(6)) as BuildFrame);
      } catch {
        // A frame we cannot parse is a frame we cannot draw. Dropping it degrades the animation;
        // throwing here would abandon a build that is very likely still succeeding server-side.
      }
    }
  }
}
