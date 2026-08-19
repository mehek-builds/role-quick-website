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

/* Comments stripped before any "is it gone?" assertion, the same way tests/review-highlighting.test.mjs
   and tests/application-submission-gate.test.mjs do it. The note recording a deleted expression has
   to name the expression it deleted, and a bare grep counts that explanation as the code still being
   there. Deleting the explanation to satisfy a grep would be the wrong repair. */
function shippedCode(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is gone from app/dashboard/applications/page.tsx`);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

/* One rendered element and its props, so a wiring assertion can be scoped to the element it is about
   without pinning the shape of any one prop. Same helper as tests/ask-at-apply.test.mjs. */
function jsxElement(source, name) {
  const element = new RegExp(`<${name}[\\s\\S]*?\\n\\s*/>`).exec(source);
  assert.ok(element, `<${name} is gone from app/dashboard/applications/page.tsx`);
  return element[0];
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
  assert.match(button, /onClick=\{\(\) => onOpenQuestion\(control\.questionId, control\.intent\)\}/, "a button with no onClick is the same defect wearing a different tag");
  assert.match(button, /aria-label=\{control\.name\}/, "read_page found these as bare buttons with no accessible name");
});

test("the panel hands the row everything a control needs, and the page hands the panel a handler", () => {
  const list = functionBody(page, "BlockerList");
  assert.match(list, /portalUrl=\{portalUrl\}/);
  assert.match(list, /onOpenQuestion=\{onOpenQuestion\}/);
  assert.match(list, /onAddDocument=\{onAddDocument\}/);

  /* onChooseOption joined the element when the rows learned to draw the employer's own options;
     tests/question-choice-list.test.mjs pins what pressing one does. The whole-element pin stays,
     so a prop silently dropped from this line is still a failure here. */
  assert.match(page, /<BlockerList items=\{needsInputItems\} portalUrl=\{attendedHandoffUrl \? undefined : handoffUrl \?\? portalUrl\} onOpenQuestion=\{onOpenQuestion\} onChooseOption=\{onChooseOption\} onAddDocument=\{onAddDocument\} \/>/);
  assert.match(page, /onOpenQuestion=\{\(questionId, intent\) => reviewPortalQuestions\(questionId, intent\)\}/);
  assert.match(page, /onAddDocument=\{askForDocument\}/);
});

/* The third control the panel can draw, added when an employer's form started asking for a file.
 *
 * It renders a <button> like the answer actions do, and the assertions above walk to the FIRST
 * <button> in ChecklistRow to pin the handler on it, so this branch has to stay below that one.
 * Putting it above would silently move the older pin onto this control and free the dead-pill
 * regression to come back on the branch the older pin is actually about. */
test("the document row draws a real button, below the question button that the pins above walk to", () => {
  const row = functionBody(page, "ChecklistRow");

  assert.match(row, /control\?\.element === "attach"/);
  const questionBranch = row.indexOf('control?.element === "button"');
  const attachBranch = row.indexOf('control?.element === "attach"');
  assert.ok(questionBranch !== -1 && attachBranch > questionBranch, "the attach branch must stay after the question branch");

  const attach = row.slice(attachBranch, row.indexOf("</button>", attachBranch));
  assert.match(attach, /type="button"/);
  assert.match(attach, /onClick=\{\(\) => onAddDocument\(control\.kind\)\}/, "a button with no onClick is the same defect wearing a different tag");
  assert.match(attach, /aria-label=\{control\.name\}/);
});

/* The row that survives its own success.
 *
 * "Remove this file" lives inside TranscriptModal's attached state, and the modal opens only from a
 * control emitted by humanInputItems. Both places that could emit one were gated on the transcript
 * NOT being attached, so uploading a file removed the last control that could ever delete it, while
 * /privacy publishes "We encrypt it and keep it until you remove it or delete your account". A
 * promise of removal with nothing in the product that removes it is a promise that is not kept.
 *
 * The row therefore has to persist in a settled state, and it has to persist QUIETLY: a confirmation
 * counted in "N to check" inside an amber panel headed "Your turn" is how an application with
 * nothing outstanding goes on looking blocked.
 */
test("a settled row keeps its control, and keeps it out of the panel that counts outstanding work", () => {
  const list = functionBody(page, "BlockerList");

  assert.match(list, /const outstanding = items\.filter\(\(item\) => !item\.settled\)/);
  assert.match(list, /const settled = items\.filter\(\(item\) => item\.settled\)/);
  assert.match(list, /\{outstanding\.length\} to check/, "the count must read outstanding rows, never the settled confirmations");
  assert.equal(/\{items\.length\} to check/.test(list), false);

  // The amber Your turn panel is for outstanding rows only.
  const amber = list.indexOf("Your turn");
  const settledStrip = list.indexOf("settled.length > 0");
  assert.ok(amber !== -1 && settledStrip > amber, "the settled strip is drawn after the panel, outside it");
  assert.match(list.slice(settledStrip), /<ChecklistRow key=\{item\.id\} item=\{item\} checked=\{false\} portalUrl=\{portalUrl\} onOpenQuestion=\{onOpenQuestion\} onAddDocument=\{onAddDocument\} \/>/);

  const row = functionBody(page, "ChecklistRow");
  // `checked` still suppresses the control, because the Done column has no action words to draw.
  // `settled` must NOT, because the control is the only route back to the file.
  assert.match(row, /const control = checked \? null : checklistRowControl\(item, \{ portalUrl \}\)/);
  assert.match(row, /const done = checked \|\| item\.settled === true/);
  assert.match(row, /className=\{done \? CHECKLIST_SETTLED_ACTION_CLASS : CHECKLIST_ACTION_CLASS\}/);
  assert.match(row, /\{!done && item\.badge/, "a stored file must not go on wearing a REQUIRED pill");
  assert.match(page, /const CHECKLIST_SETTLED_ACTION_CLASS = "mt-1 flex min-h-11 /, "quieter, and still a 44px target");
});

test("the review screen can reopen an attached document after the ask has stopped being outstanding", () => {
  /* On ready_for_final_approval there is no Your turn panel at all, so the control row is the only
     place this screen can offer the modal. It was gated on outstandingDocumentAsk, which goes null
     the moment the upload succeeds. Without this second branch, a student on that status could reach
     Remove exactly once, in the seconds before she closed the modal.

     The branch is now per kind and gated on NOTHING but that kind's own file. Gated additionally on
     no ask being outstanding anywhere, it disappeared again as soon as a second kind was asked for:
     the way to remove a stored transcript went away because a writing sample had not arrived.
     features/applications/domain/submission-checklist.test.mts holds that behaviour; this pins that
     the screen renders one control per kind rather than one for the screen. */
  assert.match(page, /documentControls\(review\.required_documents, documentMarks, review\)/);
  assert.match(page, /attachedDocumentKinds\.map\(\(kind\) => \(\s*<Button key=\{kind\} onClick=\{\(\) => onAddDocument\(kind\)\} variant="quiet">/);
  assert.equal(/!outstandingDocumentAsk/.test(shippedCode(page)), false, "one kind's state must not gate another kind's control");
});

/* THE DEAD END THAT HAD NO DOOR.
 *
 * "I've ordered it" writes ordered_at and nothing else, correctly: Litos cannot make a registrar mail
 * a sealed transcript. The send gate reads attached_at, so it stays shut, and the modal that put her
 * there says "This application then finishes with you rather than with Litos" while the screen it
 * returns to had no control that finished anything. The packet sat at ready_for_final_approval behind
 * a permanently grey Send button. A form the run measured and found no upload control on reaches the
 * identical state from the other direction.
 *
 * The exit is the words this page already uses for the same act on a stalled handoff, and the server
 * writes the same record for it: submitted, with a receipt whose source is the attended handoff and
 * whose text names her as the witness rather than claiming Litos watched it land.
 */
test("an application Litos cannot finish has a control that finishes it", () => {
  const dashboard = shippedCode(page);
  assert.match(dashboard, /const documentsLitosCannotDeliver = orderedDocumentAsks\.length > 0 \|\| undeliverableDocumentAsks\.length > 0/);
  assert.match(
    dashboard,
    /documentsLitosCannotDeliver && \(\s*<Button onClick=\{onSelfSubmitted\} variant="secondary">I submitted it myself<\/Button>/,
    "a blocked send with no way out is the trap this screen has been fixed for six times",
  );
  assert.match(dashboard, /\/submission\/self-submitted/);
  // And the ordered ask keeps a way to attach the unofficial copy plenty of employers accept.
  assert.match(dashboard, /orderedDocumentAsks\.map\(\(ask\) => \(\s*<Button key=\{ask\.kind\}[\s\S]{0,120}Add an unofficial \{ask\.kind\}<\/Button>/);
});

/* THE MEASUREMENT THE BACKEND SHIPPED AND THIS SCREEN READ NOWHERE.
 *
 * `transcript_supported` is written on both prepare paths and declared in lib/api.ts, and grep for it
 * returned the declaration and nothing else. So an employer asked for a transcript, the run found no
 * control it could put one in, the student uploaded a file, the ask cleared because a mark now
 * existed, and Send went green over an application whose document had attached to nothing.
 */
test("a form with nowhere to put the file says so, and the settled row does not answer for the employer", () => {
  const dashboard = shippedCode(page);
  assert.match(dashboard, /const transcriptPending = outstandingDocumentAsks\.length > 0 \|\| documentsLitosCannotDeliver/);
  assert.match(dashboard, /undeliverableDocumentAsks\.map\(\(ask\) => \(/);
  assert.match(dashboard, /their form has no upload Litos can fill/);
  assert.match(
    dashboard,
    /undeliverable: undeliverableDocumentAsks/,
    "the capability has to reach the screen through the domain function, not a second read of the field",
  );
});

/* THE 2.5 SECOND WINDOW IN WHICH AN ATTACHED FILE LOOKED UNATTACHED.
 *
 * selectPacket seeds the first snapshot from the board row and the first poll tick is 2.5s behind
 * it. With `documents` left off that seed, re-entering an application whose transcript is already
 * stored drew no manage control at all until the poll answered, and the manage control is the only
 * route to "Remove this file". /privacy publishes "we keep it until you remove it", so a window in
 * which the product cannot remove it is a window in which that sentence is not true.
 *
 * The marks come off `spec._documents`, which is the same stored record the server reads to build
 * the envelope, so this is not the seed guessing. What it must NOT do is invent an empty object for
 * a packet with no marks: the send gate blocks on a measured-and-empty envelope, and a seed is not
 * a server answer. features/applications/domain/submission-state.test.mts holds that behaviour. */
test("the board seed carries the document marks the row already holds, and invents none", () => {
  const dashboard = shippedCode(page);
  assert.match(dashboard, /documents: documentsFromSpecMarks\(packet\.spec\._documents\)/);
  assert.match(dashboard, /documentsFromSpecMarks[\s\S]{0,400}from "@\/features\/applications"/);
});

test("the blocker sentence names a control that exists on the screen it is printed on", () => {
  /* It said "Add the file in the row above". BlockerList renders only on needs_attention and that
     paragraph renders only on ready_for_final_approval, so the two can never be on screen together
     and there was no row above to point at. */
  assert.equal(/Add the file in the row above/.test(page), false);
  assert.match(page, /Press Add \{ask\.kind\}, next to Send application, to attach one\./);
});

test("the read-only packet viewer drops settled rows rather than listing them as input it needs", () => {
  const viewer = readFileSync(fileURLToPath(new URL("../components/app/ApplicationPacket.tsx", import.meta.url)), "utf8");
  assert.match(viewer, /\}\)\.filter\(\(item\) => !item\.settled\);/);
});

/* THE SECOND HALF OF THIS ROW'S PROMISE, which was missing for as long as the row existed.
 *
 * Pressing a Your turn row opens the answer editor on that question, and that half worked. Saving
 * there did not: the button called saveApplyAnswers, which sets a banner and changes screens and
 * issues no request, so the answer lived until the tab closed. This file used to assert that exact
 * wiring and describe it as "the existing persistence path"; it was not a persistence path at all.
 *
 * The route it writes through now is deliberately neither of the two that already existed. See
 * features/applications/domain/review-answer-save.ts, whose test holds the behaviour: one request,
 * carrying the answers, never the submission route, and no success banner on a refusal. */
test("pressing a row opens the answer editor on that question, and saving there writes", () => {
  assert.match(page, /function reviewPortalQuestions\(focusQuestionId\?: string, intent\?: SubmissionChecklistAction\)/);
  assert.match(page, /setFocusQuestion\(/);
  assert.match(page, /moveToScreen\("questions"\)/);

  /* Saving invalidates the prior audit. Any subsequent submit-request is reached through a new
     exact packet audit, so editing a stalled answer cannot reuse the PDF, answer map, or
     requirement evidence that preceded it. And the stalled-run half of the button reaches
     saveReviewedAnswers, which is the half that was missing.

     TWO FACTS, SCOPED TO THE ELEMENT. The earlier version pinned the whole onSubmit expression
     including its whitespace, which fails on a reformat and passes on nothing else. What
     saveReviewedAnswers then DOES - one request, on the answers route, never the submission route,
     and a banner built from the response rather than from the click - is executable and is asserted
     against the real function in features/applications/domain/review-answer-save.test.mts, so
     re-asserting it here by slicing the component's source proved it in the weaker of the two
     available ways and broke whenever the line after it moved. */
  const screen = jsxElement(page, "QuestionsScreen");
  assert.match(screen, /setPacketEvidence\(null\)/, "saving voids the prior exact-packet audit");
  assert.match(screen, /void saveReviewedAnswers\(\)/, "and a stalled run's save is the one that writes");

  assert.match(page, /questionsSnapshot: currentQuestionsSnapshot/);
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
