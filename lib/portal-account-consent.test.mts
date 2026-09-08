import assert from "node:assert/strict";
import test from "node:test";
import {
  PORTAL_ACCOUNT_CONSENT_BOUNDARY,
  PORTAL_ACCOUNT_CONSENT_CARRIES,
  PORTAL_ACCOUNT_CONSENT_COPY,
  PORTAL_ACCOUNT_CONSENT_INTRO,
  PORTAL_ACCOUNT_CONSENT_REVOCABLE,
  PORTAL_ACCOUNT_CONSENT_WHEN_OFF,
  portalAccountConsentCompletion,
  portalAccountConsentedAt,
  portalAccountConsentedAtReported,
  portalAccountConsentGranted,
  portalAccountConsentGrantedOn,
  portalAccountConsentPatch,
  portalAccountConsentVerdict,
} from "./portal-account-consent.ts";

/* An account holding the grant against the wording that is live now. */
const granted = {
  automatic_account_creation_enabled: true,
  automatic_account_creation_consented_at: "2026-09-08T09:14:00.000Z",
  automatic_account_creation_consent_version: "2026-09-08",
};

/* THE STALE GRANT, and it is the case this module exists for. Not hypothetical: the backend
 * constant moved 2026-08-19 -> 2026-09-08 on the day Workday's password-mandatory signup widened the
 * act, so every account that granted the old no-password wording is in exactly this state. The box
 * really was ticked, on a real day. The API's version check answers false while the original date
 * stays on the row and on the wire. */
const stale = {
  automatic_account_creation_enabled: false,
  automatic_account_creation_consented_at: "2026-08-19T09:14:00.000Z",
  automatic_account_creation_consent_version: "2026-08-19",
};

/* An API that predates the column: it sends neither the verdict nor the date. Absent is not false. */
const unreported = {};

test("the verdict is read from the server's field and never re-derived from the date", () => {
  assert.equal(portalAccountConsentGranted(granted), true);
  // The whole point: a real date sitting beside a false verdict must not read as granted.
  assert.equal(portalAccountConsentGranted(stale), false);
  assert.equal(portalAccountConsentedAt(stale), "2026-08-19T09:14:00.000Z");
  assert.equal(portalAccountConsentGranted(unreported), false);
  assert.equal(portalAccountConsentGranted(null), false);
});

test("not sent stays distinct from sent-as-false", () => {
  assert.equal(portalAccountConsentVerdict(granted), true);
  assert.equal(portalAccountConsentVerdict(stale), false);
  assert.equal(portalAccountConsentVerdict(unreported), undefined);
  assert.equal(portalAccountConsentVerdict({ automatic_account_creation_enabled: null }), undefined);
});

test("not sent stays distinct from sent-as-null for the date", () => {
  assert.equal(portalAccountConsentedAtReported(granted), "2026-09-08T09:14:00.000Z");
  assert.equal(portalAccountConsentedAtReported(unreported), undefined);
  assert.equal(portalAccountConsentedAtReported({ automatic_account_creation_consented_at: null }), null);
  // Collapsed for display, where the difference is not wanted.
  assert.equal(portalAccountConsentedAt(unreported), null);
});

test("no date is printed beside a permission the server does not honour", () => {
  assert.equal(portalAccountConsentGrantedOn(true, granted.automatic_account_creation_consented_at), new Date(granted.automatic_account_creation_consented_at).toLocaleDateString(undefined, { timeZone: "UTC" }));
  // The stale row: a real date, a false verdict, and nothing printed.
  assert.equal(portalAccountConsentGrantedOn(false, stale.automatic_account_creation_consented_at), null);
  assert.equal(portalAccountConsentGrantedOn(true, null), null);
  assert.equal(portalAccountConsentGrantedOn(true, "not a date"), null);
});

test("the patch names exactly one column, so a neighbouring grant is never revoked", () => {
  assert.deepEqual(portalAccountConsentPatch(true), { automatic_account_creation_enabled: true });
  assert.deepEqual(portalAccountConsentPatch(false), { automatic_account_creation_enabled: false });
  assert.deepEqual(Object.keys(portalAccountConsentPatch(true)), ["automatic_account_creation_enabled"]);
});

test("re-affirming a grant she already holds is not an act, and does not re-date it", () => {
  // The defect consent-acknowledgement.ts was rewritten to remove, asserted here before it can recur:
  // a redundant true would move consented_at to today on a permission whose date is the record of an
  // act that already created accounts.
  assert.deepEqual(portalAccountConsentCompletion(granted, true), {});
});

test("a stale-version re-grant restamps, because she is agreeing to different words", () => {
  assert.deepEqual(portalAccountConsentCompletion(stale, true), { automatic_account_creation_enabled: true });
});

test("a new grant is sent", () => {
  assert.deepEqual(
    portalAccountConsentCompletion({ automatic_account_creation_enabled: false }, true),
    { automatic_account_creation_enabled: true },
  );
});

test("setup never revokes a permission it was never told about", () => {
  // The column was not reported at all: writing false back would revoke whatever is really stored,
  // decided by a screen that was never shown the real value.
  assert.deepEqual(portalAccountConsentCompletion(unreported, false), {});
  // Reported, so an unticked box is a deliberate revocation and is recorded as one.
  assert.deepEqual(portalAccountConsentCompletion(granted, false), { automatic_account_creation_enabled: false });
  // Nothing chosen at all: a partial caller names only what the applicant changed.
  assert.deepEqual(portalAccountConsentCompletion(granted, undefined), {});
});

test("the copy states the act, both sign-in shapes, and both boundaries", () => {
  // Four things the permission carries, matching the backend constant's own list.
  assert.equal(PORTAL_ACCOUNT_CONSENT_CARRIES.length, 4);
  const carries = PORTAL_ACCOUNT_CONSENT_CARRIES.join(" ");
  // The two sign-in shapes the API records per platform as `method`.
  assert.match(carries, /one-time code/i);
  assert.match(carries, /encrypted/i);
  // Clause 1 of THE BAR is absolute, and the words have to say so.
  assert.match(carries, /human check/i);
  // Opening an account is not a licence to send.
  assert.match(carries, /separate permission/i);
  // The off state is printed rather than implied.
  assert.match(PORTAL_ACCOUNT_CONSENT_WHEN_OFF, /nothing is opened in your name/i);
  // THE load-bearing sentence: an account outlives the permission that authorised it.
  assert.match(PORTAL_ACCOUNT_CONSENT_BOUNDARY, /does not close it/i);
  assert.match(PORTAL_ACCOUNT_CONSENT_REVOCABLE, /turn this off at any time/i);
  assert.match(PORTAL_ACCOUNT_CONSENT_INTRO, /leaves something behind/i);
  assert.match(PORTAL_ACCOUNT_CONSENT_COPY.label, /employer accounts/i);
});
