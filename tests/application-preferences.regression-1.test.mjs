import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Regression: Applications selected the newest ready packet without loading current targeting.
test("Applications gates the next send through the current preference-ranked jobs feed", () => {
  const page = readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");

  assert.match(page, /api<JobsPage>\("\/jobs\?offset=0"\)/);
  /* Still ranked through the live feed, which is the regression above. The list is narrowed to
     autopilotCandidates rather than reviewablePackets so a row the server has refused to send
     unattended stops being chosen forever, but the RANKING argument is what this pins. */
  assert.match(page, /nextPreferredReadyPacket\(autopilotCandidates, currentMatches \?\? \[\]\)/);
  assert.match(page, /autopilotCandidates = useMemo/);
  assert.match(page, /reviewablePackets\.filter\(\(packet\) => !unsendable\.has\(packet\.id\)\)/);
  // Parked on the audit CODE, never on the sentence: matching copy is how `packet_stale` shipped.
  assert.match(page, /auditRefusalCode\(reason\)/);
  assert.match(page, /Automatic sending is paused/);
  assert.match(page, /<AutopilotLockNote/);
  assert.match(page, /<NextMatchCard/);
});
