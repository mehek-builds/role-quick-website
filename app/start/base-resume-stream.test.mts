import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readBaseResumeFrames,
  withBuildDeadline,
} from "../../lib/base-resume-stream.ts";

const encoder = new TextEncoder();

function doneFrame() {
  return {
    event: "done",
    spec: {
      school: "",
      degree: "",
      grad_date: "",
      coursework: "",
      experience: [],
      skills: [],
    },
    warnings: [],
    metrics: [],
    ats: {},
    built_at: "2026-08-02T00:00:00Z",
  };
}

function sseResponse(frames: unknown[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

test("a stream that closes without done or error is a retryable failure", async () => {
  const seen: Array<{ event: string; stage?: string }> = [];
  const response = sseResponse([{ event: "stage", stage: "selecting" }]);

  await assert.rejects(
    readBaseResumeFrames(response.body!, (frame) => seen.push(frame)),
    /ended before the resume was finished/i,
  );
  assert.deepEqual(seen, [{ event: "stage", stage: "selecting" }]);
});

test("a done frame makes a closed stream successful", async () => {
  const seen: Array<{ event: string }> = [];
  const response = sseResponse([
    { event: "stage", stage: "checking" },
    doneFrame(),
  ]);

  await readBaseResumeFrames(response.body!, (frame) => seen.push(frame));
  assert.deepEqual(seen.map((frame) => frame.event), ["stage", "done"]);
});

test("a terminal frame completes even when the transport stays open", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneFrame())}\n\n`));
    },
    cancel() {
      cancelled = true;
    },
  });
  const seen: Array<{ event: string }> = [];

  await withBuildDeadline(
    () => readBaseResumeFrames(body, (frame) => seen.push(frame)),
    25,
  );

  assert.deepEqual(seen, [doneFrame()]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(cancelled, true);
});

test("an explicit error frame is terminal and remains visible to the caller", async () => {
  const seen: Array<{ event: string; message?: string }> = [];
  const response = sseResponse([
    { event: "stage", stage: "failed" },
    { event: "error", message: "Could not make your resume" },
  ]);

  await readBaseResumeFrames(response.body!, (frame) => seen.push(frame));
  assert.deepEqual(seen.at(-1), {
    event: "error",
    message: "Could not make your resume",
  });
});

test("malformed, non-object, and schema-invalid terminal frames are ignored", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("data: null\n\n"));
      controller.enqueue(encoder.encode("data: not-json\n\n"));
      controller.enqueue(encoder.encode('data: {"event":"done"}\n\n'));
      controller.enqueue(encoder.encode('data: {"event":"error"}\n\n'));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneFrame())}\n\n`));
      controller.close();
    },
  });
  const seen: Array<{ event: string }> = [];

  await readBaseResumeFrames(body, (frame) => seen.push(frame));
  assert.deepEqual(seen, [doneFrame()]);
});

test("the whole build rejects when its deadline expires", async () => {
  await assert.rejects(
    withBuildDeadline(() => new Promise<void>(() => {}), 10),
    /took too long.*try again/i,
  );
});
