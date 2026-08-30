import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("a grounded local parse can advance without five model-inferred roles", async () => {
  const steps = await read("components/start/steps.tsx");
  const resume = steps.slice(steps.indexOf("export function ResumeStep"), steps.indexOf("export function InstallStep"));

  assert.match(resume, /resumeUploadState\(parsed\)/);
  assert.match(resume, /resumeUploadState\(savedProfile, \{ knownReady: true \}\)/);
  assert.doesNotMatch(resume, /distinctRoles\s*>=\s*5/);
  assert.match(resume, /showFallbackWarning/);
  assert.match(resume, /Review the details above, then continue normally\./);
  assert.match(resume, /Review the saved details above before continuing\./);
});

test("the upload response type exposes local fallback provenance", async () => {
  const api = await read("lib/api.ts");
  assert.match(api, /parse_method\?: "model" \| "local_fallback"/);
});
