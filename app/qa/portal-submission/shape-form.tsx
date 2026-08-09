"use client";

/* ONE PAGE PER MEASURED DEFECT.
 *
 * See shapes.ts for the list and the run each one came from. Everything here exists because a real
 * application reached a real employer in a state the harness said was fine.
 *
 * Every shape page is: the board's OWN contact block (imported, not copied, from portal-form.tsx)
 * plus the one control that broke. That keeps a run realistic - the adapter still has to fill a
 * name, an email and a resume to get as far as the submit - while keeping the page small enough
 * that MANAGED_ACTION_LIMIT (120) is never the thing under test. Measured against the action lists
 * the production builders emit, no shape page adds more than four actions over the plain board form.
 *
 * `?answered=1` renders the shape in its ANSWERED state. Three of the ten defects are gate defects
 * rather than filler defects: the question is whether the pre-submit readiness read reports a
 * correctly completed form as complete. Without a way to render the completed form directly, that
 * half can only be reached through a filler that may itself be broken, and a failure would not say
 * which of the two was at fault.
 */

import { useEffect, useState } from "react";
import { BoardContactFields, type Board } from "./portal-form";
import { ReactSelectFixture } from "./react-select-fixture";
import { JD_DECOY_BULLET, JD_DECOY_OPTION, securityCodeFor, type PortalShape } from "./shapes";
import { QA_LOG_ELEMENT_ID, qaMirror, qaRecord, qaReady } from "./qa-instrument";

/* THE ONE ELEMENT THE REAL RUNNER CAN READ.
 *
 * The managed runner's only DOM read is `extract`, which returns an element's text or ONE of its
 * attributes. So everything a trial needs to know about what happened to this page is mirrored onto
 * this element's attributes, and every verdict comes from the run that actually happened rather than
 * from a replay. See qa-instrument.ts for the writer and trial-portal-shapes.mts for the reader.
 *
 * `hidden` rather than clipped: extract falls back to textContent and reads attributes regardless of
 * layout, so there is no reason to leave a visible artefact on a page whose whole job is to look
 * like an employer's form. It holds no control, so the readiness gate walks straight past it.
 */
function QaLog() {
  return <div id={QA_LOG_ELEMENT_ID} hidden data-litos-qa-events="" />;
}

/* Greenhouse's own discipline list, trimmed. "Mathematics" is here AND in the job description body
   of the select-jd-decoy shape, on purpose: production matched the posting's bullet first. */
const DISCIPLINE_OPTIONS = [
  "Computer Science", "Computer Engineering", "Electrical Engineering", "Information Systems",
  JD_DECOY_OPTION, "Mechanical Engineering", "Physics", "Statistics",
];

/* Deliberately holds NOTHING a resume would say. The point of select-search-echo is a control whose
   list cannot contain the answer, so the choice path is guaranteed to fail and the runner is
   guaranteed to reach the fall-through that types into the search box. */
const UNMATCHABLE_OPTIONS = ["Anthropology", "Classics", "Musicology", "Comparative Literature"];

const SCHOOL_OPTIONS = [
  "University of Southern California", "University of California, Berkeley",
  "Massachusetts Institute of Technology", "Stanford University",
];

