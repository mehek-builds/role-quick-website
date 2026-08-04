/**
 * Three defects found by clicking the /start flow on 2026-08-04, one per screen state that had
 * never been exercised: a build that never started, a retry that destroyed the document it was
 * offered to save, and a radio that could not be un-clicked.
 *
 * WHAT THESE ASSERTIONS ARE AND ARE NOT
 * ====================================
 * They are static analysis of source text, like most of this suite, so they pin the SHAPE of the
 * fixes rather than their behaviour. That is worth saying plainly, because the first defect below
 * is a race between two fetches and no source assertion can see a race. The behavioural cover for
 * it is tests/e2e/start-base-build.spec.mjs, which forces the losing ordering in a real browser and
 * goes red on the unfixed tree; these assertions catch a literal reversion of the shape that fixed
 * it, which is a narrower and cheaper thing.
 *
 * Where a rule could be made pure it was moved out rather than grepped: the two answer-handling
 * rules of the impact step now live in lib/recent-experience.ts and are tested by CALLING them, a
 * few tests down. That is the preferred shape; the source assertions are what is left when a rule
 * is genuinely structural.
 *
 * Every assertion reads SHIPPED COPY, with comments stripped. This repo comments its deletions
 * heavily and has produced seven false load-bearing comments, so an assertion a comment can satisfy
 * is not an assertion. `shippedCopy` is the same tool tests/review-highlighting.test.mjs uses, for
 * the same reason.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { answersForPick, answersToSend, blankAnswers, isBlank } = await import("../lib/recent-experience.ts");

const baseStep = readFileSync(new URL("../components/start/BaseResumeStep.tsx", import.meta.url), "utf8");
const impactStep = readFileSync(new URL("../components/start/RecentExperienceStep.tsx", import.meta.url), "utf8");

/** Source with every comment removed, so nothing here can be satisfied by prose about the code. */
function shippedCopy(source) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "") // JSX comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/^\s*\/\/.*$/gm, ""); // line comments
}

const base = shippedCopy(baseStep);
const impact = shippedCopy(impactStep);

/** The text from `from` up to and including the first `to` after it. Throws rather than slicing to
 *  -1, which is how an earlier test in this repo spent three weeks asserting against one character. */
function region(source, from, to, label) {
  const start = source.indexOf(from);
  assert.ok(start >= 0, `could not find the start of ${label}: ${from}`);
  const end = source.indexOf(to, start);
  assert.ok(end > start, `could not find the end of ${label}: ${to}`);
  return source.slice(start, end + to.length);
}

/** A whole useCallback or useEffect, from `from` to the dependency array that closes it.
 *
 *  Ending on the dependency array rather than on the first `});` is not fussiness: `setSpec({});`
 *  and `setMetricAnswers({});` both contain that sequence, so a naive end marker cut run() off
 *  three lines into its own body and the assertions below passed against the wrong text. */
function hook(source, from, label) {
  const start = source.indexOf(from);
  assert.ok(start >= 0, `could not find ${label}: ${from}`);
  const rest = source.slice(start);
  const close = rest.match(/\n\s*\}, \[[^\]]*\]\);/);
  assert.ok(close, `${label} does not end in a hook dependency array`);
  return rest.slice(0, close.index + close[0].length);
}

/** The identifiers inside the dependency array that closes the hook `hook` ends with. */
function dependencies(hookText, label) {
  const match = hookText.match(/\}, \[([^\]]*)\]\);\s*$/);
  assert.ok(match, `${label} does not end in a hook dependency array`);
  return match[1].split(",").map((name) => name.trim()).filter(Boolean);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * DEFECT 1: the base resume step never started its build.
 *
 * app/start/page.tsx renders the base case with `parsed={profile}`, null until GET /profile lands.
 * `onFrame` closes over `parsed`, so it was rebuilt when the profile arrived, so `run` was, so the
 * mount effect's dependencies changed while it was awaiting GET /resume/base. React ran the
 * CLEANUP, which cancels that read, and the re-run returned at the `started.current` guard. No POST
 * to /resume/base/stream, no error, no way forward but "Finish later". It bites only when nothing
 * is stored, which is every new student's first arrival at this step.
 * ───────────────────────────────────────────────────────────────────────────── */

