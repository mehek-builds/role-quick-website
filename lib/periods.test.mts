import assert from "node:assert/strict";
import test from "node:test";
import { defaultBackup, defaultPrimary, periodsFor } from "./periods.ts";

const august2026 = new Date("2026-08-02T12:00:00Z");

test("defaults every enrolled student to the next available summer", () => {
  assert.equal(defaultPrimary(2028, august2026), "summer-2027");
  assert.equal(defaultPrimary(2030, august2026), "summer-2027");
});

test("the primary and backup defaults are always different", () => {
  for (const gradYear of [2027, 2028, 2029, 2030, 2031, 2032]) {
    assert.notEqual(defaultPrimary(gradYear, august2026), defaultBackup(gradYear, august2026));
  }
});

test("keeps the visible timing choices to one glance", () => {
  assert.ok(periodsFor(2032, august2026).length <= 8);
});
