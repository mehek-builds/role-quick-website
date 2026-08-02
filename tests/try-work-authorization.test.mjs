import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const simulator = readFileSync(
  join(ROOT, "components/try/TrySimulator.tsx"),
  "utf8",
);
const route = readFileSync(join(ROOT, "app/api/try/route.ts"), "utf8");
const tryData = readFileSync(join(ROOT, "lib/try-data.ts"), "utf8");

test("the custom resume path is available on mobile", () => {
  const button = simulator.match(
    /<button\s+onClick=\{\(\) => setPasteOpen\(true\)\}[\s\S]*?Try it free with your resume[\s\S]*?<\/button>/,
  )?.[0];

  assert.ok(button, "custom resume button is missing");
  assert.doesNotMatch(
    button,
    /\bhidden\b/,
    "custom resume button must not disappear on mobile",
  );
});

test("missing work authorization pauses the preview for the user's answer", () => {
  assert.match(
    simulator,
    /if \(!nextPacket\.filled_fields\.work_authorization\?\.trim\(\)\)/,
  );
  assert.match(simulator, /setPendingPacket\(nextPacket\)/);
  assert.match(simulator, /\{pendingPacket && \(/);
  assert.match(simulator, /role="dialog"/);
  assert.match(simulator, /max-h-\[calc\(100dvh-1\.5rem\)\]/);
  assert.match(simulator, /overflow-y-auto/);
  assert.match(simulator, /Your resume does not answer this,[\s\S]*Litos will not guess\./);
  assert.match(simulator, /Continue my preview/);
});

test("a failed personal trial never falls through to John's application", () => {
  const chooseReal = simulator.match(
    /async function chooseReal[\s\S]*?function answerWorkAuthorization/,
  )?.[0];

  assert.ok(chooseReal, "personal trial handler is missing");
  assert.doesNotMatch(chooseReal, /setMode\("canned"\)/);
  assert.doesNotMatch(chooseReal, /This is John/);
  assert.match(
    chooseReal,
    /Your resume was not replaced with sample information/,
  );
});

test("the model may return null before the API clears missing authorization", () => {
  assert.match(
    route,
    /work_authorization:[\s\S]*anyOf: \[\{ type: "string" \}, \{ type: "null" \}\]/,
  );
  assert.match(route, /Never infer it from location, citizenship, education, or employment history/);
  assert.match(route, /sanitizeTryPacket/);
  assert.match(tryData, /work_authorization: string/);
});

test("the provider schema avoids unsupported numeric and array constraints", () => {
  assert.doesNotMatch(route, /\bminItems\b|\bmaxItems\b|\bminimum\b|\bmaximum\b/);
  assert.match(route, /Exactly 3 resume bullets/);
  assert.match(route, /0-100: how many/);
  assert.match(route, /sanitizeTryPacket/);
});

test("unverified job keywords pause before the model call", () => {
  assert.match(route, /findKeywordClarifications\(posting\.jd, resume\)/);
  assert.match(route, /needs_clarification: true, clarifications/);
  assert.match(route, /parseClarificationAnswers/);
  assert.match(route, /findDeclinedKeywordClaims/);
  assert.match(route, /findDeclinedKeywordClaims\([\s\S]*packet\.tailored_bullets/);
  assert.match(route, /A job-posting keyword is not evidence/);
});

test("the clarification queue requires evidence or an explicit decline", () => {
  assert.match(simulator, /Check these requirements\./);
  assert.match(simulator, /Litos will only use[\s\S]*what you confirm\./);
  assert.match(simulator, /I have not done this\./);
  assert.match(simulator, /MIN_CLARIFICATION_ANSWER_CHARS/);
  assert.match(simulator, /Use my answers/);
});

test("a missing answer cannot receive a green completed check", () => {
  assert.match(
    simulator,
    /const filled = packet \? Boolean\(f\.value\?\.trim\(\)\) : i < shown/,
  );
  assert.match(simulator, /filled \? f\.value : "Needs your answer"/);
});