/** The effect that starts the build: from its one-shot guard to the dependency array. */
function mountEffect() {
  return hook(base, "if (started.current) return;", "the build's mount effect");
}

/** The useCallback that runs a build, from its declaration to its dependency array. */
function runCallback() {
  return hook(base, "const run = useCallback(", "run()");
}

test("the build's start cannot be restarted, so nothing it depends on may change after mount", () => {
  // The guard already declares "run once". The bug was that the dependency list contradicted the
  // declaration: a dependency that changes mid-flight does not re-enter the body, it runs the
  // cleanup, and the cleanup is what dropped the build.
  const deps = dependencies(mountEffect(), "the build's mount effect");
  for (const unstable of ["onFrame", "parsed", "profile", "note"]) {
    assert.equal(
      deps.includes(unstable),
      false,
      `"${unstable}" is rebuilt when /profile lands and must not gate the build's one and only start`,
    );
  }
  assert.ok(deps.length > 0, "an empty list would be a lie about what the effect reads");
});

test("run() is stable too, because the mount effect depends on it", () => {
  const deps = dependencies(runCallback(), "run()");
  assert.equal(deps.includes("onFrame"), false, "run() must not be rebuilt when the profile arrives");
});

test("frames are handled by the CURRENT onFrame, not the one captured at mount", () => {
  // Freezing the mount-time closure would fix the race and break the screen a different way: the
  // education frame reads `parsed` for school, degree and grad date, and at mount that is null.
  assert.match(base, /const onFrameRef = useRef\(onFrame\);/);
  assert.match(base, /onFrameRef\.current = onFrame;/);
  assert.match(base, /const emit = useCallback\(\(frame: BuildFrame\) => onFrameRef\.current\(frame\), \[\]\);/);
});

