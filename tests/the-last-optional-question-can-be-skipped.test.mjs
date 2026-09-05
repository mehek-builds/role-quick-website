import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { alreadyDecidedDirectTask, directSkipAlreadyRecorded } from "../features/applications/domain/submission-checklist.ts";

/* THE LAST OPTIONAL QUESTION CAN BE SKIPPED, EVEN WHEN THE DECISION ALREADY LANDED BY SOME OTHER
 * MEANS.
 *
 * MEASURED live 2026-09-04 ~23:05Z, production dashboard, account mehekmandal05@gmail.com. Pony.ai
 * packet fdcf4ccb-eca9-44dc-b0cb-d400805ebdeb (status `failed`): both
 * `/dashboard/applications?application=<id>` and the same URL with `&intent=apply` opened the
 * direct-question flow at "APPLICATION ANSWER - 1 of 1 - Summary - Optional. Answer it or skip
 * it." Pressing Skip (by accessibility ref and by coordinates, several times) did nothing: no
 * network request was sent (the tab's network log showed only unrelated OPTIONS preflights), the
 * card did not advance, and no Review application control ever appeared. Earlier in the same
 * session Skip worked correctly on every other optional question of this same packet, including
 * the LAST card of a four-question queue (Celerant "4 of 4"), which turned into Review
 * application exactly as designed. The one difference: this packet's other five optional
 * questions (Headline, Cover letter, City, Country, Postcode) had already been decided through
 * the review-answers screen's "Answer these" flow - and so, on this read, had Summary's own skip.
 * This "1 of 1" queue was re-presenting a decision the review already stored.
 *
 * THE MECHANISM. saveReviewedAnswers (app/dashboard/applications/page.tsx) looks up the question
 * it is about to save through directAnswerNavigationTasks, unioning the current plan's outstanding
 * work with what THIS pass has itself recorded answering. A decided question is neither of those:
 * humanInputItems already drops a question once `answer_state` reads "skipped" (correctly - see
 * features/applications/domain/submission-checklist.test.mts, "optional questions stay actionable
 * until the applicant answers or skips them"), so it is not outstanding, and a pass that never
 * itself recorded finishing it has nothing to remember it by either. The lookup returned nothing,
 * `safeDirectTask` was `null`, and the guard built to catch a genuinely changed employer prompt
 * refused the press with "The employer's question changed while you were answering" - not true,
 * nothing about the employer's question had changed - and because that guard runs BEFORE
 * saveReviewAnswers is ever called, the refusal cost zero network requests and left no way through:
 * the card's own taskFingerprint is captured once at mount, from the older undecided reading, and
 * can never catch up to the newer `answer_state` on any retry of the same card.
 *
 * THE FIX. directSkipAlreadyRecorded reads the CURRENT stored question directly - never through
 * the outstanding/answered task lookup - and recognises when a Skip press asks for a decision
 * already on record: not required, blank, `answer_state: "skipped"`, and still the same employer
 * question (same prompt fingerprint). When it does, alreadyDecidedDirectTask stands in for the
 * missing lookup result, the "employer's question changed" guard is bypassed for this one verified
 * case, and the save handler's `send` callback resolves locally instead of calling the API -
 * "advance immediately without a request", never a refusal and never a silent no-op. */
const page = readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");

function functionBody(signature) {
  const start = page.indexOf(signature);
  assert.notEqual(start, -1, `${signature} is missing`);
  const candidates = [
    page.indexOf("\nfunction ", start + signature.length),
    page.indexOf("\n  function ", start + signature.length),
    page.indexOf("\n  async function ", start + signature.length),
  ].filter((index) => index > start);
  return page.slice(start, candidates.length > 0 ? Math.min(...candidates) : page.length);
}

