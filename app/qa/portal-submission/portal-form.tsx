"use client";

import { createElement, useState } from "react";

// The board union comes from ./boards, which is the single list both route files also read. Keeping
// one source is what stops the drift that already happened once: the ?board= route was never updated
// when Workable, JazzHR and Paylocity shipped, so ?board=workable rendered a GREENHOUSE form while
// the backend resolved that url to controlled_workable - a run that exercised the wrong adapter and
// would still have looked like a pass.
import type { BoardName as Board } from "./boards";

export type { Board };


export function PortalForm({ board, caseId }: { board: Board; caseId: string }) {
  const confirmationId = `LITOS-QA-${caseId.toUpperCase()}`;
  const [submitted, setSubmitted] = useState(false);
  const [step, setStep] = useState(1);

  // Paylocity is a genuine FOUR-step wizard, so the fixture is one too. Two properties matter and
  // both are reproduced from the live form:
  //  1. The advance button reuses ONE id (#btn-submit) across every step, and its LABEL is the only
  //     thing distinguishing "Next Step" from the terminal submit. That is what the adapter's
  //     :has-text("Next Step") selector keys off, so the fixture must reuse the id too or the
  //     traversal test proves nothing.
  //  2. The final step carries the acknowledgement/EEO/prior-conviction markers and NEVER renders a
  //     receipt from an advance click. A receipt reachable by advancing would let a regression
  //     manufacture a "submitted" for an application no employer received.
  // Paylocity returns early below, so it is deliberately ABSENT from the single-step field list
  // further down. Leaving a `board === "paylocity"` branch there is not merely dead code: after the
  // early return TypeScript narrows `board` to exclude it, and the impossible comparison fails the
  // production build (`next build` type-checks app code even though `tsc -p .` does not reach it).
  const multiStep = board === "paylocity";
  const LAST_STEP = 4;

  if (multiStep) {
    return <PaylocityWizard step={step} setStep={setStep} lastStep={LAST_STEP} confirmationId={confirmationId} />;
  }

  // BambooHR returns early for the same reason Paylocity does, and carries the same warning: it must
  // stay ABSENT from the single-step field list below, or TypeScript's narrowing after this return
  // makes `board === "bamboohr"` an impossible comparison that fails `next build`.
  //
  // Its own reason for being here: on the live form the fields do not exist in the DOM at all until
  // "Apply for This Job" is pressed, and /careers/{id}/apply is a blank page. A fixture that rendered
  // the fields immediately would let an adapter that never clicks the button pass here and find
  // nothing on the real form.
  if (board === "bamboohr") {
    return <BambooHrForm confirmationId={confirmationId} />;
  }

  if (submitted) {
    return <main className="min-h-screen bg-[#f7f7f3] px-6 py-16"><section className="mx-auto max-w-2xl rounded-2xl border border-[#d8d8d0] bg-white p-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#e8f5e9] text-2xl text-[#24713b]">✓</div><h1 className="mt-5 text-3xl font-semibold text-[#151512]">Thank you. Your application was received.</h1><p className="mt-3 text-[#63635d]">This is a Litos test page. No employer got this application.</p><p className="mt-5 font-mono text-sm text-[#24713b]">Confirmation ID: {confirmationId}</p></section></main>;
  }

  return <main className="min-h-screen bg-[#f7f7f3] px-6 py-12"><form data-litos-controlled-portal data-board={board} onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }} className="mx-auto max-w-2xl rounded-2xl border border-[#d8d8d0] bg-white p-8"><p className="font-mono text-xs uppercase tracking-wider text-[#4267d5]">Controlled {board} verification portal</p><h1 className="mt-2 text-3xl font-semibold text-[#151512]">Software Engineering Intern, Summer 2027</h1><p className="mt-2 text-sm text-[#63635d]">This form exercises the production {board} adapter without contacting an employer.</p><div className="mt-8 grid gap-5 sm:grid-cols-2">{board === "greenhouse" && <GreenhouseFields />}{board === "lever" && <LeverFields />}{board === "ashby" && <AshbyFields />}{board === "smartrecruiters" && <SmartRecruitersFields />}{board === "workable" && <WorkableFields />}{board === "jazzhr" && <JazzHrFields />}{board === "rippling" && <RipplingFields />}{board === "breezy" && <BreezyFields />}</div><button type="submit" data-testid={board === "rippling" ? "Apply" : undefined} className="mt-8 rounded-full bg-[#4267d5] px-6 py-3 font-medium text-white">Submit application</button></form></main>;
}

