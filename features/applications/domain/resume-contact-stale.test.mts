import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  resumeContactRefreshBlockedReason,
  resumeContactStaleIdentity,
  resumeContactStaleNotice,
  type ResumeContactStaleLike,
} from "./resume-contact-stale.ts";

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

/* MIRRORS volley-backend's reviewAnswerSaveDisposition (src/lib/submissionSafety.ts), the SAME
 * disposition PR #945 wires POST /applications/:id/resume/contact-refresh through. A status this
 * suite says is available and the backend refuses is a client that offers a control it 409s; a
 * status this suite blocks and the backend accepts is a control that was reachable and is now
 * hidden for nothing - both directions matter equally here. */
describe("resumeContactRefreshBlockedReason", () => {
  test("the ordinary editable statuses are available", () => {
    for (const status of ["resume_ready", "questions_ready", "ready_to_submit", "needs_attention"]) {
      assert.equal(resumeContactRefreshBlockedReason({ status }), null, status);
    }
  });

  test("an unclaimed submit_requested row is available - only a claim makes it a run in progress", () => {
    assert.equal(resumeContactRefreshBlockedReason({ status: "submit_requested" }), null);
  });

  test("a claimed submit_requested row is blocked as a run in progress", () => {
    assert.ok(resumeContactRefreshBlockedReason({ status: "submit_requested", submission_claimed_at: "2026-09-04T00:00:00Z" }));
  });

  test("preparing, filling, submitting and submission_claimed are all blocked as a run in progress", () => {
    for (const status of ["preparing", "filling", "submitting", "submission_claimed"]) {
      assert.ok(resumeContactRefreshBlockedReason({ status }), status);
    }
  });

  /* THE STATUS THIS PR SHIPPED THE CHECKLIST-SCREEN NOTICE FOR, AND THE ONE THE BACKEND NEVER
   * ACCEPTS: reviewAnswerSaveDisposition refuses ready_for_final_approval unconditionally, with no
   * exception for an unclaimed row - "the picture she is previewing must not change under her" is
   * the same reason PUT /review/answers refuses it. */
  test("ready_for_final_approval is always blocked, claimed or not", () => {
    assert.ok(resumeContactRefreshBlockedReason({ status: "ready_for_final_approval" }));
    assert.ok(resumeContactRefreshBlockedReason({ status: "ready_for_final_approval", submission_claimed_at: "2026-09-04T00:00:00Z" }));
  });

  test("submitted and awaiting_security_code are blocked - the record of what the employer was given", () => {
    assert.ok(resumeContactRefreshBlockedReason({ status: "submitted" }));
    assert.ok(resumeContactRefreshBlockedReason({ status: "awaiting_security_code" }));
  });

  /* employerMayHoldApplication, ported: each of these four facts independently means the employer
   * may already hold the application, regardless of what the status column says - a needs_attention
   * row carrying one of these is not the ordinary stopped run reviewAnswerSaveDisposition exists to
   * keep saveable. */
  test("evidence the employer may already hold the application blocks an otherwise-open status", () => {
    assert.ok(resumeContactRefreshBlockedReason({ status: "needs_attention", receipt: { confirmation_text: "x" } }));
    assert.ok(resumeContactRefreshBlockedReason({ status: "needs_attention", security_code: { digits: 8 } }));
    assert.ok(resumeContactRefreshBlockedReason({ status: "needs_attention", unverified_submission: {} }));
    assert.ok(resumeContactRefreshBlockedReason({ status: "needs_attention", submission_attempted_at: "2026-09-04T00:00:00Z" }));
  });

  /* lookedAndNotThere: she looked, in her own portal or mailbox, and it was not there. The one
   * resolution that clears the evidence rather than confirming it - same rule
   * employerMayHoldApplication itself is built from. */
  test("an unverified submission she already resolved as not_sent does not block", () => {
    assert.equal(
      resumeContactRefreshBlockedReason({
        status: "needs_attention",
        unverified_submission: { resolution: "not_sent" },
        submission_attempted_at: "2026-09-04T00:00:00Z",
      }),
      null,
    );
  });

  test("an unverified submission resolved as sent still blocks", () => {
    assert.ok(resumeContactRefreshBlockedReason({
      status: "needs_attention",
      unverified_submission: { resolution: "sent" },
    }));
  });
});
