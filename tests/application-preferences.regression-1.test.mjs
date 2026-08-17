import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Regression: Applications selected the newest ready packet without loading current targeting.
test("Applications gates the next send through the current preference-ranked jobs feed", () => {
  const page = readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");

  assert.match(page, /api<JobsPage>\("\/jobs\?offset=0"\)/);
  // The pool it ranks now excludes applications held after a deterministic send refusal; the
  // gate through the preference-ranked feed is unchanged. See autopilot-refusal-hold.regression-1.
  assert.match(
    page,
    /nextPreferredReadyPacket\(\s*reviewablePackets\.filter\(\(packet\) => !heldFromQueue\.has\(packet\.id\)\),\s*currentMatches \?\? \[\],?\s*\)/,
  );
  assert.match(page, /Automatic sending is paused/);
  assert.match(page, /<AutopilotLockNote/);
  assert.match(page, /<NextMatchCard/);
});
