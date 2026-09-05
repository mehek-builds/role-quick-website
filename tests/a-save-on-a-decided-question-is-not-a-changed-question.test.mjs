import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { alreadyDecidedDirectTask, directDecisionAlreadyRecorded } from "../features/applications/domain/submission-checklist.ts";

/* THE SYMMETRIC HALF OF "the-last-optional-question-can-be-skipped": A SAVE OR A CONFIRM ON A
 * DECIDED QUESTION IS NOT A CHANGED QUESTION EITHER.
 *
 * PR #549 closed the measured Pony.ai dead end for a Skip press: directSkipAlreadyRecorded reads
 * the CURRENT stored question directly and recognises when a Skip asks for a decision the review
 * already stores by some other means (most often the review-answers screen's own bulk save), so
 * saveReviewedAnswers (app/dashboard/applications/page.tsx) can resolve it locally instead of
 * refusing with "The employer's question changed while you were answering" over a card whose
 * taskFingerprint was captured at MOUNT, before the decision landed.
 *
 * THE SAME DEAD END, TWO MORE DOORS. Review finding, PLAUSIBLE from the Skip precedent rather than
 * separately measured live: a text question's card mounts unanswered; the same question is then
 * answered through the bulk "Answer these" screen; pressing "Save answer" on the stale card calls
 * onSaveQuestion, whose request never sets answerState, so the ORIGINAL Skip-only predicate was
 * false on its first clause, the outstanding/answered-this-pass lookup found nothing (a decided
 * question is not outstanding), safeDirectTask stayed null, and the guard refused with the exact
 * same pre-fix sentence and zero network requests. Same class for a Confirm press on a sensitive
 * question already confirmed elsewhere.
 *
 * THE FIX. directSkipAlreadyRecorded is untouched; directDecisionAlreadyRecorded generalises it
 * (see its own doc comment in submission-checklist.ts): a Skip request still delegates to the
 * original, unchanged predicate, while a Save or Confirm request instead asks whether the CURRENT
 * stored answer already reads, byte for byte, what this press is about to submit - and, because a
 * matching byte is not always a matching DECISION, a Confirm additionally requires
 * applicantConfirmedAnswer and a Review additionally requires the essay to have left
 * essayDraftAwaitsApproval, so a fresh, never-yet-approved draft or a fresh, never-yet-confirmed
 * sensitive suggestion still mints its claim exactly as before - only an ALREADY-decided question
 * takes the local, no-request path. saveReviewedAnswers wires the generalised predicate in exactly
 * where the Skip-only one used to live: gating the "employer's question changed" guard and the
 * `send` callback's own choice to call the API at all. */
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