export function ShapeForm({
  board,
  caseId,
  shape,
  answered,
}: {
  board: Board;
  caseId: string;
  shape: PortalShape;
  answered: boolean;
}) {
  /* Paylocity and BambooHR have no contact block of their own here: PortalForm returns early for
     both before the block is rendered, so the extracted component cannot accept them. A shape page
     for those boards renders the greenhouse contact block, which is what the backend resolves
     ?board=paylocity&shape=... to anyway only when the board segment is dropped. Stated rather than
     silently coerced. */
  const contactBoard = (board === "paylocity" || board === "bamboohr" ? "greenhouse" : board) as
    Exclude<Board, "paylocity" | "bamboohr">;

  const confirmationId = `LITOS-QA-${caseId.toUpperCase()}`;
  const expectedCode = securityCodeFor(caseId);

  const [phase, setPhase] = useState<"form" | "security" | "done">("form");
  const [formError, setFormError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  /* Flipped by an effect, so it is only ever "1" once React has hydrated and the handlers are live.
     It lives on the FORM rather than on the log element because the managed runner's waitForSelector
     is Playwright's default, which waits for VISIBLE, and the log element is hidden. */
  const [hydrated, setHydrated] = useState(false);

  /* THE HYDRATION MARKER, AND WHY THE HARNESS NEEDS ONE.
     The managed runner navigates with waitUntil "domcontentloaded" and starts acting immediately.
     A React page that has rendered but not yet hydrated accepts a fill and drops every handler on
     the floor, so a run against a cold page silently exercises nothing and REPORTS A PASS. Measured
     here: the same date-overlay action list produced calendar_opened=1 on a warm page and 0 on a
     cold one. Production's own action lists open with a waitForSelector for this reason
     (pushGreenhouseManagedPreflightActions); the harness publishes the flag that makes one possible.
     Kept on the log element rather than the form so it survives the form being replaced by the
     receipt. */
  useEffect(() => { qaReady(shape); qaMirror("ready", "1"); setHydrated(true); }, [shape]);
  useEffect(() => { qaMirror("submit-attempts", String(attempts)); }, [attempts]);

  if (phase === "done") {
    return (
      <main className="min-h-screen bg-[#f7f7f3] px-6 py-16">
        <section
          className="mx-auto max-w-2xl rounded-2xl border border-[#d8d8d0] bg-white p-10 text-center"
          data-litos-qa-shape={shape}
          data-litos-qa-submit-attempts={attempts}
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#e8f5e9] text-2xl text-[#24713b]">+</div>
          <h1 className="mt-5 text-3xl font-semibold text-[#151512]">Thank you. Your application was received.</h1>
          <p className="mt-3 text-[#63635d]">This is a Litos test page. No employer got this application.</p>
          <p className="mt-5 font-mono text-sm text-[#24713b]">Confirmation ID: {confirmationId}</p>
        </section>
      </main>
    );
  }

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const next = attempts + 1;
    setAttempts(next);
    qaRecord("submit_attempt", String(next));

    if (shape === "phone-country") {
      const verdict = phoneVerdict(form);
      if (verdict) { setFormError(verdict); qaRecord("phone_rejected", verdict); return; }
    }

    if (shape === "security-code") {
      /* THE TWO-PHASE SUBMIT. Greenhouse accepts the first press, mails an 8-character code, renders
         the code field and refuses the application until the code comes back with a SECOND press.
         Three runs on 2026-08-08 (16:22, 16:34, 16:46) matched three emails to the minute and all
         three were written as ready_for_final_approval with submitted_at null, because the run
         treated the first press as terminal. */
      if (phase === "form") {
        qaRecord("security_code_sent", expectedCode);
        setPhase("security");
        setFormError(null);
        return;
      }
      const typed = String(new FormData(form).get("security_code") ?? "").trim().toUpperCase();
      if (typed !== expectedCode) {
        qaRecord("security_code_wrong", typed || "(empty)");
        setFormError("That security code is not correct. Check your email and try again.");
        return;
      }
      qaRecord("security_code_accepted", typed);
    }

    setFormError(null);
    setPhase("done");
  };

  return (
    <main className="min-h-screen bg-[#f7f7f3] px-6 py-12">
      <form
        data-litos-controlled-portal
        data-board={board}
        data-litos-qa-shape={shape}
        data-litos-qa-phase={phase}
        data-litos-qa-ready={hydrated ? "1" : "0"}
        onSubmit={onSubmit}
        className="mx-auto max-w-2xl rounded-2xl border border-[#d8d8d0] bg-white p-8"
      >
        <p className="font-mono text-xs uppercase tracking-wider text-[#4267d5]">
          Controlled {board} verification portal / shape {shape}
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-[#151512]">Software Engineering Intern, Summer 2027</h1>
        <p className="mt-2 text-sm text-[#63635d]">
          This form exercises the production {board} adapter without contacting an employer.
        </p>
        {/* The form's OWN legend, word for word off a live Greenhouse form. It matches the readiness
            script's error-text pattern, and an early version of that gate found only this on a
            completely correct application and would have refused every Greenhouse submission there
            is. LEGEND_TEXT exists to exclude it, so the fixture has to carry it. */}
        <p className="mt-4 text-xs text-[#63635d]">* indicates a required field</p>

        {shape === "select-jd-decoy" ? <JobDescriptionBody /> : null}

        <QaLog />
        <div className="relative mt-8 grid gap-5 sm:grid-cols-2">
          <BoardContactFields board={contactBoard} omitPhone={shape === "phone-country"} />
          <ShapeControls shape={shape} answered={answered} />
        </div>

        {phase === "security" ? <SecurityCodeStep caseId={caseId} /> : null}

        {formError
          ? <p className="mt-6 rounded-lg bg-[#fdecea] p-3 text-sm text-[#c0392b]" role="alert">{formError}</p>
          : null}

        <button
          type="submit"
          className="mt-8 rounded-full bg-[#4267d5] px-6 py-3 font-medium text-white"
        >
          Submit application
        </button>
      </form>
    </main>
  );
}

/* ─── the shapes themselves ─────────────────────────────────────────────────────────────────── */

function ShapeControls({ shape, answered }: { shape: PortalShape; answered: boolean }) {
  if (shape === "required-empty") {
    /* Deepgram packet 245c827a-daaa-463a-8026-04f89d6a69eb: green Send button, three starred fields
       visibly empty. All three are here, and the THIRD is the one that matters - it carries a red
       asterisk and no attribute of any kind, which is how a real Greenhouse form marks it and why a
       gate built on [required] alone reports the form complete. */
    return (
      <>
        <label className="field col-span-full block text-sm text-[#31312d]" htmlFor="candidate-location-required">
          Current Location<span className="required-asterisk text-[#c0392b]"> *</span>
          <input
            name="candidate-location"
            id="candidate-location-required"
            required
            defaultValue={answered ? "Dubai, United Arab Emirates" : ""}
            className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2"
          />
        </label>
        <ReactSelectFixture
          inputId="question_work_authorization"
          label="Are you legally authorized to work in the country where this role is located?"
          options={["Yes", "No"]}
          marker="aria"
          initialValue={answered ? "Yes" : undefined}
        />
        <ReactSelectFixture
          inputId="question_visa_sponsorship"
          label="Will you now or in the future require visa sponsorship to continue working in the country where this role is located?"
          options={["Yes", "No"]}
          /* THE ONE THAT IS MISSED. No required, no aria-required, red asterisk only. */
          marker="asterisk"
          initialValue={answered ? "Yes" : undefined}
        />
      </>
    );
  }

  if (shape === "select-late-menu") {
    return (
      <ReactSelectFixture
        inputId="discipline--0"
        label="Discipline"
        options={DISCIPLINE_OPTIONS}
        initialValue={answered ? "Computer Science" : undefined}
      />
    );
  }

  if (shape === "select-jd-decoy") {
    return (
      <ReactSelectFixture
        inputId="discipline--0"
        label="Discipline"
        options={DISCIPLINE_OPTIONS}
        initialValue={answered ? JD_DECOY_OPTION : undefined}
      />
    );
  }

  if (shape === "select-preserve") {
    /* School comes in ALREADY ANSWERED and is never the control the packet targets. Discipline is
       the one a run fills. The question is only whether School still holds its answer afterwards.
       Both mechanisms that emptied it in production are live here: fill('') reaches the combobox as
       a Delete keypress, and the clear control is a [role="button"] inside the widget, which is in
       the managed sweep's own control list. */
    return (
      <>
        <ReactSelectFixture
          inputId="school--0"
          label="School"
          options={SCHOOL_OPTIONS}
          initialValue="University of Southern California"
          clearable
        />
        <ReactSelectFixture
          inputId="discipline--0"
          label="Discipline"
          options={DISCIPLINE_OPTIONS}
          initialValue={answered ? "Computer Science" : undefined}
        />
      </>
    );
  }

  if (shape === "select-search-echo") {
    /* No option here can ever match a real discipline, so the choice path is guaranteed to fail and
       the runner is guaranteed to reach `locator.fill(value)` on the combobox input. After that the
       widget still reads "Select..." while the input holds the typed text. A trial can tell the two
       apart: .select__single-value is the answer, the input's value is not. */
    return (
      <ReactSelectFixture
        inputId="discipline--0"
        label="Discipline"
        options={UNMATCHABLE_OPTIONS}
        initialValue={answered ? "Classics" : undefined}
      />
    );
  }

  if (shape === "segmented-yesno") return <SegmentedYesNo answered={answered} />;
  if (shape === "date-overlay") return <DateOverlay answered={answered} />;
  if (shape === "phone-country") return <PhoneWithCountry answered={answered} />;
  if (shape === "security-code") return null;
  if (shape === "stale-error") return <StaleErrors realBlockerId={null} />;
  if (shape === "stale-error-real") return <StaleErrors realBlockerId="stale-cover-note" />;
  if (shape === "cover-letter-attach") return <CoverLetterAttachment />;
  if (shape === "eeo-radio-groups") return <EeoRadioGroups answered={answered} />;
  return null;
}

/* ─── 12. Ashby's EEO radio groups, and the preamble that swallowed them ────────────────────── */

/* Copied from the live Skydio Ashby form, 2026-08-09
 * (jobs.ashbyhq.com/skydio/.../application), the same board and the same four questions as
 * production packet 13bccb2d-d726-4c47-80bc-e8090ae1463e.
 *
 * Five properties, each one load-bearing. Drop any of them and the shape passes against the broken
 * runner:
 *
 *  1. THE PREAMBLE COMES FIRST AND CONTAINS THE QUESTION WORDS. This is the whole defect. The
 *     equal-opportunity paragraph says "race, color, religion, sex, gender identity" three questions
 *     above any control, so the first element on the page containing "gender" is prose, and an
 *     anchor of getByText(question).first() resolves the question's "container" to the section that
 *     holds every group at once.
 *  2. TWO GROUPS IN ONE SECTION. Eleven radios across two questions is what the wrong anchor then
 *     searches, in DOM order.
 *  3. BOTH GROUPS END IN "Decline to self-identify". So the race answer matches the GENDER option
 *     first and sets it, which is not merely a miss: it silently replaces an answer the applicant
 *     gave with one she did not, on the one family of questions that is hers alone. Measured on the
 *     live form, the gender control finished holding "Decline to self-identify" after a run whose
 *     packet said Female.
 *  4. THE TWO GROUPS ARE SPELLED DIFFERENTLY. Gender is Ashby's shipped markup: a name on every
 *     radio and a label[for]. Race carries NO name attribute and associates its labels by WRAPPING
 *     the input, which is the harder spelling and the one a name-based group check cannot see.
 *  5. ONE OPTION IS QUALIFIED WITH EXTRA WORDS. "Asian (Not Hispanic or Latino)" is off the real
 *     form verbatim. A stored "Asian" fails containment against it at both layers - the resolver's
 *     chooseClosestOption and the runner's optionMatches - and the answer falls to the opt-out. That
 *     gap is open and this shape exists partly to keep it measured rather than forgotten.
 *
 * The verdict is read off the FIXTURE. Both groups publish the option they currently hold, computed
 * from the DOM rather than from React state, so a run that ticks two radios in one group (which the
 * unnamed group physically permits) reports both instead of hiding one.
 */
const EEO_GENDER_OPTIONS = ["Male", "Female", "Decline to self-identify"];

const EEO_RACE_OPTIONS = [
  "Hispanic or Latino",
  "White (Not Hispanic or Latino)",
  "Black or African American (Not Hispanic or Latino)",
  "Native Hawaiian or Other Pacific Islander (Not Hispanic or Latino)",
  "Asian (Not Hispanic or Latino)",
  "American Indian or Alaska Native (Not Hispanic or Latino)",
  "Two or More Races (Not Hispanic or Latino)",
  "Decline to self-identify",
];

/* Read out of the DOM, for both groups at once, rather than off React state. The race group has no
   name, so the browser does not enforce one-of, and "what does this question hold" is a question
   only the DOM can answer honestly. Joined with " + " so a group left holding two answers is
   visible as one string rather than silently reported as the last one written. */
function publishEeoGroups() {
  for (const group of ["gender", "race"]) {
    const held = [...document.querySelectorAll<HTMLInputElement>(`input[data-eeo-group="${group}"]`)]
      .filter((input) => input.checked)
      .map((input) => input.getAttribute("data-eeo-option") ?? "");
    qaMirror(`eeo-${group}`, held.join(" + "));
  }
}

function EeoRadioGroups({ answered }: { answered: boolean }) {
  useEffect(() => { publishEeoGroups(); }, []);

  const onPick = (group: "gender" | "race", option: string) => () => {
    qaRecord("eeo_option_set", `${group}:${option}`);
    publishEeoGroups();
  };

  return (
    <div className="field col-span-full" data-litos-qa-eeo-section>
      {/* (1) The trap. Word for word off the live form, and the reason the anchor missed. */}
      <h2 className="text-lg font-semibold text-[#151512]">
        Voluntary Self-Identification
      </h2>
      <p className="mt-2 text-sm text-[#63635d]">
        Skydio provides equal employment opportunities to applicants and employees without regard to
        race, color, religion, sex, gender identity, sexual orientation, national origin, age,
        disability, protected veteran status, or any other characteristic protected by law.
      </p>
      <p className="mt-2 text-sm text-[#63635d]">
        We invite all applicants to voluntarily self-identify their race, ethnicity and gender. Your
        answers are voluntary and will not be considered in the hiring decision.
      </p>

      {/* (2) and (4a). Ashby's own spelling: a shared name and label[for]. */}
      <fieldset className="mt-6" data-field-path="_systemfield_eeoc_gender">
        <label className="block text-sm font-medium text-[#31312d]" htmlFor="_systemfield_eeoc_gender">
          Gender
        </label>
        <div className="mt-1 text-xs text-[#63635d]"><p>Input gender</p></div>
        {EEO_GENDER_OPTIONS.map((option, index) => (
          <div key={option} className="mt-2 flex items-center gap-2">
            <span>
              <input
                type="radio"
                id={`eeoc-gender-labeled-radio-${index}`}
                name="_systemfield_eeoc_gender"
                data-eeo-group="gender"
                data-eeo-option={option}
                defaultChecked={answered && option === "Female"}
                onChange={onPick("gender", option)}
              />
            </span>
            <label htmlFor={`eeoc-gender-labeled-radio-${index}`} className="text-sm text-[#31312d]">
              {option}
            </label>
          </div>
        ))}
      </fieldset>

      {/* (2), (3), (4b) and (5). No name anywhere, labels associated by wrapping, eight options, the
          last one identical to the gender group's last one, and one qualified with extra words. */}
      <fieldset className="mt-6" data-field-path="_systemfield_eeoc_race">
        <label className="block text-sm font-medium text-[#31312d]" htmlFor="_systemfield_eeoc_race">
          Race
        </label>
        <div className="mt-1 text-xs text-[#63635d]">
          <ul>
            <li><p><strong>Asian</strong> (Not Hispanic or Latino) - A person having origins in any of the original peoples of the Far East, Southeast Asia, or the Indian Subcontinent.</p></li>
            <li><p><strong>Two or More Races</strong> (Not Hispanic or Latino) - All persons who identify with more than one of the above races.</p></li>
          </ul>
        </div>
        {EEO_RACE_OPTIONS.map((option, index) => (
          <div key={option} className="mt-2">
            <label className="flex items-center gap-2 text-sm text-[#31312d]">
              <input
                type="radio"
                id={`eeoc-race-labeled-radio-${index}`}
                data-eeo-group="race"
                data-eeo-option={option}
                defaultChecked={false}
                onChange={onPick("race", option)}
              />
              {option}
            </label>
          </div>
        ))}
      </fieldset>
    </div>
  );
}

/* ─── 11. Greenhouse's cover-letter control ─────────────────────────────────────────────────── */

/* THE CONTROL THAT NO LITOS APPLICATION HAS EVER PUT A FILE INTO.
 *
 * Copied from the live Cresta form, 2026-08-09
 * (job-boards.greenhouse.io/embed/job_app?for=cresta&token=5213417008), where the whole block is:
 *
 *   <div>Cover Letter</div>
 *   <button>Attach</button> <button>Dropbox</button> <button>Enter manually</button>
 *   <input id="cover_letter" class="visually-hidden" type="file" accept=".pdf,.doc,.docx,.txt,.rtf">
 *
 * Four properties of that markup, each one of which has to survive into this fixture or the shape
 * proves nothing:
 *
 *  1. NO name attribute. `input[type="file"][name*="cover" i]` cannot match it.
 *  2. The caption is a plain div, not label[for]. `label:has-text("Cover Letter") input[type=file]`
 *     cannot match it either.
 *  3. The input is CLIPPED, not display:none. setInputFiles works on it; a click-the-visible-control
 *     approach does not, because "Attach" opens the OS file dialog.
 *  4. It is OPTIONAL. The product's promise on the pre-fill screen is that Litos attaches a cover
 *     letter "even when it is marked optional", so required here would test the wrong form.
 *
 * The third input is the trap. "Additional documents" carries no cover in its name or id, sits
 * after the cover letter in DOM order, and is what a page-wide input[type=file] sweep or an
 * off-by-one nth-match lands on. A run that files the letter there is worse than one that files it
 * nowhere: the employer receives the applicant's cover letter under a heading she did not choose.
 *
 * Nothing is uploaded anywhere. onChange reads files[0].name off the input and mirrors it to the QA
 * log so the trial's verdict comes from THE PAGE rather than from the runner's own report - the
 * runner pushes an upload's label into filledFields on the strength of setInputFiles not throwing,
 * which is exactly the kind of self-certification this harness exists to go behind.
 */
function CoverLetterAttachment() {
  const record = (slot: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const name = event.currentTarget.files?.[0]?.name ?? "";
    qaMirror(`${slot}-file`, name);
    qaRecord("file_attached", `${slot}:${name}`);
  };
  /* The resume input belongs to BoardContactFields, so it is instrumented from here rather than
     forked. Both files matter to this shape: the defect it stands for is one document missing, and
     the failure mode next door is the two documents swapped. */
  useEffect(() => {
    const resume = document.getElementById("resume") as HTMLInputElement | null;
    if (!resume) return;
    const onChange = () => {
      const name = resume.files?.[0]?.name ?? "";
      qaMirror("resume-file", name);
      qaRecord("file_attached", `resume:${name}`);
    };
    resume.addEventListener("change", onChange);
    return () => resume.removeEventListener("change", onChange);
  }, []);
  return (
    <>
      <div className="field col-span-full">
        {/* A DIV, not a label. See property 2 above. */}
        <div className="text-sm text-[#31312d]">Cover Letter</div>
        <div className="mt-2 flex gap-2">
          {["Attach", "Dropbox", "Enter manually"].map((choice) => (
            <button
              key={choice}
              type="button"
              className="rounded-lg border border-[#cfcfc6] px-3 py-1.5 text-sm text-[#31312d]"
              onClick={() => qaRecord("cover_trio_clicked", choice)}
            >
              {choice}
            </button>
          ))}
        </div>
        <input
          id="cover_letter"
          type="file"
          accept=".pdf,.doc,.docx,.txt,.rtf"
          // sr-only is the same clip Greenhouse's own .visually-hidden applies. NOT hidden and NOT
          // display:none: the live input is in the layout and reachable by setInputFiles, and a
          // fixture that removed it from the box model would be an easier form than the real one.
          className="sr-only"
          onChange={record("cover")}
        />
      </div>
      {/* THE DECOY. No cover anywhere in its name or id, and it comes last. */}
      <div className="field col-span-full">
        <div className="text-sm text-[#31312d]">Additional documents</div>
        <input
          id="additional_documents"
          name="job_application[additional]"
          type="file"
          accept=".pdf,.doc,.docx,.txt,.rtf"
          className="sr-only"
          onChange={record("extra")}
        />
      </div>
    </>
  );
}

/* ─── 6. Ashby's segmented Yes/No ───────────────────────────────────────────────────────────── */

/* Ashby renders work authorization and sponsorship as a two-button segmented control: a radiogroup
 * of role="radio" buttons carrying aria-checked, with the answer written into a hidden input. There
 * is no <select>, no <input type=radio> and no combobox, so every selector family the adapter owns
 * misses it, and NEITHER OPTION SELECTED is the production state.
 *
 * It is also the shape that shows the readiness gate's blind spot most cleanly. widgetHasAnswer()
 * skips hidden inputs and looks for `.checked` on real radios, so this widget reads as unanswered
 * whether or not a button is pressed. `?answered=1` renders it pressed, which is how a trial tells
 * "the gate cannot answer it" from "the gate cannot SEE the answer".
 */
function SegmentedYesNo({ answered }: { answered: boolean }) {
  const [value, setValue] = useState(answered ? "Yes" : "");
  return (
    <div
      className="field col-span-full"
      role="group"
      aria-labelledby="segmented-workauth-label"
    >
      <span id="segmented-workauth-label" className="block text-sm text-[#31312d]">
        Are you legally authorized to work in the United States?
        <span className="required-asterisk text-[#c0392b]"> *</span>
      </span>
      <div
        role="radiogroup"
        aria-required="true"
        aria-labelledby="segmented-workauth-label"
        className="mt-2 inline-flex overflow-hidden rounded-lg border border-[#cfcfc6]"
      >
        {["Yes", "No"].map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            className={`px-5 py-2 text-sm ${value === option ? "bg-[#4267d5] text-white" : "bg-white text-[#31312d]"}`}
            onClick={() => { setValue(option); qaRecord("segmented_set", option); }}
          >
            {option}
          </button>
        ))}
      </div>
      <input type="hidden" name="_systemfield_work_authorization" value={value} readOnly />
    </div>
  );
}

