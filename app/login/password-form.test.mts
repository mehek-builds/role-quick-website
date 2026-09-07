import test from "node:test";
import assert from "node:assert/strict";
import { passwordFormProblem } from "./password-form.ts";

test("password form enforces the API length boundaries", () => {
  assert.equal(passwordFormProblem("a1!".repeat(4) + "a", "a1!".repeat(4) + "a"), "Use at least 15 characters.");
  assert.equal(passwordFormProblem("a1!".repeat(5), "a1!".repeat(5)), null);
  assert.equal(passwordFormProblem("a1!".repeat(42) + "aa", "a1!".repeat(42) + "aa"), null);
  assert.equal(passwordFormProblem("a1!".repeat(43), "a1!".repeat(43)), "Use no more than 128 characters.");
});

test("password form rejects spaces and requires a number and a symbol", () => {
  assert.equal(passwordFormProblem("a private phrase w1!"), "Remove any spaces or invisible characters from your password.");
  assert.equal(passwordFormProblem("noDigitButSymbol!!!"), "Add at least one number.");
  assert.equal(passwordFormProblem("noSymbolHere1234567"), "Add at least one symbol.");
  assert.equal(passwordFormProblem("correct-horse-batt9"), null);
});

test("password form treats invisible Unicode characters as spaces, not a gap in the no-spaces rule", () => {
  assert.equal(
    passwordFormProblem("correct​horse​battery9!"),
    "Remove any spaces or invisible characters from your password.",
  );
});

test("password form recognizes digits outside the ASCII 0-9 range", () => {
  // Arabic-Indic ١ (U+0661) is a Unicode decimal digit.
  assert.equal(passwordFormProblem("correct-horse-batt١"), null);
});

test("password form counts normalized Unicode and requires confirmation when given one", () => {
  const decomposed = "Café-private-phrase1!";
  const composed = "Café-private-phrase1!";
  assert.equal(passwordFormProblem(decomposed, composed), null);
  assert.equal(passwordFormProblem(decomposed, "different-private-phrase1!"), "Passwords do not match.");
});

/* Both forms now ship without a Confirm field, so the no-confirmation call is
   the one the product actually makes. The length bounds are the API's and must
   still hold with nothing to compare against. */
test("password form still enforces length with no confirmation to check", () => {
  assert.equal(passwordFormProblem("a1!".repeat(4) + "a"), "Use at least 15 characters.");
  assert.equal(passwordFormProblem("a1!".repeat(5)), null);
  assert.equal(passwordFormProblem("a1!".repeat(43)), "Use no more than 128 characters.");
});

/* An empty string is a real answer (the field was left blank) and must not be
   treated as "no confirmation supplied". Guarding on undefined rather than on
   falsiness is what keeps that true. */
test("an empty confirmation is a mismatch, not a skip", () => {
  assert.equal(passwordFormProblem("correct-horse-batt9", ""), "Passwords do not match.");
});
