import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* LITOS DRAFTS THE ESSAY, AND SHE APPROVES IT. The owner's directive, verbatim: "For required
 * essays, Litos auto-generates pieces from the resume and the job description, and then asks the
 * user if they approve of the generated answer, if they'd like to make any changes in the same box
 * format as the other questions that require filling."
 *
 * MEASURED, prod, 2026-09-02. EQL Tech "Founding AI Engineer (Computer Vision)" on Workable, packet
 * 9bbf3ba1: question 3 of 5, REQUIRED, free text, "Describe a multimodal/cv system you personally
 * shipped to production, and your role in it." Litos left it empty. This screen then offered
 * Previous and a disabled Save and next, with no Skip, so the application could not complete.
 *
 * The backend now drafts it and stores answer_source 'litos_draft'. Everything below is this
 * screen's half of the contract: the SAME box, a line saying who wrote the words, a press that
 * records them as hers, and Skip left exactly where it was. */
const page = readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const checklist = readFileSync(
  new URL("../features/applications/domain/submission-checklist.ts", import.meta.url), "utf8");

function directPrompt() {
  const start = page.indexOf("export function DirectApplicationQuestion(");
  const end = page.indexOf("\nfunction SubmissionScreen(", start);
  assert.ok(start !== -1 && end > start, "DirectApplicationQuestion must still be findable");
  return page.slice(start, end);
}

describe("the drafted answer arrives in the ordinary answer box, labelled", () => {
  const prompt = directPrompt();

  test("the client understands the provenance the server writes", () => {
    assert.match(api, /answer_source\?: "applicant_review" \| "consent_permission" \| "litos_draft";/);
  });

  test("the screen reads it, off the SAVED answer so typing does not erase the attribution", () => {
    assert.match(
      prompt,
      /const litosDrafted = task\.question\.answer_source === "litos_draft" && Boolean\(savedAnswer\.trim\(\)\);/,
    );
  });

  test("it says, in plain words, that Litos wrote the answer and she decides", () => {
    assert.match(prompt, /\{litosDrafted && \(/);
    assert.match(prompt, /Litos wrote this answer from your resume and this job\. Approve it as it is, or change/);
    assert.match(prompt, /anything you want first\. Nothing is sent until you do\./);
  });

  test("the same box format as every other fill-in question: one textarea, bound to the answer", () => {
    assert.match(prompt, /<textarea\s+value=\{answer\}\s+readOnly=\{busy\}/);
    // No second editor, no read-only preview pane, no accept/reject pair. One box.
    assert.equal([...prompt.matchAll(/<textarea/g)].length, 1);
  });

  test("the notice is not dressed as a fault", () => {
    assert.doesNotMatch(prompt, /bg-warn|border-warn|text-warn/);
    assert.doesNotMatch(prompt, /role="alert"[\s\S]{0,120}Litos wrote this answer/);
  });

  test("approving a draft still adds no control of its own", () => {
    /* FOUR SINCE 2026-09-03: Previous, Next, the optional Skip, and the unreadable-choice-list
       re-read added for the Zeus breezy packet, where her stored answer was on none of the single
       option the reader captured and the screen had no correct press on it. None of the four is
       the draft approval, which is still the save press and still adds nothing. */
    assert.equal(
      [...prompt.matchAll(/type="button"/g)].length,
      4,
      "approving a draft must not add a control; it is the save press",
    );
    assert.match(prompt, /\? "Saving\.\.\." : "Skip"/);
    assert.match(prompt, /grid gap-2 \$\{task\.question\.required \? "grid-cols-1" : "grid-cols-2"\}/);
  });
});

describe("the press is Save, and the word on it is Approve", () => {
  const prompt = directPrompt();

  test("the label ternary gains an arm rather than a control", () => {
    const match = prompt.match(/const actionLabel = ([\s\S]*?);\n\n/);
    assert.ok(match, "actionLabel must still be one expression");
    const label = new Function(
      "contextOnly", "hasNext", "task", "litosDrafted", "answerDirty", "saved",
      `return ${match[1]};`,
    );
    const review = { intent: "review" };

    // The drafted answer, untouched: the press approves it.
    assert.equal(label(false, true, review, true, false, false), "Approve and next");
    assert.equal(label(false, false, review, true, false, false), "Approve answer");
    // Edited: they are her words now, so it is a save again.
    assert.equal(label(false, true, review, true, true, false), "Save and next");
    // Every pre-existing label is unchanged.
    assert.equal(label(false, true, { intent: "answer" }, false, false, false), "Save and next");
    assert.equal(label(false, false, { intent: "answer" }, false, false, false), "Save answer");
    assert.equal(label(false, true, { intent: "answer" }, false, false, true), "Save changes and next");
    assert.equal(label(false, true, { intent: "confirm" }, false, false, false), "Confirm and next");
    assert.equal(label(true, true, { intent: "answer" }, false, false, false), "Next question");
  });

  test("saving it posts the per-question confirmation the server mints her claim from", () => {
    const match = page.match(/const directlyConfirmed = ([\s\S]{0,220}?);\n/);
    assert.ok(match, "the mint gate must still be findable");
    const mint = new Function("direct", "question", `return Boolean(${match[1]});`);
    // A drafted essay opened on its own screen, saved unchanged. Without the flag the server sees
    // an untouched Save, mints nothing, and the paragraph stays a draft the send gate refuses.
    assert.equal(mint({ intent: "review", questionId: "q1" }, { id: "q1", answer: "drafted paragraph" }), true);
    // Still one question only. A bulk save claims nothing, which is the 802-answer guard.
    assert.equal(mint(null, { id: "q1", answer: "drafted paragraph" }), false);
  });

  test("the request carries confirmed, and still carries no provenance of its own", () => {
    const request = readFileSync(
      new URL("../features/applications/domain/review-answer-save.ts", import.meta.url), "utf8");
    assert.match(request, /confirmed\?: boolean;/);
    assert.match(request, /\.\.\.\(question\.confirmed === true \? \{ confirmed: true as const \} : \{\}\),/);
    assert.doesNotMatch(request, /answer_source:/);
  });
});

describe("a drafted answer is routed to that screen in the first place", () => {
  test("an essay with an answer is a Review row, which opens the direct question", () => {
    assert.match(checklist, /question\.kind === "essay" && answer/);
    assert.match(checklist, /detail: "Drafted answer ready for review"/);
    assert.match(checklist, /actionKind: "review"/);
  });
});