/* ─── 7. the calendar that stays open ───────────────────────────────────────────────────────── */

/* On Deepgram, filling Expected Graduation Year left the May 2028 calendar open across the following
 * question and its label. Nothing closed it, so the next control was covered by an absolutely
 * positioned overlay and every subsequent click landed on the calendar.
 *
 * Reproduced exactly: the overlay opens on focus or click, does NOT close when a date is chosen, and
 * closes only on Escape or a click outside. A correct run therefore has to dismiss it. A trial can
 * measure this without reading the fixture's mind: document.elementFromPoint over the centre of the
 * NEXT control must return that control and not the calendar.
 */
function DateOverlay({ answered }: { answered: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(answered ? "May 2028" : "");
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-litos-qa-datepicker]")) return;
      setOpen(false);
      qaRecord("calendar_dismissed", "outside_click");
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      qaRecord("calendar_dismissed", "escape");
    };
    document.addEventListener("mousedown", dismiss, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("mousedown", dismiss, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [open]);

  /* Mirrored for the same reason the react-select values are: the real managed runner can read an
     attribute and cannot run elementFromPoint. This is the actual measurement the defect is about -
     not "is a calendar open" but "is the next question's control reachable" - so the page computes
     it and publishes the answer. Polled rather than computed on render because the overlay's
     geometry settles a frame after the state change. */
  useEffect(() => {
    const tick = () => {
      const next = document.querySelector("#how-did-you-hear");
      if (!next) return;
      const box = next.getBoundingClientRect();
      const over = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      qaMirror("covers-next", over?.closest("[data-litos-qa-calendar]") ? "yes" : "no");
    };
    tick();
    const handle = setInterval(tick, 100);
    return () => clearInterval(handle);
    // Keyed on `open` as well as mount: the managed runner's next action follows a fill by a few
    // milliseconds, and a 100 ms poll alone would let it read the answer from before the calendar
    // appeared. Re-running the measurement on the same commit that opens the overlay is what makes
    // the published answer true at the moment the runner asks.
  }, [open]);

  return (
    <>
      <div className="field relative col-span-full" data-litos-qa-datepicker>
        {/* #end-year--0 is GREENHOUSE'S OWN ID for the education end-year field, and the id the
            production builder writes into a real action:
              portalSubmission.ts  managedFill(actions, '#end-year--0', packet.graduationYear, ...)
            Using it is what makes this shape reachable by an unmodified production action list. A
            fixture with a name of its own invention would sit untouched and pass. */}
        <label className="block text-sm text-[#31312d]" htmlFor="end-year--0">
          Expected Graduation Year<span className="required-asterisk text-[#c0392b]"> *</span>
        </label>
        <input
          id="end-year--0"
          name="end-year--0"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => { setOpen(true); qaRecord("calendar_opened"); }}
          onClick={() => { setOpen(true); qaRecord("calendar_opened"); }}
          className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2"
        />
        {open
          ? (
            <div
              data-litos-qa-calendar
              className="absolute left-0 top-full z-30 w-80 rounded-lg border border-[#cfcfc6] bg-white p-4 shadow-xl"
            >
              <p className="text-sm font-medium text-[#151512]">May 2028</p>
              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs">
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                  <button
                    key={day}
                    type="button"
                    className="rounded px-1 py-1 hover:bg-[#eef2ff]"
                    /* Chooses the value and DOES NOT CLOSE. This is the measured behaviour. */
                    onClick={() => { setValue("May 2028"); qaRecord("calendar_date_picked", String(day)); }}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )
          : null}
      </div>
      {/* THE QUESTION THE CALENDAR COVERED. Its label and its control both sit inside the overlay's
          footprint while the calendar is open. */}
      <label className="field col-span-full block text-sm text-[#31312d]" htmlFor="how-did-you-hear">
        How did you hear about this role?
        <input
          id="how-did-you-hear"
          name="how-did-you-hear"
          className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2"
        />
      </label>
    </>
  );
}

