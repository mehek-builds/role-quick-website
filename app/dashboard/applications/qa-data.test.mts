import { test } from "node:test";
import assert from "node:assert/strict";
import { QA_SCENARIOS } from "./qa-data.ts";

test("Deepgram QA answer is company-specific, not generic filler", () => {
  const answer = QA_SCENARIOS.deepgram.spec._review?.questions.find(
    (question) => question.id === "deepgram-why",
  )?.answer;

  assert.ok(answer);
  assert.match(answer, /Flux/i);
  assert.match(answer, /turn detection/i);
  assert.match(answer, /Voice Agent API/i);
  assert.match(answer, /low-latency/i);
  assert.match(answer, /developer-friendly/i);
  assert.doesNotMatch(answer, /combines developer infrastructure with applied voice AI/i);
});
