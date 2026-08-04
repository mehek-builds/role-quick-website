import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { register } from "node:module";

// The dashboard's pure review logic lives in the applications domain so it can be tested by
// behaviour rather than by grepping the component. Everything below is a regression found in live
// QA on 2026-07-23 against a real Greenhouse posting (Five Rings, Summer Intern 2027).

const lib = await import("../features/applications/domain/application-review.ts");
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

// The label vocabulary collapsed from six words to four (Getting ready / Ready / Needs you /
// Sent) in the 2026-07-26 UX pass. The invariants below are unchanged; only the words moved.

test("work in progress never reports itself as sent", () => {
  for (const status of ["submit_requested", "preparing", "filling"]) {
    assert.equal(statusLabel(true, status), "Getting ready");
    assert.equal(statusLabel(false, status), "Getting ready");
  }
});

test("an in-flight submission is still only getting ready, never Sent", () => {
  // R-051c: the chip said SUBMITTING while the body said nothing was being submitted. "Sent" is
  // now reserved for a real, confirmed receipt, so the mid-flight states cannot claim it.
  assert.equal(statusLabel(true, "submitting"), "Getting ready");
  assert.equal(statusLabel(false, "submitting"), "Getting ready");
  assert.equal(statusLabel(false, "submission_claimed"), "Getting ready");
});

test("terminal and blocked states outrank the submitting screen", () => {
  // The screen lags the server by up to one poll, so a stale "submitting" screen must not mask a
  // status that needs the user: this is the approval boundary's own label.
  assert.equal(statusLabel(true, "needs_attention"), "Needs you");
  assert.equal(statusLabel(true, "ready_for_final_approval"), "Needs you");
  assert.equal(statusLabel(true, "failed"), "Needs you");
  assert.equal(statusLabel(true, "submitted"), "Sent");
});

test("a fresh packet reads as ready", () => {
  assert.equal(statusLabel(false, "resume_ready"), "Ready");
});

test("the whole vocabulary is four words", () => {
  const every = [
    "resume_ready", "questions_ready", "ready_to_submit", "submit_requested", "preparing",
    "filling", "submitting", "submission_claimed", "needs_attention", "ready_for_final_approval",
    "failed", "submitted",
  ];
  const words = new Set(every.flatMap((s) => [statusLabel(false, s), statusLabel(true, s)]));
  assert.deepEqual([...words].sort(), ["Getting ready", "Needs you", "Ready", "Sent"]);
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
// The three highlight tones moved out of the page and into their own component in cb650c3.
const requirementText = await readFile(new URL("../components/app/RequirementText.tsx", import.meta.url), "utf8");

/** Source with comments removed, for assertions about what the screen SAYS rather than what the
 *  file contains. A `doesNotMatch` against raw source cannot tell rendered copy from a comment
 *  explaining why that copy was deleted, and this repo comments its deletions heavily. */
/** The EditableLine function body, whole. This used to be `.slice(0, 2600)` from the function
 *  keyword, a byte count that quietly stopped covering the function the moment anyone added a
 *  comment to it: four assertions here went green-to-red on a change that touched none of what they
 *  assert. Slicing to the next declaration cannot drift that way. */
function editableLineSource() {
  const start = dashboard.indexOf("function EditableLine(");
  const end = dashboard.indexOf("function EditableHighlight(", start);
  return dashboard.slice(start, end === -1 ? undefined : end);
}

function shippedCopy(source) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "") // JSX comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/^\s*\/\/.*$/gm, ""); // line comments
}

test("R-051b: resume fields wrap instead of clipping", () => {
  // A single-line <input> truncated the education headline to "Marshall School of B". EditableLine
  // must stay a growing textarea so long values wrap and stay readable.
  //
  // Read through shippedCopy, not raw source. The word "scrollHeight" appears three times inside
  // this function and only one of them is the measurement: the other two are prose explaining what
  // scrollHeight reports when the box is taller than its text. A raw grep therefore stayed green
  // with the measurement deleted, which is the same comments-versus-code hole shippedCopy was
  // written for a few tests down. An assertion that a comment can satisfy is not an assertion.
  const editableLine = shippedCopy(editableLineSource());
  assert.match(editableLine, /<textarea/);
  assert.match(editableLine, /node\.scrollHeight/);
});