function GreenhouseFields() {
  return <><Field name="job_application[first_name]" label="First name" required /><Field name="job_application[last_name]" label="Last name" required /><Field id="email" label="Email" type="email" required /><Field id="phone" label="Phone" /><Field id="candidate-location" label="Location" /><FileField id="resume" name="job_application[resume]" /></>;
}

function LeverFields() {
  return <><Field name="name" label="Full name" required /><Field name="email" label="Email" type="email" required /><Field name="phone" label="Phone" /><Field name="urls[LinkedIn]" label="LinkedIn" /><Field name="urls[GitHub]" label="GitHub" /><Field name="urls[Portfolio]" label="Portfolio" /><FileField name="resume" /></>;
}

function AshbyFields() {
  return <><Field name="_systemfield_name" label="Full name" required /><Field name="_systemfield_email" label="Email" type="email" required /><Field name="_systemfield_phone" label="Phone" /><Field name="_systemfield_location" label="Location" /><Field name="_systemfield_linkedin" label="LinkedIn profile" /><Field name="github-profile" label="GitHub profile" /><Field name="portfolio-url" label="Portfolio" /><FileField name="resume" /></>;
}

function SmartRecruitersFields() {
  const upload = createElement("spl-dropzone", { "data-test": "resume-upload" }, <FileField name="resume" bare />);
  return <><Field id="first-name-input" label="First name" required /><Field id="last-name-input" label="Last name" required /><Field id="email-input" label="Email" type="email" required /><Field id="confirm-email-input" label="Confirm email" type="email" required /><Field name="phone" label="Phone number" ariaLabel="Phone number" /><Field id="linkedin-input" label="LinkedIn" /><Field id="website-input" label="Website" />{upload}</>;
}

// Every fixture below reproduces the REAL rendered DOM captured from a live posting on 2026-07-28
// (see litos-ats-dom-capture-2026-07-28.md in the vault), including each platform's traps. That
// fidelity is the whole point: a fixture written from the same guess as the adapter would pass and
// prove nothing. Where a trap exists, it is reproduced here on purpose and commented as such.

function WorkableFields() {
  return <>
    <Field name="firstname" label="First name" required /><Field name="lastname" label="Last name" required />
    <Field name="email" label="Email" type="email" required /><Field name="phone" label="Phone" />
    <Field name="headline" label="Headline" /><Field name="city" label="City" />
    {/* TRAP, reproduced deliberately: the avatar file input comes FIRST in the real DOM, and the
        resume input's id is randomised per render. An adapter matching input[type=file] or an id
        files the resume as the profile photo. Only [data-ui="resume"] is correct. */}
    <FileField name="" id="input_files_input_waZCbCMgJvJuCMpr" dataUi="avatar" label="Profile photo" required={false} />
    <FileField name="" id="input_files_input_Zos7eYaJDFVTg6xg" dataUi="resume" label="Resume" required />
    {/* Consent checkbox: the adapter must never tick this. */}
    <label className="block text-sm text-[#31312d]"><input type="checkbox" name="gdpr" className="mr-2" />I agree to the processing of my data</label>
  </>;
}

function JazzHrFields() {
  return <>
    <Field name="resumator-firstname-value" label="First name" /><Field name="resumator-lastname-value" label="Last name" />
    <Field name="resumator-email-value" label="Email" /><Field name="resumator-phone-value" label="Phone" />
    <Field name="resumator-city-value" label="City" /><Field name="resumator-state-value" label="State" />
    <Field name="resumator-linkedin-value" label="LinkedIn" /><Field name="resumator-college-value" label="College" />
    <FileField name="resumator-resume-value" label="Resume" required={false} />
    {/* Cover letter is a TEXTAREA here, not a file input - the reason jazzhr's entry in
        COVER_LETTER_UPLOAD_SELECTORS is a deliberately never-matching file selector. */}
    <label className="block text-sm text-[#31312d]">Cover letter<textarea name="resumator-coverletter-value" className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2" /></label>
    {/* Voluntary EEO: the adapter must leave both blank. */}
    <label className="block text-sm text-[#31312d]">Gender<select name="resumator-eeo_gender-value" className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2"><option value="">Select</option><option>Female</option><option>Male</option></select></label>
    {/* TRAP: JazzHR gates submission behind reCAPTCHA. Its presence is what must drive the run to a
        blocker instead of a submit - portalCanAutoSubmit('jazzhr') is false for this reason. */}
    <textarea name="g-recaptcha-response" className="hidden" readOnly value="" />
    <div data-litos-fixture-note className="col-span-full rounded-lg bg-[#fff4e5] p-3 text-xs text-[#7a5a1e]">This fixture carries a reCAPTCHA field, so a JazzHR run must stop here and hand off.</div>
  </>;
}

