import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* R: THE SEND BUTTON THAT COULD NEVER BE PRESSED.
 *
 * Cresta packet 8142004c-3358-4538-8778-16df5e31c5bb, read in a real browser and in production on
 * 2026-08-09. Status ready_for_final_approval. The review panel read "Done, 6 checked" over a
 * complete filled Greenhouse form with no screener questions and no validation errors. Under the
 * resume preview it read "Loading cover letter." and the green "Send it" button was pale and did
 * nothing when clicked. It fired no request because it was `disabled`.
 *
 * The server had the cover letter. `spec->'_cover_letter'` held a 294 word body, an object_key and
 * a file_name, `storedCoverLetter` returns it, and GET /applications/:id/submission was handing it
 * to the browser every 2.5 seconds.
 *
 * TWO defects, and it took both:
 *
 *   1. selectPacket SEEDED `submission` from the board row, which carries `spec._review` and
 *      nothing else, so the seed had no `cover_letter` even though the same board row carries
 *      `spec._cover_letter`.
 *   2. The poll installed its response only when `review.updated_at` differed. That timestamp
 *      versions the REVIEW; `cover_letter`, `handoff_url` and `configured` ride along unversioned.
 *      A packet parked in ready_for_final_approval has a frozen `review.updated_at`, so every poll
 *      for the rest of that packet's life matched the seed and threw the cover letter away.
 *
 * This is the same failure class as the <span> pills that produced 79 prepared resumes and 0 sent
 * applications, reached a different way: not a control with nothing bound to it, but a real control
 * permanently disabled by a client state the server disagreed with, behind a progress message that
 * could never resolve.
 *
 * These assertions guard the shape of the fix, not its copy: the merge rule, the seed, the bounded
 * wait, and the fact that the greyed-out button names this reason like it names every other one.
 */

function shippedCode(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const dashboardUrl = new URL("../app/dashboard/applications/page.tsx", import.meta.url);

test("the poll cannot discard a response that carries a cover letter the snapshot lacks", async () => {
  const dashboard = shippedCode(await readFile(dashboardUrl, "utf8"));

  // The exact rule that shipped the defect. `review.updated_at` alone may never decide the fate of
  // a response that carries three fields the review does not version.
  assert.doesNotMatch(
    dashboard,
    /setSubmission\(\(current\) => current\?\.review\.updated_at === result\.review\.updated_at \? current : result\)/,
  );
  assert.match(dashboard, /setSubmission\(\(current\) => nextSubmissionState\(current, result\)\)/);
  assert.match(dashboard, /nextSubmissionState[\s\S]{0,400}from "@\/features\/applications"/);
});

test("the board seed carries the cover letter it already has, and admits it is a seed", async () => {
  const dashboard = shippedCode(await readFile(dashboardUrl, "utf8"));

  assert.match(dashboard, /cover_letter: packet\.spec\._cover_letter \?\? null/);
  assert.match(dashboard, /partial: true/);
});

test("writing a cover letter unblocks the screen that is blocked on it", async () => {
  const dashboard = shippedCode(await readFile(dashboardUrl, "utf8"));

  // `packets` and `submission` are two copies of the same letter. Generate, save and remove all
  // write both, or "Write it yourself" walks the applicant into the same dead button.
  assert.match(dashboard, /const applyCoverLetterToSubmission = useCallback/);
  assert.match(dashboard, /applyCoverLetterToSubmission\(applicationId, result\.cover_letter\)/);
  assert.match(dashboard, /applyCoverLetterToSubmission\(applicationId, null\)/);
});

test("the wait for a cover letter ends, and ends in something the applicant can act on", async () => {
  const source = await readFile(dashboardUrl, "utf8");
  const dashboard = shippedCode(source);

  assert.match(dashboard, /const coverLetterState = coverLetterGate\(/);
  assert.match(dashboard, /const coverLetterPending = coverLetterBlocks\(coverLetterState\)/);
  assert.match(dashboard, /setTimeout\(\(\) => setCoverLetterWaitedFor\(waitedApplicationId\), COVER_LETTER_WAIT_MS\)/);
  assert.match(dashboard, /const coverLetterWaited = coverLetterMissing && coverLetterWaitedFor === waitedApplicationId/);

  // "Loading cover letter." is allowed, but only while it is still loading.
  assert.match(dashboard, /coverLetterState === "loading" &&[\s\S]{0,200}Loading cover letter\./);

  // And when it is not loading any more it says so, out loud, with both doors open.
  assert.match(source, /coverLetterState === "unavailable"[\s\S]{0,1400}role="alert"/);
  assert.match(source, /Litos does not have one to show you, so it cannot send this yet/);
  assert.match(source, /onClick=\{onReloadCoverLetter\}/);
  assert.match(source, /onClick=\{onWriteCoverLetter\}/);
  assert.match(source, /onReloadCoverLetter=\{\(\) => void reloadCoverLetter\(\)\}/);
  assert.match(source, /onWriteCoverLetter=\{\(\) => moveToScreen\("review"\)\}/);
  // The retry reports its own failure rather than swallowing it into the same silence.
  assert.match(dashboard, /Could not fetch the cover letter\. Check your connection, then try again\./);
});

test("the disabled Send button names the cover letter the way it names every other blocker", async () => {
  const source = await readFile(dashboardUrl, "utf8");

  // Every other term in finalApprovalBlocked already had a line under the button. This one did not,
  // so the only screen that could explain the dead button explained everything except the cause.
  assert.match(source, /coverLetterState === "loading" &&[\s\S]{0,300}Loading cover letter\./);
  assert.match(source, /coverLetterState === "unavailable" &&[\s\S]{0,300}No cover letter to show you\./);
  assert.match(
    shippedCode(source),
    /const finalApprovalBlocked = educationProfilePending \|\| Boolean\(educationDriftWarning\) \|\| coverLetterPending \|\| requiredAnswerMissing \|\| sensitiveQuestionPresent \|\| !previewReady \|\| approving/,
  );
});
