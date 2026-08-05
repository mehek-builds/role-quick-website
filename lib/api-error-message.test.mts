import test from "node:test";
import assert from "node:assert/strict";

import { apiErrorMessage } from "./api-error-message.ts";

test("apiErrorMessage preserves backend validation issues for dashboard blockers", () => {
  const result = apiErrorMessage({
    error: "Fix the flagged resume content before continuing.",
    issues: [
      "grounding: skill \"Docker\" is not in the student's skills list",
      "experience: SoFi has one bullet but needs at least two",
    ],
  }, 422);

  assert.equal(result.issues.length, 2);
  assert.equal(
    result.message,
    "Fix the flagged resume content before continuing. Issues: grounding: skill \"Docker\" is not in the student's skills list; experience: SoFi has one bullet but needs at least two.",
  );
});

test("apiErrorMessage falls back when the backend sends no safe error", () => {
  assert.deepEqual(apiErrorMessage({}, 500), {
    message: "Request failed (500)",
    issues: [],
  });
});
