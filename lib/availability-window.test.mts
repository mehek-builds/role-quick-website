import test from "node:test";
import assert from "node:assert/strict";

import {
  availabilityCycleOptions,
  availabilityWindowPatch,
  availabilityWindowStatus,
  type AvailabilityWindowInput,
} from "./availability-window.ts";

/* THE RULE THESE PIN, and it is the same one the backend resolver enforces: a blank writes nothing,
 * and a window that is not complete and coherent is told to the student rather than quietly saved
 * as an answer that will never be given. */

const EMPTY: AvailabilityWindowInput = { start: "", end: "", cycle: "", validThrough: "" };
const READY: AvailabilityWindowInput = {
  start: "2027-06-01",
  end: "2027-08-20",
  cycle: "Summer 2027",
  validThrough: "2027-05-01",
};

test("a student who skips the window declares nothing", () => {
  assert.deepEqual(availabilityWindowPatch(EMPTY), {});
  assert.equal(availabilityWindowStatus(EMPTY), "empty");
  // Whitespace is a blank, not an answer, on every one of the four.
  assert.deepEqual(availabilityWindowPatch({ ...EMPTY, cycle: "   " }), {});
});

test("a complete window is sent under the exact backend keys", () => {
  assert.deepEqual(availabilityWindowPatch(READY), {
    availability_window_start: "2027-06-01",
    availability_window_end: "2027-08-20",
    availability_cycle: "Summer 2027",
    availability_valid_through: "2027-05-01",
  });
  assert.equal(availabilityWindowStatus(READY), "ready");
});

test("three boxes out of four is reported as incomplete, not as an answer", () => {
  for (const missing of ["start", "end", "cycle", "validThrough"] as const) {
    assert.equal(
      availabilityWindowStatus({ ...READY, [missing]: "" }),
      "incomplete",
      `a window missing ${missing} must not read as ready`,
    );
  }
});

test("a window that contradicts itself is reported rather than saved as usable", () => {
  assert.equal(availabilityWindowStatus({ ...READY, start: "2027-09-01" }), "incoherent");
  // Last year's dates left under this year's cycle: the one typo every other check would pass.
  assert.equal(availabilityWindowStatus({ ...READY, cycle: "Summer 2028" }), "incoherent");
});

test("what is typed is still saved, so an unfinished window is not lost on reload", () => {
  const partial = { ...EMPTY, start: "2027-06-01", cycle: "Summer 2027" };
  assert.deepEqual(availabilityWindowPatch(partial), {
    availability_window_start: "2027-06-01",
    availability_cycle: "Summer 2027",
  });
});

test("the cycle options are the exact shape the backend accepts, from this year forward", () => {
  const options = availabilityCycleOptions(new Date("2026-08-09T00:00:00Z"));
  assert.equal(options[0], "Spring 2026");
  assert.equal(options.at(-1), "Winter 2028");
  assert.equal(options.length, 12);
  for (const option of options) assert.match(option, /^(?:Spring|Summer|Fall|Winter) 20\d{2}$/);
});
