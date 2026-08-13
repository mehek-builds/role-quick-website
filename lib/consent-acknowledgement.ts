/* The standing permission that lets Litos accept an employer's privacy notice or code of conduct
 * in the applicant's name, and the words that ARE that permission.
 *
 * WHY THIS FILE IS SHAPED LIKE lib/captcha-consent.ts, DELIBERATELY AND ALMOST LINE FOR LINE.
 *
 * The first version of this feature was written as a fresh `NO_CONSENT_GRANTS` constant that the
 * finish screen seeded from, and it revoked the account owner's real, dated, live grant. Measured,
 * driving both repos' own functions against her production row:
 *
 *   finish payload : {"automatic_consent_acceptance_enabled":false,
 *                     "automatic_conduct_acceptance_enabled":false}
 *   row BEFORE     : {"enabled":true,"at":"2026-08-12T13:15:07.000Z","ver":"2026-08-12"}
 *   row AFTER      : {"enabled":false,"at":null,"ver":null}
 *
 * /start has no completed-user guard, so walking back through onboarding was enough to do it. The
 * API anticipated exactly this in lib/automationConsent.ts: "A writer that did not mention it must
 * not restamp the date, and must not revoke it either." The fields are optional for that reason,
 * and sending an unconditional false defeats the safeguard on purpose.
 *
 * captcha-consent.ts had already solved the identical problem on the identical screen. Its comment
 * names the hazard outright: "/start is reachable long after setup, so someone who granted this in
 * Settings and then walked back through the flow would revoke it on the way out if this screen
 * assumed off." So this is not a similar problem solved twice, it is the same problem, and the
 * shape is copied rather than reinvented: server hydration, a verdict that keeps "not sent" distinct
 * from "sent as false", a conditional completion payload, one copy module, one shared control.
 *
 * WHY THE COPY LIVES HERE. The API pins a version constant per grant and stamps it on the row when
 * the box is ticked. What that version names is the wording the applicant was shown. Two surfaces
 * ask for these, /start and Settings, so if each wrote its own sentences one of them would be
 * recording a version string for words it never showed.
 *
 * BUMP THE BACKEND CONSTANTS WHENEVER THESE STRINGS CHANGE IN SUBSTANCE, and especially whenever a
 * question class moves between the two lists below. Rewording under an unchanged version silently
 * reuses an old agreement for a new act.
 */

/** The verdict and date fields, as GET /onboarding/state and PUT /onboarding/automation send them.
 *
 *  Optional because the two repos deploy separately and in either order, so a website build can be
 *  live against an API that predates these columns. Absent reads as not granted for DISPLAY, and
 *  never as a licence to write false back. See consentAcknowledgementCompletion. */
export type ConsentAcknowledgementState = {
  automatic_consent_acceptance_enabled?: boolean | null;
  automatic_consent_acceptance_consented_at?: string | null;
  automatic_conduct_acceptance_enabled?: boolean | null;
  automatic_conduct_acceptance_consented_at?: string | null;
};

/** The two grants, in the order they are shown. Separate because the API stores them separately,
 *  with separate version constants, and either can be revoked without touching the other. */
export const CONSENT_GRANTS = [
  {
    field: "automatic_consent_acceptance_enabled",
    grantedAtField: "automatic_consent_acceptance_consented_at",
    label: "Accept privacy notices and applicant terms for me",
    body: "Employer privacy statements, candidate privacy notices, data-processing consents, and applicant terms and conditions. These are the routine condition of applying at all, and employers mark them required, so Litos stops on every one until you say otherwise.",
  },
  {
    field: "automatic_conduct_acceptance_enabled",
    grantedAtField: "automatic_conduct_acceptance_consented_at",
    label: "Accept interview codes of conduct for me",
    body: "Interview codes of conduct and similar behavioural policies. Granted separately, because agreeing to how you will behave in a live interview is not the same act as agreeing to a privacy notice. A form that names both documents needs both permissions.",
  },
] as const;

export type ConsentGrantField = (typeof CONSENT_GRANTS)[number]["field"];
export type ConsentGrantedAtField = (typeof CONSENT_GRANTS)[number]["grantedAtField"];

export const CONSENT_ACKNOWLEDGEMENT_HEADING = "Employer privacy notices and codes of conduct";

export const CONSENT_ACKNOWLEDGEMENT_INTRO =
  "Employers put these on the application form and mark them required, so Litos stops and hands each one back to you. You can let it accept them on your behalf instead. Both are off unless you turn them on, and you can change either one later in Settings.";

