import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";

/**
 * ISSUE-047, the two halves of the colour contract this screen was breaking.
 *
 * The contract is one sentence: every colour on the review screen is supported by something on the
 * page. Measured over the 85 production packets on 2026-08-09, two ways it was not:
 *
 *   BLUE WITH NOTHING TO POINT AT. 111 of 313 matched terms (35.5%), on 76 of the 83 scorable
 *   packets, were marked in the job description and marked nowhere in the resume. 102 of them came
 *   from fields the scorer reads and this pane could not mark: `school`, `degree` and the
 *   experience `org` and `title` rendered through EditableLine, which has no highlighting, and
 *   `coursework` was not rendered at all even though the PDF prints it. The single worst term was
 *   `computer science`, 65 instances, credited from "Bachelor of Science in Computer Science".
 *
 *   GREEN PROMISED AND NEVER SHOWN. `_review.edited_terms` is non-empty on 2 of 85 packets, so the
 *   legend defined a third colour that 97.6% of packets do not contain.
 *
 * Both are asserted against the page source rather than a render, in the style of the other wiring
 * regressions in this directory: the defect is which component a field is rendered through, and a
 * behavioural test of RequirementText would have stayed green through all of it.
 */
const page = readFileSync("app/dashboard/applications/page.tsx", "utf8");
const legend = readFileSync("components/app/RequirementText.tsx", "utf8");

describe("every field the scorer reads can be marked in the resume pane", () => {
  // resumeSpecText is the definition of "every word the resume puts on the page", so it is the list
  // this pane owes an anchor for. The two date fields are excluded: they carry no requirement term
  // and a mark on "May 2027" would be noise, which is a judgement worth stating rather than an
  // omission worth finding again.
  for (const field of ["spec.school", "spec.degree", "spec.coursework"]) {
    test(`${field} renders through EditableHighlight, not EditableLine`, () => {
      const pattern = new RegExp(`<EditableHighlight value=\\{${field.replace(".", "\\.")}\\}`);
      assert.match(page, pattern, `${field} is scored, so it has to be markable`);
    });
  }

  for (const field of ["entry.org", "entry.title"]) {
    test(`${field} renders through EditableHighlight, not EditableLine`, () => {
      const pattern = new RegExp(`<EditableHighlight value=\\{${field.replace(".", "\\.")}\\}`);
      assert.match(page, pattern);
    });
  }

  test("coursework is on the screen at all, under the label the PDF uses", () => {
    // drawEducation() in the backend's engine/resumeRender.ts writes "Relevant coursework: ...".
    // The pane omitted the field entirely, so a student checking the document before sending it was
    // looking at a shorter resume than the one Litos was about to send.
    assert.match(page, /Relevant coursework: /);
  });
});

describe("the legend only names colours the page can contain", () => {
  test("the edited swatch is conditional", () => {
    assert.match(legend, /\{editedCount > 0 && <Swatch tone="edited"/);
  });

  test("the two colours that are always there are not conditional", () => {
    assert.match(legend, /<Swatch tone="covered" label="asked for, and on your resume" \/>/);
    assert.match(legend, /<Swatch tone="missing"/);
  });

  test("the review screen passes the packet's own edited-term count", () => {
    assert.match(page, /<MatchLegend missingCount=\{[^}]*\} editedCount=\{editedTerms\.size\} \/>/);
  });
});
