import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* JSX cannot be mounted under --experimental-strip-types, so the wiring is pinned by reading the
 * source, the same way tests/your-turn-actions.test.mjs pins the Your turn rows. */

const PAGE = readFileSync("app/dashboard/applications/page.tsx", "utf8");
const API = readFileSync("lib/api.ts", "utf8");

/* Same slicer tests/your-turn-actions.test.mjs uses: from the declaration to the next top-level
 * one. Brace counting cannot be used here, because a component's props are destructured in the
 * signature and the count closes before the body opens. */
function functionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `could not find ${signature}`);
  const next = source.indexOf("\nfunction ", start + 1);
  const nextAsync = source.indexOf("\n  async function ", start + 1);
  const nextInner = source.indexOf("\n  function ", start + 1);
  const ends = [next, nextAsync, nextInner].filter((index) => index > start);
  return source.slice(start, ends.length > 0 ? Math.min(...ends) : source.length);
}

/* One rendered element and its props, so a wiring assertion can be scoped to the element it is about
   without pinning the shape of any one prop. */
function jsxElement(source, name) {
  const element = new RegExp(`<${name}[\\s\\S]*?\\n\\s*/>`).exec(source);
  assert.ok(element, `<${name} is gone from app/dashboard/applications/page.tsx`);
  return element[0];
}

test("the extra questions are asked at Apply, not discovered mid-run", () => {
  const ask = functionBody(PAGE, "async function askPrescriptQuestions(jobId: string)");
  assert.match(ask, /await getPostingQuestions\(jobId\)/);
  assert.match(ask, /if \(!prescriptNeedsHer\(prescript\)\) return;/);
  assert.match(ask, /moveToScreen\("questions"\)/);
});

test("it runs after the packet exists, so a slow or missing scan costs her nothing", () => {
  const create = functionBody(PAGE, "async function createApplication(draft: NewApplicationDraft = newApplication)");
  const created = create.indexOf("selectPacket(created)");
  const asked = create.indexOf("await askPrescriptQuestions(draft.jobId)");
  assert.ok(created > 0 && asked > created, "the pre-script is fetched after the packet is built");
  // Only for a posting off the board. A hand-typed link has no posting to look ahead at.
  assert.match(create, /if \(draft\.jobId && !keepCanonicalDetail\) await askPrescriptQuestions\(draft\.jobId\)/);
  // Every failure means "nothing extra to ask", which is exactly today's behaviour.
  assert.match(API, /export function getPostingQuestions[\s\S]{0,400}?\.catch\(\(\) => null\)/);
});

test("the answers go out through the one path every other answer takes", () => {
  const ask = functionBody(PAGE, "async function askPrescriptQuestions(jobId: string)");
  // Into the same `questions` state the answers editor owns, merged so an answer already typed in
  // this session is not overwritten.
  assert.match(ask, /setQuestions\(\(current\) => mergeDiscoveredQuestions\(current, asked\)\)/);
  // And out through submit-request, which is where reviewed answers have always gone.
  assert.match(PAGE, /\/applications\/\$\{applicationId\}\/submit-request/);
  // No second submit path was invented for this.
  // Three call sites in total and no more: the autopilot countdown, prepareApplication, and
  // nothing else. The Apply screen reuses prepareApplication rather than adding a fourth.
  assert.equal((PAGE.match(/api<SubmissionResponse>\(`\/applications\/\$\{[a-zA-Z.]+\}\/submit-request`/g) ?? []).length, 2);
});

test("a closed list is rendered as the employer's own choices, with nothing pre-picked", () => {
  const screen = functionBody(PAGE, "function QuestionsScreen(");
  assert.match(screen, /question\.options && question\.options\.length > 0 \?/);
  assert.match(screen, /<option value="">Choose an answer<\/option>/);
  assert.match(screen, /question\.options\.map\(\(option\) => <option key=\{option\} value=\{option\}>\{option\}<\/option>\)/);
  // The free-text control is still there for everything else.
  assert.match(screen, /<textarea id=\{`question-\$\{question\.id\}`\}/);
});

test("each question says why it is hers, and a remembered answer says so on its own row", () => {
  const screen = functionBody(PAGE, "function QuestionsScreen(");
  assert.match(screen, /\{question\.explanation && \(/);
  assert.match(screen, /\{question\.remembered && \(/);
  assert.match(screen, /You answered this before\. Change it if it is out of date\./);
});

test("the Apply summary line does not leak onto the other routes into the editor", () => {
  const review = functionBody(PAGE, "function reviewPortalQuestions(focusQuestionId?: string)");
  assert.match(review, /setPrescriptNote\(""\)/);
  const screen = functionBody(PAGE, "function QuestionsScreen(");
  assert.match(screen, /\{!reviewDiscovered && prescriptNote && \(/);
});

test("focusing a pre-script row works when it rendered as a select", () => {
  const screen = functionBody(PAGE, "function QuestionsScreen(");
  assert.match(screen, /!\(field instanceof HTMLTextAreaElement\) && !\(field instanceof HTMLSelectElement\)/);
  assert.match(screen, /if \(field instanceof HTMLTextAreaElement\) field\.setSelectionRange/);
});

test("saving at Apply hands the resume back rather than starting a submission", () => {
  const save = functionBody(PAGE, "function saveApplyAnswers()");
  assert.match(save, /moveToScreen\("review"\)/);
  assert.doesNotMatch(save, /prepareApplication/);
  // The answers stay in `questions`, which is what continueFromResume passes to prepareApplication,
  // so they ride into the packet on the next step with nothing re-entered.
  assert.doesNotMatch(save, /setQuestions\(\[\]\)/);
  /* Every route invalidates the prior exact packet audit. The next send can only happen after
     answers, PDF bytes, and requirement evidence are frozen together again.

     TWO FACTS, SCOPED TO THE ELEMENT, rather than one pin on the whole onSubmit expression. The
     Apply branch is now a branch: the same screen serves a stalled run, where a local-only save
     saved nothing at all, so that path writes through saveReviewedAnswers instead. Pinning the
     literal shape of that expression made every reformatting of it a failure while asserting nothing
     these two lines do not, and what the other branch actually DOES is executable and tested for
     real in features/applications/domain/review-answer-save.test.mts. */
  const screen = jsxElement(PAGE, "QuestionsScreen");
  assert.match(screen, /setPacketEvidence\(null\)/, "saving voids the prior exact-packet audit");
  assert.match(screen, /saveApplyAnswers\(\)/, "and the Apply save is still this handler");
});

test("nothing on the Apply screen is filled by a guess", () => {
  // The only answer that arrives non-empty is one she typed herself on an earlier posting, and the
  // client never manufactures one. There is no draft call anywhere on this path.
  const prescript = readFileSync("features/applications/domain/prescript.ts", "utf8");
  // Strip the comments first: this module explains at length that it never drafts, and the words
  // it uses to say so must not be what fails the check that it does not.
  const code = prescript.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
  assert.doesNotMatch(code, /draftApplicationAnswer|generateAnswer|inferAnswer/i);
  assert.match(prescript, /answer: item\.answer \?\? ""/);
});
