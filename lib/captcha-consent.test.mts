import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPTCHA_CONSENT_BOUNDARY,
  CAPTCHA_CONSENT_COPY,
  CAPTCHA_CONSENT_INTRO,
  CAPTCHA_CONSENT_REVOCABLE,
  CAPTCHA_CONSENT_WHEN_OFF,
  captchaConsentCompletion,
  captchaConsentedAt,
  captchaConsentedAtReported,
  captchaConsentGranted,
  captchaConsentGrantedOn,
  captchaConsentPatch,
  captchaConsentVerdict,
} from "./captcha-consent.ts";

/* The shape GET /onboarding/state sends for an account that granted this on 2026-08-12 against the
 * wording that is live now. */
const granted = {
  automatic_captcha_enabled: true,
  automatic_captcha_consented_at: "2026-08-12T09:14:00.000Z",
  automatic_captcha_consent_version: "2026-08-04",
};

/* THE STALE GRANT, and it is the case this module exists for. It is also not hypothetical: roughly
 * 25 production accounts are in exactly this state, stamped by a branch that migrated production and
 * never merged. The box really was ticked, on a real day. The constant has since moved, so the API's
 * version check answers false while the original date stays on the row and on the wire. */
const stale = {
  automatic_captcha_enabled: false,
  automatic_captcha_consented_at: "2026-08-04T11:02:00.000Z",
  automatic_captcha_consent_version: "2026-08-04",
};

test("a grant is the server's verdict, never a date on the row", () => {
  assert.equal(captchaConsentGranted(granted), true);
  // A date is present here and it is not a grant.
  assert.equal(captchaConsentGranted(stale), false);
  assert.equal(captchaConsentedAt(stale), "2026-08-04T11:02:00.000Z");
});

test("a superseded grant prints no date, so no account is shown a permission the server refuses", () => {
  assert.equal(captchaConsentGrantedOn(captchaConsentGranted(stale), captchaConsentedAt(stale)), null);
  // The live grant does print one.
  assert.notEqual(captchaConsentGrantedOn(captchaConsentGranted(granted), captchaConsentedAt(granted)), null);
});

test("an unparseable date is no date rather than an Invalid Date on screen", () => {
  assert.equal(captchaConsentGrantedOn(true, "not-a-date"), null);
  assert.equal(captchaConsentGrantedOn(true, null), null);
});

/* The one place `undefined` and `false` are different answers: an API deployed before this column
 * omits the field, and a screen hydrating from that response must keep what it had rather than read
 * the silence as a revocation. */
test("an API that predates the column is not a revocation", () => {
  assert.equal(captchaConsentVerdict({}), undefined);
  assert.equal(captchaConsentVerdict(undefined), undefined);
  assert.equal(captchaConsentVerdict({ automatic_captcha_enabled: null }), undefined);
  assert.equal(captchaConsentVerdict({ automatic_captcha_enabled: false }), false);
  // Everywhere a grant is DECIDED, absent is simply not granted.
  assert.equal(captchaConsentGranted({}), false);
});

/* SETUP MUST NOT REVOKE A PERMISSION IT WAS NEVER TOLD ABOUT. The unticked box means "you do not
 * hold this" only when the server actually said so; when the column is missing it means "this build
 * cannot see the column", and writing false from that is a revocation decided by a screen that was
 * never shown the real value. Reachable during a rolling deploy, where GET can land on an old
 * instance and POST on a new one. */
test("completion omits the field when the server never reported it", () => {
  assert.deepEqual(captchaConsentCompletion({}, false), {});
  assert.deepEqual(captchaConsentCompletion(undefined, false), {});
  assert.deepEqual(captchaConsentCompletion({ automatic_captcha_enabled: null }, false), {});
});

test("completion sends a ticked box as true even when the server said nothing", () => {
  // A tick is a grant just performed, so it is never silence.
  assert.deepEqual(captchaConsentCompletion({}, true), { automatic_captcha_enabled: true });
  assert.deepEqual(captchaConsentCompletion(stale, true), { automatic_captcha_enabled: true });
});

test("completion sends an explicit false only against a server that reported the column", () => {
  // Reported as false: unticking is a real choice about a real value, so say so.
  assert.deepEqual(captchaConsentCompletion(stale, false), { automatic_captcha_enabled: false });
  // Reported as true and then unticked: a revocation the applicant performed.
  assert.deepEqual(captchaConsentCompletion(granted, false), { automatic_captcha_enabled: false });
});

/* "Not sent" and "sent as null" are different answers when reconciling against a write response,
 * exactly as they are for the verdict. */
test("the reported date keeps absent distinct from null", () => {
  assert.equal(captchaConsentedAtReported({}), undefined);
  assert.equal(captchaConsentedAtReported({ automatic_captcha_consented_at: null }), null);
  assert.equal(captchaConsentedAtReported(granted), "2026-08-12T09:14:00.000Z");
  // The display accessor still collapses both to null, which is what a screen printing a date wants.
  assert.equal(captchaConsentedAt({}), null);
});

/* The date names the day the RECORD names, not the day the viewer is standing in. Without the UTC
 * zone this prints 8/11 for anyone far enough west of the stamped instant. */
test("the grant date is rendered in UTC, not the viewer's timezone", () => {
  /* Asserted as the calendar day itself rather than against another toLocaleDateString call, which
     would restate the implementation instead of checking it. Run this file under TZ=Pacific/Honolulu
     and both of these slide back a day without the UTC zone. */
  const stamped = captchaConsentGrantedOn(true, "2026-08-12T09:14:00.000Z");
  assert.ok(stamped?.includes("12"), `expected the 12th, printed ${stamped}`);
  // A date-only value parses as UTC midnight, the case that slides everywhere west of UTC.
  const dateOnly = captchaConsentGrantedOn(true, "2026-08-04");
  assert.ok(dateOnly?.includes("4"), `expected the 4th, printed ${dateOnly}`);
});

test("the patch names one column and only its own", () => {
  assert.deepEqual(captchaConsentPatch(true), { automatic_captcha_enabled: true });
  // Revocation is explicit, because an omitted field means "leave it alone" to the server.
  assert.deepEqual(captchaConsentPatch(false), { automatic_captcha_enabled: false });
  assert.deepEqual(Object.keys(captchaConsentPatch(true)), ["automatic_captcha_enabled"]);
});

/* The copy IS the consent, so these assert the two claims that make it honest rather than asserting
 * prose verbatim. If a reword drops either one, the words no longer describe the code. */
test("the copy says Litos never solves the check and that clearing it stays with the applicant", () => {
  assert.match(CAPTCHA_CONSENT_INTRO, /Litos never solves it/);
  assert.match(CAPTCHA_CONSENT_INTRO, /you clear it yourself, in your own browser/);
  assert.match(CAPTCHA_CONSENT_BOUNDARY, /never solves the check, never reads its token/);
  assert.match(CAPTCHA_CONSENT_BOUNDARY, /it stays yours/);
});

test("the copy separates resuming from sending, and says what off still does", () => {
  assert.match(CAPTCHA_CONSENT_BOUNDARY, /sends nothing/);
  assert.match(CAPTCHA_CONSENT_BOUNDARY, /separate permission/);
  // Off is not silence: the stall line is written before this permission is ever read.
  assert.match(CAPTCHA_CONSENT_WHEN_OFF, /still tells you the check is there/);
  assert.match(CAPTCHA_CONSENT_REVOCABLE, /turn this off at any time in Settings/);
});

test("the label is a permission in the first person, not a description of a feature", () => {
  assert.match(CAPTCHA_CONSENT_COPY.label, /^Pick my application back up after I clear a check$/);
});
