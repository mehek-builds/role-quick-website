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
    /* The wording is mode-dependent now, since the resume pane is a rasterised PDF once the exact
       packet is active and "on your resume" promised marks on an image. What must not change is
       that covered and missing are UNCONDITIONAL: unlike edited and unscoreable, those two colours
       are on the page in every mode, so the key always names them. */
    assert.match(legend, /<Swatch tone="covered" label=\{copy\.covered\} \/>/);
    assert.match(legend, /<Swatch tone="missing" label=\{withCount\(copy\.missing, missingCount\)\} \/>/);
    assert.doesNotMatch(legend, /&& <Swatch tone="covered"/);
    assert.doesNotMatch(legend, /&& <Swatch tone="missing"/);
  });

  test("both modes give covered and missing a label, and they differ", () => {
    /* A mode whose copy fell back to the other mode's wording would reintroduce the exact bug: the
       packet mode telling a student to look for a colour on a PDF canvas. */
    const draft = legend.match(/draft: \{([\s\S]*?)\},/);
    const packet = legend.match(/packet: \{([\s\S]*?)\},/);
    assert.ok(draft && packet, "both legend modes are defined");
    assert.match(draft[1], /covered: "asked for, and on your resume"/);
    assert.match(packet[1], /covered: "asked for, and evidenced in your packet"/);
    assert.notEqual(draft[1], packet[1]);
  });

  test("the unscoreable swatch is conditional, like edited", () => {
    assert.match(legend, /\{unscoreableCount > 0 && <Swatch tone="unscoreable"/);
  });

  test("every tone the key names resolves to a real colour token", () => {
    /* bg-panel-soft was referenced by the audit's "Not scoreable" chip for months while
       --color-panel-soft did not exist, so that chip rendered transparent: measured on production
       2026-08-26 as rgba(0, 0, 0, 0). A swatch with no fill is worse than no swatch, because the
       key then names a colour the student cannot find on the page. */
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const tones = [...legend.matchAll(/bg-([a-z-]+-soft)/g)].map((match) => match[1]);
    assert.ok(tones.length >= 4, `expected every tone to carry a -soft fill, saw ${tones.length}`);
    for (const tone of new Set(tones)) {
      assert.match(css, new RegExp(`--color-${tone}:\\s*#`), `--color-${tone} is referenced but never defined`);
      assert.match(css, new RegExp(`--color-${tone}: var\\(--color-${tone}\\)`), `--color-${tone} is defined but not exposed to Tailwind`);
    }
  });

  test("the review screen uses the server audit count once the exact packet is active", () => {
    assert.match(page, /authoritativeEditedCount = activePacketEvidence[\s\S]{0,300}term\.tone === "edited"/);
    assert.match(page, /<MatchLegend[\s\S]{0,400}missingCount=\{authoritativeMissingCount\}/);
    assert.match(page, /<MatchLegend[\s\S]{0,400}editedCount=\{authoritativeEditedCount\}/);
    assert.match(page, /<MatchLegend[\s\S]{0,400}mode=\{activePacketEvidence \? "packet" : "draft"\}/);
  });
});