test("every path into the build passes the stable sink, never onFrame directly", () => {
  // One missed call site is the whole defect back: it would put `onFrame` in a dependency array
  // again, or freeze a null-`parsed` closure, depending on which site was missed.
  // `function replayDemo(onFrame` is the fixture's own DECLARATION, not a call, and an earlier
  // draft of this test counted it and reported a false failure. Calls only.
  const callSites = [...base.matchAll(/(?<!function )(?:buildBaseResume|replayDemo)\(\s*([A-Za-z_$][\w$]*)/g)]
    .map((m) => m[1]);
  assert.ok(callSites.length >= 3, `expected every build entry point to be found, saw ${callSites.length}`);
  assert.deepEqual([...new Set(callSites)], ["emit"]);
});

test("the one-shot guard is RELEASED by the cleanup, not merely set once", () => {
  /* HONEST SCOPE. This is the one assertion here with no behavioural twin: the spec runs a
     production build on purpose, and in production the cleanup only runs on unmount, so deleting
     this line leaves all eight browser cases green. It was verified by hand instead, against
     `next dev` on 2026-08-04: without the release, 0 POST /resume/base/stream and a screen stuck on
     "Making..." on both fetch orderings; with it, 2 GET /resume/base and exactly 1 POST per load,
     and 0 POSTs when a resume was already stored. The line is cheap and the failure it prevents is
     silent, so it is pinned as source shape rather than left with no cover at all. */
  const cleanup = mountEffect().match(/return \(\) => \{([\s\S]*?)\};/);
  assert.ok(cleanup, "the mount effect must still return a cleanup");
  assert.match(cleanup[1], /cancelled = true;/);
  assert.match(cleanup[1], /started\.current = false;/);
});

/* ─────────────────────────────────────────────────────────────────────────────
 * DEFECT 2: "Try again" under a save error silently discarded every edit.
 *
 * The label sat under "Could not save the resume (500)" and read as "retry the save". The action
 * was `run`, a full rebuild: manual bullet edits gone, metric values stripped back out of the
 * bullets, the metrics ask reopened blank. Unrecoverable through the UI, because the next
 * "Looks right" PUTs the rebuilt spec over the server's copy.
 * ───────────────────────────────────────────────────────────────────────────── */

/** The detail panel's error block, which is where the mislabelled control lived. */
function detailRecovery() {
  const detailAt = base.indexOf('{phase === "detail" && (');
  assert.ok(detailAt > 0, "could not find the detail panel");
  return region(base.slice(detailAt), "{error && (", "</div>", "the detail panel's error recovery");
}

test("a rebuild is destructive, which is the whole reason it cannot answer a failed save", () => {
  // The premise of the defect, pinned so the rest of this section keeps its meaning. If a rebuild
  // ever stopped discarding the student's work, this test is the one that should be revisited.
  const run = runCallback();
  for (const discarded of ["setSpec({})", "setMetricAnswers({})", "setMetricsDone(false)", "setMetricGaps([])"]) {
    assert.ok(run.includes(discarded), `run() must still be understood to discard state: ${discarded}`);
  }
});

test("the recovery under a save error retries the SAVE, and never rebuilds", () => {
  const recovery = detailRecovery();
  assert.match(recovery, /failure === "edits"/);
  assert.match(recovery, /failure === "finish"/);
  assert.match(recovery, /saveEdits\(\)/);
  assert.match(recovery, /finish\(\)/);
  // The two save failures must map to their OWN operation. Retrying a failed edit-save with
  // finish() would save and then advance the step, and leaving edit mode is not the student
  // asserting the document is final.
  assert.match(recovery, /failure === "edits"\s*\?\s*\(\)\s*=>\s*void saveEdits\(\)/);
  assert.match(recovery, /failure === "finish"\s*\?\s*\(\)\s*=>\s*void finish\(\)/);
});

test("the recovery says what it will do", () => {
  const recovery = detailRecovery();
  assert.match(recovery, /"Try saving again"/);
  // "Try again" survives, but only as the fallback for a build failure.
  assert.match(recovery, /:\s*"Try again"/);
});

test("every failure records which operation it was", () => {
  // Without this the button cannot tell a build failure from a save failure, which is the defect.
  assert.match(base, /setFailure\("build"\)/);
  assert.match(base, /setFailure\("edits"\)/);
  assert.match(base, /setFailure\("finish"\)/);
  // And every start of an operation clears the last one, so a stale kind cannot mislabel the button.
  assert.ok(base.includes("setFailure(null)"), "a new attempt must clear the previous failure kind");

  const saveEdits = hook(base, "const saveEdits = useCallback(", "saveEdits()");
  assert.match(saveEdits, /setFailure\("edits"\)/);
  assert.equal(saveEdits.includes("onDone()"), false, "retrying a failed edit save must not advance the step");

  const finish = hook(base, "const finish = useCallback(", "finish()");
  assert.match(finish, /setFailure\("finish"\)/);
});

test("a successful retry takes the error banner down with it", () => {
  /* The banner is the only thing on the screen saying the resume is not saved. A retry that
     succeeded while leaving "Could not save the resume (500)" up tells the student their work is
     still lost, which is the same lie as the mislabelled button, just quieter. */
  const saveEdits = hook(base, "const saveEdits = useCallback(", "saveEdits()");
  assert.match(saveEdits, /setError\(null\);/);
  const finish = hook(base, "const finish = useCallback(", "finish()");
  assert.match(finish, /setError\(null\);/);
});

test("the recovery cannot be pressed while its own operation is in flight", () => {
  // Two presses on a slow save are two PUTs of the same spec racing each other.
  assert.match(detailRecovery(), /disabled=\{saving\}/);
});

/* ─────────────────────────────────────────────────────────────────────────────
 * DEFECT 3: a mis-click on the impact candidate radio was unrecoverable.
 *
 * Selecting a radio PUT immediately, the server answered `needs_input`, and the fieldset rendered
 * only on `choose_entry` - so the click that chose an experience was the click that deleted the
 * control for choosing one. No Continue, no confirm, no back, and a reload did not bring it back.
 * Separately, "Continue with what you found." sent `answers: []` over whatever the student had
 * already typed.
 * ───────────────────────────────────────────────────────────────────────────── */

test("choosing an experience does not remove the way to choose again", () => {
  assert.match(impact, /\{\(review\.status === "choose_entry" \|\| choosing\) && \(/);
  const choose = region(impact, "async function chooseCandidate(", "\n  }", "chooseCandidate()");
  assert.match(choose, /setChoosing\(true\)/);
});

test("the server's reading of the newly chosen entry is what the screen then uses", () => {
  /* chooseCandidate exists to REPLACE the review, because which answer fieldsets to draw comes from
     the server's assessment of the entry just picked. Dropping the response leaves the screen
     showing the previous entry's questions with a new entry selected, and every source assertion
     above stays green while it does. */
  const choose = region(impact, "async function chooseCandidate(", "\n  }", "chooseCandidate()");
  assert.match(choose, /setReview\(await putRecentExperienceReview\(/);
});

test("a single radio click cannot advance past the step", () => {
  // It used to: a `saved.completed` response called onDone() straight from the radio's onChange, so
  // a mis-click skipped the screen with no control left on it to go back with.
  const choose = region(impact, "async function chooseCandidate(", "\n  }", "chooseCandidate()");
  assert.equal(choose.includes("onDone()"), false, "advancing the flow must take a deliberate press");
});

test("a student who picked in an earlier session can still change it", () => {
  // `choosing` is component state, so a reload lands with the group closed and the stored status no
  // longer choose_entry. Without a control that reopens it there is no way back at all.
  assert.match(impact, /onClick=\{\(\) => setChoosing\(true\)\}/);
  assert.match(impact, /!choosing && review\.status !== "choose_entry" && review\.candidates\.length > 1/);
  assert.match(impact, /Choose a different experience/);
});

test("continuing with what was found keeps the answers the student typed", () => {
  const save = region(impact, "async function save(", "\n  }", "save()");
  assert.match(save, /answers: answersToSend\(answers, answerCount\)/);
  assert.equal(
    /continueWithFound \? \[\]/.test(save),
    false,
    "the flag says stop asking, not throw away what is already typed",
  );
  // The flag itself still has to travel, or the two buttons become the same button.
  assert.match(save, /continue_with_found: continueWithFound/);
});

/* ── The two answer rules, called rather than grepped ─────────────────────────
 * Both are about a claim ending up attached to work it does not describe, which is the failure
 * BaseResumeStep's applyMetrics spends three paragraphs preventing on the resume side.
 * ───────────────────────────────────────────────────────────────────────────── */

test("switching to a different entry drops answers typed about the previous one", () => {
  // Reproduced in a browser before this existed: type about employer A, switch the radio to B,
  // save, and the PUT carried A's answer attached to B.
  const typed = [{ metric_or_scope: "ALPHA-ONLY-ANSWER" }, {}, {}];
  assert.deepEqual(answersForPick("entry-a", "entry-b", typed), blankAnswers());
});

test("re-picking the entry already selected keeps the work typed about it", () => {
  // A second click on the same radio, or reopening the chooser to look and choosing the same thing,
  // must not be a way to lose four fields of typing.
  const typed = [{ metric_or_scope: "ALPHA-ONLY-ANSWER" }, {}, {}];
  assert.equal(answersForPick("entry-a", "entry-a", typed), typed);
});

test("the first pick of all, with nothing selected yet, starts blank", () => {
  assert.deepEqual(answersForPick(null, "entry-a", blankAnswers()), blankAnswers());
});

test("an all-blank answer set is sent as []", () => {
  /* "Continue with what you found." sent [] unconditionally before this step grew answer
     fieldsets, and an untouched form must still produce that exact request. Three empty objects
     would compose, server-side, to text already in the bank and be dropped there as duplicates, so
     this is about not asking for work that cannot have an effect. */
  assert.deepEqual(answersToSend(blankAnswers(), 3), []);
  assert.deepEqual(answersToSend([{ action: "   " }, {}, {}], 3), []);
});

test("a blank in the MIDDLE is preserved, because the server composes positionally", () => {
  // Compacting would slide an accomplishment written about the second bullet onto the first.
  const typed = [{}, { outcome: "cut review time" }, {}];
  assert.deepEqual(answersToSend(typed, 3), [{}, { outcome: "cut review time" }]);
});

test("only the visible answers are sent, and never more than were asked for", () => {
  const typed = [{ action: "Led" }, { action: "Built" }, { action: "Shipped" }];
  assert.deepEqual(answersToSend(typed, 1), [{ action: "Led" }]);
  assert.equal(answersToSend(typed, 99).length, 3, "the state array is the real cap, and it is 3");
});

test("blankness is about content, not about the keys being present", () => {
  assert.equal(isBlank({}), true);
  assert.equal(isBlank({ action: "", noun: "  " }), true);
  assert.equal(isBlank({ action: "Led" }), false);
});
