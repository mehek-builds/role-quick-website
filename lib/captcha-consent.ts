/* The standing permission that lets Litos pick a fill back up after the applicant has cleared a
 * human check, and the words that ARE that permission.
 *
 * WHAT THE PERMISSION ACTUALLY BUYS, because the name invites the wrong reading. Litos does not
 * solve challenges, cannot, and must not: the applicant is sitting right there, it is their
 * application, and passing that check is precisely the thing the check exists to establish. The
 * extension's behaviour is the same either way up to the moment the challenge appears - it writes
 * the stall line ("This company asks you to prove you are human...") unconditionally, then stops at
 * the submit button as it always does. This flag gates ONE thing, in content.ts: whether the
 * extension keeps watching its own detection until a human has cleared the challenge, and then
 * re-reads the form and says what is left. It sends nothing even then. See
 * `serverCaptchaResumeEnabled` and `armCaptchaStall` in the extension's src/entrypoints/content.ts.
 *
 * WHY THE COPY LIVES HERE RATHER THAN IN EITHER SCREEN. The backend pins a consent version constant
 * (AUTOMATIC_CAPTCHA_CONSENT_VERSION in the API's lib/automationConsent.ts) and stamps it on the row
 * when the box is ticked. What that version names is the wording the applicant was shown. Two
 * surfaces ask for this permission, /start and Settings, so if each wrote its own sentences one of
 * them would be recording a version string for words it never showed. One module, rendered by both,
 * is what keeps the stored version honest.
 *
 * BUMP THE BACKEND CONSTANT WHENEVER THESE STRINGS CHANGE IN SUBSTANCE. Rewording under an unchanged
 * version silently reuses an old agreement for a new act.
 *
 * WHY THIS SHIPS AT ALL, and it is not only that the control was missing. It was missing - nothing
 * on any surface wrote this column, so no account could ever grant it and the extension's resume
 * path was dead for everybody. But there is a second, worse population underneath: roughly 25
 * production accounts carry a STALE version string, written by a branch that applied its migration
 * to production and never merged. Those rows hold a real consent, given on a real day, against
 * wording the current constant has superseded. The API's version check answers false for them, and
 * with no control anywhere they had no way to re-consent. A Settings toggle is that way: ticking the
 * box writes the current version and the account is whole again. This is why the permission had to
 * appear on Settings and not on /start alone - every one of those 25 finished setup long ago.
 */

/** The verdict fields, as GET /onboarding/state and PUT /onboarding/automation both send them.
 *
 *  Optional because the two repos deploy separately and in either order, so a website build can be
 *  live against an API that predates this column. Absent reads as not granted, which is the same
 *  answer the old API's behaviour gives.
 *
 *  `automatic_captcha_enabled` is ALREADY A VERSION-CHECKED VERDICT. The API applies the version
 *  comparison and sends the result under that name. A client must never re-derive the grant from a
 *  stored date or a version string: the 25 stale rows described above carry a real `consented_at`
 *  and still verdict false, and reading the date would show those accounts a permission the backend
 *  does not honour. */
export type CaptchaConsentState = {
  automatic_captcha_enabled?: boolean | null;
  automatic_captcha_consented_at?: string | null;
};

export const CAPTCHA_CONSENT_FIELD = "automatic_captcha_enabled" as const;

export const CAPTCHA_CONSENT_HEADING = "Human checks";

export const CAPTCHA_CONSENT_INTRO =
  "Some employers put a check in the application to prove you are not a bot. Litos never solves it: you clear it yourself, in your own browser. This permission decides one thing, and it is what happens after you clear it.";

export const CAPTCHA_CONSENT_COPY = {
  label: "Pick my application back up after I clear a check",
  body: "When the check clears, Litos looks at the form again and tells you what is left. Clearing a check often empties boxes that were already filled, so this is what catches the ones that reset.",
} as const;

/** What the applicant gets with the box unticked, stated plainly because it is not nothing. The
 *  stall line is written before this permission is ever read, so turning this off costs the resume
 *  and the re-check, not the explanation. Leaving that unsaid would make the off state read as a
 *  silent failure, which is the exact defect the stall line was added to fix. */
export const CAPTCHA_CONSENT_WHEN_OFF =
  "With this off, Litos still tells you the check is there and what is left to do, then stops watching. Nothing is lost. You look the form over yourself before you send it.";

/* THE BOUNDARY, and it is the load-bearing half of this consent.
 *
 * Both halves state a property of the code rather than an intention. Litos never solves the
 * challenge: the extension watches its own detection for a cleared state and never touches the
 * provider's widget or its token. And it never sends: the fill stops at the submit button by
 * design, and unattended submission is a separate permission the server refuses to enable until it
 * has been earned. */
export const CAPTCHA_CONSENT_BOUNDARY =
  "Litos never solves the check, never reads its token, and never answers it for you. Passing it is exactly what the check exists to establish, and it stays yours. This permission also sends nothing: whether an application is ever submitted is a separate permission.";

