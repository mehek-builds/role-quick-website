import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ANSWERED_FROM_YOUR_OWN_ANSWERS_CLASSES,
  CONSENT_GRANTS,
  NEVER_ANSWERED_CLASSES,
  consentAcknowledgedAt,
  consentAcknowledgementCompletion,
  consentAcknowledgementGranted,
  consentAcknowledgementGrantedOn,
  consentAcknowledgementPatch,
  consentAcknowledgementVerdict,
  type ConsentAcknowledgementState,
  type ConsentGrantField,
} from "./consent-acknowledgement.ts";

/* FINISHING SETUP MUST NOT REVOKE A PERMISSION IT WAS NEVER TOLD ABOUT.
 *
 * THE DEFECT THIS FILE EXISTS FOR, measured against the account owner's real production row:
 *
 *   finish payload : {"automatic_consent_acceptance_enabled":false,
 *                     "automatic_conduct_acceptance_enabled":false}
 *   row BEFORE     : {"enabled":true,"at":"2026-08-12T13:15:07.000Z","ver":"2026-08-12"}
 *   row AFTER      : {"enabled":false,"at":null,"ver":null}
 *
 * A real, dated, live legal permission destroyed by walking back through onboarding. /start has no
 * completed-user guard, so that is one visit. The API had already written the rule the first
 * version broke: "A writer that did not mention it must not restamp the date, and must not revoke
 * it either."
 *
 * So the property under test is not "the toggle works". It is that no path through this screen can
 * turn a stored true into a stored false without the applicant doing it on purpose.
 */

const PRIVACY: ConsentGrantField = "automatic_consent_acceptance_enabled";
const CONDUCT: ConsentGrantField = "automatic_conduct_acceptance_enabled";

/** Her real row: both granted, dated, current. The state the first version destroyed. */
const HER_LIVE_GRANT: ConsentAcknowledgementState = {
  automatic_consent_acceptance_enabled: true,
  automatic_consent_acceptance_consented_at: "2026-08-12T13:15:07.000Z",
  automatic_conduct_acceptance_enabled: true,
  automatic_conduct_acceptance_consented_at: "2026-08-12T13:15:07.000Z",
};

/** A server that reported the columns and says nothing is granted. */
const NOTHING_GRANTED: ConsentAcknowledgementState = {
  automatic_consent_acceptance_enabled: false,
  automatic_conduct_acceptance_enabled: false,
};

/** An API that predates the columns. Absent, which is NOT the same as false. */
const COLUMN_NOT_REPORTED: ConsentAcknowledgementState = {};

/** What the screen seeds its boxes from, exactly as DoneStep does it. */
function seededFrom(state: ConsentAcknowledgementState): Partial<Record<ConsentGrantField, boolean>> {
  return Object.fromEntries(
    CONSENT_GRANTS.map((grant) => [grant.field, consentAcknowledgementGranted(state, grant.field)]),
  );
}

describe("a live grant survives a second walk through onboarding", () => {
  test("the screen opens showing the permissions she actually holds", () => {
    /* SEEDED FROM THE SERVER, never from a constant. The first version seeded from a hardcoded
     * "nothing granted", which is what made the revocation possible at all. */
    assert.deepEqual(seededFrom(HER_LIVE_GRANT), { [PRIVACY]: true, [CONDUCT]: true });
  });

  test("finishing without touching anything sends no revocation", () => {
    // THE ASSERTION THE WHOLE FILE IS FOR. Reverted, this reports two explicit falses.
    const payload = consentAcknowledgementCompletion(HER_LIVE_GRANT, seededFrom(HER_LIVE_GRANT));
    assert.deepEqual(payload, { [PRIVACY]: true, [CONDUCT]: true });
    assert.notEqual(payload[PRIVACY], false);
    assert.notEqual(payload[CONDUCT], false);
  });

  test("and her grant date is never restamped by a screen that changed nothing", () => {
    // The date is what the permission is defined by. It is not in the payload at all, so finishing
    // setup cannot move it.
    const payload = consentAcknowledgementCompletion(HER_LIVE_GRANT, seededFrom(HER_LIVE_GRANT));
    assert.equal("automatic_consent_acceptance_consented_at" in payload, false);
    assert.equal("automatic_conduct_acceptance_consented_at" in payload, false);
  });

  test("she can still revoke, deliberately, by unticking", () => {
    /* The other direction, so the fix cannot pass by making revocation impossible. This is the ONE
     * path that may produce a false, and it requires the server to have reported the column, so the
     * screen is refusing something it was actually shown. */
    const payload = consentAcknowledgementCompletion(HER_LIVE_GRANT, { [PRIVACY]: false, [CONDUCT]: true });
    assert.deepEqual(payload, { [PRIVACY]: false, [CONDUCT]: true });
  });
});

