import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readBaseResumeFrames,
  withBuildDeadline,
} from "../../lib/base-resume-stream.ts";

const encoder = new TextEncoder();

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
    { event: "done", spec: {} },
  ]);

  await readBaseResumeFrames(response.body!, (frame) => seen.push(frame));
  assert.deepEqual(seen.map((frame) => frame.event), ["stage", "done"]);
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

test("malformed and non-object frames are ignored without crashing the recovery path", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("data: null\n\n"));
      controller.enqueue(encoder.encode("data: not-json\n\n"));
      controller.enqueue(encoder.encode('data: {"event":"done"}\n\n'));
      controller.close();
    },
  });
  const seen: Array<{ event: string }> = [];

  await readBaseResumeFrames(body, (frame) => seen.push(frame));
  assert.deepEqual(seen, [{ event: "done" }]);
});

test("the whole build rejects when its deadline expires", async () => {
  await assert.rejects(
    withBuildDeadline(() => new Promise<void>(() => {}), 10),
    /took too long.*try again/i,
  );
});
