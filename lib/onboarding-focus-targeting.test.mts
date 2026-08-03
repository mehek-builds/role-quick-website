import assert from "node:assert/strict";
import test from "node:test";
import { focusPatch, focusSeed, type SavedFocus } from "./onboarding-role-inference.ts";
import type { RoleType } from "./api.ts";

/* The account that reproduced this live: a complete profile, saved targeting, five sent
 * applications, and a titles array that predates the titles field - which is exactly what makes
 * the derived step land back on 'focus' instead of 'done'. */
const LIVE_ACCOUNT: SavedFocus = {
  categories: ["quant-trading", "software-engineering", "product"],
  titles: [],
  role_types: ["internship"] as RoleType[],
};

/* What the resume inference offered on that same account, and what used to be committed over it. */
const BAD_GUESS = { roles: ["Investment Banking Analyst", "Financial Analyst"], roleType: "new-grad" as RoleType };

test("saved targeting survives an onboarding pass over the roles screen", () => {
  const seed = focusSeed(LIVE_ACCOUNT, BAD_GUESS);
  const body = focusPatch(LIVE_ACCOUNT, seed);

  // The stated type stands. The inference said new-grad; the student said internship.
  assert.deepEqual(body.role_types, ["internship"]);
  // Every saved category is still there. Recomputing from the guessed title used to drop all three.
  for (const category of LIVE_ACCOUNT!.categories!) {
    assert.ok(body.categories?.includes(category), `lost category ${category}`);
  }
  assert.ok(!body.categories?.includes("other"), "widened a stated preference into the untargeted bucket");
});

test("seeds the type from saved targeting, never from the resume guess", () => {
  assert.deepEqual(focusSeed(LIVE_ACCOUNT, BAD_GUESS).roleTypes, ["internship"]);
});

test("seeds titles from saved targeting when the student has stated some", () => {
  const saved: SavedFocus = { categories: ["software-engineering"], titles: ["Backend Engineer"], role_types: ["internship"] };
  assert.deepEqual(focusSeed(saved, BAD_GUESS).titles, ["Backend Engineer"]);
});

test("falls back to one guessed title when nothing is stated, and never to all five", () => {
  const seed = focusSeed(LIVE_ACCOUNT, BAD_GUESS);
  assert.deepEqual(seed.titles, ["Investment Banking Analyst"]);
});

test("a brand new account is unchanged: guess seeds it and categories derive from the titles", () => {
  const guess = { roles: ["Software Engineer"], roleType: "internship" as RoleType };
  const seed = focusSeed(null, guess);
  assert.deepEqual(seed, { titles: ["Software Engineer"], roleTypes: ["internship"] });

  const body = focusPatch(null, seed);
  assert.deepEqual(body.titles, ["Software Engineer"]);
  assert.deepEqual(body.role_types, ["internship"]);
  assert.deepEqual(body.categories, ["software-engineering"]);
});

test("an empty row with no titles at all still gets 'other' rather than no category", () => {
  const saved: SavedFocus = { categories: null, titles: null, role_types: null };
  const body = focusPatch(saved, { titles: ["Registered Nurse"], roleTypes: ["full-time"] });
  assert.deepEqual(body.categories, ["other"]);
});

test("a title the student adds widens categories instead of replacing them", () => {
  const body = focusPatch(LIVE_ACCOUNT, { titles: ["Product Designer"], roleTypes: ["internship"] });
  assert.deepEqual(body.categories, ["quant-trading", "software-engineering", "product", "design"]);
});

test("categories are never duplicated when the chosen titles re-derive a saved one", () => {
  const body = focusPatch(LIVE_ACCOUNT, { titles: ["Software Engineer"], roleTypes: ["internship"] });
  assert.equal(new Set(body.categories).size, body.categories?.length);
});

test("the student's own edits on this screen are what get written for titles and type", () => {
  const body = focusPatch(LIVE_ACCOUNT, { titles: ["Quantitative Trader", "Data Analyst"], roleTypes: ["co-op"] });
  assert.deepEqual(body.titles, ["Quantitative Trader", "Data Analyst"]);
  assert.deepEqual(body.role_types, ["co-op"]);
});
