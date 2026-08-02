// Finish before the backend's 300 second Vercel ceiling, so platform termination becomes a clear
// retryable client error instead of an open or truncated stream with no terminal frame.
export const BASE_RESUME_BUILD_DEADLINE_MS = 285_000;

const TIMED_OUT_MESSAGE = "The resume build took too long. Try again.";
const INCOMPLETE_MESSAGE = "The build ended before the resume was finished. Try again.";

/** Bound the entire request, including waiting for headers and reading the response body. */
export async function withBuildDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = BASE_RESUME_BUILD_DEADLINE_MS,
  externalSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromCaller();
  else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(TIMED_OUT_MESSAGE);
      reject(error);
      controller.abort(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

/** Read data-only SSE frames and require an explicit terminal event before EOF. */
export async function readBaseResumeFrames<T extends { event: string }>(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: T) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((candidate) => candidate.startsWith("data: "));
      if (!line) continue;
      let parsed: T;
      try {
        const value = JSON.parse(line.slice(6)) as unknown;
        if (!value || typeof value !== "object" || typeof (value as { event?: unknown }).event !== "string") {
          continue;
        }
        parsed = value as T;
      } catch {
        continue;
      }
      const terminal = parsed.event === "done" || parsed.event === "error";
      if (terminal && !hasValidTerminalPayload(parsed)) continue;
      onFrame(parsed);
      if (terminal) {
        // A terminal frame is the protocol boundary. Do not wait for a proxy or server to close the
        // connection, because a held-open response would turn a completed build into a timeout.
        void reader.cancel().catch(() => {});
        return;
      }
    }
  }

  throw new Error(INCOMPLETE_MESSAGE);
}

function hasValidTerminalPayload(frame: { event: string }): boolean {
  const payload = frame as Record<string, unknown>;
  if (frame.event === "done") {
    if (!isRecord(payload.spec)) return false;
    const spec = payload.spec;
    return (
      typeof spec.school === "string" &&
      typeof spec.degree === "string" &&
      typeof spec.grad_date === "string" &&
      typeof spec.coursework === "string" &&
      Array.isArray(spec.experience) &&
      Array.isArray(spec.skills) &&
      Array.isArray(payload.warnings) &&
      Array.isArray(payload.metrics) &&
      isRecord(payload.ats) &&
      typeof payload.built_at === "string"
    );
  }
  if (frame.event === "error") {
    return typeof payload.message === "string" && payload.message.length > 0;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
