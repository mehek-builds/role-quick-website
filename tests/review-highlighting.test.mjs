import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { register } from "node:module";

// The dashboard's pure review logic lives in lib/application-review.ts so it can be tested by
// behaviour rather than by grepping the component. Everything below is a regression found in live
// QA on 2026-07-23 against a real Greenhouse posting (Five Rings, Summer Intern 2027).

const lib = await import("../lib/application-review.ts");
const { normalizedTerms, explicitTerms, statusLabel, sectionHeading, startsNewSection, isLivePacketStatus, HIGHLIGHT_STOPWORDS } = lib;

// ---- R-045: the highlighter matched function words ----

test("function words never become highlight terms", () => {
  // Observed live: the JD pane highlighted "the" five times plus "and" and "with". Note this list
  // is function words ONLY: "business", "system" and "team" were deliberately removed from the
  // stopword set on review, because suppressing a domain noun the resume genuinely matches is a
  // worse error than a stray highlight. See the domain-noun test below.
  const terms = normalizedTerms("The team and you will work with our required qualifications");
  for (const junk of ["the", "and", "you", "will", "with", "our", "required", "qualifications"]) {
    assert.equal(terms.has(junk), false, `"${junk}" must not be highlightable`);
  }
});

test("real skills still survive the filter", () => {
  const terms = normalizedTerms("Proficiency with Python C++ and Linux kubernetes postgres");
  for (const real of ["python", "c++", "linux", "kubernetes", "postgres"]) {
    assert.equal(terms.has(real), true, `"${real}" must stay highlightable`);
  }
});

test("punctuation is normalized away, and short tokens survive only when high-signal", () => {
  const terms = normalizedTerms("Go C R rust, node.js! at by");
  assert.equal(terms.has("go"), true); // short, but a language
  assert.equal(terms.has("rust"), true);
  assert.equal(terms.has("node.js"), true);
  assert.equal(terms.has("at"), false); // short AND a function word
  assert.equal(terms.has("by"), false);
});

test("the array form is filtered identically to the string form", () => {
  // edited_terms arrives from the backend as an array; it must not bypass the stopword filter.
  const terms = normalizedTerms(["Python", "the", "and", "TensorFlow"]);
  assert.deepEqual([...terms].sort(), ["python", "tensorflow"]);
});

test("the stopword list covers the function words seen highlighted in production", () => {
  for (const seen of ["the", "and", "with"]) {
    assert.equal(HIGHLIGHT_STOPWORDS.has(seen), true);
  }
  // and deliberately does NOT cover the domain nouns an earlier draft included
  for (const kept of ["business", "system", "product", "development", "time"]) {
    assert.equal(HIGHLIGHT_STOPWORDS.has(kept), false, `"${kept}" is a skill term`);
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
  assert.match(editableLine.slice(0, 2600), /<textarea/);
  assert.match(editableLine.slice(0, 2600), /scrollHeight/);
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
  assert.match(progress.slice(0, 3200), /completing the authorized submission/);
});

// ---- Fixes from adversarial review of the first cut of this branch, 2026-07-23 ----

test('an in-flight poll cannot install another packet under the current one', () => {
  // The worst finding of the review: a poll for packet A landing after the user switched to packet
  // B would render A's portal preview, filled fields and blockers while the Submit button approved
  // B, i.e. an application sent to the wrong employer. The guard compares a ref, not the closure.
  assert.match(dashboard, /selectedIdRef/);
  assert.match(dashboard, /if \(selectedIdRef\.current !== requestedId\) return;/);
  assert.match(dashboard, /selectedIdRef\.current = packet\.id;/);
});

test('resume fields cannot contain a newline', () => {
  // These were structurally single-line under <input>. The value flows into the resume spec, the
  // rendered PDF and the portal autofill payload, where a newline in an org or date field is a
  // broken line at best and a mis-parsed ATS field at worst.
  const editableLine = dashboard.slice(dashboard.indexOf("function EditableLine("));
  assert.match(editableLine.slice(0, 2600), /event\.key === "Enter"/);
  assert.match(editableLine.slice(0, 2600), /replace\(\/\\s\*\[\\r\\n\]\+\\s\*\/g, " "\)/);
});

test('the auto-grow height is re-measured on reflow, not only on value change', () => {
  // overflow-hidden plus a JS-set pixel height means a stale height CLIPS with no scrollbar and no
  // ellipsis, which is worse than the truncation this replaced.
  const editableLine = dashboard.slice(dashboard.indexOf("function EditableLine("));
  assert.match(editableLine.slice(0, 2600), /ResizeObserver/);
  assert.match(editableLine.slice(0, 2600), /document\.fonts/);
  assert.match(editableLine.slice(0, 2600), /useLayoutEffect/);
});

test('IME composition is not rewritten mid-keystroke', () => {
  const editableLine = dashboard.slice(dashboard.indexOf("function EditableLine("));
  assert.match(editableLine.slice(0, 2600), /onCompositionStart/);
  assert.match(editableLine.slice(0, 2600), /onCompositionEnd/);
});

test('degree and graduation date are separate fields, not a separator-joined string', () => {
  assert.doesNotMatch(dashboard, /value\.split\(" · "\)/);
});

test('a blocked or failed run is not painted in the ready treatment', () => {
  assert.match(dashboard, /function chipKind/);
  assert.match(dashboard, /kind=\{chipKind\(review\.status\)\}/);
});

test('the elapsed clock is anchored to the server, not to component mount', () => {
  // A reload during a live run remounted the component; a mount-anchored clock restarted at 0s and
  // reported "3s elapsed" for a four-minute-old run, defeating the point of showing it.
  assert.match(dashboard, /startedAt=\{submission\?\.review\.updated_at\}/);
  assert.match(dashboard, /Date\.parse\(startedAt\)/);
});

test('the ticking second count is not announced to screen readers', () => {
  // As an aria-live region it announced every single second for the minutes a run takes.
  const progress = dashboard.slice(dashboard.indexOf("function PortalProgress("));
  // The number itself is aria-hidden; the live region sits on the milestone copy, which changes
  // twice in a run rather than every second.
  assert.match(progress.slice(0, 4000), /className="text-center text-xs text-muted" aria-hidden/);
  assert.match(progress.slice(0, 4000), /\{milestone && \(/);
});

test('a run that has gone on too long says so instead of claiming it is fine', () => {
  assert.match(dashboard, /PORTAL_STUCK_AFTER_S/);
  assert.match(dashboard, /longer than a portal run usually takes/);
});

test('a successful poll clears a stale error banner', () => {
  const refresh = dashboard.slice(dashboard.indexOf("const refreshSubmission"));
  assert.match(refresh.slice(0, 1800), /setError\(null\);/);
});
