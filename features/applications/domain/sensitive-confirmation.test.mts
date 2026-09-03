import assert from "node:assert/strict";
import test from "node:test";
import type { ApplicationReview } from "@/lib/api";
import { checklistRowControl, humanInputItems, sensitiveConfirmationItems } from "./submission-checklist.ts";
import {
  applicantConfirmedAnswer,
  sensitiveConfirmationLabels,
  sensitiveConfirmationPending,
  sensitiveConfirmationQuestionIds,
  sensitiveConfirmationQuestions,
  sensitiveConfirmationRefusalLabels,
  sensitiveConfirmationSendRouteQuestionId,
  SENSITIVE_CONFIRMATION_ANSWERED_DETAIL,
  SENSITIVE_CONFIRMATION_BADGE,
  SENSITIVE_CONFIRMATION_UNANSWERED_DETAIL,
} from "./sensitive-confirmation.ts";

/* THE PACKET THIS WAS MEASURED ON. Hudson River Trading, Greenhouse, application 4a79eec1,
   2026-09-03: ready_for_final_approval, server audit passed, 27 of 27 questions answered, 46 fields
   filled, resume verified attached on the employer's own form, and every press of Send application
   answered 422. The sponsorship question below is the one the send gate was holding, and its answer
   is "Yes" - she ANSWERED it. What was missing was any statement anywhere that her confirmation was
   still owed. */
const SPONSORSHIP = "Will you now, or in the future, require visa sponsorship to legally work in the country specified for this position?";

/* THE LABELS ARE A SECOND ARGUMENT, NOT A FIELD ON THE REVIEW, and every test here passes them that
   way because the backend ships them that way: `sensitive_questions_requiring_confirmation` is a
   sibling of `review` on the GET /applications/:id/submission envelope, derived on each read from
   the stored questions and her profile. A reader that looked for it on the review would be reading
   a key that is never there, and would be permanently, silently dark. */
function hrt(overrides: Partial<ApplicationReview> = {}): ApplicationReview {
  return {
    jd_text: "",
    status: "ready_for_final_approval",
    edited_terms: [],
    skipped_reasons: [],
    updated_at: "2026-09-03T09:00:00.000Z",
    questions: [
      { id: "q-sponsorship", question: SPONSORSHIP, answer: "Yes", kind: "required", required: true },
      { id: "q-referral", question: "How did you hear about this role?", answer: "Job board", kind: "required", required: true },
    ],
    ...overrides,
  } as ApplicationReview;
}

/* ---- ABSENT IS NONE, AND IT IS THE ONLY STATE PRODUCTION IS IN TODAY ----
   volley #906 is not merged, so every live envelope omits this field, and so does every envelope
   the dashboard installs that is not a GET /submission response. Every one of these has to be the
   "nothing happens" answer, or this change is not dark, it is a regression waiting on a deploy. */

test("an absent list asks for nothing, marks nothing, and blocks nothing", () => {
  const review = hrt();
  assert.deepEqual(sensitiveConfirmationLabels(undefined), []);
  assert.deepEqual(sensitiveConfirmationQuestions(review, undefined), []);
  assert.deepEqual(sensitiveConfirmationQuestionIds(review, undefined), []);
  assert.equal(sensitiveConfirmationPending(review, undefined), false);
  assert.deepEqual(sensitiveConfirmationItems(review), []);
  assert.deepEqual(sensitiveConfirmationItems(review, { sensitiveConfirmations: undefined }), []);
});

test("a malformed list is read as absent rather than as a requirement", () => {
  const review = hrt();
  for (const value of [null, undefined, "a string", 7, {}, [], [""], ["   "], [42, null]]) {
    assert.deepEqual(sensitiveConfirmationLabels(value), [], `${JSON.stringify(value)} invented a requirement`);
    assert.equal(sensitiveConfirmationPending(review, value), false);
  }
});

/* ---- THE MEASURED CASE ---- */

