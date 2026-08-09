/* THE SHAPES THAT ACTUALLY BREAK.
 *
 * Every fixture in portal-form.tsx is a plain text input and a file input. That is a faithful copy
 * of each board's CONTACT block and nothing else, and it is why ten measured production defects all
 * shipped while the controlled portal passed: none of the controls that failed exist on it. A test
 * that cannot fail is not a test.
 *
 * A shape is one defect, reproduced from the production run that found it, and addressable on its
 * own so a trial can drive exactly one at a time:
 *
 *   /qa/portal-submission?board=greenhouse&shape=select-jd-decoy
 *   /qa/portal-submission/greenhouse/select-jd-decoy
 *
 * Two rules hold for all of them.
 *
 *  1. ADD, NEVER REPLACE. An unknown or absent shape renders exactly the form that rendered before,
 *     so every existing case keeps working and the ten boards keep their captured traps.
 *  2. ONE SHAPE PER PAGE. Each shape page carries its board's normal contact block plus at most
 *     three extra controls. The managed runner has a hard MANAGED_ACTION_LIMIT of 120 and a real
 *     Greenhouse packet already lands at exactly 120, so a page that piled all eleven shapes
 *     together would be over budget before the run began and would prove only that the budget
 *     truncates. There is deliberately no "all shapes" page.
 */

export const PORTAL_SHAPES = [
  /* 1. Deepgram packet 245c827a-daaa-463a-8026-04f89d6a69eb reached ready_for_final_approval with a
        green Send button while three starred fields were visibly empty. One of the three is marked
        with a VISUAL ASTERISK ONLY and carries neither `required` nor aria-required, because a real
        Greenhouse form does that and a gate keyed on [required] cannot see it. */
  'required-empty',
  /* 2. Greenhouse menus render 555 to 563 ms after the click. An instantaneous count() at 150 ms is
        what made the runner fall through to a page-wide sweep. */
  'select-late-menu',
  /* 3. The page-wide sweep clicked a bullet in the JOB DESCRIPTION carrying the literal text of a
        valid option, returned true, and left the control reading "Select...". */
  'select-jd-decoy',
  /* 4. A later candidate emptied a control an earlier one had answered, two ways: fill('') on a
        react-select whose backspaceRemovesValue deletes the selection, and a click on the widget's
        own aria-label="Clear selections". */
  'select-preserve',
  /* 5. When the choice path failed, the runner typed into the widget's SEARCH BOX and read the value
        back out of that same box, so filled_fields claimed the field was answered while the blocker
        list said it was empty. */
  'select-search-echo',
  /* 6. Ashby's work-authorization and sponsorship questions are a segmented Yes/No. Neither option
        selected is the production failure. */
  'segmented-yesno',
  /* 7. On Deepgram, filling Expected Graduation Year left the May 2028 calendar open across the
        following question and its label. */
  'date-overlay',
  /* 8. Cresta rejected "+971 567417451" with "Phone number is too short" because the country code
        was present in both the selector and the field. */
  'phone-country',
  /* 9. Greenhouse emails an 8-character code on submit and refuses the application until the code is
        entered and the form RESUBMITTED. Three runs at 16:22, 16:34 and 16:46 on 2026-08-08 matched
        three emails to the minute and all three were recorded ready_for_final_approval with
        submitted_at null. */
  'security-code',
  /* 10a. Redwood's COMPLETED form showed red "This field is required." under five filled controls.
         A gate that blocks on error text would refuse every Greenhouse submission there is. */
  'stale-error',
  /* 10b. The other half of the same mistake: an error message under a control that really is empty,
         on a control carrying no required attribute at all, so a gate that ignores error text
         entirely misses it. Both mistakes have to be catchable or the gate is untested. */
  'stale-error-real',
  /* 11. Cresta packet 8142004c-3358-4538-8778-16df5e31c5bb reached ready_for_final_approval with a
        complete 294-word cover letter written, a live PDF in blob storage, and a Send button that
        returned 422 because filled_fields recorded no cover-letter attachment. Across the corpus,
        111 of the 112 packets that hold a written letter on a form with a slot for one were in that
        state.

        The control is the reason this needs its own shape rather than one more file input on an
        existing page. Read off the live Cresta form, 2026-08-09: the cover letter sits behind an
        "Attach / Dropbox / Enter manually" trio, its input is CLIPPED OUT OF VIEW, it carries NO
        name attribute, and its visible caption is a div rather than a label[for]. Three of the four
        alternatives in the production selector cannot match it, and the resume beside it is the
        identical shape - which is exactly why "the resume attaches, so the cover letter would too"
        was believable and wrong for a different reason entirely. A third file input, carrying no
        cover in its name, is here so a page-wide input[type=file] sweep files the letter in the
        wrong place instead of passing. */
  'cover-letter-attach',
  /* 12. Skydio packet 13bccb2d-d726-4c47-80bc-e8090ae1463e (Ashby) came back with filled_fields
        ["name","email","phone","resume"] and four lines reading 'Litos could not leave this answer
        on the form ... value did not persist after fillByLabelText' - gender, race, veteran status
        and disability status, every one of them resolved correctly from the stored profile.

        Measured against the live form on 2026-08-09, the report was not even the worst of it. Ashby
        renders each of these as a real radio group inside its own fieldset, but the whole
        self-identification block sits in ONE section, and the section opens with the equal-opportunity
        preamble - "...without regard to race, color, religion, sex, gender identity...". The runner
        anchored on the first element containing the question word, which is that paragraph, so the
        block it then searched for options was the entire section: eleven radios across two questions.
        The race answer "Decline to self-identify" matched GENDER's "Decline to self-identify" first
        in DOM order and set it, overwriting the Female that had been set moments earlier, and race
        and veteran status were left blank. Verified end to end against jobs.ashbyhq.com/skydio: the
        gender control finished on "Decline to self-identify" while filled_fields claimed nothing.

        So this shape carries the preamble as well as the controls, because the preamble is the trap.
        Two groups, one of them eight options long, sharing a "Decline to self-identify" option; the
        second group deliberately carries NO name attribute and associates its labels by WRAPPING
        rather than by for, which is the harder of the two spellings Ashby ships. And one option is
        qualified with extra distinguishing words - "Asian (Not Hispanic or Latino)" - which is the
        known open gap: a stored "Asian" fails containment against it, and this shape makes that
        visible rather than hiding it. */
  'eeo-radio-groups',
] as const;

