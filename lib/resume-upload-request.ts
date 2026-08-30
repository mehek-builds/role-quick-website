export const RESUME_UPLOAD_CLIENT_TIMEOUT_MS = 35_000;
export const RESUME_UPLOAD_CLIENT_TIMEOUT_SECONDS = RESUME_UPLOAD_CLIENT_TIMEOUT_MS / 1_000;

export async function resumeUploadIdempotencyKey(file: Blob, userNamespace: string): Promise<string> {
  // Namespace the digest per account so identical public sample resumes cannot be correlated across
  // users if stored profile data is ever inspected outside this request path.
  const digestInput = await new Blob([userNamespace, "\0", file]).arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", digestInput);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function fetchResumeUpload(
  url: string,
  init: RequestInit,
  timeoutMs = RESUME_UPLOAD_CLIENT_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error(`Resume parsing took longer than ${timeoutMs / 1_000} seconds. Please try again.`);
    }
    throw new Error("The upload did not reach us. Check your connection and try again.");
  }
}