/* ─── 8. the phone that is too short because it is too long ─────────────────────────────────── */

/* Cresta rejected "+971 567417451" with "Phone number is too short". The country selector already
 * carried +971, so the submitted number was "+971+971567417451" as far as the validator was
 * concerned. The selector defaults to the United Arab Emirates here for the same reason the defect
 * happened there: the applicant's stored phone is a +971 number.
 */
const DIAL_CODES: Array<[label: string, dial: string]> = [
  ["United Arab Emirates (+971)", "+971"],
  ["United States (+1)", "+1"],
  ["United Kingdom (+44)", "+44"],
  ["India (+91)", "+91"],
];

function PhoneWithCountry({ answered }: { answered: boolean }) {
  return (
    <div className="field col-span-full">
      <label className="block text-sm text-[#31312d]" htmlFor="phone-national">
        Phone<span className="required-asterisk text-[#c0392b]"> *</span>
      </label>
      <div className="mt-2 flex gap-2">
        <select
          name="phone_country"
          aria-label="Country code"
          defaultValue="+971"
          className="rounded-lg border border-[#cfcfc6] px-3 py-2"
        >
          {DIAL_CODES.map(([label, dial]) => <option key={dial} value={dial}>{label}</option>)}
        </select>
        <input
          id="phone-national"
          name="phone_national"
          type="tel"
          defaultValue={answered ? "567417451" : ""}
          className="block w-full rounded-lg border border-[#cfcfc6] px-3 py-2"
        />
      </div>
    </div>
  );
}

