import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * Home counts what the Tracker counts, and that sentence is only true while both fetch the
 * canonical ledger with the SAME limit. The two fetch sites cannot share a constant: the Home
 * loader may not import the applications feature except through its barrel, and the barrel does
 * not load under this test runner, so the limit exists as a literal in each file. This test is
 * the lockstep: raising one without the other silently reintroduces the 2026-08-28 defect where
 * Home's tiles read 44 against a Tracker action view of 88.
 */
const CANONICAL_FETCH = '"/applications?limit=200"';

/*
 * The limit is also the BOARD's own ceiling. GET /applications/board caps at 200 server-side, and
 * the Tracker renders that board directly under a ledger header counting this fetch. While the two
 * differed, one screen carried "Your applications 100" above "187 of 200 have not been sent yet",
 * and a card could sit in the board's Applied column while falling outside the ledger's window -
 * which is exactly how "Applied 13" and "12 Sent" were both true. Lowering this literal below 200
 * reopens that gap.
 */
test("Home's loader and the Tracker fetch the canonical ledger with one limit", () => {
  const loader = readFileSync(new URL("../features/dashboard/application/load-dashboard.ts", import.meta.url), "utf8");
  const tracker = readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");
  assert.ok(loader.includes(CANONICAL_FETCH), "the Home loader fetches the canonical ledger at the shared limit");
  assert.ok(tracker.includes(CANONICAL_FETCH), "the Tracker fetches the canonical ledger at the shared limit");
});
