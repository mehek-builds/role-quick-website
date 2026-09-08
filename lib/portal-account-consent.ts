/* The standing permission that lets Litos OPEN AN ACCOUNT for the applicant on an employer's job
 * platform, and the words that ARE that permission.
 *
 * WHY THIS FILE IS SHAPED LIKE lib/captcha-consent.ts. Same problem, same solution: the API pins a
 * version constant (AUTOMATIC_ACCOUNT_CREATION_VERSION in its lib/automationConsent.ts) and stamps
 * it on the row when the box is ticked. What that version names is the wording the applicant was
 * shown. Two surfaces could ask for this permission, so if each wrote its own sentences one of them
 * would be recording a version string for words it never showed. One module, rendered by whoever
 * asks, is what keeps the stored version honest.
 *
 * BUMP THE BACKEND CONSTANT WHENEVER THESE STRINGS CHANGE IN SUBSTANCE. Rewording under an
 * unchanged version silently reuses an old agreement for a new act. That is not a hypothetical on
 * this permission: the constant already moved 2026-08-19 -> 2026-09-08 when Workday's
 * password-mandatory signup widened the act, and every grant made under the old no-password words
 * has to be given again.
 *
 * WHY THIS SHIPS AT ALL, and it is the same defect captcha-consent.ts shipped to fix, one permission
 * over. Measured 2026-09-08 against the production API with the account owner's own token:
 *
 *     automatic_account_creation_enabled        : false
 *     automatic_account_creation_consented_at   : null
 *     automatic_account_creation_consent_version: "2026-09-08"
 *
 * The API serves the verdict, the date and the current version on GET /onboarding/state, and
 * PUT /onboarding/automation accepts the field. Both halves of the backend gate are live. NOTHING IN
 * THIS REPO EVER RENDERED THE CONTROL - a grep for `account_creation` across the whole website
 * returned no hits - so no account could grant it from any screen, and the permission was
 * unreachable for everybody. The version bump makes that worse rather than neutral: it invalidated
 * whatever grants existed, and left no surface on which to give them again.
 *
 * IT IS THE MOST CONSEQUENTIAL PERMISSION ON THE SCREEN, and the copy says so rather than burying
 * it. Every other automation grant answers a field on a form the applicant is already filling. This
 * one creates a lasting relationship with a third party in her name, and REVOKING IT DOES NOT CLOSE
 * THE ACCOUNT IT MADE. The words she agreed to are the whole record of what she allowed, so they
 * state the boundary structurally rather than as a promise.
 */

/** The verdict fields, as GET /onboarding/state and PUT /onboarding/automation both send them.
 *
 *  Optional because the two repos deploy separately and in either order, so a website build can be
 *  live against an API that predates this column. Absent reads as not granted, which is the same
 *  answer the old API's behaviour gives.
 *
 *  `automatic_account_creation_enabled` is ALREADY A VERSION-CHECKED VERDICT: the API applies the
 *  comparison against AUTOMATIC_ACCOUNT_CREATION_VERSION and sends the result under that name. A
 *  client must never re-derive the grant from a stored date or a version string. Every account that
 *  granted this before 2026-09-08 carries a real `consented_at` and still verdicts false, and
 *  reading the date would show those accounts a permission the backend refuses to honour. */
export type PortalAccountConsentState = {
  automatic_account_creation_enabled?: boolean | null;
  automatic_account_creation_consented_at?: string | null;
};

export const PORTAL_ACCOUNT_CONSENT_FIELD = "automatic_account_creation_enabled" as const;

export const PORTAL_ACCOUNT_CONSENT_HEADING = "Accounts on employer platforms";

export const PORTAL_ACCOUNT_CONSENT_INTRO =
  "Some employers will not show you their application until you have an account on their hiring platform. Litos can open that account for you, using the Litos application address it already minted for that packet. This is the only permission here that leaves something behind in your name.";

export const PORTAL_ACCOUNT_CONSENT_COPY = {
  label: "Open employer accounts for me",
  body: "When an application needs an account before it can be filled, Litos registers one on that employer's platform using your Litos application address, and signs back in with it later to finish or resume the application.",
} as const;

/* WHAT THE PERMISSION CARRIES, taken line for line from the act the backend constant names. The
 * first two are the two sign-in shapes the API records per platform as `method`; the third and
 * fourth are the boundaries, and both are properties of the code rather than intentions. */
export const PORTAL_ACCOUNT_CONSENT_CARRIES = [
  "Where the platform signs in with a one-time code, no password is set at all. The code goes to your Litos application address, which is a mailbox Litos already owns, so reading it needs no access to your personal inbox.",
  "Where the platform requires a password, Litos generates one, sets it, and stores it encrypted so it can sign back in. It is never shown to the employer, never reused across platforms, and is deleted once the application reaches a final state.",
  "No human check is ever attempted. A platform that asks you to prove you are human before it will open an account stays out of reach with this granted, exactly as it is without it.",
  "Nothing is sent. Opening an account and submitting an application to an employer are different acts, and sending is a separate permission.",
] as const;

export const PORTAL_ACCOUNT_CONSENT_CARRIES_HEADING =
  "What Litos does with this, and what it will not do:";

/** What the applicant gets with the box unticked, stated plainly because it is not nothing: the
 *  application is still found, still ranked and still shown, and the account step is handed back
 *  rather than skipped silently. */
export const PORTAL_ACCOUNT_CONSENT_WHEN_OFF =
  "With this off, Litos still finds and ranks these jobs and tells you an account is needed, then stops and hands the application back to you. Nothing is lost, and nothing is opened in your name.";

/* THE BOUNDARY, and it is the load-bearing half of this consent. An account is not a form field: it
 * outlives the permission that authorised it, and the applicant has to be told that in the sentence
 * she is agreeing to rather than discovering it later. */