export type PortalShape = (typeof PORTAL_SHAPES)[number];

/** Resolve an untrusted shape name off the URL. Anything unknown means "render the old form". */
export function toShape(raw: string | undefined | null): PortalShape | null {
  const value = (raw ?? '').toLowerCase();
  return (PORTAL_SHAPES as readonly string[]).includes(value) ? (value as PortalShape) : null;
}

/** Strip a case or shape id off the URL to the same character set both routes already allow. */
export function normalizeCaseId(raw: string | undefined | null, fallback: string): string {
  return (raw ?? '').replace(/[^a-z0-9-]/gi, '').slice(0, 32) || fallback;
}

/* THE SECURITY CODE, AND WHY IT IS DERIVED RATHER THAN CONSTANT.
 *
 * Greenhouse mails an 8-character code and will not accept the application until it is typed back
 * in and the form resubmitted. The harness has to reproduce that loop without a mailbox, so the code
 * is a pure function of the case id and is also served from a QA-only endpoint
 * (/qa/portal-submission/security-code?case=<caseId>) that stands in for the inbox.
 *
 * Derived, not a single constant, for one reason: a runner that hardcodes one value would pass a
 * constant forever. Two different case ids produce two different codes, so the only way through is
 * to actually READ the code at run time, which is the behaviour the product side has to have.
 *
 * FNV-1a, twice with different offset bases, because it is eight lines and identical in any
 * language a trial might be written in. It is not a secret and is not protecting anything.
 */
export function securityCodeFor(caseId: string): string {
  const digest = (seed: number) => {
    let hash = seed >>> 0;
    for (let index = 0; index < caseId.length; index += 1) {
      hash ^= caseId.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  };
  const raw = `${digest(0x811c9dc5).toString(36)}${digest(0x9e3779b9).toString(36)}00000000`;
  return raw.toUpperCase().slice(0, 8);
}

/* The literal option text planted in the job description body of the select-jd-decoy shape, and the
 * option the control genuinely offers. They are the SAME STRING on purpose: production clicked the
 * posting's bullet because a page-wide `li` selector matched it first. */
export const JD_DECOY_OPTION = 'Mathematics';

export const JD_DECOY_BULLET =
  'pursuing a degree in mathematics, economics, physics, statistics, computer science or any '
  + 'engineering discipline';
