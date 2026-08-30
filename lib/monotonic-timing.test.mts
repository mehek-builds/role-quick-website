import assert from "node:assert/strict";
import test from "node:test";

import {
  elapsedClockStamp,
  measureElapsed,
  reliableElapsedSecondsSince,
  resumeReadyTiming,
} from "./monotonic-timing.ts";

test("the receipt suppresses a duration when the calendar clock jumps", () => {
  assert.equal(
    reliableElapsedSecondsSince(
      { monotonicStartedAtMs: 12_000, wallStartedAtMs: 100_000 },
      { monotonicEndedAtMs: 19_900, wallEndedAtMs: 494_400 },
    ),
    null,
  );
});

test("the receipt keeps a duration when both clocks agree", () => {
  assert.equal(
    reliableElapsedSecondsSince(
      { monotonicStartedAtMs: 12_000, wallStartedAtMs: 100_000 },
      { monotonicEndedAtMs: 19_900, wallEndedAtMs: 107_900 },
    ),
    7.9,
  );
});

test("the receipt samples both clocks when no explicit end is supplied", (context) => {
  context.mock.method(performance, "now", () => 19_900);
  context.mock.method(Date, "now", () => 107_900);
  assert.equal(
    reliableElapsedSecondsSince({ monotonicStartedAtMs: 12_000, wallStartedAtMs: 100_000 }),
    7.9,
  );
});

test("the receipt accepts the drift boundary and rejects either direction beyond it", () => {
  const started = { monotonicStartedAtMs: 12_000, wallStartedAtMs: 100_000 };
  assert.equal(
    reliableElapsedSecondsSince(started, { monotonicEndedAtMs: 19_900, wallEndedAtMs: 108_900 }),
    7.9,
  );
  assert.equal(
    reliableElapsedSecondsSince(started, { monotonicEndedAtMs: 19_900, wallEndedAtMs: 106_899 }),
    null,
  );
});

test("the receipt suppresses a duration when suspension pauses the monotonic clock", () => {
  assert.equal(
    reliableElapsedSecondsSince(
      { monotonicStartedAtMs: 12_000, wallStartedAtMs: 100_000 },
      { monotonicEndedAtMs: 19_900, wallEndedAtMs: 130_000 },
    ),
    null,
  );
});

test("receipt copy prints measured time and stays honest when clocks disagree", () => {
  assert.deepEqual(resumeReadyTiming(7.9), { time: "7.9s", label: "Ready in" });
  assert.deepEqual(resumeReadyTiming(null), { time: "", label: "Ready" });
});

test("build log stamps suppress time when clocks disagree", () => {
  const started = { monotonicStartedAtMs: 12_000, wallStartedAtMs: 100_000 };
  assert.equal(
    elapsedClockStamp(started, { monotonicEndedAtMs: 19_900, wallEndedAtMs: 107_900 }),
    "00:07",
  );
  assert.equal(
    elapsedClockStamp(started, { monotonicEndedAtMs: 19_900, wallEndedAtMs: 494_400 }),
    "--:--",
  );
  assert.equal(elapsedClockStamp(null), "--:--");
});

test("an async operation returns its value with a reliable elapsed duration", async (context) => {
  const monotonicSamples = [12_000, 19_900];
  const wallSamples = [100_000, 107_900];
  context.mock.method(performance, "now", () => monotonicSamples.shift()!);
  context.mock.method(Date, "now", () => wallSamples.shift()!);

  assert.deepEqual(await measureElapsed(async () => "parsed"), { value: "parsed", seconds: 7.9 });
});
