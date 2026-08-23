import assert from "node:assert/strict";
import test from "node:test";
import { newRipplingFieldNames } from "./rippling-fixture.ts";

test("Rippling fixture names rotate between independent renders", () => {
  const first = Object.values(newRipplingFieldNames());
  const second = Object.values(newRipplingFieldNames());

  assert.equal(first.length, 8);
  assert.equal(new Set(first).size, first.length);
  for (const name of [...first, ...second]) assert.match(name, /^[a-z0-9]{10}$/);
  assert.notDeepEqual(first, second);
});
