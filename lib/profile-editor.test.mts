import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasCompleteTargetRoleSet,
  parseEditableLines,
  parseEditableList,
  splitBankByCategory,
  targetRolesChanged,
} from "./profile-editor.ts";

test("the bank splits into work and leadership, and jobs and projects both count as work", () => {
  const { work, leadership } = splitBankByCategory([
    { type: "job", org: "Cinematica Labs" },
    { type: "leadership", org: "Spark SC" },
    { type: "project", org: "Tonee" },
    { type: "leadership", org: "Venture Capital Academy" },
  ]);
  assert.deepEqual(work.map(({ entry }) => entry.org), ["Cinematica Labs", "Tonee"]);
  assert.deepEqual(leadership.map(({ entry }) => entry.org), ["Spark SC", "Venture Capital Academy"]);
});

/* The whole point of carrying the index: the two groups interleave in the stored array, so a
   group-local index would edit a different row than the one on screen. */
test("each entry keeps the index it has in the single stored bank", () => {
  const { work, leadership } = splitBankByCategory([
    { type: "leadership", org: "Spark SC" },
    { type: "job", org: "Cinematica Labs" },
    { type: "leadership", org: "USG" },
    { type: "job", org: "Tri Coast Capital" },
  ]);
  assert.deepEqual(work.map(({ index }) => index), [1, 3]);
  assert.deepEqual(leadership.map(({ index }) => index), [0, 2]);
});

test("an unknown future type lands under work rather than leadership", () => {
  const { work, leadership } = splitBankByCategory([{ type: "volunteering", org: "Somewhere" }]);
  assert.equal(work.length, 1);
  assert.equal(leadership.length, 0);
});

test("an empty bank yields two empty groups rather than throwing", () => {
  const { work, leadership } = splitBankByCategory([]);
  assert.deepEqual(work, []);
  assert.deepEqual(leadership, []);
});

test("profile lists accept commas and lines, trim, and deduplicate", () => {
  assert.deepEqual(
    parseEditableList(" Python, SQL\npython\nFinancial modeling "),
    ["Python", "SQL", "Financial modeling"],
  );
});

test("private equity is preserved as a normal role title", () => {
  assert.deepEqual(parseEditableList("Private Equity Associate"), ["Private Equity Associate"]);
});

test("a comma inside a real role title is preserved", () => {
  assert.deepEqual(parseEditableLines("Private Equity Associate, Healthcare\nChief of Staff"), [
    "Private Equity Associate, Healthcare",
    "Chief of Staff",
  ]);
});

test("an existing target set cannot be silently cleared", () => {
  assert.equal(hasCompleteTargetRoleSet([], ["One", "Two", "Three", "Four", "Five"]), false);
  assert.equal(hasCompleteTargetRoleSet([], []), true);
  assert.equal(hasCompleteTargetRoleSet(["One", "Two", "Three", "Four", "Five"], []), true);
});

test("case-only role corrections are saved", () => {
  assert.equal(targetRolesChanged(["Private Equity Associate"], ["Private equity associate"]), true);
  assert.equal(targetRolesChanged(["Private Equity Associate"], ["Private Equity Associate"]), false);
});