/* THE EMPLOYER'S VALIDATOR, AND WHAT IS AND IS NOT KNOWN ABOUT IT.
 *
 * MEASURED: Cresta's form, with the country selector on United Arab Emirates, rejected the value
 * "+971 567417451" with the message "Phone number is too short". NOT MEASURED: the internals of the
 * widget that produced it. Combining a selector holding +971 with a field that also holds +971 gives
 * a string no country's numbering plan parses, and the phone-input libraries these forms use report
 * that as a length error.
 *
 * So the rule below is stated as the CONTRACT rather than as a guess at the library: the field is
 * for the national number, and a "+" or a repeated dial code in it is rejected with the message the
 * live form returned. That is honest about what was observed, and it makes the passing behaviour
 * unambiguous - write the national number, which is exactly what nationalPhoneForCountryCodeField
 * already does for Rippling and does not do for anything else.
 */
function phoneVerdict(form: HTMLFormElement): string | null {
  const data = new FormData(form);
  const dialDigits = String(data.get("phone_country") ?? "").replace(/\D/g, "");
  const raw = String(data.get("phone_national") ?? "").trim();
  if (!raw) return "Phone number is required";
  const digits = raw.replace(/\D/g, "");
  if (raw.includes("+") || digits.startsWith("00") || (dialDigits && digits.startsWith(dialDigits))) {
    return "Phone number is too short";
  }
  if (digits.length < 7) return "Phone number is too short";
  return null;
}

