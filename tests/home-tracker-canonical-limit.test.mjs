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
const CANONICAL_FETCH = '"/applications?limit=100"';

/*
 * AND 100 IS THE SERVER'S MAXIMUM FOR THIS PARAMETER, not a preference either surface can revise.
 * The backend validates it with `z.coerce.number().int().min(1).max(100)`
 * (student-outreach-backend, src/routes/canonicalApplications.ts) and answers 400 above it. That
 * failure is silent where it matters most: Home swallows it through its own .catch and quietly
 * returns to counting /resume/history alone, and the Tracker's allSettled leaves the canonical list
 * empty, dropping every canonical-only application off the page. Raising this literal means raising
 * that max first and deploying the backend ahead of the web app.
 *
 * It was raised to 200 on 2026-08-29 and reverted before merge for exactly this reason. The board
 * and the ledger are reconciled without it - see pipelineCoverage and boardStageReconciliationNote.
 */
test("Home's loader and the Tracker fetch the canonical ledger with one limit", () => {
  const loader = readFileSync(new URL("../features/dashboard/application/load-dashboard.ts", import.meta.url), "utf8");
  const tracker = readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");
  assert.ok(loader.includes(CANONICAL_FETCH), "the Home loader fetches the canonical ledger at the shared limit");
  assert.ok(tracker.includes(CANONICAL_FETCH), "the Tracker fetches the canonical ledger at the shared limit");
});
