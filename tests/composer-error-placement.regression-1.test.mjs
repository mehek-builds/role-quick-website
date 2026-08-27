import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

// Regression: ISSUE-043, the half of the composer ISSUE-040 did not reach.
//
// ISSUE-040 moved the two EMPTY-FORM validation refusals into the composer's own button row and
// stopped there. Everything else either composer button could say still went to the page-level
// banner, which renders far above the composer. Measured on production on 2026-08-04 with
// /resume/generate returning 500 on a fully filled form:
//
//   viewport    button      alert top   in viewport
//   1440x900    on screen   119         yes
//   1280x723    on screen   -126        NO
//   375x812     on screen   -195        NO
//
// Worse than the ISSUE-040 case, because the failure also moves scrollY (345 -> 413 and 560 -> 628),
// carrying the banner further out of reach. A student on a phone presses "Make my resume", the
// request fails, and nothing visibly happens.
//
// The line this file holds:
//   * a message caused by pressing a button INSIDE the composer renders beside that button;
//   * a message about the state of the page stays in the page banner.
// So "Read job" and "Make my resume" own all of their outcomes, and the applications-list load,
// the preferences load, the autopilot's unattended send and the review screen keep the banner.
//
// Two further invariants, both of which a one-operator change can quietly break:
//   * a server failure marks NO fields. Nothing the student typed is wrong, and four aria-invalid
//     boxes on a 500 are a lie about their input.
//   * exactly one live region speaks. Raising a composer refusal clears the page banner, or a
//     screen reader reads a stale problem and the new one back to back.

const source = readFileSync("app/dashboard/applications/page.tsx", "utf8");

// Comments are stripped before EVERY structural assertion, in both directions. This file documents
// its own reasoning at length in the source it inspects, and an assertion satisfied from inside a
// comment has already gone green against a live defect in this repo.
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

const region = (from, to, label) => {
  const start = code.indexOf(from);
  const end = code.indexOf(to);
  assert.ok(start >= 0 && end > start, `${label} must still be findable`);
  return code.slice(start, end);
};

const fetchJobDescription = region("async function fetchJobDescription", "async function fillApplication", "fetchJobDescription");
const fillApplication = region("async function fillApplication", "async function createApplication", "fillApplication");
const createApplication = region("async function createApplication", "async function generateCoverLetter", "createApplication");
const sendWithoutAsking = region("const sendWithoutAsking", "const reviewOpen", "sendWithoutAsking");
const panel = region("function NewApplicationPanel", "function ApplicationField", "NewApplicationPanel");

