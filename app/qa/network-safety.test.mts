import test from "node:test";
import assert from "node:assert/strict";

import {
  hasLoopbackQaApiUrl,
  hasQaInterceptionSignal,
  QA_INTERCEPTION_READY_KEY,
  QA_INTERCEPTION_READY_VALUE,
} from "./network-safety.ts";

test("route stress frames require a plain HTTP loopback fixture API", () => {
  assert.equal(hasLoopbackQaApiUrl("http://localhost:4202"), true);
  assert.equal(hasLoopbackQaApiUrl("http://127.0.0.1:4202"), true);
  assert.equal(hasLoopbackQaApiUrl("https://localhost:4202"), false);
  assert.equal(hasLoopbackQaApiUrl("https://student-outreach-backend.vercel.app"), false);
  assert.equal(hasLoopbackQaApiUrl("http://localhost.example.com:4202"), false);
  assert.equal(hasLoopbackQaApiUrl("not a URL"), false);
});

test("route stress frames require the browser runner interception signal", () => {
  const ready = { getItem: (key: string) => key === QA_INTERCEPTION_READY_KEY ? QA_INTERCEPTION_READY_VALUE : null };
  const missing = { getItem: () => null };
  const throws = { getItem: () => { throw new Error("storage unavailable"); } };

  assert.equal(hasQaInterceptionSignal(ready), true);
  assert.equal(hasQaInterceptionSignal(missing), false);
  assert.equal(hasQaInterceptionSignal(throws), false);
});
