import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pages = [
  "app/browse-jobs/page.tsx",
  "app/dashboard/jobs/page.tsx",
].map((path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));

test("historical filing evidence is not presented as a promise about the current posting", () => {
  for (const page of pages) {
    assert.match(page, /Company has sponsored visas/);
    assert.doesNotMatch(page, /\? "Sponsorship offered" : "Sponsors visas"/);
    assert.match(page, /That is not a promise to sponsor you/);
  }
});
