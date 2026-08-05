import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Regression: Applications selected the newest ready packet without loading current targeting.
test("Applications gates the next send through the current preference-ranked jobs feed", () => {
  const page = readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");

  assert.match(page, /api<JobsPage>\("\/jobs\?offset=0"\)/);
  assert.match(page, /nextPreferredReadyPacket\(reviewablePackets, currentMatches \?\? \[\]\)/);
  assert.match(page, /Automatic sending is paused/);
  assert.match(page, /<AutopilotLockNote/);
  assert.match(page, /<NextMatchCard/);
});