describe("a Save or Confirm whose decision is already recorded advances instead of refusing", () => {
  const save = functionBody("  async function saveReviewedAnswers(");

  test("the guard and the network shortcut both key off the generalised predicate, not a Skip-only name", () => {
    // These three are the exact places PR #549 wired skipAlreadyRecorded/directSkipAlreadyRecorded
    // into saveReviewedAnswers. If a future edit renames the generalised boolean again without
    // updating every site, one of these three will still say the old name and this test will catch
    // the drift the same way the sibling Skip-only file already does for its own three sites.
    assert.match(
      save,
      /const decisionAlreadyRecorded = Boolean\(\s*\n\s*direct && activeCurrentQuestion && directDecisionAlreadyRecorded\(activeCurrentQuestion, direct\),\s*\n\s*\);/,
      "the current stored question must be read through the generalised predicate, not a Skip-only one",
    );
    assert.match(
      save,
      /\?\? \(decisionAlreadyRecorded && activeCurrentQuestion\s*\n\s*\? alreadyDecidedDirectTask\(activeCurrentQuestion, direct\.intent\)\s*\n\s*: null\)/,
      "safeDirectTask's fallback must not be gated on a Skip-only flag - a Save or Confirm needs the same door",
    );
    assert.match(
      save,
      /if \(direct && !decisionAlreadyRecorded && \(\s*\n\s*!safeDirectTask/,
      "the employer-prompt-changed guard must be gated on the generalised predicate for every intent, not just Skip",
    );
    assert.match(
      save,
      /send: \(path, init\) => decisionAlreadyRecorded\s*\n(?:[^\n]*\n)*?\s*\? Promise\.resolve\(\{ application_id: applicationId, review: activeSubmission\.review \}\)\s*\n\s*: api<ReviewAnswerSaveResponse<SubmissionResponse\["review"\]>>\(path, init\),/,
      "a Save or Confirm resolved as already-decided must skip the network call, exactly as a Skip does",
    );
  });

  test("the decision lives in the domain module, not a page-local reimplementation", () => {
    assert.match(
      page,
      /import \{[^}]*\bdirectDecisionAlreadyRecorded\b[^}]*\} from "@\/features\/applications";/,
      "page.tsx must import directDecisionAlreadyRecorded rather than redefine it",
    );
    assert.doesNotMatch(page, /\nfunction directDecisionAlreadyRecorded\(/, "a page-local redefinition could silently drift from the tested domain function");
  });

  test("the behaviour, run rather than read back: a Save matching an answer recorded elsewhere is recognised", () => {
    // The exact scenario this file exists for: the card mounted on this question while it was
    // still blank (answer_state "unanswered", taskFingerprint minted from THAT reading), and by the
    // time this press reaches saveReviewedAnswers the review-answers screen's bulk save has already
    // written the identical text through a different, working save path.
    const city = {
      id: "city",
      question: "What city are you based in?",
      answer: "Los Angeles, CA",
      kind: "required",
      required: true,
    };
    const promptFingerprint = JSON.stringify(["city", "What city are you based in?", "required", true, null, null, null, null]);
    const direct = {
      questionId: "city",
      answer: "Los Angeles, CA",
      intent: "answer",
      promptFingerprint,
    };

    assert.equal(
      directDecisionAlreadyRecorded(city, direct),
      true,
      "the stored answer already reads exactly what this Save press is about to submit",
    );
    const task = alreadyDecidedDirectTask(city, direct.intent);
    assert.equal(task.question.answer, "Los Angeles, CA");
    assert.equal(task.item.action, "Answer", "the synthesized item must not carry the Skip-only caption a plain Save never asked for");
    assert.equal(task.item.actionKind, "answer");

    // A real edit - what she typed no longer matches the stored answer - must still refuse, exactly
    // as a genuinely changed employer prompt must.
    assert.equal(
      directDecisionAlreadyRecorded({ ...city, answer: "New York, NY" }, direct),
      false,
      "a stored answer that differs from what she typed is a real edit, not a decided one",
    );
    assert.equal(
      directDecisionAlreadyRecorded({ ...city, question: "What city and state are you based in?" }, direct),
      false,
      "a genuinely changed employer prompt must still refuse, for a Save exactly as for a Skip",
    );
  });

  test("the behaviour, run rather than read back: a Confirm needs the confirmation itself, not just matching text", () => {
    // The measured Skip dead end's mirror image for Confirm: an unconfirmed sensitive question's
    // machine-suggested answer is commonly correct and unedited on its very first Confirm press, and
    // that first press must still mint answer_confirmed_of - only an ALREADY-confirmed question
    // (confirmed through some other path, most often the same bulk screen) may resolve locally.
    const LABEL = "Do you require visa sponsorship?";
    const unconfirmed = { id: "visa", question: LABEL, answer: "No", kind: "required", required: true };
    const promptFingerprint = JSON.stringify(["visa", LABEL, "required", true, null, null, null, null]);
    const direct = { questionId: "visa", answer: "No", intent: "confirm", promptFingerprint };

    assert.equal(
      directDecisionAlreadyRecorded(unconfirmed, direct),
      false,
      "a pre-filled, unconfirmed suggestion is exactly the DV Trading loop - matching text alone is not yet a confirmation",
    );

    const confirmedElsewhere = { ...unconfirmed, answer_confirmed_of: LABEL };
    assert.equal(
      directDecisionAlreadyRecorded(confirmedElsewhere, direct),
      true,
      "already confirmed elsewhere, with the same answer: nothing is left for this press to write",
    );
    const task = alreadyDecidedDirectTask(confirmedElsewhere, direct.intent);
    assert.equal(task.item.action, "Confirm");
    assert.equal(task.item.actionKind, "confirm");
    assert.notEqual(task.item.action, "Skip", "a confirmed sensitive question must not be mislabeled as an unanswered Skip");

    assert.equal(
      directDecisionAlreadyRecorded({ ...confirmedElsewhere, answer: "Yes" }, direct),
      false,
      "the stored answer no longer matches what this Confirm press would submit - a real edit",
    );
  });
});