test("R-049: a tab returning to the foreground refreshes immediately", () => {
  // Backgrounding may slow the poll but must never withhold the terminal state: a run that finished
  // while the user was on another tab used to leave the page frozen on "Preparing".
  assert.match(dashboard, /addEventListener\("visibilitychange"/);
  assert.match(dashboard, /removeEventListener\("visibilitychange"/);
});

test("R-049: a run in progress shows elapsed time", () => {
  // Read through shippedCopy, the same reason as R-051b above and measured the same way: renaming
  // every CODE occurrence of "elapsed" in the page left this file at 30 pass, 0 fail, because the
  // word also appears in the prose around the timer. The assertion was satisfied by the comment
  // explaining the feature rather than by the feature. PORTAL_SLOW_AFTER_S was clean on the same
  // measurement and is routed through shippedCopy anyway, because the rule is that an assertion
  // reads shipped code, not that it reads shipped code once someone has proved it had to.
  const shipped = shippedCopy(dashboard);
  assert.match(shipped, /elapsed/);
  assert.match(shipped, /PORTAL_SLOW_AFTER_S/);
});

test("R-051d: the packet switcher is not nested inside the review screen", () => {
  // It must render above the screen branch, so a portal run cannot unmount every other application.
  const switcherAt = dashboard.indexOf("packet.job_context.role} · {packet.job_context.company}");
  const screenBranchAt = dashboard.indexOf("screen === \"questions\" ?");
  assert.ok(switcherAt > 0 && screenBranchAt > 0);
  assert.ok(switcherAt < screenBranchAt, "the switcher must be rendered before the screen branch");
});

test("R-046: every mark is named, in exactly one legend", () => {
  // The invariant is that EVERY mark is named. It has not changed. What changed on 2026-07-28 is
  // where the naming lives and how many copies of it there are.
  //
  // The screen carried two legends for one colour code: MatchLegend above the panes, and a
  // Blue/Green pair below them in the action bar. Identical Tailwind classes, different words for
  // the same two colours ("words you already had" vs "asked for, and on your resume"). Two names
  // for one colour is worse than no name, so the Blue/Green copy was deleted and MatchLegend kept,
  // because it names all three tones rather than two and says what the colour MEANS.
  //
  // So this test now asserts against the file that owns the legend, plus the thing the old version
  // could not: that the second legend has not grown back on the dashboard page.
  assert.match(requirementText, /asked for, and on your resume/);
  assert.match(requirementText, /asked for, not on your resume/);
  assert.match(requirementText, /wording Litos changed for this job/);

  // The "is it gone?" half has to read SHIPPED COPY, not raw source. A comment explaining why the
  // second legend was deleted necessarily quotes the phrase it deleted, and a bare grep counts
  // that as the legend still being there. This failed exactly that way when the comment was
  // written, which is the argument for stripping rather than for a vaguer regex.
  assert.doesNotMatch(shippedCopy(dashboard), /words you already had/);
  assert.doesNotMatch(shippedCopy(dashboard), /words we added for this job/);
  assert.doesNotMatch(shippedCopy(dashboard), /Blue highlights job language/);
  assert.doesNotMatch(shippedCopy(requirementText), /wording tailoring changed for this posting/);
});

test("R-046: the highlight tones are visually distinct", () => {
  // Both were brand-blue and differed only by a border, despite meaning opposite things.
  //
  // This test used to grep the dashboard page for `const HighlightedText`. That component was
  // deleted in cb650c3, which split the marks into three tones and moved them into
  // components/app/RequirementText.tsx. indexOf returned -1, slice(-1) took the last character,
  // and the test failed against a one-character string for three weeks. It asserts the same
  // invariant against the file that now owns the tones.
  //
  // Distinct means distinct COLOUR FAMILY, not merely a distinct string: the earlier bug was two
  // marks that both read as brand-blue and differed only by a border.
  assert.match(requirementText, /covered:\s*"[^"]*\bbg-brand-soft\b/);
  assert.match(requirementText, /missing:\s*"[^"]*\bbg-warn-soft\b/);
  assert.match(requirementText, /edited:\s*"[^"]*\bbg-positive-soft\b/);

  const families = ["brand", "warn", "positive"];
  const tones = ["covered", "missing", "edited"].map((tone) => {
    const line = requirementText.match(new RegExp(`\\n\\s*${tone}:\\s*"([^"]*)"`))?.[1] ?? "";
    return families.filter((family) => line.includes(`-${family}`));
  });
  assert.deepEqual(
    tones,
    [["brand"], ["warn"], ["positive"]],
    "each tone must use exactly one colour family, and no two may share it",
  );

  // Colour is never the only carrier: every mark states its meaning to a screen reader.
  assert.match(requirementText, /aria-label=\{`\$\{children\}, \$\{TONE_LABEL\[tone\]\}`\}/);
});

/**
 * PortalProgress's own source, from its declaration to the next top-level function.
 *
 * The point of a bounded span is that a match cannot wander into some other component; a character
 * count achieves that only by accident, and two of these assertions broke on a comment being added
 * rather than on the thing they guard changing.
 */
function portalProgressSource() {
  const start = dashboard.indexOf("function PortalProgress(");
  assert.ok(start >= 0, "PortalProgress has been renamed or removed");
  const end = dashboard.indexOf("\nfunction ", start + 1);
  assert.ok(end > start, "could not find the end of PortalProgress");
  return dashboard.slice(start, end);
}

test("the submitting screen names the dashboard authorization", () => {
  // Bounded to PortalProgress itself rather than to a character count. The span was 3200, which was
  // simply "long enough today", and a comment added inside the function on 2026-08-04 pushed this
  // sentence to offset 3233 and turned a passing invariant red without anything about the invariant
  // changing. Ending at the next function declaration says what was meant: this sentence lives in
  // THIS component.
  const progress = portalProgressSource();
  assert.match(progress, /You told Litos to send this/);
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
  const editableLine = editableLineSource();
  assert.match(editableLine, /event\.key === "Enter"/);
  assert.match(editableLine, /replace\(\/\\s\*\[\\r\\n\]\+\\s\*\/g, " "\)/);
});

