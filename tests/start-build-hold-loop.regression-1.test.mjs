import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* Three quality holds in a row, each blaming the posting.
 *
 * The hold is per-posting, so ONE hold rightly says "try another posting". But a resume with no
 * bullet that answers any of the board's postings holds every time, and the screen sent a student
 * round that loop with the same sentence each pass - measured live on a guest walk: three
 * consecutive holds, the error above naming the resume while the remedy below blamed the posting.
 *
 * After the second consecutive hold the screen now names the pattern and offers the resume
 * revisit. These pin the pieces that make that work.
 */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const code = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const BUILD = code(read("components/start/BuildStep.tsx"));

test("the hold is recognised by its structured code, not its sentence", () => {
  /* routes/resume.ts sends code "resume_quality_hold" beside the message, and the message is
     allowed to be rewritten. Matching on the sentence would silently stop counting the day the
     copy changes. */
  assert.match(BUILD, /\(reason\.data as \{ code\?: string \}\)\.code === "resume_quality_hold"/);
});

test("the counter lives at module scope, because remounts are the loop", () => {
  /* "Show me a different one" unmounts the component; a state counter forgets exactly the pattern
     it exists to notice. */
  assert.match(BUILD, /^let consecutiveQualityHolds = 0;/m);
  assert.match(BUILD, /consecutiveQualityHolds = qualityHold \? consecutiveQualityHolds \+ 1 : 0;/);
});

test("one successful build breaks the pattern", () => {
  assert.match(BUILD, /consecutiveQualityHolds = 0;\s*setResult\(built\);/);
});

test("from the second consecutive hold, the resume path is offered", () => {
  assert.match(BUILD, /consecutiveQualityHolds >= 2 && onReviseResume && \(/);
  assert.match(BUILD, /Let me change my resume/);
});

test("both call sites can open the resume revisit", () => {
  const page = code(read("app/start/page.tsx"));
  const wired = page.match(/onReviseResume=\{\(\) => \{ track\("onboarding_revisit_opened", \{ step: "resume" \}\); setRevisiting\("resume"\); \}\}/g) ?? [];
  assert.equal(wired.length, 2, "the sequence build and the job-first build must both offer the way out");
});
