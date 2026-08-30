import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { mock } from "node:test";
import {
  fetchResumeUpload,
  RESUME_UPLOAD_CLIENT_TIMEOUT_MS,
  RESUME_UPLOAD_CLIENT_TIMEOUT_SECONDS,
  resumeUploadIdempotencyKey,
} from "./resume-upload-request.ts";

const dashboardSource = await readFile(new URL("../app/dashboard/resume/page.tsx", import.meta.url), "utf8");

test("resume upload passes a 35 second abort signal to fetch", async (t) => {
  t.after(() => mock.restoreAll());
  const signal = new AbortController().signal;
  let receivedSignal: AbortSignal | null | undefined;
  mock.method(AbortSignal, "timeout", (milliseconds: number) => {
    assert.equal(milliseconds, RESUME_UPLOAD_CLIENT_TIMEOUT_MS);
    return signal;
  });
  mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
    receivedSignal = init?.signal;
    return new Response("{}", { status: 200 });
  });

  await fetchResumeUpload("https://example.test/profile", { method: "POST" });
  assert.equal(receivedSignal, signal);
  assert.equal(RESUME_UPLOAD_CLIENT_TIMEOUT_SECONDS, 35);
});

for (const name of ["TimeoutError", "AbortError"] as const) {
  test(`${name} becomes a retryable resume timeout message`, async (t) => {
    t.after(() => mock.restoreAll());
    mock.method(globalThis, "fetch", async () => {
      throw new DOMException("request stopped", name);
    });

    await assert.rejects(
      () => fetchResumeUpload("https://example.test/profile", { method: "POST" }),
      { message: "Resume parsing took longer than 35 seconds. Please try again." },
    );
  });
}

test("a dropped connection keeps its distinct recovery message", async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });

  await assert.rejects(
    () => fetchResumeUpload("https://example.test/profile", { method: "POST" }),
    { message: "The upload did not reach us. Check your connection and try again." },
  );
});

test("the same resume bytes produce the same retry key", async () => {
  const first = await resumeUploadIdempotencyKey(new Blob(["same resume"]), "user-1");
  const retry = await resumeUploadIdempotencyKey(new Blob(["same resume"]), "user-1");
  const different = await resumeUploadIdempotencyKey(new Blob(["different resume"]), "user-1");
  const otherUser = await resumeUploadIdempotencyKey(new Blob(["same resume"]), "user-2");
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(retry, first);
  assert.notEqual(different, first);
  assert.notEqual(otherUser, first);
});

test("onboarding and dashboard uploads share the same bounded request helper", () => {
  assert.match(dashboardSource, /const parsedProfile = await uploadResume\(file\)/);
  assert.doesNotMatch(dashboardSource, /fetch\(`\$\{API_URL\}\/profile`/);
});
