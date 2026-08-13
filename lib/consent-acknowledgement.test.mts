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

/* THE BACKEND'S OWN WRITE RULE, modelled so a test can assert the RESULTING ROW rather than the
 * shape of the payload. Transcribed from volley-backend src/routes/onboarding.ts:
 *
 *   if (parsed.data.<field> !== undefined) {
 *     patch.<field>                 = value;
 *     patch.<field>_consented_at    = value ? now : null;
 *     patch.<field>_consent_version = value ? VERSION : null;
 *   }
 *
 * An absent key is not written at all. A true stamps `now` UNCONDITIONALLY, which is the whole
 * reason a redundant true is destructive: the backend has no idea the value did not change.
 *
 * Modelled rather than imported because the two repos do not share a package. The transcription is
 * four lines and the shape it encodes is the documented contract of that route.
 */
const NOW = "2026-08-13T10:00:00.000Z";

function applyToRow(
  row: ConsentAcknowledgementState,
  payload: Partial<Record<ConsentGrantField, boolean>>,
  now = NOW,
): ConsentAcknowledgementState {
  const next: Record<string, unknown> = { ...row };
  for (const grant of CONSENT_GRANTS) {
    if (!(grant.field in payload)) continue;
    const value = payload[grant.field] === true;
    next[grant.field] = value;
    next[grant.grantedAtField] = value ? now : null;
  }
  return next as ConsentAcknowledgementState;
}

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

  test("finishing without touching anything writes nothing at all", () => {
    /* THE ASSERTION THE WHOLE FILE IS FOR. She changed nothing, so the payload has nothing to say.
     * Reverted to the first version this reported two explicit falses; reverted to the second it
     * reported two redundant trues, which the backend turns into a date rewrite. */
    const payload = consentAcknowledgementCompletion(HER_LIVE_GRANT, seededFrom(HER_LIVE_GRANT));
    assert.deepEqual(payload, {});
  });

  test("and her grant DATE survives, asserted on the row the backend would end up with", () => {
    /* THE PREVIOUS VERSION OF THIS TEST COULD NOT FAIL. It asserted
     * `"..._consented_at" in payload === false`, but consentAcknowledgementCompletion only ever
     * writes the two `_enabled` keys, so a `_consented_at` key was impossible for every input. The
     * date is absent from the payload because the BACKEND derives it, and the payload that was
     * being sent is exactly what triggered the rewrite. So the assertion has to be on the ROW. */
    const payload = consentAcknowledgementCompletion(HER_LIVE_GRANT, seededFrom(HER_LIVE_GRANT));
    const after = applyToRow(HER_LIVE_GRANT, payload);

    assert.equal(after.automatic_consent_acceptance_enabled, true, "the grant must still stand");
    assert.equal(after.automatic_conduct_acceptance_enabled, true);
    assert.equal(
      after.automatic_consent_acceptance_consented_at,
      "2026-08-12T13:15:07.000Z",
      "the privacy grant date was rewritten by a screen that changed nothing",
    );
    assert.equal(
      after.automatic_conduct_acceptance_consented_at,
      "2026-08-12T13:15:07.000Z",
      "the conduct grant date was rewritten by a screen that changed nothing",
    );
    // And the model is capable of moving a date, so the assertion above is not vacuous.
    assert.equal(
      applyToRow(HER_LIVE_GRANT, { [PRIVACY]: true }).automatic_consent_acceptance_consented_at,
      NOW,
    );
  });

  test("a stale-version re-grant DOES restamp, which is the case the fix must not break", () => {
    /* A row enabled against superseded wording: the API version-checks it and verdicts FALSE, so
     * the box arrives unticked and ticking it is a real act against new words. It must send true
     * and take today's date. Reading a raw column instead of the verdict would break exactly this. */
    const stale: ConsentAcknowledgementState = {
      automatic_consent_acceptance_enabled: false,
      automatic_consent_acceptance_consented_at: "2026-08-04T00:00:00.000Z",
    };
    const payload = consentAcknowledgementCompletion(stale, { [PRIVACY]: true });
    assert.deepEqual(payload, { [PRIVACY]: true });
    assert.equal(applyToRow(stale, payload).automatic_consent_acceptance_consented_at, NOW);
  });

  test("she can still revoke, deliberately, by unticking", () => {
    /* The other direction, so the fix cannot pass by making revocation impossible. This is the ONE
     * path that may produce a false, and it requires the server to have reported the column, so the
     * screen is refusing something it was actually shown. */
    const payload = consentAcknowledgementCompletion(HER_LIVE_GRANT, { [PRIVACY]: false, [CONDUCT]: true });
    // The conduct grant is omitted, not re-sent: she left it exactly as it was, and naming it would
    // move its date. The privacy revocation is the only thing that changed and the only thing sent.
    assert.deepEqual(payload, { [PRIVACY]: false });
    const after = applyToRow(HER_LIVE_GRANT, payload);
    assert.equal(after.automatic_consent_acceptance_enabled, false, "the revocation must land");
    assert.equal(after.automatic_consent_acceptance_consented_at, null, "and clear its date");
    assert.equal(after.automatic_conduct_acceptance_enabled, true, "the other grant must stand");
    assert.equal(
      after.automatic_conduct_acceptance_consented_at,
      "2026-08-12T13:15:07.000Z",
      "and must keep its own date",
    );
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

  test("revoking one leaves the other standing, and untouched", () => {
    const payload = consentAcknowledgementCompletion(HER_LIVE_GRANT, { [PRIVACY]: false, [CONDUCT]: true });
    assert.equal(payload[PRIVACY], false);
    assert.equal(CONDUCT in payload, false, "an unchanged grant must not be named at all");
    assert.equal(
      applyToRow(HER_LIVE_GRANT, payload).automatic_conduct_acceptance_consented_at,
      "2026-08-12T13:15:07.000Z",
    );
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
    for (const required of ["true and complete", "health", "medical", "accommodation", "criminal", "background", "references", "cannot positively identify"]) {
      assert.ok(never.includes(required), `the never-answered list must name: ${required}`);
    }
  });

  test("no subject is claimed by both lists, or the screen contradicts itself", () => {
    /* "Disability" was in BOTH. Each line was individually true, medical disclosure in one and EEO
     * self-identification in the other, but on a legal-permission screen the pair reads as a
     * contradiction and the applicant has no way to tell which one governs her. The health line now
     * names health, and the self-identification line names the EEO block it belongs to. */
    for (const subject of ["disab", "veteran", "gender", "race", "work authorization", "sponsorship"]) {
      assert.ok(
        !(never.includes(subject) && own.includes(subject)),
        `"${subject}" appears in both lists, which reads as a contradiction`,
      );
    }
    // And specifically: the word that caused it lives in exactly one of them now.
    assert.ok(!never.includes("disab"), "the never-answered list must not claim disability questions");
    assert.ok(own.includes("disability status"), "the EEO block must still be disclosed as answered");
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
