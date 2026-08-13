import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The "Mark ... done" checkbox on the "Your turn" panel, on /dashboard/applications.
 *
 * WHAT WAS WRONG. Each outstanding row drew
 * `<input type="checkbox" aria-label={`Mark ${item.label} done`}>` with no `checked`, no
 * `onChange`, no `defaultChecked` and no state anywhere behind it. It arrived in
 * "Make application blockers checkable" (7051e6d, 2026-08-06), which turned a decorative <span>
 * tick into a decorative <input> and added nothing else. Measured on the live Deepgram packet
 * b18f1842 on 2026-08-13: five presses across five boxes, NO NETWORK REQUEST AT ALL, `checked` false
 * on all five afterwards, and the rows still there. Not disabled, not readOnly - unwired.
 *
 * This is the same defect the action pill on these rows had, four months later and one column to the
 * left, which is why it is pinned the same way. See tests/your-turn-actions.test.mjs for the pill,
 * and for why this half is source analysis: `npm test` runs node --experimental-strip-types, which
 * strips TypeScript but cannot compile JSX, so no test in this repo can mount a component. The
 * decision half IS executable and lives in features/applications/domain/answer-approval.test.mts,
 * where the row-clears-once-approved behaviour is driven for real. What only this file can pin is
 * that the element the decision asks for is the element that gets drawn - precisely the half that
 * shipped broken, twice.
 */

const page = readFileSync(fileURLToPath(new URL("../app/dashboard/applications/page.tsx", import.meta.url)), "utf8");

/* Comments stripped before any "is it gone?" assertion, as tests/your-turn-actions.test.mjs and
   tests/application-submission-gate.test.mjs do it: a note recording a deleted expression has to
   name that expression, and a bare grep would count the explanation as the code. */
function shippedCode(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is gone from app/dashboard/applications/page.tsx`);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

function checkboxIn(source) {
  const start = source.indexOf("<input");
  assert.notEqual(start, -1, "the approvable row has to render an input");
  return source.slice(start, source.indexOf("/>", start));
}

test("the checkbox has a handler, which is the whole of what it never had", () => {
  const row = shippedCode(functionBody(page, "ChecklistRow"));
  const checkbox = checkboxIn(row);

  assert.match(checkbox, /type="checkbox"/);
  assert.match(
    checkbox,
    /onChange=\{\(\) => onApproveAnswer\(approval\.questionId\)\}/,
    "a checkbox with no onChange is scenery, which is the defect this file exists for",
  );
  assert.match(checkbox, /aria-label=\{`Mark \$\{item\.label\} done`\}/, "and it keeps its accessible name");
});

/* CONTROLLED, so what the box shows is what the server holds. An uncontrolled box toggles itself on
   press and goes on looking ticked through a refusal, a lost race, or an offline tab - which is a
   second way of telling the applicant something was recorded when nothing was. The ticked state is
   the other branch of this row, reached because the APPROVAL IS ON THE PACKET. */
test("the checkbox is controlled off the row rather than off the browser", () => {
  const checkbox = checkboxIn(shippedCode(functionBody(page, "ChecklistRow")));

  assert.match(checkbox, /checked=\{false\}/, "the box must not carry its own state");
  assert.match(checkbox, /disabled=\{approvingQuestionId === approval\.questionId\}/, "and must not be pressable twice while one press is in flight");
});

/* NO CONTROL WITHOUT A TARGET, which is the rule checklistRowControl already applies to the pill on
   the same row. A blocker the run reported has no stored answer to approve and no honest place to
   record "done": these rows are rebuilt from attention_reason by the 2.5s poll, so a tick kept in
   the client would hide a live blocker and then be erased on the next tick. */
test("only a row with something to approve draws an input at all", () => {
  const row = shippedCode(functionBody(page, "ChecklistRow"));

  assert.match(row, /checklistRowApproval\(item\)/, "the row has to ask the domain whether there is anything to approve");
  assert.match(row, /approval && onApproveAnswer \?/, "and draw the input only in that branch");

  const inputs = row.match(/<input/g) ?? [];
  assert.equal(inputs.length, 1, "one input, in one branch, or an unwired one is back");
});

/* THE WIRE ITSELF, END TO END. Each hop was absent, and a handler that reaches ChecklistRow through
   only two of the three props is a handler that never fires. */
test("the handler reaches the row from the screen that owns the request", () => {
  const shipped = shippedCode(page);

  assert.match(shipped, /onApproveAnswer=\{\(questionId\) => void approveAnswer\(questionId\)\}/, "the page has to pass its own handler in");
  assert.match(functionBody(shipped, "SubmissionScreen"), /<BlockerList[\s\S]*?onApproveAnswer=\{onApproveAnswer\}/, "the panel has to pass it to the list");
  assert.match(functionBody(shipped, "BlockerList"), /onApproveAnswer=\{onApproveAnswer\}/, "and the list to the row");
});

/* THE REQUEST THE PRESS MAKES, pinned to the one helper that defines it. A second definition of this
   call inside the component is how the two Save paths drifted apart, which is the defect
   features/applications/domain/review-answer-save.ts was written to stop recurring. */
test("the press goes through the one helper that names the route", () => {
  const shipped = shippedCode(page);

  assert.match(shipped, /approveDraftedAnswer<SubmissionResponse\["review"\]>\(\{/);
  assert.match(shipped, /answer: question\.answer,/, "the exact text the row was drawn from, so the server can refuse an answer that moved");
  assert.equal(
    /fetch\(`\/applications\/\$\{[^}]*\}\/review\/answers\/[^`]*approval/.test(shipped),
    false,
    "the approval route must not be spelled out anywhere but answer-approval.ts",
  );
});