describe("an API that never reported the column is not a revocation", () => {
  test("nothing at all is sent for an unreported column", () => {
    /* THE ROLLING-DEPLOY CASE, and it is the one that is invisible in a screenshot. GET can land on
     * an instance that predates these columns while POST lands on one that does not. Absent reads
     * as not granted for DISPLAY, and writing that back as false revokes whatever is really stored,
     * decided by a screen that was never shown the real value. */
    assert.deepEqual(consentAcknowledgementCompletion(COLUMN_NOT_REPORTED, seededFrom(COLUMN_NOT_REPORTED)), {});
    assert.deepEqual(consentAcknowledgementCompletion(COLUMN_NOT_REPORTED, {}), {});
  });

  test("but a box she ticked is always sent, even then", () => {
    // A tick is a grant she just performed, whatever the server did or did not report.
    assert.deepEqual(
      consentAcknowledgementCompletion(COLUMN_NOT_REPORTED, { [PRIVACY]: true }),
      { [PRIVACY]: true },
    );
  });

  test("a reported false IS sent, so an honest refusal is recorded", () => {
    // Without this the fix would pass by never sending anything, and an applicant who declined
    // would have no record of declining.
    assert.deepEqual(
      consentAcknowledgementCompletion(NOTHING_GRANTED, seededFrom(NOTHING_GRANTED)),
      { [PRIVACY]: false, [CONDUCT]: false },
    );
  });

  test("absent and false are genuinely different values, not two spellings of one", () => {
    assert.equal(consentAcknowledgementVerdict(COLUMN_NOT_REPORTED, PRIVACY), undefined);
    assert.equal(consentAcknowledgementVerdict(NOTHING_GRANTED, PRIVACY), false);
    assert.equal(consentAcknowledgementVerdict(HER_LIVE_GRANT, PRIVACY), true);
    assert.equal(consentAcknowledgementVerdict({ automatic_consent_acceptance_enabled: null }, PRIVACY), undefined);
  });
});

describe("the two grants stay independent", () => {
  test("a patch names exactly one field", () => {
    /* The API reads an omitted key as "leave it alone" and an explicit false as a revocation, so a
     * patch naming both would revoke the one she never touched. */
    assert.deepEqual(consentAcknowledgementPatch(PRIVACY, true), { [PRIVACY]: true });
    assert.deepEqual(Object.keys(consentAcknowledgementPatch(CONDUCT, false)), [CONDUCT]);
  });

  test("revoking one leaves the other standing", () => {
    const payload = consentAcknowledgementCompletion(HER_LIVE_GRANT, { [PRIVACY]: false, [CONDUCT]: true });
    assert.equal(payload[PRIVACY], false);
    assert.equal(payload[CONDUCT], true);
  });

  test("granting one does not grant the other", () => {
    const payload = consentAcknowledgementCompletion(NOTHING_GRANTED, { [PRIVACY]: true });
    assert.equal(payload[PRIVACY], true);
    assert.equal(payload[CONDUCT], false, "the untouched grant keeps the server's reported answer");
  });
});

describe("the date shown beside a grant", () => {
  test("a granted permission prints the day the record names, in UTC", () => {
    const printed = consentAcknowledgementGrantedOn(true, "2026-08-12T13:15:07.000Z");
    assert.ok(printed);
    assert.equal(printed, new Date("2026-08-12T13:15:07.000Z").toLocaleDateString(undefined, { timeZone: "UTC" }));
  });

  test("a date with a false verdict prints nothing", () => {
    /* That pairing is what a superseded consent version looks like. Printing the old date over an
     * unticked box would claim a permission the server refuses to honour. */
    assert.equal(consentAcknowledgementGrantedOn(false, "2026-08-12T13:15:07.000Z"), null);
  });

  test("a nonsense date prints nothing rather than Invalid Date", () => {
    assert.equal(consentAcknowledgementGrantedOn(true, "not-a-date"), null);
    assert.equal(consentAcknowledgementGrantedOn(true, null), null);
  });

  test("the date is read from the field the server actually sends", () => {
    assert.equal(consentAcknowledgedAt(HER_LIVE_GRANT, "automatic_consent_acceptance_consented_at"), "2026-08-12T13:15:07.000Z");
    assert.equal(consentAcknowledgedAt(COLUMN_NOT_REPORTED, "automatic_conduct_acceptance_consented_at"), null);
  });
});

describe("the scope on the screen describes what the backend actually does", () => {
  /* AN EARLIER DRAFT SAID SOMETHING FALSE HERE, on the one screen that must not contain a false
   * statement about the product. It listed work authorization, visa sponsorship and demographic
   * questions under "Litos will never answer these for you". Measured against the real resolver
   * with the six-argument production call and a populated profile, all four are ANSWERED, from
   * declarations she made herself. */
  const never = NEVER_ANSWERED_CLASSES.join(" | ").toLowerCase();
  const own = ANSWERED_FROM_YOUR_OWN_ANSWERS_CLASSES.join(" | ").toLowerCase();

  test("the never-answered list holds only classes the backend never answers", () => {
    for (const required of ["true and complete", "health", "disability", "accommodation", "criminal", "background", "references", "cannot positively identify"]) {
      assert.ok(never.includes(required), `the never-answered list must name: ${required}`);
    }
  });

  test("the classes the backend DOES answer are not claimed as never answered", () => {
    // The specific correction. These four were in the wrong list.
    for (const answered of ["work authorization", "sponsorship", "veteran", "gender"]) {
      assert.ok(!never.includes(answered), `"${answered}" is answered, so it must not be listed as never answered`);
      assert.ok(own.includes(answered), `"${answered}" must be disclosed as answered from her own answers`);
    }
  });

  test("both lists are non-empty, so neither assertion above is vacuous", () => {
    assert.ok(NEVER_ANSWERED_CLASSES.length >= 4);
    assert.ok(ANSWERED_FROM_YOUR_OWN_ANSWERS_CLASSES.length >= 2);
  });

  test("each grant names the documents it covers and they are not the same words", () => {
    assert.equal(CONSENT_GRANTS.length, 2);
    for (const grant of CONSENT_GRANTS) {
      assert.ok(grant.label.trim().length > 0);
      assert.ok(grant.body.trim().length > 40, `${grant.field} needs a real description`);
    }
    assert.notEqual(CONSENT_GRANTS[0].body, CONSENT_GRANTS[1].body);
  });
});
