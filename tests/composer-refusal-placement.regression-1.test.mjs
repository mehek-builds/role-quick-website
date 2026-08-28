import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { canGenerateFrom, isHttpsJobUrl, missingApplicationFields } from "../features/applications/domain/daily-matches.ts";

// Regression: ISSUE-040, a validation error rendered off-screen from the button that raised it.
//
// Found by a live production audit on 2026-08-04. On /dashboard/applications?new=1, pressing
// "Make my resume" on an empty form emitted role="alert" with "Fill in all four boxes first." at
// y = -281, i.e. 281px ABOVE the top of a 723px viewport, while the button that raised it sat at
// y = 434, on screen. A screen reader user was told. A sighted user saw the button do nothing.
//
// This is the DEFAULT geometry, not an edge case: the job description textarea is ~320px tall, so
// the banner at the top of the composer is always off-screen when the button is in reach.
//
// THE FIX IS PLACEMENT PLUS ATTACHMENT, not motion. The message moved into the composer's own
// button row, and the boxes it is about are marked aria-invalid. Nothing scrolls: this audit has
// already produced false findings from behavior: "smooth", which does not run in a background tab,
// and a fix that depends on animation frames is a fix that stops working when the tab is not
// looked at.

describe("the refusal knows which boxes it is about", () => {
  const full = {
    company: "PsiQuantum",
    role: "Intern, Quantum Architecture",
    portalUrl: "https://psiquantum.com/careers/1",
    jobDescription: "x".repeat(40),
  };

  test("an empty form names all four", () => {
    assert.deepEqual(
      missingApplicationFields({ company: "", role: "", portalUrl: "", jobDescription: "" }),
      ["company", "role", "portalUrl", "jobDescription"],
    );
  });

  test("a full form names none", () => {
    assert.deepEqual(missingApplicationFields(full), []);
  });

  test("each box is named on its own, and only itself", () => {
    // A one-operator mutation that collapses this back to a boolean ("something is missing") fails
    // here: the whole point is that the page can mark the ONE field that is empty.
    for (const [field, blank] of [
      ["company", { company: "   " }],
      ["role", { role: "" }],
      ["portalUrl", { portalUrl: "  " }],
      ["jobDescription", { jobDescription: "too short" }],
    ]) {
      assert.deepEqual(missingApplicationFields({ ...full, ...blank }), [field], field);
    }
  });

  test("whitespace is not an answer", () => {
    assert.deepEqual(missingApplicationFields({ ...full, company: "\n\t " }), ["company"]);
  });

  test("a present but unusable link is a different complaint from an empty one", () => {
    // "Fill in all four boxes first" is nonsense to someone who typed http://, so emptiness and
    // protocol are separate predicates and produce separate messages.
    assert.deepEqual(missingApplicationFields({ ...full, portalUrl: "http://x.com/j" }), []);
    assert.equal(isHttpsJobUrl("http://x.com/j"), false);
    assert.equal(isHttpsJobUrl("psiquantum.com/careers"), false);
    assert.equal(isHttpsJobUrl(""), false);
    assert.equal(isHttpsJobUrl(" https://x.com/j "), true);
  });

  test("canGenerateFrom is exactly those two predicates, so the pre-check cannot drift", () => {
    // "Apply now" generates with nothing typed, and it decides using canGenerateFrom while the
    // button decides using the two predicates. They agreed by duplication before; they agree by
    // composition now. Checked across cases where the two halves disagree with each other.
    for (const draft of [
      full,
      { ...full, company: "" },
      { ...full, portalUrl: "http://x.com/j" },
      { ...full, portalUrl: "" },
      { ...full, jobDescription: "short" },
    ]) {
      assert.equal(
        canGenerateFrom(draft),
        missingApplicationFields(draft).length === 0 && isHttpsJobUrl(draft.portalUrl),
        JSON.stringify(draft.portalUrl + "|" + draft.company),
      );
    }
  });
});

