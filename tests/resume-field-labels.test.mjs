import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* ISSUE-034, the same defect class as ISSUE-012 one page over. The work-history editor renders
   six fields per entry. Four go through the Field helper, whose <label> wraps its input, so they
   were named correctly. The Type select and the bullets textarea were written inline with a
   <label> that was only a sibling: no htmlFor, no wrapping element, so nothing computed an
   accessible name and a reader announced twelve unnamed controls on the page a student uses to
   edit the history feeding every tailored resume (WCAG 4.1.2 and 3.3.2).

   The inconsistency is why it survived: the page looked and read the same either way to a sighted
   user, so only a test can hold the line. */

const resumePage = new URL("../app/dashboard/resume/page.tsx", import.meta.url);

/* Several guards in this repo were found to be satisfiable by a comment containing the asserted
   string, which is not an assertion at all. Read shipped code only. Same helper as the one in
   tests/review-highlighting.test.mjs. */
function shippedCopy(source) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "") // JSX comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/^\s*\/\/.*$/gm, ""); // line comments
}

/* Slice out one helper's body so a fix in a neighbouring helper cannot make this pass for a
   helper that is still broken. */
function helperBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} helper is gone; the ISSUE-034 guard needs updating`);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test("the work-history select and bullets helpers name their controls programmatically", async () => {
  const source = shippedCopy(await readFile(resumePage, "utf8"));

  for (const [name, control] of [["SelectField", "select"], ["LinesField", "textarea"]]) {
    const body = helperBody(source, name);
    assert.match(body, /const fieldId = useId\(\);/, `${name} must derive a stable id`);
    assert.match(body, /<label htmlFor=\{fieldId\}/, `${name} label must point at its control`);
    /* Check the id sits on the opening tag of the control itself. Grepping the whole helper for
       id={fieldId} would stay green if the id landed on the wrapper div. */
    const openingTag = body.match(new RegExp(`<${control}[\\s\\S]*?>`))?.[0];
    assert.ok(openingTag, `${name} must still render a <${control}>`);
    assert.match(openingTag, /\sid=\{fieldId\}/, `the <${control}> in ${name} must carry the id its label points at`);
    /* aria-label would satisfy a checker while letting the spoken name drift away from the visible
       text on the next copy edit. The visible label is the name. */
    assert.doesNotMatch(body, /aria-label=/, `${name} should associate its visible label, not duplicate it`);
  }
});

test("no work-history control is written inline, where it can be born unnamed", async () => {
  const source = shippedCopy(await readFile(resumePage, "utf8"));
  const workspace = source.slice(
    source.indexOf("export default function ResumeWorkspace("),
    source.indexOf("\nfunction Field("),
  );
  assert.ok(workspace.length > 0, "ResumeWorkspace body not found; the guard needs updating");

  /* The file input is the one raw control that belongs here: it is display:none and driven by the
     Replace resume button, so it is not in the accessibility tree at all. Everything a student
     types into must come from a helper that owns its label. */
  assert.doesNotMatch(workspace, /<select/, "selects belong in SelectField, which names them");
  assert.doesNotMatch(workspace, /<textarea/, "textareas belong in LinesField, which names them");
  for (const match of workspace.matchAll(/<input[\s\S]*?\/>/g)) {
    assert.match(match[0], /type="file"/, `raw <input> in the entry card: ${match[0]}`);
  }
});

test("the four fields that were already correct keep their wrapping label", async () => {
  const source = shippedCopy(await readFile(resumePage, "utf8"));

  /* Organization, Title, Dates and Skills were the 24 of 36 controls that measured clean, because
     Field puts the control inside the <label>. Implicit association is a real association, so this
     does not need converting, but it does need holding: dropping the wrap would silently unname
     four more fields per entry. */
  for (const name of ["Field", "TextAreaField"]) {
    const body = helperBody(source, name);
    assert.match(body, /<label className="block">/, `${name} must keep wrapping its control`);
    assert.match(body, /<\/label>/, `${name} must keep wrapping its control`);
  }
});

test("no label on the resume page is left as a bare sibling", async () => {
  const source = shippedCopy(await readFile(resumePage, "utf8"));

  /* Labels that wrap their control are fine. This catches the form the defect took: a <label> with
     text and a closing tag, standing next to the control rather than owning it. */
  for (const match of source.matchAll(/<label(?![^>]*htmlFor)[^>]*>([\s\S]*?)<\/label>/g)) {
    assert.ok(
      /<(input|select|textarea)/.test(match[1]),
      `label neither wraps a control nor carries htmlFor: ${match[0].slice(0, 120)}`,
    );
  }
});