test("the question the server names is resolved, marked and given a Confirm control", () => {
  const review = hrt();

  assert.deepEqual(sensitiveConfirmationQuestionIds(review, [SPONSORSHIP]), ["q-sponsorship"]);
  assert.equal(sensitiveConfirmationPending(review, [SPONSORSHIP]), true);

  const items = sensitiveConfirmationItems(review, { sensitiveConfirmations: [SPONSORSHIP] });
  assert.equal(items.length, 1, "the one question waiting on her must produce exactly one row");
  const row = items[0];
  assert.equal(row.questionId, "q-sponsorship");
  assert.equal(row.action, "Confirm");
  assert.equal(row.actionKind, "confirm");
  assert.equal(row.badge, SENSITIVE_CONFIRMATION_BADGE);
  /* THE COPY IS THE POINT. She answered "Yes". A row saying she failed to answer would be the
     screen accusing her of the product's own caution, so the sentence says the answer is saved and
     says why Litos will not send it. */
  assert.equal(row.detail, SENSITIVE_CONFIRMATION_ANSWERED_DETAIL);
  assert.match(row.detail!, /Your answer is saved/);
  assert.match(row.detail!, /Litos will not make this declaration to an employer for you/);
  assert.doesNotMatch(row.detail!, /missing|required answer|you did not answer/i);

  const control = checklistRowControl(row, {});
  assert.equal(control?.element, "button");
  assert.equal(control?.element === "button" ? control.intent : null, "confirm", "the press must record a confirm intent or her save mints no claim");
  assert.equal(control?.element === "button" ? control.questionId : null, "q-sponsorship");
  assert.match(control?.name ?? "", /^Confirm your answer to: /);
});

test("the question the server does not name is untouched", () => {
  const items = sensitiveConfirmationItems(hrt(), { sensitiveConfirmations: [SPONSORSHIP] });
  assert.equal(items.some((item) => item.questionId === "q-referral"), false);
});

/* A packet at ready_for_final_approval has NO Your turn panel, which is exactly why nothing on
   screen ever said this. The rows must exist for that status, because that is the status this was
   measured at. */
test("the rows exist on the status that has no Your turn panel", () => {
  for (const status of ["ready_for_final_approval", "needs_attention"] as const) {
    const items = sensitiveConfirmationItems(hrt({ status }), { sensitiveConfirmations: [SPONSORSHIP] });
    assert.equal(items.length, 1, `${status} lost the row that names the confirmation`);
  }
});

test("a submitted application is never asked to confirm anything", () => {
  const items = sensitiveConfirmationItems(hrt({ status: "submitted" }), { sensitiveConfirmations: [SPONSORSHIP] });
  assert.deepEqual(items, []);
});

/* ---- A BLANK ONE IS STILL A CONFIRMATION, AND THE CAPTION IS THE HALF THAT CHANGES ----
   The kind decides what the press MEANS, the caption decides what it SAYS. Routing a blank one
   through "answer" would open the editor with no confirm intent recorded, her save would carry no
   `confirmed` flag, the server would mint no applicant claim, and the same ask would come back on
   the next round: the DV Trading loop, re-entered through the blank door. */
test("a named question with no answer asks her to answer it, and still routes as a confirmation", () => {
  const review = hrt({
    questions: [{ id: "q-sponsorship", question: SPONSORSHIP, answer: "", kind: "required", required: true }],
  });
  const row = sensitiveConfirmationItems(review, { sensitiveConfirmations: [SPONSORSHIP] })[0];
  assert.ok(row);
  assert.equal(row.action, "Answer");
  assert.equal(row.actionKind, "confirm");
  assert.equal(row.detail, SENSITIVE_CONFIRMATION_UNANSWERED_DETAIL);
  assert.match(row.detail!, /Only you can answer this one/);
});

/* An off-list answer is not empty and is not an answer the portal can take either, so the caption
   is the one that asks her to answer rather than the one that says her answer is saved. */
test("a named question whose answer names no offered option asks her to answer it", () => {
  const review = hrt({
    questions: [{
      id: "q-sponsorship",
      question: SPONSORSHIP,
      answer: "It depends on the office",
      kind: "required",
      required: true,
      portal_input_type: "select-one",
      options: ["Yes", "No"],
    }],
  });
  const row = sensitiveConfirmationItems(review, { sensitiveConfirmations: [SPONSORSHIP] })[0];
  assert.equal(row?.action, "Answer");
  assert.equal(row?.detail, SENSITIVE_CONFIRMATION_UNANSWERED_DETAIL);
});