// A faithful four-step Paylocity wizard. The single most important detail: #btn-submit is the SAME
// id on all four steps, and only its text changes. An adapter that advances by id alone will press
// Submit on step 4 - reproducing that here is what makes the traversal test meaningful.
function PaylocityWizard({ step, setStep, lastStep, confirmationId }: { step: number; setStep: (n: number) => void; lastStep: number; confirmationId: string }) {
  const [sent, setSent] = useState(false);
  const isLast = step === lastStep;

  if (sent) {
    return <main className="min-h-screen bg-[#f7f7f3] px-6 py-16"><section className="mx-auto max-w-2xl rounded-2xl border border-[#d8d8d0] bg-white p-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#e8f5e9] text-2xl text-[#24713b]">✓</div><h1 className="mt-5 text-3xl font-semibold text-[#151512]">Thank you. Your application was received.</h1><p className="mt-3 text-[#63635d]">This is a Litos test page. No employer got this application.</p><p className="mt-5 font-mono text-sm text-[#24713b]">Confirmation ID: {confirmationId}</p></section></main>;
  }

  return <main className="min-h-screen bg-[#f7f7f3] px-6 py-12"><form data-litos-controlled-portal data-board="paylocity" onSubmit={(e) => { e.preventDefault(); if (isLast) setSent(true); else setStep(step + 1); }} className="mx-auto max-w-2xl rounded-2xl border border-[#d8d8d0] bg-white p-8">
    <p className="progress-header font-mono text-xs uppercase tracking-wider text-[#4267d5]">Step {step} of {lastStep}</p>
    <h1 className="mt-2 text-3xl font-semibold text-[#151512]">{["Your information", "Work history", "Screening questions", "Review and confirm"][step - 1]}</h1>
    <div className="mt-8 grid gap-5 sm:grid-cols-2">
      {step === 1 && <PaylocityFields />}
      {step === 2 && <PaylocityWorkHistory />}
      {step === 3 && <PaylocityScreener />}
      {step === 4 && <PaylocityAcknowledgement />}
    </div>
    {/* Same id every step; only the label changes. This is the real behaviour. */}
    <button type="submit" id="btn-submit" className="mt-8 rounded-full bg-[#4267d5] px-6 py-3 font-medium text-white">{isLast ? "Submit application" : "Next Step"}</button>
  </form></main>;
}

function PaylocityWorkHistory() {
  return <>
    <Field noName id="workHistory.companyName.0" label="Company" /><Field noName id="workHistory.position.0" label="Position" />
    <label className="col-span-full block text-sm text-[#31312d]">Responsibilities<textarea id="workHistory.responsibilities.0" className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2" /></label>
    <Field id="txt-workHistory-startDate-0" label="Start date" /><Field id="txt-workHistory-endDate-0" label="End date" />
    <Field noName id="educationHistory.certificationsAndAwards" label="Certifications and awards" />
  </>;
}

function PaylocityScreener() {
  // Employer screener questions: mostly required choice controls on the live form. Litos fills only
  // reviewed free-text answers and leaves choice controls to the human, so these must stay untouched.
  return <>
    <label className="col-span-full block text-sm text-[#31312d]">Why are you interested in this role?<textarea aria-label="Why are you interested in this role?" className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2" /></label>
    <fieldset className="col-span-full text-sm text-[#31312d]"><legend>Do you have 2+ years of experience?</legend>
      <label className="mr-4"><input type="radio" name="screener-exp" className="mr-1" />Yes</label>
      <label><input type="radio" name="screener-exp" className="mr-1" />No</label>
    </fieldset>
  </>;
}