/* ─── 9. the emailed security code ──────────────────────────────────────────────────────────── */

function SecurityCodeStep({ caseId }: { caseId: string }) {
  return (
    <div className="field mt-8 rounded-lg border border-[#e2c17a] bg-[#fff8e8] p-5">
      <p className="text-sm font-medium text-[#7a5a1e]">
        We emailed you an 8-character security code. Enter it below and submit the application again.
      </p>
      <label className="mt-3 block text-sm text-[#31312d]" htmlFor="security_code">
        Security code<span className="required-asterisk text-[#c0392b]"> *</span>
        <input
          id="security_code"
          name="security_code"
          aria-label="Security code"
          autoComplete="one-time-code"
          maxLength={8}
          required
          className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2 font-mono uppercase"
        />
      </label>
      <p className="mt-2 text-xs text-[#7a5a1e]">
        In the harness the code is served at /qa/portal-submission/security-code?case={caseId} rather
        than mailed. It is never printed on this page.
      </p>
    </div>
  );
}

/* ─── 10. the error text that means nothing, and the error text that means everything ────────── */

/* Redwood Materials, 2026-08-08: one stray keystroke ran the employer's validator while the form was
 * half filled, six "is required" messages rendered, and NOT ONE cleared when those fields were then
 * filled correctly. Submitting that same form passed validation with zero errors and posted.
 *
 * So a gate that refuses on error TEXT would refuse every Greenhouse submission there is, and a gate
 * that ignores error text entirely misses the case where the message is telling the truth about a
 * control no attribute marks as required. Both mistakes have to be catchable, which takes two pages:
 *
 *   shape=stale-error       five FILLED controls, five stale messages. Correct answer: nothing blocks.
 *   shape=stale-error-real  the same five, plus one EMPTY control with the same message and no
 *                           required attribute. Correct answer: that one, and only that one, blocks.
 */
