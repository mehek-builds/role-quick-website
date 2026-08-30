import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pages = [
  "app/browse-jobs/page.tsx",
  "app/dashboard/jobs/page.tsx",
].map((path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const evidenceCopy = readFileSync(
  new URL("../lib/sponsorship-evidence.ts", import.meta.url),
  "utf8",
);

test("historical filing evidence is not presented as a promise about the current posting", () => {
  assert.match(evidenceCopy, /Company has sponsored visas/);
  assert.match(evidenceCopy, /That is not a promise to sponsor you/);
  for (const page of pages) {
    assert.doesNotMatch(page, /\? "Sponsorship offered" : "Sponsors visas"/);
    assert.match(page, /sponsorshipEvidence(?:Label|Title)/);
  }
});