// The terminal step. Everything here is either voluntary self-identification or a legal attestation
// made in the student's name, so the adapter must reach this page and stop.
function PaylocityAcknowledgement() {
  return <>
    <span id="acknowledgements.eeoGenderEthnicity.notLastStepOrNotIncluded" />
    <span id="acknowledgements.priorConviction.notLastStep" />
    <span id="acknowledgements.authorizedToWorkInUS.notLastStep" />
    <label className="block text-sm text-[#31312d]">Gender<select id="eeo-gender" className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2"><option value="">Select</option><option>Female</option><option>Male</option></select></label>
    <label className="block text-sm text-[#31312d]">Race / ethnicity<select id="eeo-race" className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2"><option value="">Select</option><option>Asian</option></select></label>
    <fieldset className="col-span-full text-sm text-[#31312d]"><legend>Have you ever been convicted of a crime?</legend>
      <label className="mr-4"><input type="radio" name="priorConviction" className="mr-1" />Yes</label>
      <label><input type="radio" name="priorConviction" className="mr-1" />No</label>
    </fieldset>
    <fieldset className="col-span-full text-sm text-[#31312d]"><legend>Are you authorized to work in the US?</legend>
      <label className="mr-4"><input type="radio" name="authorizedToWorkInUS" className="mr-1" />Yes</label>
      <label><input type="radio" name="authorizedToWorkInUS" className="mr-1" />No</label>
    </fieldset>
    <label className="col-span-full block text-sm text-[#31312d]"><input type="checkbox" id="acknowledgement" className="mr-2" />By submitting your application you hereby certify that the facts set forth in the above employment application are true and complete to the best of your knowledge.</label>
  </>;
}

function PaylocityFields() {
  return <>
    {/* TRAP: dotted ids and NO name attribute. #info.firstName is invalid CSS for an id selector;
        only the [id="info.firstName"] attribute form matches. */}
    <Field noName id="info.firstName" label="First name" /><Field noName id="info.lastName" label="Last name" />
    <Field noName id="info.email" label="Email" /><Field noName id="info.cellPhone" label="Cell phone" />
    <Field noName id="info.linkedIn" label="LinkedIn" />
    <Field id="public-site-address-address-1" label="Address Line 1" required />
    <Field id="public-site-address-city" label="City" required />
    <Field id="public-site-address-us-state" label="State" required />
    <Field id="public-site-address-zip" label="Zip Code" required />
    {/* TRAP: three file inputs. A bare input[type=file] selector picks the wrong one. */}
    <FileField id="btn-resume" name="" label="Resume" /><FileField id="btn-coverLetter" name="" label="Cover letter" required={false} /><FileField id="btn-additionalFiles" name="" label="Additional files" required={false} />
    {/* Paylocity offers to parse the resume back into the form, which would overwrite our fills. */}
    <label className="block text-sm text-[#31312d]"><input type="checkbox" id="useAttachedResumeToFillOutApplication" className="mr-2" />Fill out application with my resume</label>
  </>;
}

// ─── 2026-07-29 captures. Same rule as above: every trap below is reproduced from a real form. ────

// Rippling (ats.rippling.com). THE trap: both `name` and `id` are randomised per render, so the
// fixture randomises them too. An adapter that matches either passes on one render and fails on the
// next, and only a fixture that actually randomises can catch that.
function RipplingFields() {
  // Deliberately opaque, in the shape Rippling emits (name="Z9gMtYRYFO", id="field-8").
  const junk = (n: number) => ({ id: `field-${n}`, name: Math.random().toString(36).slice(2, 12) });
  return <>
    <TestIdField testId="input-first_name" label="First name" {...junk(8)} />
    <TestIdField testId="input-last_name" label="Last name" {...junk(12)} />
    <TestIdField testId="input-email" label="Email" type="email" {...junk(16)} />
    <TestIdField testId="input-phone_number" label="Phone number" {...junk(31)} />
    <TestIdField testId="input-current_company" label="Current company" {...junk(27)} />
    {/* Two file inputs, both with a data-testid. Weaker than Workable's avatar trap and worth
        stating precisely: resume comes first here and on the live form, so a bare input[type=file]
        happens to resolve correctly today. Measured, not assumed. The captured selector still ships
        because "correct while the DOM order holds" is not a property worth relying on. */}
    <FileField name="" dataTestId="input-resume" label="Resume" />
    <FileField name="" dataTestId="input-cover_letter" label="Cover letter" required={false} />
    {/* THE OTHER trap: all three comboboxes share ONE data-testid, so they cannot be told apart by
        selector at all. Reading the label above each identifies them as pronouns, phone country code
        and race. Two are the applicant's own to declare, so there is nothing here to fill and the
        ambiguity never has to be resolved. */}
    <TestIdField testId="input-select-search-input" label="Pronouns" ariaLabel="Search" {...junk(20)} />
    <TestIdField testId="input-select-search-input" label="Country code" ariaLabel="Search" {...junk(34)} />
    <TestIdField testId="input-select-search-input" label="Please identify your race" ariaLabel="Select..." {...junk(61)} />
    {/* Marketing consent. Never ticked. */}
    <fieldset className="col-span-full text-sm text-[#31312d]"><legend>Text messages</legend>
      <label className="mr-4"><input type="radio" name="sms_opt_in" data-testid="radio-sms_opt_in" className="mr-1" />Yes - I consent to receiving text messages</label>
      <label><input type="radio" name="sms_opt_in" data-testid="radio-sms_opt_in" className="mr-1" />No</label>
    </fieldset>
  </>;
}