/* ---- THE STANDDOWN, WHICH IS WHAT KEEPS THIS FROM BECOMING A TRAP ----
   The list rides on GET /submission and NOT on the save response, so between a landed confirmation
   and the next poll tick the page is holding a list that still names the question she just
   confirmed. Without this the send gate would sit grey through that window over a row she has
   already answered, with no press left that changes anything. */

test("an answer she confirmed in this round stops asking and stops blocking", () => {
  const review = hrt({
    questions_reviewed_at: "2026-09-03T09:00:00.000Z",
    questions: [{
      id: "q-sponsorship",
      question: SPONSORSHIP,
      answer: "Yes",
      kind: "required",
      required: true,
      answer_source: "applicant_review",
      answer_reviewed_at: "2026-09-03T09:00:00.000Z",
    }],
  });
  assert.equal(sensitiveConfirmationPending(review, [SPONSORSHIP]), false);
  assert.deepEqual(sensitiveConfirmationItems(review, { sensitiveConfirmations: [SPONSORSHIP] }), []);
});

test("a claim from a stale review round is not a confirmation", () => {
  const review = hrt({
    questions_reviewed_at: "2026-09-03T09:00:00.000Z",
    questions: [{
      id: "q-sponsorship",
      question: SPONSORSHIP,
      answer: "Yes",
      kind: "required",
      required: true,
      answer_source: "applicant_review",
      answer_reviewed_at: "2026-08-01T00:00:00.000Z",
    }],
  });
  assert.equal(sensitiveConfirmationPending(review, [SPONSORSHIP]), true);
});

test("a machine answer is not a confirmation however it got there", () => {
  const review = hrt({
    questions_reviewed_at: "2026-09-03T09:00:00.000Z",
    questions: [{
      id: "q-sponsorship",
      question: SPONSORSHIP,
      answer: "Yes",
      kind: "required",
      required: true,
      answer_source: "consent_permission",
      answer_reviewed_at: "2026-09-03T09:00:00.000Z",
    }],
  });
  assert.equal(sensitiveConfirmationPending(review, [SPONSORSHIP]), true);
});

test("applicantConfirmedAnswer keeps the server's own round check", () => {
  const round = "2026-09-03T09:00:00.000Z";
  const claim = { answer: "Yes", answer_source: "applicant_review" as const, answer_reviewed_at: round };
  assert.equal(applicantConfirmedAnswer(claim, round), true);
  assert.equal(applicantConfirmedAnswer(claim, "2026-09-02T09:00:00.000Z"), false);
  assert.equal(applicantConfirmedAnswer(claim, undefined), false, "a review with no round cannot have minted a claim");
  assert.equal(applicantConfirmedAnswer({ ...claim, answer: "  " }, round), false, "a confirmation of a blank claims nothing");
});

/* ---- MATCHING ---- */

test("a label matched across whitespace and case is still the same employer prompt", () => {
  const noisy = `  ${SPONSORSHIP.replace(/ /g, "  ").toUpperCase()}\n`;
  assert.deepEqual(sensitiveConfirmationQuestionIds(hrt(), [noisy]), ["q-sponsorship"]);
});

/* A REQUIREMENT WITH NO QUESTION BEHIND IT MUST NOT GREY THE BUTTON. She would have no card to read
   and no control to press, so gating on it is a wall. The server still refuses that send, and the
   refusal still carries its own sentence. */
test("a label naming no stored question blocks nothing and invents no row", () => {
  const review = hrt();
  assert.equal(sensitiveConfirmationPending(review, ["Some question this form never asked"]), false);
  assert.deepEqual(sensitiveConfirmationItems(review, { sensitiveConfirmations: ["Some question this form never asked"] }), []);
});

