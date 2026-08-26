import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* JSX cannot be mounted under --experimental-strip-types, so the wiring is pinned by reading the
 * source, the same way tests/ask-at-apply.test.mjs pins the Apply screen. What these pins protect:
 * a required question Litos could not answer used to reach the applicant as a blank textarea under
 * the employer's raw paragraph. Measured on a live Optiver Greenhouse form on 2026-08-19, the
 * acknowledgement rows offered only two exact sentences; a person handed a blank box types "Yes",
 * which matches neither and fails silently. The employer's own options now render as choices on
 * the answers editor and on the Your turn panel. */

const PAGE = readFileSync("app/dashboard/applications/page.tsx", "utf8");

/* Same slicer tests/ask-at-apply.test.mjs uses: from the declaration to the next top-level one. */
function functionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `could not find ${signature}`);
  const next = source.indexOf("\nfunction ", start + 1);
  const nextAsync = source.indexOf("\n  async function ", start + 1);
  const nextInner = source.indexOf("\n  function ", start + 1);
  const ends = [next, nextAsync, nextInner].filter((index) => index > start);
  return source.slice(start, ends.length > 0 ? Math.min(...ends) : source.length);
}

test("a short closed list renders as the employer's own choices, and picking one writes that option as the answer", () => {
  const screen = functionBody(PAGE, "function QuestionsScreen(");
  assert.match(screen, /question\.options\.length <= QUESTION_CHOICE_LIST_LIMIT \?/);
  // A radio group, carrying the focus target id the Your turn rows navigate to.
  assert.match(screen, /role="radiogroup"[\s\S]{0,200}?data-choice-list/);
  assert.match(screen, /<div id=\{`question-\$\{question\.id\}`\} role="radiogroup"/);
  // The chosen option's own text becomes the answer, byte for byte.
  assert.match(screen, /onChange=\{\(\) => onChange\(questions\.map\(\(item\) => item\.id === question\.id \? \{ \.\.\.item, answer: option \} : item\)\)\}/);
  // The long-list select survives below the split: tests/ask-at-apply.test.mjs pins its shape.
  assert.match(screen, /<option value="">Choose an answer<\/option>/);
});

test("an exact multi-value field renders checkboxes and stores employer-ordered labels", () => {
  const screen = functionBody(PAGE, "function QuestionsScreen(");
  assert.match(screen, /questionAcceptsMultipleOptions\(question\) \? \(/);
  assert.match(screen, /type="checkbox"/);
  assert.match(screen, /checked=\{exactSelectedQuestionOptions\(question\.answer, question\.options\)\?\.includes\(option\) === true\}/);
  assert.match(screen, /answerWithExactOptionToggled\(question\.answer, question\.options, option, event\.target\.checked\)/);
  assert.match(screen, /item\.id === question\.id \? \{ \.\.\.item, answer \} : item/);
});

test("focusing a Your turn row still lands when the question rendered as a radio group", () => {
  const screen = functionBody(PAGE, "function QuestionsScreen(");
  assert.match(screen, /field\.dataset\.choiceList !== undefined/);
  // The chosen option takes focus when there is one, the first row otherwise.
  assert.match(screen, /querySelector<HTMLInputElement>\("input:checked"\) \?\? field\.querySelector<HTMLInputElement>\("input"\)/);
});

test("a whole-paragraph question stays fully readable instead of rendering as a bold wall", () => {
  const screen = functionBody(PAGE, "function QuestionsScreen(");
  // The full text always renders; only the weight changes past paragraph length.
  assert.match(screen, /question\.question\.trim\(\)\.length > 140 \? "font-normal leading-6" : "font-medium"/);
});

test("an unread employer choice list stays visible without becoming a free-text answer", () => {
  const screen = functionBody(PAGE, "function QuestionsScreen(");
  assert.match(PAGE, /metadataBlockers=\{selectedSubmission\?\.review\.question_metadata_blockers \?\? \[\]\}/);
  assert.match(screen, /questionReviewPresentation\(questions, metadataBlockers\)/);
  assert.match(screen, /effectiveMetadataBlockers\.length > 0/);
  assert.match(screen, /Exact choices not read/);
  assert.match(screen, /The employer's current options were not readable, so Litos did not guess or fill this field\./);
  const metadataSection = screen.slice(
    screen.indexOf('{effectiveMetadataBlockers.length > 0 && ('),
    screen.indexOf('{visibleQuestions.map'),
  );
  assert.ok(metadataSection.length > 0, "the metadata explanation renders before editable questions");
  assert.doesNotMatch(metadataSection, /<textarea|<select|type="radio"/);
});

test("historical closed controls are partitioned before the textarea branch", () => {
  const screen = functionBody(PAGE, "function QuestionsScreen(");
  assert.match(screen, /const presentation = questionReviewPresentation\(questions, metadataBlockers\)/);
  assert.match(screen, /const editableQuestions = presentation\.editableQuestions/);
  assert.match(screen, /focusedReview \? actionableQuestions : editableQuestions/);
  assert.match(screen, /effectiveMetadataBlockers\.map/);
});

test("the Your turn row draws the employer's options as radio inputs, never as buttons", () => {
  const row = functionBody(PAGE, "function ChecklistRow(");
  const choices = row.slice(row.indexOf("{choices && ("), row.indexOf('{control?.element === "link"'));
  assert.ok(choices.length > 0, "the choices block renders before the control pills");
  assert.match(choices, /type="radio"/);
  assert.match(choices, /onChange=\{\(\) => choices\.choose\(choices\.questionId, option\)\}/);
  /* tests/your-turn-actions.test.mjs walks to the FIRST <button> in ChecklistRow and pins the
     onOpenQuestion handler on it. A button in this block would take that pin and the regression it
     guards - an action pill rendered as scenery - would be free to come back unnoticed. */
  assert.doesNotMatch(choices, /<button/);
  // The press routes, it does not save, and the row says so where she is looking.
  assert.match(choices, /Pick one to open it in the editor, then save\./);
});

test("picking a choice opens the one answers editor with the pick selected, and saves nothing itself", () => {
  const choose = functionBody(PAGE, "function chooseBlockerOption(questionId: string, option: string)");
  // Through the same route every Your turn row takes into the editor.
  assert.match(choose, /reviewPortalQuestions\(questionId, "answer"\)/);
  /* A functional update, because reviewPortalQuestions has just QUEUED the merged list and a plain
     `questions.map` here would map the stale list this closure captured, dropping the merge. */
  assert.match(choose, /setQuestions\(\(current\) => current\.map\(\(question\) => question\.id === questionId \? \{ \.\.\.question, answer: option \} : question\)\)/);
  // No write: the editor's Save is the only path that persists an answer.
  assert.doesNotMatch(choose, /saveReviewedAnswers|api</);
  // And the panel is actually wired to it.
  assert.match(PAGE, /onChooseOption=\{chooseBlockerOption\}/);
});