// BreezyHR (*.breezy.hr). Stable c-prefixed names, ONE full-name field, and a honeypot that is the
// most instructive thing captured all session.
function BreezyFields() {
  return <>
    {/* cName is a single full-name field. An adapter that splits into first/last finds nothing. */}
    <Field name="cName" label="Full Name" required />
    <Field name="cEmail" label="Email Address" type="email" required />
    <Field name="cPhoneNumber" label="Phone Number" />
    <Field id="fullAddress" name="cAddress" label="Address" />
    <FileField id="main-attachment" name="cResume" label="Resume" />
    {/* Long-form answer is a TEXTAREA, not a file input - why breezy's cover-letter entry in
        COVER_LETTER_UPLOAD_SELECTORS is a deliberately never-matching selector. */}
    <label className="col-span-full block text-sm text-[#31312d]">Summary<textarea name="cSummary" className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2" /></label>
    {/* Faithful to the live form: Breezy's trap carries NO label copy and NO placeholder hint, so
        the "leave this field blank" pattern that catches BambooHR's does nothing here. Prefix and
        ancestor geometry are the only tells. Giving it copy would make the fixture the easy case. */}
    <Honeypot name="hp_7f2b" label="" />
    {/* Two consent checkboxes. Never ticked. */}
    <label className="block text-sm text-[#31312d]"><input type="checkbox" name="smsConsent" className="mr-2" />Text me about this application</label>
    <label className="block text-sm text-[#31312d]"><input type="checkbox" name="gdprAgreement" className="mr-2" />I have read the Privacy Notice and consent</label>
  </>;
}

// BambooHR. The form does not exist until the button is pressed, so the fixture behaves that way.
function BambooHrForm({ confirmationId }: { confirmationId: string }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent) {
    return <main className="min-h-screen bg-[#f7f7f3] px-6 py-16"><section className="mx-auto max-w-2xl rounded-2xl border border-[#d8d8d0] bg-white p-10 text-center"><h1 className="mt-5 text-3xl font-semibold text-[#151512]">Thank you. Your application was received.</h1><p className="mt-3 text-[#63635d]">This is a Litos test page. No employer got this application.</p><p className="mt-5 font-mono text-sm text-[#24713b]">Confirmation ID: {confirmationId}</p></section></main>;
  }

  return <main className="min-h-screen bg-[#f7f7f3] px-6 py-12"><div className="mx-auto max-w-2xl rounded-2xl border border-[#d8d8d0] bg-white p-8">
    <p className="font-mono text-xs uppercase tracking-wider text-[#4267d5]">Controlled bamboohr verification portal</p>
    <h1 className="mt-2 text-3xl font-semibold text-[#151512]">Software Engineering Intern, Summer 2027</h1>
    {!open && <>
      <p className="mt-2 text-sm text-[#63635d]">The application fields are not in the DOM until this button is pressed, exactly as on a live BambooHR posting.</p>
      <button type="button" onClick={() => setOpen(true)} className="mt-8 rounded-full bg-[#4267d5] px-6 py-3 font-medium text-white">Apply for This Job</button>
    </>}
    {open && <form data-litos-controlled-portal data-board="bamboohr" onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <Honeypot name="nickname_hpcsaf" label="Please leave this field blank" />
        <Field name="firstName" label="First Name" required /><Field name="lastName" label="Last Name" required />
        <Field name="email" label="Email" type="email" required /><Field name="phone" label="Phone" required />
        <Field name="streetAddress.value" label="Address" required /><Field name="city.value" label="City" required />
        <Field name="zip.value" label="ZIP" required />
        <Field name="desiredPay" label="Desired Pay" /><Field name="websiteUrl" label="Website, Blog or Portfolio" />
        <Field name="linkedinUrl" label="LinkedIn URL" />
        {/* The resume input carries NO name and NO stable id - aria-label is the only hook. */}
        <FileField name="" ariaLabel="file-input" label="Resume" />
        {/* TRAP: BambooHR gates on reCAPTCHA. Its presence is what must drive a run to a blocker
            rather than a submit - portalCanAutoSubmit('bamboohr') is false for this reason. */}
        <textarea name="g-recaptcha-response" className="hidden" readOnly value="" />
        <div data-litos-fixture-note className="col-span-full rounded-lg bg-[#fff4e5] p-3 text-xs text-[#7a5a1e]">This fixture carries a reCAPTCHA field, so a BambooHR run must stop here and hand off.</div>
      </div>
      {/* TRAP: TWO type="submit" buttons, and "Cancel" is one of them. A generic
          button[type="submit"] selector is ambiguous on this form. */}
      <button type="submit" className="mt-8 rounded-full bg-[#4267d5] px-6 py-3 font-medium text-white">Submit Application</button>
      <button type="submit" className="mt-8 ml-3 rounded-full border border-[#cfcfc6] px-6 py-3 font-medium text-[#63635d]">Cancel</button>
    </form>}
  </div></main>;
}