/* ---- THE SCOPE, AND IT IS WRITTEN FROM MEASUREMENT RATHER THAN FROM INTENT ----
 *
 * An earlier draft of this screen said "Litos will never answer these for you", and then listed
 * work authorization and visa sponsorship, and demographic questions. Both were FALSE. Measured
 * against the real resolver with the six-argument production call and a populated profile:
 *
 *   work authorization                 ->  "Yes"                        answered
 *   sponsorship                        ->  "Yes"                        answered
 *   EEO race                           ->  her own stored answer        answered
 *   veteran / disability               ->  "Decline to self-identify"   answered, her own opt-out
 *
 * They are answered from declarations she made herself, which is correct behaviour and not a leak.
 * But telling her they are never answered, on the screen where she grants a legal permission, is a
 * false statement about the product on the one screen that must not contain one.
 *
 * So there are two lists, and the second exists because the honest answer to "what will Litos do
 * with these?" is not "nothing".
 */

/** Never answered by Litos, whatever either box says. */
export const NEVER_ANSWERED_CLASSES = [
  "Statements that the information you have given is true and complete",
  "Anything about your health: medical conditions, fitness for a role, and interview or workplace accommodations",
  "Criminal history, background checks, and permission to contact your references",
  "Any document Litos cannot positively identify",
] as const;

/** Answered, but from her own stored answers, and untouched by this permission. */
export const ANSWERED_FROM_YOUR_OWN_ANSWERS_CLASSES = [
  "Equal-opportunity self-identification, which is the separate block asking your race, gender, veteran status and disability status, using the answers you gave in your profile, including “prefer not to say” where that is what you chose",
  "Work authorization and visa sponsorship, using the declaration you made yourself",
] as const;

export const CONSENT_ACKNOWLEDGEMENT_NEVER_HEADING =
  "Litos never answers these for you, whichever boxes you tick:";

export const CONSENT_ACKNOWLEDGEMENT_OWN_ANSWERS_HEADING =
  "These are answered from what you already told Litos, and these permissions do not change them:";

export const CONSENT_ACKNOWLEDGEMENT_BOUNDARY =
  "Those first four are claims about you rather than agreements to a document, so Litos leaves every one of them for you to answer yourself. Accepting a notice also sends nothing: whether an application is ever submitted is a separate permission.";

export const CONSENT_ACKNOWLEDGEMENT_WHEN_OFF =
  "With these off, Litos fills the rest of the application and hands you each notice to accept yourself before anything is sent. Nothing is lost, and nothing is sent either way.";

export const CONSENT_ACKNOWLEDGEMENT_REVOCABLE =
  "You can turn either of these off at any time in Settings. Turning one off clears the date you granted it and leaves the other standing.";

/**
 * The verdict field as sent, including the case where it was not sent at all.
 *
 * `undefined` is a distinct answer from `false`, and the distinction is the whole safeguard. See
 * consentAcknowledgementCompletion.
 */
export function consentAcknowledgementVerdict(
  state: ConsentAcknowledgementState | null | undefined,
  field: ConsentGrantField,
): boolean | undefined {
  const value = state?.[field];
  return value === undefined || value === null ? undefined : value;
}

/** The verdict. Reads the verdict field and nothing else, never a stored date or version: the API
 *  applies the version comparison and sends the result, and a client that re-derived it would show
 *  a permission the backend does not honour. */
export function consentAcknowledgementGranted(
  state: ConsentAcknowledgementState | null | undefined,
  field: ConsentGrantField,
): boolean {
  return consentAcknowledgementVerdict(state, field) === true;
}

/** The stored grant date, as sent. */
export function consentAcknowledgedAt(
  state: ConsentAcknowledgementState | null | undefined,
  grantedAtField: ConsentGrantedAtField,
): string | null {
  return state?.[grantedAtField] ?? null;
}

/**
 * The date to print beside a granted permission, or null.
 *
 * Null whenever the verdict is false, even with a date on the row: that pairing is what a superseded
 * consent version looks like, and printing the old date over an unticked box would claim a
 * permission the server refuses to honour.
 */
export function consentAcknowledgementGrantedOn(
  granted: boolean,
  consentedAt: string | null | undefined,
): string | null {
  if (!granted || !consentedAt) return null;
  const when = new Date(consentedAt);
  if (Number.isNaN(when.getTime())) return null;
  // UTC, so the printed day is the day the record names rather than the viewer's local one. This is
  // an audit statement about when permission was given.
  return when.toLocaleDateString(undefined, { timeZone: "UTC" });
}

