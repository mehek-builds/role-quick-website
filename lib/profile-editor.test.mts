import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasCompleteTargetRoleSet,
  parseEditableLines,
  parseEditableList,
  targetRolesChanged,
} from "./profile-editor.ts";

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
