import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The "Your turn" panel's action pills, on /dashboard/applications.
 *
 * WHAT WAS WRONG. Each row of the panel printed one of OPEN PAGE, REVIEW, ANSWER or CONFIRM, and
 * every one of them was a `<span>` carrying `bg-warn ... text-white` pill styling. Pressed by hand
 * on the Anduril packet on 2026-08-08: no modal, no drawer, no inline editor, no navigation, no
 * state change, NO NETWORK REQUEST AT ALL, and no console error. There was nothing to fire. An
 * application stopped, said exactly what it needed, offered a button, and the button was scenery.
 *
 * WHY THIS FILE IS SOURCE ANALYSIS AND NOT A CLICK. `npm test` runs node --experimental-strip-types,
 * which strips TypeScript but cannot compile JSX, so no test in this repo can mount a component.
 * The decision half of the fix IS executable and is tested for real in
 * features/applications/domain/submission-checklist.test.mts, where checklistRowControl is driven
 * with the production Anduril review and four mutations to it were confirmed to fail that suite.
 * What only this file can pin is the half that lives in JSX: that the element the decision asks for
 * is the element that gets drawn. That is precisely the half that shipped broken.
 */

const page = readFileSync(fileURLToPath(new URL("../app/dashboard/applications/page.tsx", import.meta.url)), "utf8");

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is gone from app/dashboard/applications/page.tsx`);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test("the action pill is an element that can act, never a styled span again", () => {
  const row = functionBody(page, "ChecklistRow");

  assert.match(row, /checklistRowControl\(item, \{ portalUrl \}\)/, "the row has to ask the domain what control to draw");
  assert.match(row, /control\?\.element === "link"/);
  assert.match(row, /control\?\.element === "button"/);

  // The exact shape of the defect: item.action interpolated into a non-interactive element.
  const deadPill = /<span[^>]*>\s*\{item\.action\}/;
  assert.equal(deadPill.test(row), false, "item.action is being rendered into a <span> again");

  // item.action must not be reachable at all from the row any more. Everything goes through the
  // control, whose label is the same words with an element and a name attached.
  assert.equal(/\{item\.action\}/.test(row), false, "the caption must only be printed by way of checklistRowControl");
  assert.match(row, /\{control\.label\}/);
});

test("OPEN PAGE is a real link and the question actions are real buttons, each with its own accessible name", () => {
  const row = functionBody(page, "ChecklistRow");

  const link = row.match(/<a\s[^>]*>/);
  assert.ok(link, "the open-page branch has to render an anchor");
  assert.match(link[0], /href=\{control\.href\}/);
  assert.match(link[0], /target="_blank"/);
  assert.match(link[0], /rel="noreferrer"/);
  assert.match(link[0], /aria-label=\{control\.name\}/);

  const buttonStart = row.indexOf("<button");
  assert.notEqual(buttonStart, -1, "the answer, review and confirm branches have to render a button");
  const button = row.slice(buttonStart, row.indexOf("</button>", buttonStart));
  assert.match(button, /type="button"/);
  assert.match(button, /onClick=\{\(\) => onOpenQuestion\(control\.questionId\)\}/, "a button with no onClick is the same defect wearing a different tag");
  assert.match(button, /aria-label=\{control\.name\}/, "read_page found these as bare buttons with no accessible name");
});

test("the panel hands the row everything a control needs, and the page hands the panel a handler", () => {
  const list = functionBody(page, "BlockerList");
  assert.match(list, /portalUrl=\{portalUrl\}/);
  assert.match(list, /onOpenQuestion=\{onOpenQuestion\}/);

  assert.match(page, /<BlockerList items=\{needsInputItems\} portalUrl=\{attendedHandoffUrl \? undefined : handoffUrl \?\? portalUrl\} onOpenQuestion=\{onOpenQuestion\} \/>/);
  assert.match(page, /onOpenQuestion=\{\(questionId\) => reviewPortalQuestions\(questionId\)\}/);
});

test("pressing a row opens the answer editor on that question, and saving there is the existing persistence path", () => {
  assert.match(page, /function reviewPortalQuestions\(focusQuestionId\?: string\)/);
  assert.match(page, /setFocusQuestion\(/);
  assert.match(page, /moveToScreen\("questions"\)/);

  // Saving returns to the review screen and invalidates the prior audit. The only subsequent
  // submit-request is reached through a new exact packet audit, so editing a stalled answer cannot
  // reuse the PDF, answer map, or requirement evidence that preceded it.
  assert.match(page, /onSubmit=\{\(\) => \{\s*saveApplyAnswers\(\);\s*setPacketEvidence\(null\);\s*\}\}/);
  assert.match(page, /questionsJson: JSON\.stringify\(questions\)/);
  assert.match(page, /`\/applications\/\$\{applicationId\}\/submit-request`/);

  const questions = functionBody(page, "QuestionsScreen");
  assert.match(questions, /focusQuestion\?: \{ id: string; token: number \} \| null/);
  assert.match(questions, /document\.getElementById\(`question-\$\{focusQuestionId\}`\)/);
  assert.match(questions, /field\.focus\(\)/);
  assert.match(questions, /\[focusQuestionId, focusToken\]/, "the token is what makes a second press on the same row work");
  // The call, not the word: the comment above the effect explains why the call is not there.
  assert.equal(
    /requestAnimationFrame\(/.test(questions),
    false,
    "focusing in a rAF made this work in a real browser and silently not work in a hidden one",
  );

  // The scroll to the top of the page is suppressed for this one navigation, because the question
  // she pressed is not at the top. Without it the two scrolls race, and which one wins depends on
  // whether the tab is visible.
  assert.match(page, /moveToScreen\("questions", \{ scrollToTop: !focusQuestionId \}\)/);
});

test("the read-only packet viewer still prints no action words, so it cannot grow the same dead pill", () => {
  const viewer = readFileSync(fileURLToPath(new URL("../components/app/ApplicationPacket.tsx", import.meta.url)), "utf8");
  assert.equal(/\{item\.action\}/.test(viewer), false);
});