/**
 * The request body for changing ONE permission.
 *
 * Exactly one key, always. The API treats an omitted field as "leave it alone" and an explicit false
 * as a revocation, so a patch naming both would revoke the one she never touched. Independence is a
 * property of this payload, not of the code that calls it.
 */
export function consentAcknowledgementPatch(
  field: ConsentGrantField,
  enabled: boolean,
): Partial<Record<ConsentGrantField, boolean>> {
  return { [field]: enabled };
}

/**
 * What POST /onboarding/complete should carry, which is sometimes nothing.
 *
 * SETUP MUST NOT REVOKE A PERMISSION IT WAS NEVER TOLD ABOUT. This is the exact rule
 * captchaConsentCompletion states, and the reason it exists is the defect this file was rewritten
 * to remove.
 *
 * The screen seeds its boxes from the server, so an unticked box normally means "she is looking at
 * a permission she does not hold", and an explicit false is the honest way to say so. There is one
 * case where it means something else entirely: the server did not report the column at all. Absent
 * reads as not granted for DISPLAY, but writing that back as false is a revocation of whatever is
 * actually stored, decided by a screen that was never shown the real value.
 *
 * That is not hypothetical during a rolling deploy, when GET can land on an instance that predates
 * these columns while POST lands on one that does not: an account holding a real grant would walk
 * through setup, see an unticked box it had no way to know was wrong, press the button, and lose a
 * dated legal permission silently.
 *
 * SETUP MUST ALSO NOT RE-DATE A PERMISSION SHE ALREADY HOLDS, which is the same defect one layer
 * down and it survived the first repair. The backend stamps `consented_at = now` on ANY write that
 * names the column, so sending a redundant `true` moved a live grant's date to today without a
 * deliberate act. That date is written onto every control the runner ticks, so it became a record
 * postdating the applications it authorised.
 *
 * THE RULE, in one line each:
 *
 *   ticked, stored verdict already true    send NOTHING. Re-affirming is not an act.
 *   ticked, stored verdict false or absent send TRUE. A new grant, or a re-grant against
 *                                          superseded wording, and both deserve today's date.
 *   unticked, column reported              send FALSE. A deliberate revocation, recorded.
 *   unticked, column never reported        send NOTHING. See above.
 *
 * Both conditions read the VERDICT rather than a raw column, and that is load-bearing in the second
 * row: a grant against superseded wording verdicts false, so it correctly restamps.
 */
export function consentAcknowledgementCompletion(
  state: ConsentAcknowledgementState | null | undefined,
  chosen: Partial<Record<ConsentGrantField, boolean>>,
): Partial<Record<ConsentGrantField, boolean>> {
  const out: Partial<Record<ConsentGrantField, boolean>> = {};
  for (const grant of CONSENT_GRANTS) {
    const value = chosen[grant.field];
    const stored = consentAcknowledgementVerdict(state, grant.field);
    if (value === true) {
      /* A TICK IS ONLY NEWS IF SHE DID NOT ALREADY HOLD IT, and this half is the second defect.
       *
       * The first version sent `true` whenever the box was ticked, including when the box was
       * ticked because the SERVER said she already holds the grant. The `enabled` column survived
       * that, so the revocation was fixed, but the date did not:
       *
       *   ROW BEFORE    : {"enabled":true,"at":"2026-08-12T13:15:07.000Z","ver":"2026-08-12"}
       *   payload       : {"automatic_consent_acceptance_enabled":true, ...}
       *   consent AFTER : {"enabled":true,"at":"2026-08-13T10:00:00.000Z","ver":"2026-08-12"}
       *
       * The backend stamps consented_at = now on any write that names the column, by design, and
       * it writes that date onto every control the runner ticks. So walking back through setup and
       * touching nothing moved the audit record to a date AFTER the applications it authorised. On
       * a revocable, dated, versioned permission that record is the whole point, and a date that
       * post-dates its own use is worse than no date.
       *
       * Omitted, therefore, when the stored verdict is already true: she is re-affirming something
       * the row already says, which is not an act and must not be recorded as one.
       *
       * A STALE-VERSION RE-GRANT STILL RESTAMPS, and that is why this reads the VERDICT rather than
       * the raw column. A row enabled against superseded wording verdicts FALSE, so it takes this
       * branch, sends true, and the backend writes today's date and the current version. That is
       * correct: she is agreeing to different words, on a new day, and the new date is the honest
       * record of it. Reading a raw boolean here would have broken exactly that case. */
      if (stored !== true) out[grant.field] = true;
      continue;
    }
    if (stored !== undefined) out[grant.field] = false;
  }
  return out;
}
