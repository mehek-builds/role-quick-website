import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { resumeContactStaleIdentity, resumeContactStaleNotice, type ResumeContactStaleLike } from "./resume-contact-stale.ts";

/* THE MEASURED FIXTURE, PINNED. Live on trylitos.com, 2026-09-04: packets built while the account
   read Dubai/+971 still carry that header on GET /applications/:id/submission after the applicant's
   profile moved to Los Angeles/+1. Kept byte-identical to the backend's own fixture in
   volley-backend src/lib/resumeContactOfRecord.test.ts so a divergence between the two repos'
   understanding of the shape would show up as a fixture that no longer matches production. */
const DUBAI_STORED = {
  full_name: "Test Applicant",
  email: "resume@example.com",
  phone: "+971 567417451",
  location: "Dubai, Dubai",
};
const LOS_ANGELES_CURRENT = {
  full_name: "Test Applicant",
  email: "resume@example.com",
  phone: "+1 213 574 6270",
  location: "Los Angeles, California",
};
const STALE: ResumeContactStaleLike = { stored: DUBAI_STORED, current: LOS_ANGELES_CURRENT };

describe("resumeContactStaleNotice", () => {
  test("a submission carrying the field surfaces the exact stored/current pair", () => {
    assert.deepEqual(
      resumeContactStaleNotice({ resume_contact_stale: STALE }),
      STALE,
    );
  });

  test("no field at all - the common case, and every packet on an older backend - is not stale", () => {
    assert.equal(resumeContactStaleNotice({}), null);
    assert.equal(resumeContactStaleNotice({ resume_contact_stale: undefined }), null);
  });

  test("null and undefined submissions are not stale, so a caller need not guard first", () => {
    assert.equal(resumeContactStaleNotice(null), null);
    assert.equal(resumeContactStaleNotice(undefined), null);
  });

  /* THE DEFENSIVE HALF. A field this client does not understand - wrong shape, a future backend
     revision, a stray array - must read as "nothing to show her", never as a crash that takes the
     packet screen or the send screen down with it. */
  test("a malformed value is read as no signal, not as an error", () => {
    assert.equal(resumeContactStaleNotice({ resume_contact_stale: "stale" }), null);
    assert.equal(resumeContactStaleNotice({ resume_contact_stale: 1 }), null);
    assert.equal(resumeContactStaleNotice({ resume_contact_stale: [] }), null);
    assert.equal(resumeContactStaleNotice({ resume_contact_stale: null }), null);
  });

  test("only one half of the pair present is not a notice either half could render honestly", () => {
    assert.equal(resumeContactStaleNotice({ resume_contact_stale: { stored: DUBAI_STORED } }), null);
    assert.equal(resumeContactStaleNotice({ resume_contact_stale: { current: LOS_ANGELES_CURRENT } }), null);
    assert.equal(
      resumeContactStaleNotice({ resume_contact_stale: { stored: "nope", current: LOS_ANGELES_CURRENT } }),
      null,
    );
  });
});

describe("resumeContactStaleIdentity", () => {
  test("no signal has one stable identity, so absent and cleared compare equal", () => {
    assert.equal(resumeContactStaleIdentity(null), resumeContactStaleIdentity(undefined));
    assert.equal(resumeContactStaleIdentity(null), "");
  });

  test("a real signal has a different identity from no signal", () => {
    assert.notEqual(resumeContactStaleIdentity(STALE), resumeContactStaleIdentity(null));
  });

  test("the same pair, a new object each time, is the same identity - the poll must dedupe", () => {
    const nextTick: ResumeContactStaleLike = { stored: { ...DUBAI_STORED }, current: { ...LOS_ANGELES_CURRENT } };
    assert.equal(resumeContactStaleIdentity(STALE), resumeContactStaleIdentity(nextTick));
  });

  test("a resolved staleness (the applicant pressed refresh) is a different identity from the stale one", () => {
    const resolved: ResumeContactStaleLike = { stored: LOS_ANGELES_CURRENT, current: LOS_ANGELES_CURRENT };
    assert.notEqual(resumeContactStaleIdentity(STALE), resumeContactStaleIdentity(resolved));
  });

  test("a second, unrelated drift (a new city) is also a different identity", () => {
    const movedAgain: ResumeContactStaleLike = {
      stored: LOS_ANGELES_CURRENT,
      current: { ...LOS_ANGELES_CURRENT, location: "Austin, Texas" },
    };
    assert.notEqual(resumeContactStaleIdentity(STALE), resumeContactStaleIdentity(movedAgain));
  });

  /* full_name and email never move (see refreshResumeContactFromProfile on the backend), so they
     are not what makes two headers differ in practice - but the identity still reads every named
     field, and a header pair that differs ONLY in a field outside phone/location/links must still
     compare unequal: this identity's contract is "these two objects are byte-different", not
     "these two objects differ in a field the backend currently allows to move". */
  test("a difference confined to full_name or email still changes the identity", () => {
    const renamed: ResumeContactStaleLike = {
      stored: DUBAI_STORED,
      current: { ...LOS_ANGELES_CURRENT, full_name: "A Different Name" },
    };
    assert.notEqual(resumeContactStaleIdentity(STALE), resumeContactStaleIdentity(renamed));
  });
});
