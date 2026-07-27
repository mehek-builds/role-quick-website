import test from "node:test";
import assert from "node:assert/strict";
import { passwordFormProblem } from "./password-form.ts";

test("password form enforces the API length boundaries", () => {
  assert.equal(passwordFormProblem("x".repeat(14), "x".repeat(14)), "Use at least 15 characters.");
  assert.equal(passwordFormProblem("x".repeat(15), "x".repeat(15)), null);
  assert.equal(passwordFormProblem("x".repeat(128), "x".repeat(128)), null);
  assert.equal(passwordFormProblem("x".repeat(129), "x".repeat(129)), "Use no more than 128 characters.");
});

test("password form counts normalized Unicode and requires confirmation when given one", () => {
  const decomposed = "Café private phrase";
  const composed = "Café private phrase";
  assert.equal(passwordFormProblem(decomposed, composed), null);
  assert.equal(passwordFormProblem(decomposed, "different private phrase"), "Passwords do not match.");
});

/* Both forms now ship without a Confirm field, so the no-confirmation call is
   the one the product actually makes. The length bounds are the API's and must
   still hold with nothing to compare against. */
test("password form still enforces length with no confirmation to check", () => {
  assert.equal(passwordFormProblem("x".repeat(14)), "Use at least 15 characters.");
  assert.equal(passwordFormProblem("x".repeat(15)), null);
  assert.equal(passwordFormProblem("x".repeat(129)), "Use no more than 128 characters.");
});

/* An empty string is a real answer (the field was left blank) and must not be
   treated as "no confirmation supplied". Guarding on undefined rather than on
   falsiness is what keeps that true. */
test("an empty confirmation is a mismatch, not a skip", () => {
  assert.equal(passwordFormProblem("x".repeat(15), ""), "Passwords do not match.");
});
