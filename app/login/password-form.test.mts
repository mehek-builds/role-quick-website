import test from "node:test";
import assert from "node:assert/strict";
import { passwordFormProblem } from "./password-form.ts";

test("password form enforces the API length boundaries", () => {
  assert.equal(passwordFormProblem("x".repeat(14), "x".repeat(14)), "Use at least 15 characters.");
  assert.equal(passwordFormProblem("x".repeat(15), "x".repeat(15)), null);
  assert.equal(passwordFormProblem("x".repeat(128), "x".repeat(128)), null);
  assert.equal(passwordFormProblem("x".repeat(129), "x".repeat(129)), "Use no more than 128 characters.");
});

test("password form counts normalized Unicode and requires confirmation", () => {
  const decomposed = "Cafe\u0301 private phrase";
  const composed = "Caf\u00e9 private phrase";
  assert.equal(passwordFormProblem(decomposed, composed), null);
  assert.equal(passwordFormProblem(decomposed, "different private phrase"), "Passwords do not match.");
});