describe("the refusal renders where the button is, and is announced exactly once", () => {
  const source = readFileSync("app/dashboard/applications/page.tsx", "utf8");
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

  const createApplicationStart = code.indexOf("async function createApplication");
  const createApplication = code.slice(
    createApplicationStart,
    code.indexOf('setCreating("tailor")', createApplicationStart),
  );

  test("the button's own refusal never goes to the page-level banner", () => {
    // setError renders <ErrorNote> at the top of the page, which IS the off-screen banner. Scoped to
    // createApplication's guard: the same URL sentence is still a legitimate setError elsewhere on
    // this page, raised by the "Read job" button, and banning the string everywhere would be a
    // vocabulary rule rather than a placement one.
    //
    // ISSUE-043 moved these two through the refuseInComposer helper rather than calling
    // setComposerRefusal inline, because the helper also clears the page banner. The assertion
    // still holds the same thing: these exact sentences reach the composer and not setError.
    assert.ok(createApplication.length > 0, "createApplication must still be findable");
    assert.doesNotMatch(createApplication, /setError\(/, "the generate guard must not use the page banner");
    for (const message of ["Fill in all four boxes first.", "Enter a complete job URL beginning with https://."]) {
      assert.ok(
        createApplication.includes(`reportGenerationFailure("${message}"`),
        `${message} must set the composer refusal`,
      );
    }
    assert.match(createApplication, /else \{\s*refuseInComposer\("action", message, fields\);/);
  });

  test("it is rendered inside the composer's button row", () => {
    // Asserted on ADJACENCY rather than on the alert existing anywhere: the defect was an alert
    // that existed and was 281px above the viewport. The refusal paragraph and the button must sit
    // in the same flex row, which is what makes it visible whenever the button is reachable.
    //
    // ISSUE-043 gave the composer a second slot beside "Read job", so the alert element moved into
    // ComposerRefusalNote and each row mounts it with its own `at`. The adjacency this test exists
    // for is unchanged and still asserted: the note and the button share the flex row, and the note
    // is the thing that carries role="alert" and refusal.message.
    const row = code.match(/<div className="mt-5 flex flex-wrap items-center justify-end gap-3">([\s\S]*?)<\/div>/);
    assert.ok(row, "the generate button must keep its own row");
    assert.match(row[1], /<ComposerRefusalNote refusal=\{visibleRefusal\} at="action" \/>/);
    assert.match(row[1], /Tailor resume/);
    assert.match(row[1], /Fill application/);
    assert.match(
      code,
      /function ComposerRefusalNote\([\s\S]*?if \(!refusal \|\| refusal\.at !== at\) return null;[\s\S]*?role="alert">\{refusal\.message\}<\/p>/,
    );
  });

  test("exactly one element announces it", () => {
    // A mirrored copy left behind in the banner would announce the same refusal twice.
    const alerts = [...code.matchAll(/refusal\.message/g)];
    assert.equal(alerts.length, 1, "the refusal message must be rendered in one place only");
  });

  test("the empty boxes are marked invalid, so the message is attached to what it is about", () => {
    assert.match(code, /aria-invalid=\{invalid\("jobDescription"\) \|\| undefined\}/);
    assert.match(code, /aria-invalid=\{invalid \|\| undefined\}/);
    for (const field of ["company", "role", "portalUrl"]) {
      assert.match(code, new RegExp(`invalid=\\{invalid\\("${field}"\\)\\}`), field);
    }
  });

  test("the fix does not depend on scrolling or animation", () => {
    // behavior: "smooth" does not run in a background tab, and this audit has already produced
    // false findings from that. Placement runs everywhere. Scoped to the composer and its guard,
    // because the rest of this page legitimately animates.
    const panel = code.slice(code.indexOf("function NewApplicationPanel"), code.indexOf("function ApplicationField"));
    assert.ok(panel.length > 0, "the composer panel must still be findable");
    for (const region of [panel, createApplication]) {
      assert.doesNotMatch(region, /scrollIntoView/);
      assert.doesNotMatch(region, /requestAnimationFrame/);
    }
  });

  test("typing clears it, and so does closing the composer", () => {
    assert.match(code, /function applyDraftEdit[\s\S]{0,200}setComposerRefusal\(null\)/);
    assert.match(code, /closeNewApplication = useCallback\(\(\) => \{[\s\S]{0,300}setComposerRefusal\(null\)/);
  });
});
