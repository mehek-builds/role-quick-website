import assert from "node:assert/strict";
import { test } from "node:test";
import {
  courseworkLine,
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

/* ISSUE-044. coursework is stored as a LIST and shown as one comma separated line, and every screen
 * that displays it goes through this one function so they cannot disagree about the shape again. */
test("the coursework line is joined from the stored list", () => {
  assert.equal(
    courseworkLine(["Data Structures & Algorithms", "Object-Oriented Programming"]),
    "Data Structures & Algorithms, Object-Oriented Programming",
  );
});

/* The shape the field held before the backfill, and the shape an older API beside a newer page could
 * still serve. On the /start path this used to reach a bare `.join`, which a string does not have:
 * the failure was a TypeError on the screen where a new user approves their base resume, not a
 * blank line. Asserting it does not throw is the point of the case. */
test("a coursework value stored as a string is displayed, not thrown on", () => {
  assert.doesNotThrow(() => courseworkLine("Data Structures & Algorithms"));
  assert.equal(courseworkLine("Data Structures & Algorithms"), "Data Structures & Algorithms");
});

test("a missing or malformed coursework value reads as empty rather than crashing", () => {
  assert.equal(courseworkLine(undefined), "");
  assert.equal(courseworkLine(null), "");
  assert.equal(courseworkLine({ nope: true }), "");
  assert.equal(courseworkLine([1, "Real Course", null]), "Real Course");
  assert.equal(courseworkLine([]), "");
  assert.equal(courseworkLine(""), "");
  assert.equal(courseworkLine("   "), "");
});

/* Behavioural parity with the API's courseworkFromParsed, pinned case by case.
 *
 * These two functions live in different repos and are the reason a dashboard and a PDF can disagree
 * about the same field, so "they do roughly the same thing" is not good enough. The parser writes
 * parsed_json.coursework straight from the model with no normalising, so untrimmed and duplicate
 * entries reach storage without anyone hand-editing jsonb: a display that only joined would show
 * "  Math  , Math" while the generated resume printed "Math". Each case below is an input where a
 * join-only implementation gave a different answer from the generator. */
test("the displayed line matches what the generator prints, entry for entry", () => {
  assert.equal(courseworkLine(["  Math  ", "Physics"]), "Math, Physics");
  assert.equal(courseworkLine(["Math", "math"]), "Math");
  assert.equal(courseworkLine(["Math", "", "  ", "Physics"]), "Math, Physics");
  // A stored string normalises the same way, so a legacy row reads identically on both sides.
  assert.equal(courseworkLine("  Math ,  Physics , "), "Math, Physics");
  // The separator is the comma alone: "and" and "&" are ordinary content inside one course title.
  assert.equal(
    courseworkLine(["Data Structures and Object-Oriented Design", "Financial Analysis & Valuation"]),
    "Data Structures and Object-Oriented Design, Financial Analysis & Valuation",
  );
});
