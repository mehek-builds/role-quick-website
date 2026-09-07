import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { unverifiedRecoveryStatus } from "./unverified-recovery-status.ts";

const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";

test("exact unresolved recovery reports that verification ended without using page-check count", () => {
  const review = {
    submission_claim_id: ATTEMPT_ID,
    outcome_recovery: { attempt_id: ATTEMPT_ID, state: "unresolved" },
    unverified_submission: { employer_page_checks: [] },
  };
  const status = unverifiedRecoveryStatus(review);

  assert.equal(status.phase, "unresolved");
  assert.equal(status.heading, "Submission not verified");
  assert.match(status.description, /could not verify the employer's response/i);
  assert.match(status.description, /matching confirmation can still update/i);
});

test("an exact pending recovery still reports active checking regardless of prior page checks", () => {
  for (const state of ["pending", "checking"] as const) {
    const review = {
      submission_claim_id: ATTEMPT_ID,
      outcome_recovery: { attempt_id: ATTEMPT_ID, state },
      unverified_submission: { employer_page_checks: [{}, {}, {}] },
    };
    const status = unverifiedRecoveryStatus(review);

    assert.equal(status.phase, "checking");
    assert.equal(status.heading, "Checking submission");
    assert.match(status.description, /checks the original application attempt/i);
  }
});

test("a recovery for another attempt does not claim that checks are active", () => {
  const status = unverifiedRecoveryStatus({
    submission_claim_id: ATTEMPT_ID,
    outcome_recovery: { attempt_id: "22222222-2222-4222-8222-222222222222", state: "checking" },
  });

  assert.equal(status.phase, "unverified");
  assert.equal(status.heading, "Submission unverified");
  assert.doesNotMatch(status.description, /checks the original|while it checks/i);
});

test("missing or malformed recovery identity remains generically unverified", () => {
  for (const review of [
    { submission_claim_id: ATTEMPT_ID },
    { submission_claim_id: ATTEMPT_ID, outcome_recovery: { attempt_id: "", state: "unresolved" } },
    { submission_claim_id: " held-attempt ", outcome_recovery: { attempt_id: " held-attempt ", state: "checking" } },
    { submission_claim_id: ATTEMPT_ID, outcome_recovery: { attempt_id: ATTEMPT_ID, state: "unknown" } },
  ]) {
    const status = unverifiedRecoveryStatus(review);
    assert.equal(status.phase, "unverified");
    assert.equal(status.heading, "Submission unverified");
  }
});

test("all dashboard recovery surfaces render the shared status instead of counting page checks", () => {
  const page = readFileSync("app/dashboard/applications/page.tsx", "utf8");

  assert.doesNotMatch(page, /employer_page_checks\?\.length/);
  assert.match(page, /const recoveryStatus = unverifiedRecoveryStatus\(review\);/);
  assert.match(page, /<UnverifiedSubmissionCard status=\{recoveryStatus\} \/>/);
  assert.match(page, /unverifiedSubmissionReview=\{canonicalUnverifiedSubmissionPacket\?\.spec\._review \?\? null\}/);
  assert.match(page, /const recoveryStatus = onCheckUnverifiedSubmission[\s\S]{0,160}?unverifiedRecoveryStatus\(unverifiedSubmissionReview\)/);
  assert.match(page, /awaitingUnverifiedSubmission[\s\S]{0,100}?recoveryStatus\.heading/);
});
