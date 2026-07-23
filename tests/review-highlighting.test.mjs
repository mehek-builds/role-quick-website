import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { register } from "node:module";

// The dashboard's pure review logic lives in lib/application-review.ts so it can be tested by
// behaviour rather than by grepping the component. Everything below is a regression found in live
// QA on 2026-07-23 against a real Greenhouse posting (Five Rings, Summer Intern 2027).

const lib = await import("../lib/application-review.ts");
const { normalizedTerms, statusLabel, sectionHeading, startsNewSection, HIGHLIGHT_STOPWORDS } = lib;

// ---- R-045: the highlighter matched function words ----

test("function words never become highlight terms", () => {
  // Observed live: the JD pane highlighted "the" five times plus "and", "with", "business".
  const terms = normalizedTerms("The team and you will work with our business system");
  for (const junk of ["the", "and", "you", "will", "work", "with", "our", "business", "system", "team"]) {
    assert.equal(terms.has(junk), false, `"${junk}" must not be highlightable`);
  }
});

test("real skills still survive the filter", () => {
  const terms = normalizedTerms("Proficiency with Python C++ and Linux kubernetes postgres");
  for (const real of ["python", "c++", "linux", "kubernetes", "postgres"]) {
    assert.equal(terms.has(real), true, `"${real}" must stay highlightable`);
  }
});

test("short tokens are still dropped, and punctuation is normalized away", () => {
  const terms = normalizedTerms("Go C R rust, node.js!");
  assert.equal(terms.has("go"), false); // 2 chars
  assert.equal(terms.has("rust"), true);
  assert.equal(terms.has("node.js"), true);
});

test("the array form is filtered identically to the string form", () => {
  // edited_terms arrives from the backend as an array; it must not bypass the stopword filter.
  const terms = normalizedTerms(["Python", "the", "and", "TensorFlow"]);
  assert.deepEqual([...terms].sort(), ["python", "tensorflow"]);
});

test("the stopword list covers the exact tokens seen highlighted in production", () => {
  for (const seen of ["the", "and", "with", "business", "system"]) {
    assert.equal(HIGHLIGHT_STOPWORDS.has(seen), true);
  }
});

// ---- R-051c: the chip said SUBMITTING while the body said nothing was being submitted ----

test("preparation never reports itself as submitting", () => {
  for (const status of ["submit_requested", "preparing", "filling"]) {
    assert.equal(statusLabel(true, status), "Preparing");
    assert.equal(statusLabel(false, status), "Preparing");
  }
});

test("only the genuine post-approval status says Submitting", () => {
  assert.equal(statusLabel(true, "submitting"), "Submitting");
  assert.equal(statusLabel(false, "submitting"), "Submitting");
});

test("terminal and blocked states outrank the submitting screen", () => {
  // The screen lags the server by up to one poll, so a stale "submitting" screen must not mask a
  // status that needs the user: this is the approval boundary's own label.
  assert.equal(statusLabel(true, "needs_attention"), "Needs attention");
  assert.equal(statusLabel(true, "ready_for_final_approval"), "Approval required");
  assert.equal(statusLabel(true, "failed"), "Stopped safely");
  assert.equal(statusLabel(true, "submitted"), "Submitted");
});

test("a fresh packet reads as ready for review", () => {
  assert.equal(statusLabel(false, "resume_ready"), "Ready for review");
});

// ---- R-051a: "EXPERIENCE" printed once per role instead of once per section ----

test("consecutive roles in one section print the heading once", () => {
  const types = ["job", "job", "job", "job"];
  assert.deepEqual(types.map((_, i) => startsNewSection(types, i)), [true, false, false, false]);
});

test("the heading reappears when the section genuinely changes", () => {
  const types = ["job", "job", "project", "project", "leadership"];
  assert.deepEqual(types.map((_, i) => startsNewSection(types, i)), [true, false, true, false, true]);
});

test("an undefined entry type is treated as Experience, not a new section", () => {
  assert.equal(sectionHeading(undefined), "Experience");
  assert.equal(sectionHeading("job"), "Experience");
  assert.equal(sectionHeading("project"), "Projects");
  assert.equal(sectionHeading("leadership"), "Leadership");
  assert.deepEqual(["job", undefined].map((_, i) => startsNewSection(["job", undefined], i)), [true, false]);
});

// ---- Component-level guards for the fixes that are structural, not pure ----

const dashboard = await readFile(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");

test("R-051b: resume fields wrap instead of clipping", () => {
  // A single-line <input> truncated the education headline to "Marshall School of B". EditableLine
  // must stay a growing textarea so long values wrap and stay readable.
  const editableLine = dashboard.slice(dashboard.indexOf("function EditableLine("));
  assert.match(editableLine.slice(0, 900), /<textarea/);
  assert.match(editableLine.slice(0, 900), /scrollHeight/);
});

test("R-049: a tab returning to the foreground refreshes immediately", () => {
  // Backgrounding may slow the poll but must never withhold the terminal state: a run that finished
  // while the user was on another tab used to leave the page frozen on "Preparing".
  assert.match(dashboard, /addEventListener\("visibilitychange"/);
  assert.match(dashboard, /removeEventListener\("visibilitychange"/);
});

test("R-049: a run in progress shows elapsed time", () => {
  assert.match(dashboard, /elapsed/);
  assert.match(dashboard, /PORTAL_SLOW_AFTER_S/);
});

test("R-051d: the packet switcher is not nested inside the review screen", () => {
  // It must render above the screen branch, so a portal run cannot unmount every other application.
  const switcherAt = dashboard.indexOf("packet.job_context.role} · {packet.job_context.company}");
  const screenBranchAt = dashboard.indexOf("screen === \"questions\" ?");
  assert.ok(switcherAt > 0 && screenBranchAt > 0);
  assert.ok(switcherAt < screenBranchAt, "the switcher must be rendered before the screen branch");
});

test("R-046: the legend names both marks, not just one", () => {
  assert.match(dashboard, /language your resume already matches/);
  assert.match(dashboard, /wording tailoring changed for this posting/);
  assert.doesNotMatch(dashboard, /Blue highlights job language/);
});

test("R-046: the two highlight tones are visually distinct", () => {
  // Both were brand-blue and differed only by a border, despite meaning opposite things.
  const highlight = dashboard.slice(dashboard.indexOf("const HighlightedText"));
  assert.match(highlight.slice(0, 1200), /tone === "edited" \? "[^"]*positive/);
});

test("the submitting screen no longer claims nothing is submitted while submitting", () => {
  const progress = dashboard.slice(dashboard.indexOf("function PortalProgress("));
  assert.match(progress.slice(0, 1600), /You approved this submission/);
});