test('the auto-grow height is re-measured on reflow, not only on value change', () => {
  // overflow-hidden plus a JS-set pixel height means a stale height CLIPS with no scrollbar and no
  // ellipsis, which is worse than the truncation this replaced.
  //
  // shippedCopy for the same reason as R-051b above: "ResizeObserver" and "useLayoutEffect" are
  // both named in the prose that explains why they are there, so a raw grep passed on the strength
  // of the comment alone and would have stayed green through the deletion of either hook.
  const editableLine = shippedCopy(editableLineSource());
  assert.match(editableLine, /new ResizeObserver\(/);
  assert.match(editableLine, /document\.fonts/);
  assert.match(editableLine, /useLayoutEffect\(/);

  // observe(node) is the one that does the work, and it is what these measurements are of.
  // Measured 2026-08-03 in a browser with rendering actually running: forcing the parent from
  // 446px to 120px re-measured the school headline from 28px to 168px and back to 28px, and a
  // 375-to-1280 viewport change landed on 28px, equal to a fresh load at 1280.
  //
  // The parent observation is DEFENSIVE REDUNDANCY, and is pinned as such rather than because it
  // is load-bearing. It is not: the field is w-full, so any width change reaching it through the
  // parent also changes the field's own box, and observe(node) sees it. Removing the parent
  // observation was measured to change nothing. It is kept, and pinned, because that argument
  // rests entirely on w-full, and the day someone gives this field an intrinsic or fixed width
  // the parent becomes the only place the change is visible. Cheap insurance against a class of
  // silent clipping, not a mechanism.
  assert.match(editableLine, /observer\.observe\(node\)/);
  assert.match(editableLine, /observer\.observe\(node\.parentElement\)/);
});

test('IME composition is not rewritten mid-keystroke', () => {
  const editableLine = editableLineSource();
  assert.match(editableLine, /onCompositionStart/);
  assert.match(editableLine, /onCompositionEnd/);
});

test('degree and graduation date are separate fields, not a separator-joined string', () => {
  assert.doesNotMatch(dashboard, /value\.split\(" · "\)/);
});

test('a blocked or failed run is not painted in the ready treatment', () => {
  // The selected packet's status used to print a third time in the page header, beside the
  // create button; that copy is gone. The invariant lives on the row, which is where status is
  // painted now: needs_attention and failed must not fall through to the "ready" chip.
  assert.match(dashboard, /function chipKind/);
  assert.match(dashboard, /kind=\{chipKind\(packet\.spec\._review\.status\)\}/);
  const chipKind = dashboard.slice(dashboard.indexOf("function chipKind"));
  assert.match(chipKind.slice(0, 400), /status === "needs_attention" \|\| status === "failed"\) return "bounced"/);
});

test('the elapsed clock is anchored to the server, not to component mount', () => {
  // A reload during a live run remounted the component; a mount-anchored clock restarted at 0s and
  // reported "3s elapsed" for a four-minute-old run, defeating the point of showing it.
  //
  // Two anchors now, and which one is correct depends on what the screen is doing. While PREPARING,
  // `review.updated_at` is the server's own stamp for that run. While SENDING it is not: it was
  // stamped when preparation finished, so a student who read the packet for six minutes before
  // pressing "Send it" opened the sending screen already reading "6m 00s elapsed", past the
  // five-minute threshold that tells them to start the application again. The send is anchored to
  // when the send began, and falls back to the server stamp if that is somehow absent.
  assert.match(dashboard, /startedAt=\{submittingPhase === "sending" \? approveStartedAt \?\? submission\?\.review\.updated_at : submission\?\.review\.updated_at\}/);
  assert.match(dashboard, /setApproveStartedAt\(new Date\(\)\.toISOString\(\)\)/);
  assert.match(dashboard, /Date\.parse\(startedAt\)/);
});

test('the ticking second count is not announced to screen readers', () => {
  // As an aria-live region it announced every single second for the minutes a run takes.
  const progress = portalProgressSource();
  // The number itself is aria-hidden; the live region sits on the milestone copy, which changes
  // twice in a run rather than every second.
  assert.match(progress, /className="text-center text-xs text-muted" aria-hidden/);
  assert.match(progress, /\{milestone && \(/);
});

test('a run that has gone on too long says so instead of claiming it is fine', () => {
  assert.match(dashboard, /PORTAL_STUCK_AFTER_S/);
  assert.match(dashboard, /This is taking longer than usual/);
});

test('a successful poll clears a stale error banner', () => {
  // Bounded to refreshSubmission itself. The span was 1800 characters, which is "long enough
  // today": adding the in-flight guard and its comment pushed setError past it and turned a
  // passing invariant red without the invariant changing.
  const start = dashboard.indexOf("const refreshSubmission");
  const end = dashboard.indexOf("\n  useEffect(", start);
  assert.ok(end > start, "could not find the end of refreshSubmission");
  assert.match(dashboard.slice(start, end), /setError\(null\);/);
});
