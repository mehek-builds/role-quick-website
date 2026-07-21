import test from "node:test";
import assert from "node:assert/strict";
import { requestCodeError, verifyCodeError } from "./errors.ts";

test("a verification provider outage never exposes backend error tokens", () => {
  const message = requestCodeError(503, "verification_unavailable");

  assert.match(message, /could not send a sign-in code/i);
  assert.match(message, /try again/i);
  assert.doesNotMatch(message, /verification_/i);
});

test("a blocked legacy session error is never shown to the user", () => {
  const message = requestCodeError(403, "verification_required");

  assert.equal(message, "Could not send a sign-in code. Try again in a minute.");
  assert.doesNotMatch(message, /verification_required/);
});

test("known verification-code errors stay actionable", () => {
  assert.equal(verifyCodeError(400, "Incorrect code."), "Incorrect code.");
  assert.equal(
    verifyCodeError(400, "Code expired or not found. Request a new one."),
    "Code expired or not found. Request a new one.",
  );
});

test("invalid email and request throttling stay specific", () => {
  assert.equal(requestCodeError(400, "anything"), "Enter a valid email address.");
  assert.equal(
    requestCodeError(429, "rate_limited"),
    "Too many sign-in attempts. Wait a few minutes, then try again.",
  );
});

test("verification throttling directs the user to a new code", () => {
  assert.equal(verifyCodeError(429, "rate_limited"), "Too many attempts. Request a new code.");
});

test("unknown backend failures never leak implementation details", () => {
  assert.equal(
    requestCodeError(500, "database_connection_failed"),
    "Could not send a sign-in code. Try again in a minute.",
  );
  assert.equal(
    verifyCodeError(500, "JWT_SIGNING_SECRET not configured"),
    "That code did not work. Request a new one.",
  );
});