function StaleErrors({ realBlockerId }: { realBlockerId: string | null }) {
  const stale = "This field is required.";
  return (
    <>
      <label className="field col-span-full block text-sm text-[#31312d]" htmlFor="stale-phone">
        Phone
        <input id="stale-phone" name="stale-phone" defaultValue="+971 56 741 7451" className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2" />
        <span className="field-error mt-1 block text-sm text-[#c0392b]">{stale}</span>
      </label>
      <label className="field col-span-full block text-sm text-[#31312d]" htmlFor="stale-location">
        Current Location
        <input id="stale-location" name="stale-location" defaultValue="Dubai, United Arab Emirates" className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2" />
        <span className="field-error mt-1 block text-sm text-[#c0392b]">{stale}</span>
      </label>
      <label className="field col-span-full block text-sm text-[#31312d]" htmlFor="stale-linkedin">
        LinkedIn Profile
        <input id="stale-linkedin" name="stale-linkedin" defaultValue="https://www.linkedin.com/in/mehekmandal" className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2" />
        <span className="field-error mt-1 block text-sm text-[#c0392b]">{stale}</span>
      </label>
      <ReactSelectFixture
        inputId="school--0"
        label="School"
        options={SCHOOL_OPTIONS}
        initialValue="University of Southern California"
        errorText={stale}
      />
      <ReactSelectFixture
        inputId="discipline--0"
        label="Discipline"
        options={DISCIPLINE_OPTIONS}
        initialValue="Computer Science"
        errorText={stale}
      />
      {realBlockerId
        ? (
          /* THE ONE THAT IS TELLING THE TRUTH. Empty, and marked required by NOTHING except the
             message underneath it. */
          <label className="field col-span-full block text-sm text-[#31312d]" htmlFor={realBlockerId}>
            Why do you want to work here?
            <textarea
              name={realBlockerId}
              id={realBlockerId}
              className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2"
            />
            <span className="field-error mt-1 block text-sm text-[#c0392b]">{stale}</span>
          </label>
        )
        : null}
    </>
  );
}