/* ---- THE 422 IS A ROUTE, NOT A PARAGRAPH ----
   TWO BODIES, and the one the dashboard's own Send application button gets is the SECOND one.
   #906 added the typed code to POST /submit-request and to the unsupported-portal email refusal.
   POST /applications/:id/submission/approve, which is what "Send application" calls, was not
   touched: it folds every reason into FINAL_APPROVAL_VERIFICATION_FAILED's `issues` array as
   authored prose. A route that read only the typed code would not fire on the measured press. */

test("the typed refusal names the question it is about", () => {
  const review = hrt();
  const refusal = { status: 422, data: { code: "SENSITIVE_QUESTION_CONFIRMATION_REQUIRED", questions: [SPONSORSHIP] } };
  assert.deepEqual(sensitiveConfirmationRefusalLabels(refusal), [SPONSORSHIP]);
  assert.equal(sensitiveConfirmationSendRouteQuestionId(refusal, review), "q-sponsorship");
});

test("the approve route's issue list routes too, and only its sensitive line", () => {
  const review = hrt();
  const refusal = {
    status: 422,
    data: {
      code: "FINAL_APPROVAL_VERIFICATION_FAILED",
      issues: [
        "The filled form preview is missing.",
        `Sensitive question requires your attention: ${SPONSORSHIP}`,
      ],
    },
  };
  assert.deepEqual(sensitiveConfirmationRefusalLabels(refusal), [SPONSORSHIP]);
  assert.equal(sensitiveConfirmationSendRouteQuestionId(refusal, review), "q-sponsorship");
});

/* THE APPROVE ROUTE TRUNCATES AT 120 CHARACTERS, so the sentence arrives carrying a cut-off prompt.
   The measured sponsorship label is 118 characters and survives whole; a longer one does not, and a
   route that demanded equality would silently stop firing on exactly the longest prompts. */
test("a truncated label still resolves, but never to a guess between two questions", () => {
  const long = "Please confirm whether you now hold, or will at any point in the future require, an employer-sponsored visa or work permit in any of the listed offices";
  const cut = `Sensitive question requires your attention: ${long.slice(0, 120)}`;
  const one = [{ id: "q-long", question: long, answer: "Yes", kind: "required" as const, required: true }];
  assert.equal(sensitiveConfirmationSendRouteQuestionId({ data: { code: "FINAL_APPROVAL_VERIFICATION_FAILED", issues: [cut] } }, { questions: one }), "q-long");

  /* Two prompts sharing the truncated prefix: the cut removed the thing that told them apart, and
     routing to a guess about a legal declaration is worse than routing nowhere. */
  const ambiguous = [...one, { id: "q-long-2", question: `${long} in the next 12 months`, answer: "", kind: "required" as const, required: true }];
  assert.equal(sensitiveConfirmationSendRouteQuestionId({ data: { code: "FINAL_APPROVAL_VERIFICATION_FAILED", issues: [cut] } }, { questions: ambiguous }), null);
});

test("the route is keyed on the code, never on the sentence alone", () => {
  const review = hrt();
  const sentence = `Sensitive question requires your attention: ${SPONSORSHIP}`;
  /* The exact sentence that was on screen for three sessions, carried with no code at all. It must
     route nowhere: the prose arm is bounded to a body that has already identified itself. */
  assert.equal(sensitiveConfirmationSendRouteQuestionId({ status: 422, message: sentence, data: { error: sentence } }, review), null);
  assert.equal(sensitiveConfirmationSendRouteQuestionId({ status: 422, data: { issues: [sentence] } }, review), null);
  assert.equal(sensitiveConfirmationSendRouteQuestionId({ status: 409, data: { code: "PACKET_AUDIT_STALE" } }, review), null);
});

test("a refusal with nothing to route to falls back rather than guessing", () => {
  const review = hrt();
  for (const data of [
    { code: "SENSITIVE_QUESTION_CONFIRMATION_REQUIRED" },
    { code: "SENSITIVE_QUESTION_CONFIRMATION_REQUIRED", questions: [] },
    { code: "SENSITIVE_QUESTION_CONFIRMATION_REQUIRED", questions: ["A question this form never asked"] },
    { code: "SENSITIVE_QUESTION_CONFIRMATION_REQUIRED", questions: [null, 7] },
    { code: "FINAL_APPROVAL_VERIFICATION_FAILED", issues: ["A required application answer is still blank."] },
    { code: "FINAL_APPROVAL_VERIFICATION_FAILED", issues: [] },
    { code: "FINAL_APPROVAL_VERIFICATION_FAILED" },
  ]) {
    assert.equal(sensitiveConfirmationSendRouteQuestionId({ status: 422, data }, review), null, JSON.stringify(data));
  }
  assert.equal(sensitiveConfirmationSendRouteQuestionId(null, review), null);
  assert.equal(sensitiveConfirmationSendRouteQuestionId(new Error(SPONSORSHIP), review), null);
});

