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
 * AND 200 IS THE SERVER'S MAXIMUM FOR THIS PARAMETER, not a preference either surface can revise.
 * The backend validates it with `z.coerce.number().int().min(1).max(INVENTORY_LIMIT)`
 * (student-outreach-backend, src/routes/canonicalApplications.ts) and answers 400 above it. That
 * failure is silent where it matters most: Home swallows it through its own .catch and quietly
 * returns to counting /resume/history alone, and the Tracker's allSettled leaves the canonical list
 * empty, dropping every canonical-only application off the page. Raising this literal means raising
 * that max first and deploying the backend AHEAD of the web app.
 *
 * That is exactly what happened here. It was raised to 200 on 2026-08-29 and reverted before merge
 * because the ceiling was still 100; the backend ceiling went up first (volley-backend #768), was
 * verified against production - limit=200 answers 200 with 200 rows, limit=201 still answers 400 -
 * and only then did this literal move.
 *
 * 200 is also the number GET /applications/board has always bounded itself at, which is the reason
 * to want it: the Tracker draws that board directly under a ledger counted from this fetch, and
 * while the two windows differed a card could sit in the board's Applied column while falling
 * outside the ledger entirely. That is how "Applied 13" and "12 Sent" were both true.
 */
test("Home's loader and the Tracker fetch the canonical ledger with one limit", () => {
  const loader = readFileSync(new URL("../features/dashboard/application/load-dashboard.ts", import.meta.url), "utf8");
  const tracker = readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");
  assert.ok(loader.includes(CANONICAL_FETCH), "the Home loader fetches the canonical ledger at the shared limit");
  assert.ok(tracker.includes(CANONICAL_FETCH), "the Tracker fetches the canonical ledger at the shared limit");
});