// A honeypot as the live forms actually build them, and the reason this component exists rather than
// a `hidden` attribute: the INPUT ITSELF is fully visible - opacity 1, visibility visible, display
// block, real width and height. It is concealed only by an ancestor with height 0 and overflow
// hidden. Captured this way on both Breezy and BambooHR on 2026-07-29.
//
// Measured against this fixture: Playwright's isVisible() returns TRUE for it. So neither a
// computed-style check nor isVisible() catches it - only ancestor geometry does, and a filled
// honeypot means the employer silently discards the application. Reproducing it faithfully is the
// whole value of the fixture; `display: none` would prove nothing.
function Honeypot({ name, label = "Please leave this field blank" }: { name: string; label?: string }) {
  return <div className="apply-field-extra" style={{ height: 0, overflow: "hidden" }} aria-hidden>
    <label className="block text-sm text-[#31312d]">{label}<input name={name} id={name} type="text" tabIndex={-1} placeholder="Enter your text here" className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2" /></label>
  </div>;
}

// Rippling's fields are identified by data-testid alone, so this variant makes the testid primary and
// the name/id deliberately junk.
function TestIdField({ testId, id, name, label, type = "text", ariaLabel }: { testId: string; id?: string; name?: string; label: string; type?: string; ariaLabel?: string }) {
  return <label className="block text-sm text-[#31312d]">{label}<input id={id} name={name} data-testid={testId} type={type} aria-label={ariaLabel} placeholder={label} className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2" /></label>;
}

function Field({ id, name, label, type = "text", required = false, ariaLabel, noName = false }: { id?: string; name?: string; label: string; type?: string; required?: boolean; ariaLabel?: string; noName?: boolean }) {
  // noName exists for Paylocity, whose real fields carry an id and NO name attribute at all. The
  // default `name ?? id` fallback would quietly give them a name, and an adapter matching by name
  // would then pass here and fail on the live form - the exact class of false-confidence this
  // fixture is meant to rule out.
  return <label className="block text-sm text-[#31312d]">{label}<input id={id} name={noName ? undefined : (name ?? id)} type={type} required={required} aria-label={ariaLabel} className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2" /></label>;
}

function FileField({ id, name, bare = false, dataUi, dataTestId, ariaLabel, label = "Resume", required = true }: { id?: string; name: string; bare?: boolean; dataUi?: string; dataTestId?: string; ariaLabel?: string; label?: string; required?: boolean }) {
  // Defaults to required, matching every pre-existing fixture's single resume input. The Workable
  // and Paylocity fixtures render SEVERAL file inputs (photo, cover letter, additional files), and
  // those pass required={false}: marking them required would make the fixture's own required-field
  // sweep report blockers for documents the student was never actually asked for.
  const input = <input id={id} name={name} data-ui={dataUi} data-testid={dataTestId} aria-label={ariaLabel} type="file" accept="application/pdf" required={required} className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2" />;
  return bare ? input : <label className="block text-sm text-[#31312d]">{label}{input}</label>;
}