/* ─── the posting body that answered a question it was never asked ──────────────────────────── */

/* Production clicked this bullet, returned true, and left the control reading "Select...". The cause
 * is in the managed runner: its option click is scoped to the PAGE, not to the widget, and its
 * selector list ends in a bare `li`. So any list item on the page whose text contains the wanted
 * option is a candidate, and a job description is full of them.
 *
 * The bullet is the literal sentence from the posting that did it. Keeping the option's exact text
 * inside it is the entire point; a paraphrase would prove nothing.
 */
function JobDescriptionBody() {
  return (
    <section className="mt-8 rounded-lg bg-[#f2f2ee] p-5 text-sm text-[#31312d]" data-litos-qa-jd>
      <h2 className="text-base font-medium text-[#151512]">About the role</h2>
      <p className="mt-2">
        You will join a small team building high throughput systems. We care about correctness, about
        measurement, and about people who can explain why something worked.
      </p>
      <h3 className="mt-4 text-sm font-medium text-[#151512]">What we look for</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li onClick={() => qaRecord("decoy_clicked", JD_DECOY_BULLET.slice(0, 60))}>{JD_DECOY_BULLET}</li>
        <li onClick={() => qaRecord("decoy_clicked", "internship experience")}>
          previous internship experience in software engineering or quantitative research
        </li>
        <li onClick={() => qaRecord("decoy_clicked", "graduating 2027 or 2028")}>
          graduating in 2027 or 2028 and available for a full summer
        </li>
      </ul>
      <h3 className="mt-4 text-sm font-medium text-[#151512]">What you will do</h3>
      <p className="mt-2">
        Own a service end to end. Write the tests that would have caught the last outage. Read more
        code than you write, and leave the parts you touch clearer than you found them.
      </p>
    </section>
  );
}