describe("a Skip whose decision is already recorded advances instead of refusing", () => {
  const save = functionBody("  async function saveReviewedAnswers(");

  test("the current stored question is read directly, never through the outstanding/answered lookup", () => {
    // Independent of activeDirectTaskPlan and activeAnsweredTasks on purpose: the whole point is to
    // notice when the task those build from has already diverged from the review's own record.
    assert.match(
      save,
      /const activeCurrentQuestion = direct\s*\n\s*\? activeSubmission\.review\.questions\.find\(\(question\) => question\.id === direct\.questionId\) \?\? null\s*\n\s*: null;/,
    );
    // Renamed from skipAlreadyRecorded/directSkipAlreadyRecorded when the predicate generalised
    // from Skip alone to a matching Save or Confirm too - see
    // a-save-on-a-decided-question-is-not-a-changed-question.test.mjs, the sibling that exercises
    // the generalised names.
    assert.match(
      save,
      /const decisionAlreadyRecorded = Boolean\(\s*\n\s*direct && activeCurrentQuestion && directDecisionAlreadyRecorded\(activeCurrentQuestion, direct\),\s*\n\s*\);/,
    );
  });

  test("a missing outstanding/answered lookup falls back to the already-decided task instead of staying null", () => {
    assert.match(
      save,
      /\)\.find\(\(task\) => \(\s*\n\s*task\.question\.id === direct\.questionId\s*\n\s*&& directQuestionPromptFingerprint\(task\) === direct\.promptFingerprint\s*\n\s*\)\)\s*\n\s*\?\? \(decisionAlreadyRecorded && activeCurrentQuestion\s*\n\s*\? alreadyDecidedDirectTask\(activeCurrentQuestion, direct\.intent\)\s*\n\s*: null\)/,
      "safeDirectTask must fall back to the synthesized already-decided task, or the accepted-answer bookkeeping below it never runs",
    );
  });

  test("the employer-prompt-changed guard excludes an already-recorded decision rather than merely tolerating it", () => {
    assert.match(
      save,
      /if \(direct && !decisionAlreadyRecorded && \(\s*\n\s*!safeDirectTask/,
      "decisionAlreadyRecorded must gate the whole guard, not satisfy one of its OR clauses",
    );
  });

  test("an already-recorded decision resolves locally instead of calling the API", () => {
    assert.match(
      save,
      /send: \(path, init\) => decisionAlreadyRecorded\s*\n(?:[^\n]*\n)*?\s*\? Promise\.resolve\(\{ application_id: applicationId, review: activeSubmission\.review \}\)\s*\n\s*: api<ReviewAnswerSaveResponse<SubmissionResponse\["review"\]>>\(path, init\),/,
      "'advance without a request' means the fetch itself must not run, not merely that its result is discarded",
    );
  });

  test("the decision lives in the domain module, not a page-local reimplementation", () => {
    assert.match(
      page,
      /import \{[^}]*\balreadyDecidedDirectTask\b[^}]*\} from "@\/features\/applications";/,
      "page.tsx must import alreadyDecidedDirectTask rather than redefine it",
    );
    assert.match(
      page,
      /import \{[^}]*\bdirectDecisionAlreadyRecorded\b[^}]*\} from "@\/features\/applications";/,
      "page.tsx must import directDecisionAlreadyRecorded rather than redefine it",
    );
    assert.doesNotMatch(page, /\nfunction directDecisionAlreadyRecorded\(/, "a page-local redefinition could silently drift from the tested domain function");
    assert.doesNotMatch(page, /\nfunction alreadyDecidedDirectTask\(/, "a page-local redefinition could silently drift from the tested domain function");
  });

  test("the behaviour, run rather than read back: the measured Pony.ai shape is recognised, a genuine employer change is not", () => {
    const summary = {
      id: "summary",
      question: "Summary",
      answer: "",
      kind: "essay",
      required: false,
      answer_state: "skipped",
    };
    const direct = {
      questionId: "summary",
      answer: "",
      answerState: "skipped",
      intent: "answer",
      promptFingerprint: JSON.stringify(["summary", "Summary", "essay", false, null, null, null, null]),
      taskFingerprint: JSON.stringify([
        JSON.stringify(["summary", "Summary", "essay", false, null, null, null, null]),
        "answer",
        "", // the answer at mount, before this pass's own decision existed
        "unanswered",
        null,
        null,
      ]),
    };

    // The measured shape: the card's own taskFingerprint was minted before the skip landed, so it
    // can never equal a fresh one built from the now-decided question - and must not need to.
    assert.equal(directSkipAlreadyRecorded(summary, direct), true);
    const task = alreadyDecidedDirectTask(summary, direct.intent);
    assert.equal(task.question.answer_state, "skipped");
    assert.notEqual(task.context, true, "not the parent-context shape - this is settled work, not a re-admitted parent");

    // A genuinely changed employer prompt (the case this guard exists for) must still refuse: same
    // id, same recorded skip, different wording.
    assert.equal(
      directSkipAlreadyRecorded({ ...summary, question: "Summary (updated)" }, direct),
      false,
      "a real employer-side change must still be caught, not waved through by id alone",
    );

    // A required question is never "already recorded" as skippable - required-ness must win even if
    // some upstream bug ever set answer_state: "skipped" on one.
    assert.equal(directSkipAlreadyRecorded({ ...summary, required: true }, direct), false);
  });
});
