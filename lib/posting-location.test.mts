import assert from "node:assert/strict";
import test from "node:test";
import { narrowPostingLocation, splitPostingLocations } from "./posting-location.ts";

/* The posting that produced this: one Hudson River Trading internship, five offices, printed whole
   under the title on the onboarding build screen. */
const HRT = "Austin, TX, United States; Chicago, Illinois, United States; London, United Kingdom; New York, NY, United States; Singapore";

test("offices are split on the separators employers use, never on the comma", () => {
  assert.deepEqual(splitPostingLocations("New York, NY; London, UK"), ["New York, NY", "London, UK"]);
  assert.deepEqual(splitPostingLocations("Berlin, Germany | Remote"), ["Berlin, Germany", "Remote"]);
  assert.deepEqual(splitPostingLocations("Austin, TX, United States"), ["Austin, TX, United States"]);
  assert.deepEqual(splitPostingLocations(null), []);
});

test("the header keeps the office the student named", () => {
  assert.equal(narrowPostingLocation(HRT, ["New York, NY"]), "New York, NY, United States");
  assert.equal(narrowPostingLocation(HRT, ["Singapore"]), "Singapore");
  assert.equal(narrowPostingLocation(HRT, ["Austin, TX"]), "Austin, TX, United States");
});

test("a city the student and the employer spell differently is still the same city", () => {
  // The suggestion list offers "London, UK"; the employer wrote "London, United Kingdom".
  assert.equal(narrowPostingLocation(HRT, ["London, UK"]), "London, United Kingdom");
  // "Chicago, IL" against "Chicago, Illinois, United States".
  assert.equal(narrowPostingLocation(HRT, ["Chicago, IL"]), "Chicago, Illinois, United States");
});

test("several saved places keep several offices, in the employer's own order", () => {
  assert.equal(
    narrowPostingLocation(HRT, ["Singapore", "New York, NY"]),
    "New York, NY, United States; Singapore",
  );
});

test("a country the student named keeps every office in it", () => {
  assert.equal(
    narrowPostingLocation(HRT, ["United States"]),
    "Austin, TX, United States; Chicago, Illinois, United States; New York, NY, United States",
  );
});

test("nothing recognised prints the field exactly as the employer wrote it", () => {
  assert.equal(narrowPostingLocation(HRT, ["Berlin, Germany"]), HRT);
  assert.equal(narrowPostingLocation(HRT, []), HRT);
  assert.equal(narrowPostingLocation(HRT, null), HRT);
  // Every office matched: the field is returned untouched rather than rebuilt.
  assert.equal(narrowPostingLocation("New York, NY | London, UK", ["New York, NY", "London, UK"]), "New York, NY | London, UK");
});

test("a posting written as one place is left alone", () => {
  assert.equal(narrowPostingLocation("Austin, TX, United States", ["New York, NY"]), "Austin, TX, United States");
  assert.equal(narrowPostingLocation(null, ["New York, NY"]), null);
  assert.equal(narrowPostingLocation("   ", ["New York, NY"]), null);
});

test("two cities of the same name in different places are not the same place", () => {
  // The narrowing is dropped entirely rather than pointing a Californian at Costa Rica.
  const twoSanJoses = "San Jose, CA, United States; San Jose, Costa Rica";
  assert.equal(narrowPostingLocation(twoSanJoses, ["San Jose, Costa Rica"]), "San Jose, Costa Rica");
  const otherCambridge = "Cambridge, United Kingdom; London, United Kingdom";
  assert.equal(narrowPostingLocation(otherCambridge, ["Cambridge, MA"]), otherCambridge);
});

test("a preference matches whole words, not letters inside them", () => {
  // "us" sits inside "Austin", and an unanchored substring test would keep that office.
  assert.equal(narrowPostingLocation("Austin, TX, United States; Singapore", ["US"]), "Austin, TX, United States; Singapore");
});

test("Remote is a place a student can pick, and it is kept when the employer wrote it", () => {
  assert.equal(narrowPostingLocation("Remote; New York, NY", ["Remote"]), "Remote");
  assert.equal(
    narrowPostingLocation("Remote; New York, NY; London, UK", ["Remote", "London, UK"]),
    "Remote; London, UK",
  );
});
