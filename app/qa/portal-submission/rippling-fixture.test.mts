import assert from "node:assert/strict";
import test from "node:test";
import { newRipplingFieldIdentities } from "./rippling-fixture.ts";

test("Rippling fixture ids and names rotate between independent renders", () => {
  const first = Object.values(newRipplingFieldIdentities());
  const second = Object.values(newRipplingFieldIdentities());
  const firstIds = first.map(({ id }) => id);
  const secondIds = second.map(({ id }) => id);
  const firstNames = first.map(({ name }) => name);
  const secondNames = second.map(({ name }) => name);

  assert.equal(first.length, 8);
  assert.equal(new Set(firstIds).size, first.length);
  assert.equal(new Set(firstNames).size, first.length);
  for (const { id, name } of [...first, ...second]) {
    assert.match(id, /^field-\d+$/);
    assert.match(name, /^[a-z0-9]{10}$/);
  }
  assert.notDeepEqual(firstIds, secondIds);
  assert.notDeepEqual(firstNames, secondNames);
});
