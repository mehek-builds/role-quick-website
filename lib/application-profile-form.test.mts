import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  editableProfileText,
  nullableProfileList,
  nullableProfileText,
} from "./application-profile-form.ts";

describe("application profile form values", () => {
  test("cleared text and list controls become null", () => {
    assert.equal(nullableProfileText(""), null);
    assert.equal(nullableProfileText("   \t"), null);
    assert.equal(nullableProfileList(" ,  , "), null);
  });

  test("text and comma-separated lists round-trip applicant input", () => {
    assert.equal(nullableProfileText("14 weeks"), "14 weeks");
    assert.equal(nullableProfileText("  August 2024  "), "August 2024");
    assert.deepEqual(nullableProfileList("Los Angeles, New York"), ["Los Angeles", "New York"]);
  });

  test("typing preserves a separator until blur normalization", () => {
    assert.equal(editableProfileText("August "), "August ");
    assert.equal(editableProfileText("   "), null);
    assert.equal(nullableProfileText("August "), "August");
  });
});
