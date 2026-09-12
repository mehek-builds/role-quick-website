import assert from "node:assert/strict";
import test from "node:test";

import {
  RUN_PROGRESS_QUIET_AFTER_S,
  lastUpdateLabel,
  quietRunNotice,
  runProgressFreshness,
} from "./run-progress-freshness.ts";

const at = Date.parse("2026-09-12T10:00:00.000Z");

test("the age of the last stage write is read in whole seconds", () => {
  assert.deepEqual(runProgressFreshness("2026-09-12T09:59:48.000Z", at), { secondsSince: 12, quiet: false });
  assert.equal(lastUpdateLabel({ secondsSince: 12, quiet: false }), "Last update 12s ago");
  assert.equal(lastUpdateLabel({ secondsSince: 184, quiet: false }), "Last update 3m 04s ago");
  assert.equal(lastUpdateLabel({ secondsSince: 2, quiet: false }), "Last update just now");
});

test("no stamp, an unreadable stamp, or no clock yet shows nothing rather than a guess", () => {
  assert.equal(runProgressFreshness(undefined, at), null);
  assert.equal(runProgressFreshness("not a date", at), null);
  assert.equal(runProgressFreshness("2026-09-12T09:59:48.000Z", null), null);
});

test("a client clock behind the server never prints a negative age", () => {
  assert.deepEqual(runProgressFreshness("2026-09-12T10:00:30.000Z", at), { secondsSince: 0, quiet: false });
});

/* The measured shape: a 268s discovery call is a healthy run and must not be called stuck; a run
   whose stage has not moved past one whole provider window (420s) plus margin may be. */
test("a run inside its longest single step is not quiet, and one past it is", () => {
  assert.equal(runProgressFreshness(new Date(at - 268_000).toISOString(), at)?.quiet, false);
  assert.equal(runProgressFreshness(new Date(at - 420_000).toISOString(), at)?.quiet, false);
  const quiet = runProgressFreshness(new Date(at - RUN_PROGRESS_QUIET_AFTER_S * 1000).toISOString(), at);
  assert.equal(quiet?.quiet, true);
  assert.match(quietRunNotice({ secondsSince: 552, quiet: true }), /^No new step for 9m 12s\./);
});