test("the route reads the same list the checklist does, so the screen it lands on has the row", () => {
  const review = hrt();
  const routed = sensitiveConfirmationSendRouteQuestionId(
    { status: 422, data: { code: "SENSITIVE_QUESTION_CONFIRMATION_REQUIRED", questions: [SPONSORSHIP] } },
    review,
  );
  assert.equal(routed, sensitiveConfirmationItems(review, { sensitiveConfirmations: [SPONSORSHIP] })[0]?.questionId);
});

/* ---- ONE BUILDER, SO TWO SCREENS CANNOT DESCRIBE ONE REQUIREMENT DIFFERENTLY ---- */

test("the packet-screen block and the Your turn panel draw the same row object", () => {
  const review = hrt({ status: "needs_attention" });
  const context = { sensitiveConfirmations: [SPONSORSHIP] };
  const fromPanel = humanInputItems(review, context).find((item) => item.questionId === "q-sponsorship");
  assert.deepEqual(sensitiveConfirmationItems(review, context), [fromPanel]);
});

/* The server naming a question outranks every guess this file makes about it. Left to the ordinary
   branches, this row would have read "Required answer missing" over an answered question. */
test("the server's naming outranks the label heuristic and the required-blank row", () => {
  const review = hrt({
    status: "needs_attention",
    questions: [{ id: "q-gender", question: "What is your gender?", answer: "", kind: "required", required: true }],
  });
  const rows = humanInputItems(review, { sensitiveConfirmations: ["What is your gender?"] })
    .filter((item) => item.questionId === "q-gender");
  assert.equal(rows.length, 1, "one question must not produce two rows saying different things");
  assert.equal(rows[0].actionKind, "confirm");
  assert.equal(rows[0].detail, SENSITIVE_CONFIRMATION_UNANSWERED_DETAIL);
  assert.notEqual(rows[0].detail, "Required answer missing");
});

/* ---- THE GATE MAY ONLY CLOSE OVER WORK THE CONFIRM LOOP CAN FINISH ----
 *
 * The dead end this branch shipped in its first version, and the exact failure mode the whole
 * change exists to prevent: a greyed Send with no press that clears it. `humanInputItems` walks
 * every stored question and falls back to the stored record when `questionReviewPresentation` has
 * BLOCKED one, so a blocked question produced a row with a live Confirm pill; the answers screen
 * renders only `editableQuestions`, so the press landed on a screen with no card for it and a Save
 * disabled by `continuationBlocked`, and Send stayed grey for good.
 *
 * All three unreadable shapes below were measured producing that wall before the fix. */
test("a named question the answers screen cannot draw closes no gate and draws no row", () => {
  const shapes: Array<[string, Partial<ApplicationReview>]> = [
    ["a server metadata blocker", {
      questions: [{ id: "q-auth", question: SPONSORSHIP, answer: "Yes", kind: "required", required: true }],
      question_metadata_blockers: [{ kind: "missing_exact_options", required: true, portal_input_type: "select-one", question: SPONSORSHIP }],
    }],
    ["a closed control whose options were never read", {
      questions: [{ id: "q-auth", question: SPONSORSHIP, answer: "Yes", kind: "required", required: true, portal_input_type: "select-one", options: [] }],
    }],
    ["a multi-value control whose options were never read", {
      questions: [{ id: "q-auth", question: SPONSORSHIP, answer: "Yes", kind: "required", required: true, portal_input_type: "select-multiple", options: [] }],
    }],
  ];
  for (const [name, overrides] of shapes) {
    const review = hrt(overrides);
    assert.deepEqual(sensitiveConfirmationQuestionIds(review, [SPONSORSHIP]), [], name);
    assert.equal(sensitiveConfirmationPending(review, [SPONSORSHIP]), false, name);
    assert.deepEqual(sensitiveConfirmationItems(review, { sensitiveConfirmations: [SPONSORSHIP] }), [], name);
    /* And the refusal routes nowhere rather than to a card that is not there. Routing would also
       record a confirm intent against a question she was never shown, which survives a metadata
       refresh and would later ride out on a bulk save as her own claim. */
    assert.equal(
      sensitiveConfirmationSendRouteQuestionId({ data: { code: "SENSITIVE_QUESTION_CONFIRMATION_REQUIRED", questions: [SPONSORSHIP] } }, review),
      null,
      name,
    );
  }
});