export const CAPTCHA_CONSENT_REVOCABLE =
  "You can turn this off at any time in Settings. Turning it off clears the date you granted it.";

/**
 * The verdict field as sent, including the case where it was not sent at all.
 *
 * `undefined` is a distinct answer from `false` and only in one place: hydrating a screen from a
 * write response returned by an API that predates this column. Overwriting a live toggle with
 * `false` there would revoke a permission on screen that the applicant had just granted, so the
 * caller keeps what it had. Everywhere a grant is being DECIDED, use captchaConsentGranted.
 */
export function captchaConsentVerdict(
  state: CaptchaConsentState | null | undefined,
): boolean | undefined {
  const value = state?.automatic_captcha_enabled;
  return value === undefined || value === null ? undefined : value;
}

/** The verdict. Reads the verdict field and nothing else. */
export function captchaConsentGranted(state: CaptchaConsentState | null | undefined): boolean {
  return captchaConsentVerdict(state) === true;
}

/** The stored grant date, as sent. Absent and null collapse to null, which is what a screen wants
 *  when it is DISPLAYING a date. Use captchaConsentedAtReported when the difference matters. */
export function captchaConsentedAt(state: CaptchaConsentState | null | undefined): string | null {
  return state?.automatic_captcha_consented_at ?? null;
}

/**
 * The grant date as REPORTED, keeping "not sent" distinct from "sent as null".
 *
 * The same distinction captchaConsentVerdict draws, and needed in the same place: reconciling a
 * screen against a write response. An API that does not send this column must not be read as having
 * cleared the date, or a toggle would erase a date that GET /onboarding/state still returns, and the
 * screen would disagree with itself across a reload.
 */
export function captchaConsentedAtReported(
  state: CaptchaConsentState | null | undefined,
): string | null | undefined {
  return state?.automatic_captcha_consented_at;
}

/**
 * The date to print beside the granted permission, or null.
 *
 * NULL WHENEVER THE VERDICT IS FALSE, even though a date is sitting right there. That pairing is not
 * hypothetical here: it is the live state of the 25 accounts stamped with the superseded version.
 * The row was granted on a real day, the constant has since moved, and the API answers
 * `enabled: false` with the old `consented_at` still attached. Printing "granted on 4 August" over
 * an unticked box would tell those accounts they hold a permission the backend refuses to honour,
 * which is the failure the version check exists to prevent.
 */
export function captchaConsentGrantedOn(
  granted: boolean,
  consentedAt: string | null | undefined,
): string | null {
  if (!granted || !consentedAt) return null;
  const when = new Date(consentedAt);
  if (Number.isNaN(when.getTime())) return null;
  /* Rendered in UTC, which is the instant the server stored rather than the one the viewer happens
     to be standing in. Without the zone, a grant stamped 09:14Z prints as the previous day for
     anyone far enough west, and a date-only value parses as UTC midnight and does it everywhere west
     of UTC. This date is an audit statement about when permission was given, so it has to name the
     day the record names. */
  return when.toLocaleDateString(undefined, { timeZone: "UTC" });
}

/**
 * The request body for changing this permission.
 *
 * Exactly one key, always. The API treats an omitted field as "leave it alone" and an explicit false
 * as a revocation, so a patch that also named the submission or verification columns could revoke a
 * permission the applicant never touched. Independence is a property of this payload, not of the
 * code that calls it.
 */
export function captchaConsentPatch(enabled: boolean): { automatic_captcha_enabled: boolean } {
  return { [CAPTCHA_CONSENT_FIELD]: enabled };
}

/**
 * What POST /onboarding/complete should carry for this permission, which is sometimes nothing.
 *
 * SETUP MUST NOT REVOKE A PERMISSION IT WAS NEVER TOLD ABOUT. /start is reachable long after setup,
 * and it seeds its box from the server, so an unticked box normally means "she is looking at a
 * permission she does not hold" and an explicit false is the honest way to say so. There is one case
 * where it means something else entirely: the server did not report the column at all. Absent reads
 * as not granted for DISPLAY, but writing that back as false is a revocation of whatever is actually
 * stored, decided by a screen that was never shown the real value.
 *
 * That is not hypothetical during a rolling deploy, when GET can land on an instance that predates
 * the column while POST lands on one that does not: an account holding a real grant would walk
 * through setup, see an unticked box it had no way to know was wrong, press the button, and lose the
 * permission silently. So a false is sent only when the server reported the column, and a true is
 * always sent, because a ticked box is a grant the applicant just performed either way.
 */
export function captchaConsentCompletion(
  state: CaptchaConsentState | null | undefined,
  chosen: boolean,
): { automatic_captcha_enabled?: boolean } {
  if (chosen) return { [CAPTCHA_CONSENT_FIELD]: true };
  return captchaConsentVerdict(state) === undefined ? {} : { [CAPTCHA_CONSENT_FIELD]: false };
}
