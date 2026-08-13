import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

async function source(file) {
  return readFile(path.join(ROOT, file), "utf8");
}

test("availability is presented as one semantic date table", async () => {
  const table = await source("components/app/AvailabilityWindowTable.tsx");

  assert.match(table, /<table/);
  assert.match(table, /<caption[^>]*>Internship availability date table<\/caption>/);
  assert.match(table, /<th scope="row"/);
  assert.match(table, /Cycle/);
  assert.match(table, /Earliest start/);
  assert.match(table, /Available through/);
  assert.match(table, /Reuse through/);
  assert.match(table, /After the reuse date, Litos stops using this answer and asks again/);
});

test("onboarding and Account share the same availability table", async () => {
  const onboarding = await source("components/start/BaseResumeStep.tsx");
  const settings = await source("app/dashboard/settings/page.tsx");

  assert.match(onboarding, /<AvailabilityWindowTable value={availabilityWindow} onChange={setAvailabilityWindow} \/>/);
  assert.match(settings, /<AvailabilityWindowTable/);
  assert.match(settings, /availability_window_start: value\.start \|\| null/);
  assert.match(settings, /availability_valid_through: value\.validThrough \|\| null/);
});
