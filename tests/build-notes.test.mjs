import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { humanizeBuildNote } from "../lib/buildNotes.ts";

/* The note a student actually got on the screen where they approve their resume, measured on a real
 * federal resume, 2026-07-27:
 *     bullet not action-verb-first ("Maintained"): "Maintained a caseload of 12-21 individua"
 * Internal vocabulary, chopped mid-word, and no statement of what to do about it. */

describe("build notes a student reads", () => {
  test("the weak-verb note says what to do instead of naming the rule", () => {
    const said = humanizeBuildNote(
      'bullet not action-verb-first ("Maintained"): "Maintained a caseload of 12-21\u2026"',
    );
    assert.ok(!said.includes("action-verb-first"), said);
    assert.ok(said.includes("Maintained"), said);
    assert.ok(said.includes("Rewrite it"), said);
  });

  test("a dropped bullet says what was dropped and why", () => {
    assert.equal(
      humanizeBuildNote("dropped unsupported bullet in National Institutes of Health"),
      "We left out a bullet from National Institutes of Health, because the resume you uploaded does not say it.",
    );
    assert.ok(
      humanizeBuildNote("dropped ungrounded skills: gRPC, SDK design").includes(
        "not on the resume you uploaded: gRPC, SDK design",
      ),
    );
    assert.ok(
      humanizeBuildNote('dropped entry "Acme Corp" (not in experience bank)').includes("We left Acme Corp off"),
    );
  });

  test("coursework and education mismatches are translated", () => {
    assert.ok(
      humanizeBuildNote("coursework contains a course not listed on the uploaded resume").includes(
        "not on the resume you uploaded",
      ),
    );
    assert.ok(
      humanizeBuildNote("education school differs from uploaded resume").includes(
        "does not match the resume you uploaded",
      ),
    );
  });

  test("bullet-shape notes are translated", () => {
    assert.ok(humanizeBuildNote('em dash in bullet: "Built the thing\u2026"').includes("em dash"));
    assert.ok(humanizeBuildNote('bullet exceeds 220 chars: "Built the thing\u2026"').includes("220 characters"));
  });

  test("an unrecognised note passes through rather than being swallowed", () => {
    const raw = "something entirely new from a later validator";
    assert.equal(humanizeBuildNote(raw), raw);
  });

  test("no translated note leaks internal vocabulary", () => {
    const raws = [
      'bullet not action-verb-first ("Maintained"): "x"',
      "dropped ungrounded skills: a",
      'grounding: metric "40%" in a job bullet is not in the experience bank ("x")',
    ];
    for (const raw of raws) {
      const said = humanizeBuildNote(raw);
      assert.ok(!/ungrounded|experience bank|action-verb-first|^grounding:/.test(said), said);
    }
  });
});

/* Findings from the code review of this branch: five validator strings the first pass missed still
 * put "ungrounded" and "experience bank" on the student's screen. */
describe("every note the backend can emit is translated", () => {
  const raws = [
    'grounding: metric "40%" in a job bullet is not in the experience bank ("Cut latency…")',
    'grounding: claim "led a team" in a project bullet is not in the experience bank ("Led four…")',
    "dropped bullet with ungrounded 40% in Acme Corp",
    'reset title "Senior Engineer" -> "Engineer" for Acme Corp',
    'reset date "2020 - 2024" -> "2022 - 2024" for Acme Corp',
    "6 entries selected (max 4)",
    "education must render at the top for a currently enrolled student",
    'dropped "Acme Corp" entirely, nothing on it could be supported by your resume',
  ];

  for (const raw of raws) {
    test(`translates: ${raw.slice(0, 40)}`, () => {
      const said = humanizeBuildNote(raw);
      assert.notEqual(said, raw, "fell through untranslated");
      assert.ok(
        !/ungrounded|experience bank|action-verb-first|^grounding:|->/.test(said),
        said,
      );
    });
  }
});