test("the healthy shape beside those three still asks, so the guard is not just off", () => {
  const review = hrt({
    questions: [{ id: "q-auth", question: SPONSORSHIP, answer: "Yes", kind: "required", required: true, portal_input_type: "select-one", options: ["Yes", "No"] }],
  });
  assert.equal(sensitiveConfirmationPending(review, [SPONSORSHIP]), true);
  assert.equal(sensitiveConfirmationItems(review, { sensitiveConfirmations: [SPONSORSHIP] }).length, 1);
});

/* AN OPTIONAL QUESTION WITH NO ANSWER IS AN OFFER, NOT A BLOCKER, and the rule is the backend's
   own (#906's sensitiveQuestionsFor filters on `required || answer.trim()` before naming a label).
   A loop rather than a wall, and optional EEO self-identifications are #906's own target class:
   she confirms a named optional question, presses Skip, and saves. The save correctly carries no
   `confirmed` flag - the backend ignores a confirmation of a blank too - so no claim was minted and
   the ask returned on every pass. Reading the server's rule is the fix. */
test("a named optional question she skipped stops asking instead of looping", () => {
  const review = hrt({
    questions: [{ id: "q-eeo", question: SPONSORSHIP, answer: "", kind: "required", required: false, answer_state: "skipped" }],
  });
  assert.equal(sensitiveConfirmationPending(review, [SPONSORSHIP]), false);
  assert.deepEqual(sensitiveConfirmationItems(review, { sensitiveConfirmations: [SPONSORSHIP] }), []);
});

test("a named optional question that still carries an answer is still hers to confirm", () => {
  const review = hrt({
    questions: [{ id: "q-eeo", question: SPONSORSHIP, answer: "Prefer not to say", kind: "required", required: false }],
  });
  assert.equal(sensitiveConfirmationPending(review, [SPONSORSHIP]), true);
});

test("a named required question with no answer is still hers, blank or not", () => {
  const review = hrt({
    questions: [{ id: "q-auth", question: SPONSORSHIP, answer: "", kind: "required", required: true }],
  });
  assert.equal(sensitiveConfirmationPending(review, [SPONSORSHIP]), true);
});

/* TWO BOXES ASKING THE SAME THING ARE TWO CONFIRMATIONS. addUnique drops a second row sharing a
   label, which is right for a blocker and wrong here: race/ethnicity asked in two sections of one
   form is the ordinary case, and each box is one the employer will read. Deduped, the gate counted
   rows and said "One answer is a declaration" while the answers screen counted questions and said
   "2 answers below are declarations", and the second had no row to press. */
test("two questions sharing a label produce two rows, so the counts on both screens agree", () => {
  const label = "What is your race/ethnicity?";
  const review = hrt({
    questions: [
      { id: "q-eeo-1", question: label, answer: "Asian", kind: "required", required: true },
      { id: "q-eeo-2", question: label, answer: "Asian", kind: "required", required: true },
    ],
  });
  const ids = sensitiveConfirmationQuestionIds(review, [label]);
  const rows = sensitiveConfirmationItems(review, { sensitiveConfirmations: [label] });
  assert.deepEqual(ids, ["q-eeo-1", "q-eeo-2"]);
  assert.equal(rows.length, ids.length, "the gate's count and the answers screen's count must be the same number");
  assert.deepEqual(rows.map((row) => row.questionId), ids);
});
