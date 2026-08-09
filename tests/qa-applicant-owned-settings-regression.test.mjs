import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../app/dashboard/settings/page.tsx", import.meta.url),
  "utf8",
);

test("settings presents sensitive saved values as disabled reference data", () => {
  assert.match(source, /Authorized to work\? \(saved reference only\)/);
  assert.match(source, /Need sponsorship\? \(saved reference only\)/);
  assert.match(source, /function Select[\s\S]*?<select[\s\S]*?disabled/);
  assert.match(source, /function StringSelect[\s\S]*?<select[\s\S]*?disabled/);
});

test("settings never promises to answer or auto-decline applicant-owned questions", () => {
  assert.doesNotMatch(source, /Litos uses these exact answers/);
  assert.doesNotMatch(source, /it will choose decline/);
  assert.doesNotMatch(source, /or declined when possible/);
  assert.match(source, /Litos does not use them to answer a form/);
  assert.match(source, /never inferred, automatically declined, or reused/);
});
