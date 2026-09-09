/* THE RAW THROW THAT REACHED A STUDENT'S SCREEN.
 *
 * MEASURED LIVE 2026-09-09, 3M (workday) packet ec26aae7-1fe1-411b-81cc-9cc929fca063, status
 * `failed`. The row carried BOTH halves of the pair volley-backend writes - a correct authored
 * attention_reason and the raw thrown submission_error - and the "Stopped" card printed the raw
 * one, hostname and request body included.
 *
 * WHAT THESE TESTS REFUSE TO ASSERT. They do not assert that the measured string is unprintable
 * because of anything IN it. The second test below pins the opposite: userFacingError's denylist
 * does not match it and never did, which is why "add a regex arm" is not a fix and why the choice
 * has to be made on the field. If a future edit widens that regex until this test fails, the
 * failure is the point - it means someone is back to filtering content instead of choosing a field.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FAILED_RUN_FALLBACK_SENTENCE, failedRunSentence } from "./failed-run-sentence.ts";
import { userFacingError } from "../../../lib/user-facing-error.ts";

/** Verbatim from the dashboard on 2026-09-09. */
const MEASURED_THROWN_ERROR =
  "Error: A non-submit action attempted employer transport without exact final authority"
  + " (ping transport: POST https://3m.wd1.myworkdayjobs.com/Search/job/US-Texas-Angleton/undefined"
  + " body=json{message:str2109,tenant:str2,user_agent:str109})";

/** Verbatim from the same row: submissionTerminalCause.ts's UNEXPLAINED_RUN_FAILURE_REASON. */
const MEASURED_AUTHORED_REASON =
  "Litos could not finish this application, and it stopped before anything was sent. Nothing has"
  + " gone to the employer. You can try this one again from your dashboard.";

test("the measured 3M row shows its authored sentence, not its thrown error", () => {
  const sentence = failedRunSentence({
    attention_reason: MEASURED_AUTHORED_REASON,
    submission_error: MEASURED_THROWN_ERROR,
  });
  assert.equal(sentence, MEASURED_AUTHORED_REASON);
});

test("no part of the thrown error survives into what the applicant reads", () => {
  const sentence = failedRunSentence({
    attention_reason: MEASURED_AUTHORED_REASON,
    submission_error: MEASURED_THROWN_ERROR,
  });
  /* The hostname and the serialised body are the two halves that made this a disclosure and not
     merely an unreadable sentence. Asserted separately from the equality above so a future change
     to the authored copy cannot quietly turn this into a test of nothing. */
  for (const fragment of ["myworkdayjobs.com", "body=json", "user_agent", "exact final authority"]) {
    assert.equal(sentence.includes(fragment), false, fragment);
  }
});

test("userFacingError's denylist never caught this string, so the field is what has to change", () => {
  /* THE REASON THIS MODULE EXISTS. The old line ran the raw field through this filter and shipped
     whatever came back. The filter is a denylist of stack frames, browser binaries, filesystem
     paths, 5xx text and credential shapes; the measured throw has none of those, so it returned
     unchanged - which is exactly the card that was measured. */
  assert.equal(userFacingError(MEASURED_THROWN_ERROR, "unused"), MEASURED_THROWN_ERROR);
});

test("a row with no authored reason falls back rather than reaching for the raw field", () => {
  assert.equal(
    failedRunSentence({ submission_error: MEASURED_THROWN_ERROR }),
    FAILED_RUN_FALLBACK_SENTENCE,
  );
});

test("an authored reason that is blank or technical still does not fall through to the raw field", () => {
  assert.equal(
    failedRunSentence({ attention_reason: "   ", submission_error: MEASURED_THROWN_ERROR }),
    FAILED_RUN_FALLBACK_SENTENCE,
  );
  assert.equal(
    failedRunSentence({
      attention_reason: "TypeError: x is not a function\n    at run (/Users/ci/app/run.js:1:1)",
      submission_error: MEASURED_THROWN_ERROR,
    }),
    FAILED_RUN_FALLBACK_SENTENCE,
  );
});

const page = readFileSync("app/dashboard/applications/page.tsx", "utf8");

test("the failed card renders through the shared rule, not its own read of the raw field", () => {
  /* The defect restored would be a call to userFacingError on submission_error anywhere in this
     screen. Pinned by source because the card is a branch deep inside SubmissionScreen and nothing
     else can observe which field it reached for. */
  assert.equal(/userFacingError\(\s*review\.submission_error/.test(page), false);
  assert.match(page, /: failedRunSentence\(review\)/);
});

test("no screen in the dashboard prints submission_error", () => {
  /* Broader than the card, on purpose: the rule is about the field, so a second screen adopting the
     raw one is the same defect in a new place. audit-refusal.ts reads submission_error to COMPARE
     it against a fixed set of historical values and never renders it, which is why this looks at
     the page rather than at the whole tree. */
  assert.equal(page.includes("review.submission_error"), false);
});