describe("every message a composer button raises lands beside that button", () => {
  test("the helper exists and is the single channel", () => {
    // Asserted on the expression, not on the identifier appearing nearby: the body has to clear the
    // banner AND set the refusal, in that order, or the two announcements coexist.
    //
    // The refusal object is allowed to carry MORE than {message, fields, at} - `needsExtension` was
    // added so an install/update refusal can offer a link to the Chrome Web Store beside the alert
    // (see lib/extension-store-link.ts). What this test is about is the ORDER of the two calls, and
    // that is unchanged and still asserted exactly. The field list is deliberately open-ended rather
    // than re-pinned to today's shape, so the next field does not fail a test about announcements.
    assert.match(
      code,
      /const refuseInComposer = useCallback\(\(at: ComposerSlot, message: string, fields: ApplicationDraftField\[\]\) => \{\s*setError\(null\);\s*setComposerRefusal\(\{ message, fields, at[^}]*\}\);\s*\}, \[\]\);/,
      "refuseInComposer must clear the page banner and then set the refusal",
    );
  });

  test("Read job answers beside Read job, never in the banner and never in the generate row", () => {
    // These three were the miss. The first two are the same class of validation ISSUE-040 moved for
    // the other button; the third is /jobs/extract failing.
    //
    // The slot is asserted, not just the routing. The first cut of this fix put all three in the
    // generate row, which the harness measured at y = 979 on 375x812 with the Read job button at
    // y = 554: still off screen, from the other direction. "Inside the composer" is not the bar.
    for (const message of [
      "Add the job link first, then get the description.",
      "Enter a complete job URL beginning with https://.",
      "We could not read that page. Paste the job description below instead.",
    ]) {
      assert.ok(
        new RegExp(`refuseInComposer\\("url",[^;]*"${message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(fetchJobDescription),
        `${message} must be raised in the url slot`,
      );
      assert.ok(
        !new RegExp(`setError\\([^)]*${message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(fetchJobDescription),
        `${message} must not be raised in the page banner`,
      );
    }
    assert.doesNotMatch(fetchJobDescription, /refuseInComposer\("action"/, "Read job must not answer in the action row");
    // setError(null) is the only setError allowed to survive here, and only as a clear.
    const setErrorCalls = [...fetchJobDescription.matchAll(/setError\(([^)]*)\)/g)].map((match) => match[1]);
    assert.deepEqual(setErrorCalls, ["null"], "Read job must not write to the page banner");
  });

  test("Tailor resume answers in the composer when the request fails", () => {
    // The exact expression, including the empty fields array. Swapping [] for `missing` or for the
    // four field names restores a lie about the student's input while leaving the message visible,
    // which is precisely the mutation an identifier-presence assertion cannot see.
    assert.match(
      createApplication,
      /reportGenerationFailure\(reason instanceof Error \? reason\.message : "We could not build this application\. Check the job description and try again\.", \[\]\);/,
      "the tailoring failure must be raised beside the action buttons with no fields marked",
    );
    assert.match(createApplication, /else \{\s*refuseInComposer\("action", message, fields\);/);
    const setErrorCalls = [...createApplication.matchAll(/setError\(([^)]*)\)/g)].map((match) => match[1]);
    assert.deepEqual(setErrorCalls, ["null"], "the generate path must not write to the page banner");
  });

  test("Fill application answers in the composer without starting generation", () => {
    assert.match(
      fillApplication,
      /reportFailure\(reason instanceof Error \? reason\.message : "Litos could not prepare this form\. Your job details are still here\."\);/,
    );
    assert.match(
      fillApplication,
      /if \(errorSurface === "tracker"\)[\s\S]{0,480}else \{\s*refuseInComposer\("action", message, fields\);/,
      "a composer retry stays beside its button while a Tracker or captcha-recovery retry stays off the page banner",
    );
    assert.doesNotMatch(fillApplication, /\/resume\/generate/);
  });

  test("a server failure marks no boxes, and the panel honours that", () => {
    // Behavioural, not textual: the predicate is lifted out of the component and run. `?? false`
    // flipped to `?? true`, or `.includes` to `.length > 0`, changes the answer for an empty array
    // and is caught here rather than by reading the operator back to itself.
    const visible = panel.match(/const visibleRefusal = (.+);/);
    const match = panel.match(/const invalid = \(field: ApplicationDraftField\) => (.+);/);
    assert.ok(visible && match, "the panel must still derive per-field invalidity from the visible refusal");
    const invalid = new Function(
      "refusal",
      "field",
      "postingDistinction",
      `const visibleRefusal = ${visible[1]}; return ${match[1]};`,
    );
    const serverFailure = { message: "Boom.", fields: [] };
    for (const field of ["company", "role", "portalUrl", "jobDescription"]) {
      assert.equal(invalid(serverFailure, field, null), false, `${field} must not be marked invalid by a server failure`);
    }
    // And it still marks what a validation refusal names, so the fix did not buy this by disabling
    // marking altogether.
    assert.equal(invalid({ message: "Fill in all four boxes first.", fields: ["role"] }, "role", null), true);
    assert.equal(invalid({ message: "Fill in all four boxes first.", fields: ["role"] }, "company", null), false);
    assert.equal(invalid(null, "role", null), false);
    assert.equal(invalid({ message: "Old refusal", fields: ["role"] }, "role", { tone: "resolved" }), false);
  });

  test("each button has a slot, and the note sits in both of them", () => {
    // Read job's slot is directly under the Job URL row it is about; the generate row keeps its own.
    assert.match(panel, /<ComposerRefusalNote refusal=\{visibleRefusal\} at="url" \/>/);
    assert.match(panel, /<ComposerRefusalNote refusal=\{visibleRefusal\} at="action" \/>/);
    const urlSlot = panel.indexOf('at="url"');
    const textarea = panel.indexOf('id="new-application-jd"');
    const generateSlot = panel.indexOf('at="action"');
    assert.ok(urlSlot > 0 && urlSlot < textarea, "the url slot must sit above the job description box, beside Read job");
    assert.ok(generateSlot > textarea, "the generate slot must sit below it, beside Make my resume");
  });

  test("the message renders whether or not any box is marked, and only in one slot", () => {
    // Gated on the refusal existing and its slot matching, never on it naming a field.
    // `refusal.fields.length` creeping into that condition would silence every network failure
    // while every test about validation stayed green.
    const note = region("function ComposerRefusalNote", "function ApplicationField", "ComposerRefusalNote");
    assert.match(note, /if \(!refusal \|\| refusal\.at !== at\) return null;/);
    assert.doesNotMatch(note, /fields\.length/);
    assert.match(note, /role="alert">\{refusal\.message\}<\/p>/);
    // One live region, written once. Two copies behind two conditions is how they drift apart.
    //
    // Scoped to the composer, which is what this assertion has always MEANT. Counted over the whole
    // file it was a claim about the entire page, and the page is allowed more than one alert: the
    // packet-staleness sibling adds an education-drift banner, gated on reviewOpen so it can never
    // be on screen at the same time as the composer. That merge is textually clean and semantically
    // red, which git cannot see, so the scope is the fix rather than the number.
    assert.equal([...code.matchAll(/refusal\.message/g)].length, 1);
    assert.equal([...panel.matchAll(/role="alert"/g)].length, 1);
  });
});

describe("page-level facts stay in the page banner", () => {
  test("the autopilot's unattended send is not a composer refusal", () => {
    // Nobody pressed a composer button. Routing this into the composer would answer a question the
    // composer did not ask, in a panel that is usually closed when this fires.
    assert.match(
      sendWithoutAsking,
      /setError\(reason instanceof Error \? reason\.message : "Could not send that application on its own\. It is still here for you\."\);/,
    );
    assert.doesNotMatch(sendWithoutAsking, /refuseInComposer/);
  });

  test("failing to load the page's own data stays in the banner", () => {
    for (const message of [
      "We could not load your applications. Reload the page.",
    ]) {
      assert.ok(code.includes(`setError(reason instanceof Error ? reason.message : "${message}")`), message);
    }
    assert.doesNotMatch(code, /refuseInComposer\([^)]*Reload the page/);
  });

  test("a job link that will not open stays in the banner, and says nothing the backend said", () => {
    /* This used to be the second entry in the list above, asserting
       `setError(reason instanceof Error ? reason.message : "We could not load that job...")`. The
       `reason.message` half of that is what put the backend's own "Job not found" on screen, in red,
       over a Tracker that was at that moment listing the very application the id belonged to
       (2026-08-11). The placement finding this file is about is unchanged and still asserted: this
       is page-level news and it belongs in the page banner, not in the composer. What is gone is
       the backend's wording, which is a different rule from a different file
       (lib/user-facing-error.ts) and one this path was exempt from. */
    assert.ok(
      code.includes('setError("We could not open that job link. Everything you have already built is listed below.")'),
      "the ?job= failure has to reach the page banner",
    );
    const effect = code.slice(code.indexOf("const resolvedJobParam = useRef"));
    assert.doesNotMatch(
      effect.slice(0, effect.indexOf("}, [openApplication, packets, qaMode]")),
      /refuseInComposer/,
      "nobody pressed a composer button to get here",
    );
    assert.doesNotMatch(code, /reason\.message : "We could not load that job/);
  });
});
