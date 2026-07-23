import test from "node:test";
import assert from "node:assert/strict";
import {
  HUNTS,
  FIELDS,
  REGIONS,
  matchRoles,
} from "../lib/rolesFeed.ts";

/* Every hunt x field x region combination must return at least one match,
   and the top match must share the visitor's field or hunt (never a
   nothing-in-common filler). */
test("all 96 calibration combos return relevant matches", () => {
  for (const h of HUNTS) {
    for (const f of FIELDS) {
      for (const r of REGIONS) {
        const m = matchRoles(h.id, f.id, r.id);
        assert.ok(m.length >= 1, `${h.id}/${f.id}/${r.id}: empty`);
        const top = m[0];
        assert.ok(
          top.fields.includes(f.id) || top.hunts.includes(h.id),
          `${h.id}/${f.id}/${r.id}: top match ${top.company} shares nothing`
        );
      }
    }
  }
});

/* Craft-first: even where a region has no roles in a field, the top match
   stays in the visitor's field rather than switching disciplines. */
test("field dominates cross-region fallbacks", () => {
  for (const hunt of ["intern", "newgrad", "fulltime", "asap"]) {
    const m = matchRoles(hunt, "design", "mena");
    assert.ok(
      m[0].fields.includes("design"),
      `${hunt}/design/mena got ${m[0].company}`
    );
  }
});