export const PORTAL_ACCOUNT_CONSENT_BOUNDARY =
  "An account Litos opens is a real account with that employer, and turning this permission off later does not close it. Litos can stop opening new ones the moment you say so; the ones already made are yours to keep or close with the employer directly.";

export const PORTAL_ACCOUNT_CONSENT_REVOCABLE =
  "You can turn this off at any time in Settings. Turning it off clears the date you granted it, and Litos opens no further accounts.";

/**
 * The verdict field as sent, including the case where it was not sent at all.
 *
 * `undefined` is a distinct answer from `false`, and only in one place: hydrating a screen from a
 * write response returned by an API that predates this column. Overwriting a live toggle with
 * `false` there would revoke a permission on screen that the applicant had just granted, so the
 * caller keeps what it had. Everywhere a grant is being DECIDED, use portalAccountConsentGranted.
 */
export function portalAccountConsentVerdict(
  state: PortalAccountConsentState | null | undefined,
): boolean | undefined {
  const value = state?.automatic_account_creation_enabled;
  return value === undefined || value === null ? undefined : value;
}

/** The verdict. Reads the verdict field and nothing else, never a stored date or version: the API
 *  applies the version comparison and sends the result, and a client that re-derived it would show
 *  a permission the backend does not honour. */
export function portalAccountConsentGranted(
  state: PortalAccountConsentState | null | undefined,
): boolean {
  return portalAccountConsentVerdict(state) === true;
}

/** The stored grant date, as sent. Absent and null collapse to null, which is what a screen wants
 *  when it is DISPLAYING a date. Use portalAccountConsentedAtReported when the difference matters. */
export function portalAccountConsentedAt(
  state: PortalAccountConsentState | null | undefined,
): string | null {
  return state?.automatic_account_creation_consented_at ?? null;
}

/**
 * The grant date as REPORTED, keeping "not sent" distinct from "sent as null".
 *
 * The same distinction portalAccountConsentVerdict draws, and needed in the same place: reconciling
 * a screen against a write response. An API that does not send this column must not be read as
 * having cleared the date, or a toggle would erase a date that GET /onboarding/state still returns,
 * and the screen would disagree with itself across a reload.
 */
export function portalAccountConsentedAtReported(
  state: PortalAccountConsentState | null | undefined,
): string | null | undefined {
  return state?.automatic_account_creation_consented_at;
}

/**
 * The date to print beside the granted permission, or null.
 *
 * NULL WHENEVER THE VERDICT IS FALSE, even though a date is sitting right there. That pairing is the
 * live state of every account that granted this before 2026-09-08: the row was granted on a real
 * day, the constant has since moved, and the API answers `enabled: false` with the old
 * `consented_at` still attached. Printing "granted on 19 August" over an unticked box would tell
 * those accounts they hold a permission the backend refuses to honour, which is the failure the
 * version check exists to prevent.
 */
export function portalAccountConsentGrantedOn(
  granted: boolean,
  consentedAt: string | null | undefined,
): string | null {
  if (!granted || !consentedAt) return null;
  const when = new Date(consentedAt);
  if (Number.isNaN(when.getTime())) return null;
  /* UTC, so the printed day is the day the record names rather than the viewer's local one. This is
     an audit statement about when permission to create a third-party account was given, and on this
     permission the record is the only thing that survives a revocation. */
  return when.toLocaleDateString(undefined, { timeZone: "UTC" });
}

/**
 * The request body for changing this permission.
 *
 * Exactly one key, always. The API treats an omitted field as "leave it alone" and an explicit false
 * as a revocation, so a patch that also named a neighbouring permission could revoke one the
 * applicant never touched. Independence is a property of this payload, not of the code that calls
 * it, and it matters more here than anywhere else on the screen, because this is the arm whose
 * date is the record of an act that created an account in her name.
 */
export function portalAccountConsentPatch(
  enabled: boolean,
): { automatic_account_creation_enabled: boolean } {
  return { [PORTAL_ACCOUNT_CONSENT_FIELD]: enabled };
}

/**
 * What POST /onboarding/complete should carry for this permission, which is sometimes nothing.
 *
 * SETUP MUST NOT REVOKE A PERMISSION IT WAS NEVER TOLD ABOUT, and MUST NOT RE-DATE ONE SHE ALREADY
 * HOLDS. Both rules are stated in full in lib/consent-acknowledgement.ts, which was rewritten to fix
 * exactly these two defects after a measured revocation of a live grant. They apply here unchanged,
 * and the stakes are strictly higher: this date is the record of an act that left a third-party
 * account behind, so a date that post-dates the accounts it authorised is worse than no date.
 *
 *   ticked, stored verdict already true     send NOTHING. Re-affirming is not an act.
 *   ticked, stored verdict false or absent  send TRUE. A new grant, or a re-grant against
 *                                           superseded wording, and both deserve today's date.
 *   unticked, column reported               send FALSE. A deliberate revocation, recorded.
 *   unticked, column never reported         send NOTHING. See above.
 *
 * Both conditions read the VERDICT rather than a raw column, and that is load-bearing in the second
 * row: a grant against the superseded 2026-08-19 wording verdicts false, so it correctly restamps.
 */
export function portalAccountConsentCompletion(
  state: PortalAccountConsentState | null | undefined,
  chosen: boolean | undefined,
): { automatic_account_creation_enabled?: boolean } {
  if (chosen === undefined) return {};
  const stored = portalAccountConsentVerdict(state);
  if (chosen === true) return stored === true ? {} : { [PORTAL_ACCOUNT_CONSENT_FIELD]: true };
  return stored === undefined ? {} : { [PORTAL_ACCOUNT_CONSENT_FIELD]: false };
}
