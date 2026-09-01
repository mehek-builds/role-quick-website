import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const raw = readFileSync(
  new URL("../components/start/BaseResumeStep.tsx", import.meta.url),
  "utf8",
);

const source = raw
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("the base resume step names its four pieces of work", () => {
  assert.match(source, /<PhaseLabel>\{phase === "compare" \? "Compare" : "Review and edit"\}<\/PhaseLabel>/);
  assert.match(source, /Optional application details/);
  assert.match(source, /<PhaseLabel>Approval<\/PhaseLabel>/);
});

test("optional application details use one native disclosure and keep every field reachable", () => {
  const start = source.indexOf('<details className="mt-5 rounded-inner border border-border px-4 py-3">');
  const end = source.indexOf("</details>", start);
  assert.ok(start >= 0 && end > start, "could not isolate the optional application details disclosure");

  const disclosure = source.slice(start, end);
  assert.match(disclosure, /<summary/);
  assert.match(disclosure, /RACE_AND_GENDER_QUESTION_FIELDS\.map/);
  assert.match(disclosure, /APPLICATION_FACT_FIELDS\.map/);
  assert.match(disclosure, /base-fact-prior-employers/);
  assert.match(disclosure, /base-fact-offers/);
  assert.match(disclosure, /base-fact-referral/);
  assert.match(disclosure, /<AvailabilityWindowTable/);
  assert.match(disclosure, /base-fact-advanced-study/);
  assert.match(disclosure, /Leave a field blank and Litos leaves it blank too/);
});

test("approval still saves the base resume before advancing", () => {
  const finishStart = source.indexOf("const finish = useCallback(");
  const finishEnd = source.indexOf("function patchFact", finishStart);
  assert.ok(finishStart >= 0 && finishEnd > finishStart, "could not isolate finish()");
  const finish = source.slice(finishStart, finishEnd);

  assert.ok(finish.indexOf("await persist()") < finish.indexOf("onDone()"));
  assert.match(finish, /putApplicationProfile\(profilePatch\)/);
});

test("onboarding shows ATS readability facts and no target-role coverage percentage", () => {
  /* THE PAGE COUNT IS DELIBERATELY GONE (Mehek, 2026-09-01). This line used to end "on one page",
     and the page count was the second of its two numbers. The product no longer sells itself on
     being one page anywhere in the flow, so the fact retired with the phrasing. The guardrail it
     was serving is unchanged and still asserted below: this line states a number the student can
     check (extractable_chars), never an adjective, and never a coverage percentage. */
  assert.match(source, /applicant tracking system can read this/);
  assert.match(source, /ats\.extractable_chars/);

  /* Scoped to the fact line itself, not the whole file: a file-wide sweep here would fail on any
     unrelated future mention and blame this line for it. */
  const factAt = source.indexOf("Checked: an applicant tracking system");
  assert.ok(factAt >= 0, "the ATS fact line went missing");
  const factLine = source.slice(factAt, factAt + 400);
  assert.doesNotMatch(factLine, /one page|ats\.pages/i, "the one-page claim came back to the ATS fact line");
  assert.doesNotMatch(source, /ats\.keyword_coverage_pct/);
  assert.doesNotMatch(source, /matches .*% of the words in the roles you picked/);
});
