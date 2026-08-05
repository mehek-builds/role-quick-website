import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

/* A PACKET IS FROZEN AT BUILD TIME AND THE UNATTENDED SEND WAS THE ONE PATH THAT NEVER RECHECKED IT.
 *
 * The resume that reaches an employer is the PDF blob rendered when the packet was built: the
 * backend's submissionRunner.buildPacket downloads `generated_resumes.resume_object_key` and
 * uploads those exact bytes. Nothing re-derives it from the profile at send time. Measured on a
 * live account, a stored packet printed a May 2027 graduation while the profile said May 2028, and
 * graduation year is not cosmetic: it is what decides whether a student is eligible for a summer
 * internship at all.
 *
 * Sending from the review screen was already covered by accident. `continueFromResume` calls
 * `saveResume` first, and PATCH /applications/:id/resume re-validates the spec's education against
 * the current profile server-side ("education graduation date differs from uploaded resume"), so a
 * drifted packet is refused there.
 *
 * `sendWithoutAsking` - the autopilot countdown reaching zero - posts submit-request on its own
 * with no save in front of it. Its own comment described it as "the same POST the review screen's
 * own send makes", which is true of the POST and false of the flow: the review screen saves first
 * and this does not. So an unattended send was the only way a resume stating a graduation year the
 * student had already corrected could reach an employer with no human and no check in between.
 *
 * This test pins the guard structurally rather than through the DOM, because the failure is an
 * ABSENT check: a render test can only assert on what a mounted component shows, and what went
 * wrong here is that one function did not consult something before firing a network call.
 */

/* Comments stripped before every structural assertion, so the explanation above is allowed to
   quote the very call it is asserting is present in the code. */
function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const PAGE = code(readFileSync("app/dashboard/applications/page.tsx", "utf8"));

/** The body of a named function declaration, matched by brace depth. */
function functionBody(source, name) {
  const callbackStart = source.indexOf(`${name} = useCallback(`);
  const declarationStart = source.indexOf(`function ${name}(`);
  const start = callbackStart === -1 ? declarationStart : callbackStart;
  assert.notEqual(start, -1, `${name} is no longer declared the way this test finds it`);
  const open = callbackStart === -1 ? source.indexOf("{", start) : source.indexOf("(", start);
  const close = callbackStart === -1 ? "}" : ")";
  const openToken = callbackStart === -1 ? "{" : "(";
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === openToken) depth += 1;
    else if (source[i] === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} never closes`);
}

describe("the unattended send checks the packet against the profile first", () => {
  const body = functionBody(PAGE, "sendWithoutAsking");

  test("it consults educationDrift before it posts the submission", () => {
    const drift = body.indexOf("educationDrift");
    const post = body.indexOf("submit-request");
    assert.notEqual(drift, -1, "the autopilot send does not check the packet's education at all");
    assert.notEqual(post, -1, "the autopilot send no longer posts submit-request");
    assert.ok(drift < post, "the education check must run BEFORE the submission is posted, not after");
  });

  test("it returns without sending when the packet has drifted", () => {
    assert.match(
      body,
      /educationDrift[\s\S]{0,200}?if \(drift\) \{[\s\S]{0,240}?return;/,
      "drift must stop the send, not merely be noticed",
    );
  });

  test("the profile it compares against is fetched, not assumed", () => {
    assert.match(PAGE, /api<EducationProfile>\("\/profile"\)/);
    assert.match(body, /educationProfile/);
  });
});

describe("the review screen says so before the student presses send", () => {
  const approveBody = functionBody(PAGE, "approveFinalSubmission");

  test("a drift banner renders while the review screen is open", () => {
    assert.match(PAGE, /reviewOpen && educationDriftBanner/);
  });

  test("the banner is derived from the spec being edited, so fixing the line clears it", () => {
    assert.match(PAGE, /educationDriftBanner = useMemo\(\s*\(\) =>\s*\(spec \? educationDriftMessage\(educationDrift\(spec,/);
  });

  test("the final approval screen blocks drifted packets and sends the user back to the resume", () => {
    assert.match(PAGE, /educationDriftWarning = educationDriftMessage\(educationDrift\(packet\.spec, educationProfile\)\)/);
    assert.match(PAGE, /educationProfilePending = educationProfileStatus !== "ready"/);
    assert.match(PAGE, /finalApprovalBlocked = educationProfilePending \|\| Boolean\(educationDriftWarning\)/);
    assert.match(PAGE, /onCheckResume=\{\(\) => moveToScreen\("review"\)\}/);
    assert.match(PAGE, /Save the corrected resume, then Litos will refill the company form with the updated PDF/);
    assert.match(PAGE, /Litos is checking this resume against your current profile before it can be sent/);
  });

  test("the final approval action rechecks drift before it posts approval", () => {
    const status = approveBody.indexOf('educationProfileStatus !== "ready"');
    const drift = approveBody.indexOf("educationDrift");
    const approve = approveBody.indexOf("submission/approve");
    assert.notEqual(status, -1, "the final approval action does not wait for profile verification");
    assert.notEqual(drift, -1, "the final approval action does not check the packet's education");
    assert.notEqual(approve, -1, "the final approval action no longer posts approval");
    assert.ok(status < approve, "profile verification must finish before approval is posted");
    assert.ok(drift < approve, "the education check must run before approval is posted");
    assert.match(approveBody, /if \(drift\) \{[\s\S]{0,160}?moveToScreen\("review"\);[\s\S]{0,80}?return;/);
  });
});
