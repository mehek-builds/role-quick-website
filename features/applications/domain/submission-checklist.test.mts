import assert from "node:assert/strict";
import test from "node:test";
import { checklistRowControl, completedSubmissionGroups, completedSubmissionItems, displayQuestionLabel, documentAsksByKind, documentControls, humanInputItems, QUESTION_CHOICE_LIST_LIMIT } from "./submission-checklist.ts";

test("displayQuestionLabel restores sentence case and common application acronyms", () => {
  assert.equal(displayQuestionLabel("select your standardized test score type"), "Select your standardized test score type");
  assert.equal(displayQuestionLabel("provide your best result on sat"), "Provide your best result on SAT");
  assert.equal(displayQuestionLabel("provide your best result on act"), "Provide your best result on ACT");
  assert.equal(displayQuestionLabel("What is your GPA?"), "What is your GPA?");
});
import type { ApplicationReview } from "@/lib/api";

const review: Pick<ApplicationReview, "attention_reason" | "questions" | "status" | "filled_fields"> = {
  status: "needs_attention",
  attention_reason: [
    "CAPTCHA requires your attention",
    "Are you legally authorized to work in Canada? required field is required",
    "AI-drafted answer needs your review before this goes out: \"Why Stripe?\"",
  ].join("\n"),
  questions: [
    {
      id: "essay-1",
      question: "Why Stripe?",
      answer: "I like infrastructure products that hide complex workflows behind simple APIs.",
      kind: "essay",
      required: true,
    },
    {
      id: "start-date",
      question: "When are you available to start full-time?",
      answer: "",
      kind: "required",
      required: true,
    },
    {
      id: "salary",
      question: "What are your annualized total compensation expectations?",
      answer: "USD 175,000",
      kind: "required",
      required: true,
    },
    {
      id: "recording",
      question: "Do you consent to BrightHire recording your interview?",
      answer: "Yes",
      kind: "required",
      required: true,
    },
    {
      id: "canada-auth",
      question: "Are you legally authorized to work in Canada?",
      answer: "Yes",
      kind: "required",
      required: true,
    },
    {
      id: "immigration-support",
      question: "Will you require immigration support in the future?",
      answer: "Yes",
      kind: "required",
      required: true,
    },
  ],
  filled_fields: [
    "First name",
    "Last name",
    "Resume",
    "Cover letter",
    "School",
    "Degree",
    "Discipline",
    "question:Are you eligible to work in the U.S.?",
    "Question text:8:Expected graduation year",
    "question:What are your annualized total compensation expectations?",
    "question:By checking this box, I consent to the Candidate Privacy Policy",
    "question:CAPTCHA requires your attention",
  ],
};

test("humanInputItems turns portal blockers and missing answers into checklist rows", () => {
  const items = humanInputItems(review);
  assert.deepEqual(items.map((item) => item.label), [
    "CAPTCHA requires your attention",
  ]);
  assert.equal(items[0]?.action, "Open page");
});

test("a stale packet is repaired inside Litos rather than assigned to the company page", () => {
  const label = "This application changed after you approved the exact packet Litos prepared, so it was not sent. Open it to review the current one and send from there.";
  const items = humanInputItems({
    status: "needs_attention",
    attention_reason: label,
    questions: [],
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.actionKind, "restart");
  assert.equal(items[0]?.action, "Review and fill");
  assert.equal(items[0]?.acknowledgeable, false, "an in-dashboard repair must not pretend she handled work on the employer page");
  assert.deepEqual(checklistRowControl(items[0]!, {}), {
    element: "restart",
    label: "Review and fill",
    name: `Review the current packet and restart this application in Litos: ${label}`,
  });
});

test("humanInputItems still shows non-captcha answer work when there is no captcha stop", () => {
  const items = humanInputItems({
    ...review,
    attention_reason: "Are you legally authorized to work in Canada? required field is required\nAI-drafted answer needs your review before this goes out: \"Why Stripe?\"",
  });
  assert.deepEqual(items.map((item) => item.label), [
    "Why Stripe?",
    "When are you available to start full-time?",
    "What are your annualized total compensation expectations?",
    "Do you consent to BrightHire recording your interview?",
    "Are you legally authorized to work in Canada?",
    "Will you require immigration support in the future?",
  ]);
  assert.equal(items.find((item) => item.label === "Why Stripe?")?.detail, "Drafted answer ready for review");
  assert.equal(items.find((item) => item.label === "When are you available to start full-time?")?.detail, "Required answer missing");
  assert.equal(items.find((item) => item.label === "What are your annualized total compensation expectations?")?.detail, "Needs your confirmation");
});

test("a measured unsupported cover letter is not left as applicant work", () => {
  const items = humanInputItems({
    status: "needs_attention",
    cover_letter_supported: false,
    questions: [
      { id: "cover", question: "Cover letter", answer: "A historical draft", kind: "essay", required: false },
      { id: "why", question: "Why did your cover letter focus on this team?", answer: "Because the work matches my background.", kind: "essay", required: false },
    ],
  });

  assert.deepEqual(items.map((item) => item.label), ["Why did your cover letter focus on this team?"]);
});

test("humanInputItems hides stale academic provider blockers already covered by filled evidence", () => {
  const items = humanInputItems({
    status: "needs_attention",
    attention_reason: [
      "\"Discipline\" is required and is still empty",
      "\"What is your expected graduation year?\" is required and is still empty",
      "open-ended question left for you (could not draft a confident answer): \"are you interested in our women's winternship program?\"",
    ].join("\n"),
    questions: [],
    filled_fields: [
      "discipline* discipline--0",
      "education end year field",
    ],
  });

  assert.deepEqual(items, []);
});

/* The blocker-10 shape: a required question Litos could not answer, on a control whose options
   discovery already read. The row has to carry the employer's own list, in the employer's own
   order, so the panel can offer a choice instead of naming a box she has to guess the wording
   for. Measured on a live Optiver Greenhouse form on 2026-08-19: the acknowledgement offered two
   sentences, she was shown a blank box, and "Yes" matched neither. */
test("humanInputItems carries the employer's own options on a missing required answer", () => {
  const options = ["I consent to the above.", "Yes, I have read and agree to Optiver's privacy policies, notices and disclaimers."];
  const items = humanInputItems({
    status: "needs_attention",
    attention_reason: "",
    questions: [
      { id: "consent", question: "Do you consent to the processing described above?", answer: "", kind: "required", required: true, options },
      { id: "essay", question: "Why Optiver?", answer: "", kind: "required", required: true },
    ],
  });
  const consent = items.find((item) => item.questionId === "consent");
  assert.deepEqual(consent?.options, options, "the employer's list rides the row, unreordered");
  const essay = items.find((item) => item.questionId === "essay");
  assert.equal(essay?.options, undefined, "a question with no list stays a plain Answer row");
});

test("humanInputItems keeps a long option list off the row, where the editor's select is the kinder shape", () => {
  const options = Array.from({ length: QUESTION_CHOICE_LIST_LIMIT + 1 }, (_, index) => `Office ${index + 1}`);
  const items = humanInputItems({
    status: "needs_attention",
    attention_reason: "",
    questions: [
      { id: "office", question: "Which office are you applying to?", answer: "", kind: "required", required: true, options },
    ],
  });
  const office = items.find((item) => item.questionId === "office");
  assert.equal(office?.detail, "Required answer missing", "the row itself still exists");
  assert.equal(office?.options, undefined);
});

test("completedSubmissionItems shows safe filled fields as done", () => {
  const items = completedSubmissionItems(review);
  assert.ok(items.some((item) => item.label === "School"));
  assert.ok(items.some((item) => item.label === "Degree"));
  assert.ok(items.some((item) => item.label === "Discipline"));
  assert.equal(items.some((item) => item.label === "Are you eligible to work in the U.S.?"), false);
  assert.equal(items.some((item) => item.label.includes("Question text")), false);
  assert.equal(items.some((item) => item.label === "Why Stripe?"), false);
  assert.equal(items.some((item) => item.label === "What are your annualized total compensation expectations?"), false);
  assert.equal(items.some((item) => item.label.includes("Candidate Privacy Policy")), false);
  assert.equal(items.some((item) => item.label.includes("CAPTCHA")), false);
  assert.equal(items.some((item) => item.label === "Do you consent to BrightHire recording your interview?"), false);
  assert.equal(items.some((item) => item.label === "Are you legally authorized to work in Canada?"), false);
  assert.equal(items.some((item) => item.label === "Will you require immigration support in the future?"), false);
});

test("completedSubmissionGroups hides provider handles and keeps the Done section compact", () => {
  const groups = completedSubmissionGroups({
    status: "needs_attention",
    attention_reason: "",
    filled_fields: [
      "First name",
      "Last name input_88291004",
      "Email field:9",
      "Phone country combo:0",
      "Phone",
      "Location control-42",
      "Education school combo:0",
      "Education degree combo_7744",
      "Education discipline label--0",
      "Education end month combo",
      "Education end year field",
      "LinkedIn profile question_772211",
      "Resume upload control_4",
    ],
    questions: [{ id: "q-1", question: "How did you hear about us?", answer: "Company website", kind: "required", required: true }],
  });

  assert.deepEqual(groups.map(({ label, detail }) => ({ label, detail })), [
    { label: "Contact details", detail: "6 items completed" },
    { label: "Education", detail: "5 items completed" },
    { label: "Professional links", detail: "1 item completed" },
    { label: "Application files", detail: "1 item completed" },
    { label: "Employer questions", detail: "1 item completed" },
  ]);
  assert.equal(groups.some((group) => /\d{2,}|combo|control|field/i.test(group.label)), false);
});

/**
 * The Anduril run, copied out of production on 2026-08-08.
 *
 * Not an invented fixture. `_review` for generated_resumes 5cd3aff6-03ad-4a08-805e-f03b4a964676,
 * user a18f774b, status needs_attention, greenhouse. This is the packet where REVIEW and CONFIRM
 * were pressed by hand and nothing happened: no modal, no navigation, no state change, and no
 * network request at all.
 */
const anduril: Pick<ApplicationReview, "attention_reason" | "attention_categories" | "filled_fields" | "questions" | "status" | "portal_url"> = {
  status: "needs_attention",
  portal_url: "https://job-boards.greenhouse.io/embed/job_app?for=andurilindustries&token=5148079007",
  attention_categories: ["required_field", "sensitive_attestation", "unknown"],
  attention_reason: [
    '"Discipline" is required and is still empty',
    '"Are you willing to work in-person for 12 weeks during the internship?" is required and is still empty',
    '"What is your top location preference?" is required and is still empty',
    '"EXPORT CONTROLS - This position requires access to information and technology that is subject to U.S. export controls. Y" is required and is still empty',
    '"How did you hear about Anduril?" is required and is still empty',
    "drafted answer needs your review: Names/orgs not found in your background or the job post (verify): Los Angeles",
    'location choice left for you: "what is your top location preference?"',
  ].join("\n"),
  filled_fields: [
    "first_name",
    "last_name",
    "email",
    "phone",
    "education_end_year_field",
    "resume",
    "question:end date year",
    "question:website",
    "question:linkedin profile",
    "question:u.s. work authorization",
  ],
  questions: [
    { id: "q-in-person", question: "are you willing to work in-person for 12 weeks during the internship?", answer: "Yes, I'm fully willing and glad to work in-person for the full twelve weeks.", kind: "essay", required: false },
    { id: "q-work-auth", question: "u.s. work authorization", answer: "Yes", kind: "required", required: false },
    { id: "q-sponsorship", question: "will you require sponsorship from anduril for employment now or in the future (e.g, h1b visa)?", answer: "Yes", kind: "required", required: false },
    { id: "q-heard", question: "how did you hear about anduril?", answer: "Company website", kind: "required", required: false },
  ],
};

test("every Your turn row that prints an action word resolves to a real control", () => {
  const items = humanInputItems(anduril);
  const acting = items.filter((item) => item.action);
  assert.ok(acting.length > 0);
  for (const item of acting) {
    const control = checklistRowControl(item, { portalUrl: anduril.portal_url });
    assert.ok(control, `"${item.action}" on "${item.label}" resolved to no control, which is the dead pill`);
    assert.ok(control.name.length > item.label.length, "the control has to carry its own accessible name, not just the caption");
    /* Every member of the union has to name a real target, and each member names a different one:
       a link has a page, an attach control has a document kind, a restart has its action name,
       and a button has a question. The members are enumerated rather than defaulted so that a
       fifth one added later fails to compile here instead of silently taking the questionId branch. */
    assert.ok(
      control.element === "link"
        ? control.href.length > 0
        : control.element === "attach"
          ? control.kind.length > 0
          : control.element === "restart"
            ? control.name.length > 0
            : control.questionId.length > 0,
    );
  }
});

test("REVIEW opens the drafted essay answer and CONFIRM opens the answer it wants accepted", () => {
  const items = humanInputItems(anduril);

  const reviewRow = items.find((item) => item.action === "Review");
  assert.ok(reviewRow, "the drafted essay answer must still offer a Review row");
  assert.equal(reviewRow.detail, "Drafted answer ready for review");
  const reviewControl = checklistRowControl(reviewRow, { portalUrl: anduril.portal_url });
  assert.deepEqual(reviewControl, {
    element: "button",
    label: "Review",
    name: 'Review the drafted answer to: Are you willing to work in-person for 12 weeks during the internship?',
    intent: "review",
    questionId: "q-in-person",
  });

  const confirmRow = items.find((item) => item.action === "Confirm");
  assert.ok(confirmRow, "the sponsorship answer must still offer a Confirm row");
  assert.equal(confirmRow.detail, "Needs your confirmation");
  const confirmControl = checklistRowControl(confirmRow, { portalUrl: anduril.portal_url });
  assert.equal(confirmControl?.element, "button");
  assert.equal(confirmControl?.element === "button" ? confirmControl.intent : null, "confirm");
  assert.equal(confirmControl?.element === "button" ? confirmControl.questionId : null, "q-sponsorship");
  assert.match(confirmControl?.name ?? "", /^Confirm your answer to: Will you require sponsorship/);
});

test("OPEN PAGE is a link to the employer, and renders nothing at all when there is no page to open", () => {
  const items = humanInputItems(anduril);
  const openRow = items.find((item) => item.action === "Open page");
  assert.ok(openRow);

  assert.deepEqual(checklistRowControl(openRow, { portalUrl: anduril.portal_url }), {
    element: "link",
    label: "Open page",
    name: `Open the company page to handle: ${openRow.label}`,
    href: anduril.portal_url,
  });

  // A control that cannot act is absent, not dead. That rule is the whole point of this change, so
  // the no-URL case must not fall back to printing the word on its own.
  assert.equal(checklistRowControl(openRow, {}), null);
  assert.equal(checklistRowControl(openRow, { portalUrl: "   " }), null);
});

test("a row with no action, and an action with no target, both render no control", () => {
  assert.equal(checklistRowControl({ id: "done-1", label: "Resume" }, { portalUrl: "https://example.com" }), null);
  assert.equal(
    checklistRowControl({ id: "x", label: "Something", action: "Confirm", actionKind: "confirm" }, { portalUrl: "https://example.com" }),
    null,
    "a question-bound action with no question id has nothing to open",
  );
});

test("one field asked about twice is one row", () => {
  const items = humanInputItems(anduril);
  const locationRows = items.filter((item) => /top location preference/i.test(item.label));
  assert.equal(
    locationRows.length,
    1,
    `"What is your top location preference?" produced ${locationRows.length} rows: ${locationRows.map((item) => item.label).join(" | ")}`,
  );
});

test("an answer the run says never reached the form is Your turn, not Done", () => {
  const items = humanInputItems(anduril);
  const done = completedSubmissionItems(anduril);

  const heard = items.find((item) => item.label === "How did you hear about anduril?");
  assert.ok(heard, "the run reports this field still empty, so it is work the applicant still has");
  assert.equal(heard.detail, "Answered here, still empty on the form");
  assert.equal(heard.action, "Answer");
  assert.equal(heard.questionId, "q-heard");
  assert.equal(
    done.some((item) => item.label === "How did you hear about anduril?"),
    false,
    "Done said Answer filled for a box the same run reported empty",
  );

  // The other half of the report was a false alarm, and the fix must not sweep it up: this one IS
  // in filled_fields, so Done is telling the truth about it.
  assert.ok(done.some((item) => item.label.toLowerCase() === "u.s. work authorization"));
});

test("the later spelling of the drafted-answer blocker is still recognised as a duplicate", () => {
  const items = humanInputItems(anduril);
  assert.equal(
    items.some((item) => /^drafted answer needs your review/i.test(item.label)),
    false,
    "the essay already has its own Review row; the blocker sentence is the same fact twice",
  );
});

/* ---- the employer asking for a file of her own ----
 *
 * The trigger is `required_documents`, a structured measurement off the employer's own form, and
 * never `attention_categories.includes("required_document")`. Two independent things write that
 * category and neither is a document: the classifier's pattern has no word boundaries, so `file`
 * matches inside `profile` and "LinkedIn Profile" is required and is still empty lands in it, and a
 * lead-experience alignment failure writes it outright. A screen keyed on the category asks a
 * student to upload a transcript because the posting wanted a LinkedIn URL.
 */
const transcriptAsk = { kind: "transcript", label: "Transcript", official_requested: false };

test("the employer is the subject of the sentence, and the row carries a control that can act", () => {
  const items = humanInputItems(
    { status: "needs_attention", questions: [], required_documents: [transcriptAsk] },
    { company: "Databricks", role: "Data Engineer Intern" },
  );

  const row = items.find((item) => item.documentKind === "transcript");
  assert.ok(row, "an employer asking for a document has to produce a row");
  /* "Transcript required" is a form validation message: the student has to work out who wants it
     and what happens if she ignores it. The asker belongs in the sentence. */
  assert.equal(row.label, "Databricks needs your transcript");
  assert.equal(row.detail, "Their Data Engineer Intern form will not submit without it.");
  assert.equal(row.badge, "Required");
  assert.deepEqual(checklistRowControl(row, { portalUrl: "https://example.com" }), {
    element: "attach",
    label: "Add transcript",
    name: "Add the file this employer asks for: Databricks needs your transcript",
    kind: "transcript",
  });
});

test("an attach action with no document behind it renders no control, rather than a label with a dead pill", () => {
  /* The resolver's attach branch sits ABOVE the questionId guard on purpose. A document row routed
     through that guard returns null, and the panel then draws the sentence saying an employer is
     waiting on a file with no control underneath it, which is the exact defect this file exists to
     prevent. */
  assert.equal(
    checklistRowControl({ id: "x", label: "Something", action: "Add transcript", actionKind: "attach" }, { portalUrl: "https://example.com" }),
    null,
  );
});

test("a captcha stall does not swallow the document row", () => {
  /* humanInputItems returns immediately after the captcha row. The document ask is emitted before
     that return, because the send stays blocked on the missing file whether or not a puzzle also
     stopped the run, and a screen that names only the captcha leaves her fixing the wrong thing. */
  const items = humanInputItems(
    {
      status: "needs_attention",
      questions: [],
      attention_reason: "CAPTCHA requires your attention",
      required_documents: [transcriptAsk],
    },
    { company: "Databricks" },
  );

  assert.deepEqual(items.map((item) => item.label), [
    "Databricks needs your transcript",
    "CAPTCHA requires your attention",
  ]);
});

test("the actionable document row survives the generic blocker about the same field, not the other way round", () => {
  /* addUnique drops on subject collision, and the runner already emits the same field as an
     open-page blocker. Exactly one of the two rows lives. It has to be the one whose control can
     resolve it, which is why the document row is added first. */
  const items = humanInputItems(
    {
      status: "needs_attention",
      questions: [],
      attention_reason: '"Transcript" is required and is still empty',
      required_documents: [transcriptAsk],
    },
    { company: "Databricks" },
  );

  assert.deepEqual(items.map((item) => item.label), ["Databricks needs your transcript"]);
  assert.equal(items[0]?.actionKind, "attach");
});

/* An attached transcript used to produce NO row at all, and that one omission is what made a
 * published privacy sentence untrue.
 *
 * /privacy says "We encrypt it and keep it until you remove it or delete your account". The only
 * control in the product that removes a stored file is "Remove this file", inside the upload modal,
 * and the modal opens only from a row this function emits. Emitting nothing once a file was stored
 * therefore took the remove control off the screen the instant it became the only thing that
 * mattered, and no click path in the shipped build could get back to it.
 */
test("an attached transcript keeps a row, because that row is the only way back to Remove", () => {
  const items = humanInputItems(
    { status: "needs_attention", questions: [], required_documents: [transcriptAsk] },
    {
      company: "Databricks",
      documents: { transcript: { file_name: "spring-2026-transcript.pdf", attached_at: "2026-08-11T09:00:00.000Z", ordered_at: null } },
    },
  );

  assert.equal(items.length, 1);
  const row = items[0];
  assert.equal(row?.settled, true, "a confirmation must not be counted or coloured as work waiting on her");
  assert.equal(row?.badge, undefined, "a stored file has nothing left to mark REQUIRED");
  assert.equal(row?.label, "Your transcript is attached");
  assert.match(row?.detail ?? "", /^spring-2026-transcript\.pdf\./, "the row has to name the file she is being offered control of");
  assert.match(row?.detail ?? "", /keeps it until you remove it/);

  // And the control, which is the whole point of the row surviving.
  assert.deepEqual(checklistRowControl(row!, { portalUrl: "https://example.com" }), {
    element: "attach",
    label: "Manage file",
    name: "Open the transcript attached to this application, where you can remove it",
    kind: "transcript",
  });
});

test("a mark with no file name still confirms the file rather than dropping the row", () => {
  /* An older submission envelope can carry attached_at without a name. A confirmation that cannot
     name the file still has to keep its control: losing the row is the defect, not losing a word. */
  const items = humanInputItems(
    { status: "needs_attention", questions: [], required_documents: [transcriptAsk] },
    { company: "Databricks", documents: { transcript: { attached_at: "2026-08-11T09:00:00.000Z", ordered_at: null } } },
  );

  assert.equal(items.length, 1);
  assert.equal(items[0]?.settled, true);
  assert.equal(items[0]?.detail, "Litos keeps it until you remove it.");
  assert.equal(checklistRowControl(items[0]!, {})?.element, "attach", "no portal URL is needed to reopen a file she already gave us");
});

test("the confirmation outlives the ask, because the ask is the thing that goes away", () => {
  /* required_documents is re-derived from the unanswered-required labels on every prepare, so the
     first run AFTER a successful upload reports no ask at all: the field it came from is filled.
     Keyed on the ask, the row and its control would come back for one screen and then leave, and
     "Remove this file" would be unreachable again by the next run rather than by the next click. */
  const items = humanInputItems(
    { status: "needs_attention", questions: [] },
    {
      company: "Databricks",
      documents: { transcript: { file_name: "spring-2026-transcript.pdf", attached_at: "2026-08-11T09:00:00.000Z", ordered_at: null } },
    },
  );

  assert.equal(items.length, 1);
  assert.equal(items[0]?.settled, true);
  assert.equal(items[0]?.documentKind, "transcript");
  assert.equal(checklistRowControl(items[0]!, {})?.element, "attach");
});

test("a document only ordered, never attached, is not confirmed as stored", () => {
  /* The mark exists and carries no file. "I have ordered it" is an acknowledgement, and a row saying
     her transcript is attached would be the screen inventing a file that is not there. */
  const items = humanInputItems(
    { status: "needs_attention", questions: [] },
    { company: "Databricks", documents: { transcript: { attached_at: null, ordered_at: "2026-08-11T09:00:00.000Z" } } },
  );
  assert.deepEqual(items, []);
});

test("the stale blocker about the same field loses to the row that says the file is attached", () => {
  /* The run that stopped emitted `"Transcript" is required and is still empty`, and it was true when
     it was written. After the upload it is a sentence contradicting the file sitting next to it.
     addUnique drops on subject collision and the confirmation is added first, so the accurate row is
     the survivor, which is the same rule that makes the actionable row beat this blocker before the
     upload. */
  const items = humanInputItems(
    {
      status: "needs_attention",
      questions: [],
      attention_reason: '"Transcript" is required and is still empty',
      required_documents: [transcriptAsk],
    },
    { company: "Databricks", documents: { transcript: { file_name: "t.pdf", attached_at: "2026-08-11T09:00:00.000Z", ordered_at: null } } },
  );

  assert.deepEqual(items.map((item) => item.label), ["Your transcript is attached"]);
});

test("ordering an official copy stops the row demanding, and does not pretend the file is attached", () => {
  /* "I have ordered it" records an acknowledgement. It cannot unblock anything: Litos cannot make a
     registrar mail a sealed transcript, so a row that went quiet AND a send that went live would be
     offering to send an application the employer is going to reject. */
  const items = humanInputItems(
    { status: "needs_attention", questions: [], required_documents: [{ ...transcriptAsk, official_requested: true }] },
    { company: "Databricks", documents: { transcript: { attached_at: null, ordered_at: "2026-08-11T09:00:00.000Z" } } },
  );

  assert.equal(items.length, 1);
  assert.equal(items[0]?.label, "Databricks asked for an official transcript");
  assert.equal(items[0]?.badge, undefined, "an acknowledged ask must stop shouting REQUIRED at her");
  assert.equal(items[0]?.documentKind, "transcript", "she can still attach an unofficial copy from here");
});

test("no measurement means no row, so an unmeasured form cannot invent an ask", () => {
  assert.deepEqual(humanInputItems({ status: "needs_attention", questions: [] }, { company: "Databricks" }), []);
});

/* ---- documentControls: one kind's state must never decide another kind's control ----
 *
 * On ready_for_final_approval there is no Your turn panel, so the control row beside Send it is the
 * only place the review screen can reopen the upload modal, and "Remove this file" lives inside it.
 * That row asked for the FIRST outstanding ask and then suppressed the reopen control whenever any
 * ask anywhere was outstanding. With one kind attached and a second still asked for, the attached
 * file's control disappeared: the route to deleting a file Litos was storing went away because a
 * different file had not arrived, while /privacy publishes "We encrypt it and keep it until you
 * remove it or delete your account".
 */
const writingSampleAsk = { kind: "writing_sample", label: "Writing sample", official_requested: false };
const ATTACHED = { attached_at: "2026-08-11T09:00:00.000Z" };

test("an attached file keeps its control while another kind is still outstanding", () => {
  const controls = documentControls([transcriptAsk, writingSampleAsk], { transcript: ATTACHED });

  assert.deepEqual(controls.attached, ["transcript"], "the stored file's way back must not depend on the other ask");
  assert.deepEqual(controls.outstanding.map((ask) => ask.kind), ["writing_sample"]);
});

test("every outstanding ask gets its own control, because one button can only open one of them", () => {
  const controls = documentControls([transcriptAsk, writingSampleAsk], {});
  assert.deepEqual(controls.outstanding.map((ask) => ask.kind), ["transcript", "writing_sample"]);
  assert.deepEqual(controls.attached, []);
});

test("a stored file keeps its control after the ask that produced it has gone", () => {
  /* `required_documents` is re-measured from the unanswered-required labels on every prepare, so the
     first run after a successful upload reports no ask at all. A control keyed on the ask would come
     back for one screen and then leave again. */
  const controls = documentControls([], { transcript: ATTACHED });
  assert.deepEqual(controls.attached, ["transcript"]);
  assert.deepEqual(controls.outstanding, []);
});

test("ordering a copy is not a stored file, and does not clear the ask", () => {
  const controls = documentControls([transcriptAsk], { transcript: { attached_at: null, ordered_at: "2026-08-11T09:00:00.000Z" } });
  assert.deepEqual(controls.attached, [], "nothing is stored, so there is nothing to offer removal of");
  assert.deepEqual(controls.outstanding, [], "she has answered this one, so it is not still asking in the same words");
  assert.deepEqual(controls.ordered.map((ask) => ask.kind), ["transcript"], "a registrar's sealed copy is not on the form yet");
});

test("no asks and no marks is no controls, on any of the four", () => {
  assert.deepEqual(documentControls(undefined, undefined), { outstanding: [], ordered: [], undeliverable: [], attached: [] });
});

/* ---- the measurement that was shipped on the wire and read nowhere ----
 *
 * `transcript_supported` is written by both prepare paths and rides on every submission envelope,
 * and the only reader of it on this side was its own type declaration. So: an employer's form asks
 * for a transcript, the run finds no control it can put one in, the student uploads a file, the ask
 * clears because a mark now exists, and the send goes out reporting the document handled. The file
 * attached to nothing and no screen ever said so.
 */
test("a form with no control Litos can fill is not an ask she can clear by uploading", () => {
  const controls = documentControls([transcriptAsk], {}, { transcript_supported: false });
  assert.deepEqual(controls.undeliverable.map((ask) => ask.kind), ["transcript"]);
  assert.deepEqual(controls.outstanding, [], "an Add control here would be an upload that reaches nobody");
});

test("a stored file does not settle an ask the form has nowhere to receive", () => {
  /* THE SUBSTITUTION THAT MADE THE SEND DISHONEST. A settled row means Litos is holding her file. It
     has never meant the employer received it, and letting it answer for the employer's own blocker
     is exactly how an application went out reporting a document that attached to nothing. */
  const controls = documentControls([transcriptAsk], { transcript: ATTACHED }, { transcript_supported: false });
  assert.deepEqual(controls.undeliverable.map((ask) => ask.kind), ["transcript"], "the file is stored and it is still not going to reach them");
  assert.deepEqual(controls.attached, ["transcript"], "and it is still hers to remove");
});

test("a form that measured a control it CAN fill is an ordinary ask", () => {
  const controls = documentControls([transcriptAsk], {}, { transcript_supported: true });
  assert.deepEqual(controls.outstanding.map((ask) => ask.kind), ["transcript"]);
  assert.deepEqual(controls.undeliverable, []);
});

test("never measured is not measured false, and blocks nothing extra", () => {
  /* The tri-state, held to the same discipline as cover_letter_required. Every packet prepared before
     the measurement existed carries `undefined` here, and reading unknown as "no control" would
     refuse sends on forms that were perfectly able to take the file. */
  assert.deepEqual(documentControls([transcriptAsk], {}, {}).undeliverable, []);
  assert.deepEqual(documentControls([transcriptAsk], {}).undeliverable, []);
});

test("the checklist says the form has nowhere to put it, rather than asking her to add one", () => {
  const items = humanInputItems(
    { status: "needs_attention", questions: [], required_documents: [transcriptAsk], transcript_supported: false },
    { company: "Databricks" },
  );

  assert.equal(items.length, 1);
  assert.equal(items[0]?.label, "Databricks asks for your transcript and their form has nowhere Litos can put one");
  assert.equal(items[0]?.documentKind, undefined, "an upload control here would be an upload that reaches nobody");
  assert.equal(checklistRowControl(items[0]!, { portalUrl: "https://boards.example.com/x" })?.element, "link");
});

test("an undeliverable ask keeps the stored file's own row, so Remove stays reachable", () => {
  /* Two true sentences that are not the same sentence: Litos is keeping her file and can still delete
     it, and this employer is not going to receive it from here. addUnique drops on subject collision,
     so collapsing them would have to give up one, and both are load-bearing - one is the privacy
     promise, the other is the send gate. */
  const items = humanInputItems(
    { status: "needs_attention", questions: [], required_documents: [transcriptAsk], transcript_supported: false },
    { company: "Databricks", documents: { transcript: { file_name: "t.pdf", attached_at: "2026-08-11T09:00:00.000Z", ordered_at: null } } },
  );

  assert.deepEqual(items.map((item) => item.label), [
    "Your transcript is attached",
    "Databricks asks for your transcript and their form has nowhere Litos can put one",
  ]);
  assert.equal(items[0]?.settled, true);
  assert.equal(checklistRowControl(items[0]!, {})?.element, "attach", "the way back to Remove this file cannot depend on the form having a slot");
  assert.equal(items[1]?.settled, undefined, "the employer's blocker is not something already handled");
});

test("the stale required-and-empty blocker still loses to the row that names the file", () => {
  /* The two rows carry different subjects on purpose. The runner's own
     `"Transcript" is required and is still empty` collides with the confirmation, which is added
     first, so the accurate row survives and the generic line drops - exactly as it does when the form
     DOES have a control. */
  const items = humanInputItems(
    {
      status: "needs_attention",
      questions: [],
      attention_reason: '"Transcript" is required and is still empty',
      required_documents: [transcriptAsk],
      transcript_supported: false,
    },
    { company: "Databricks", documents: { transcript: { file_name: "t.pdf", attached_at: "2026-08-11T09:00:00.000Z", ordered_at: null } } },
  );

  assert.equal(items.length, 2, "the run's generic sentence adds nothing the two rows do not already say");
});

/* ---- one kind, one control, however many labels the employer wrote ----
 *
 * A kind is a storage key: one upload writes one `spec._documents` entry. A form carrying both
 * "Official transcript" and "Unofficial transcript (PDF)" is one file asked for twice, and both
 * screens that draw these controls key their React elements on `ask.kind`. Two asks of one kind is
 * therefore a duplicate key: the whole control row and the warning paragraph beside it render
 * twice, React warns, and the pair is undefined behaviour on the next reorder.
 *
 * The server folds these too. This holds the invariant where the render is, because the list comes
 * over the wire from a repo that deploys separately.
 */
const officialTranscriptAsk = { kind: "transcript", label: "Official transcript", official_requested: true };
const unofficialTranscriptAsk = { kind: "transcript", label: "Unofficial transcript (PDF)", official_requested: false };

test("two labels for one kind are one control, not two with the same React key", () => {
  const controls = documentControls([unofficialTranscriptAsk, officialTranscriptAsk], {});
  assert.equal(controls.outstanding.length, 1, "one kind is one control, whatever the employer called it");
  assert.deepEqual(controls.outstanding.map((ask) => ask.kind), ["transcript"]);
  const keys = controls.outstanding.map((ask) => ask.kind);
  assert.equal(new Set(keys).size, keys.length, "every rendered key has to be distinct");
});

test("the fold keeps the first label and loses no official ask to arrival order", () => {
  /* Which door the modal opens hangs on this flag. Dropped, a student whose employer will only take
     a sealed copy is shown an upload box and no way to say she has ordered one. */
  const folded = documentAsksByKind([unofficialTranscriptAsk, officialTranscriptAsk]);
  assert.deepEqual(folded, [{ kind: "transcript", label: "Unofficial transcript (PDF)", official_requested: true }]);

  const reversed = documentAsksByKind([officialTranscriptAsk, unofficialTranscriptAsk]);
  assert.equal(reversed.length, 1);
  assert.equal(reversed[0].official_requested, true, "an official ask survives whichever order it arrives in");
});

test("the fold copies rather than writing back into the list it was handed", () => {
  /* This list is React state on both callers. OR-ing the flag onto the caller's own object mutates
     a value that is already rendered, and the screen that reads it next is reading a write nobody
     scheduled. */
  const asks = [{ ...unofficialTranscriptAsk }, { ...officialTranscriptAsk }];
  documentAsksByKind(asks);
  assert.equal(asks[0].official_requested, false, "the caller's ask is untouched");
});

test("a kind attached once clears every label that asked for it", () => {
  const controls = documentControls([unofficialTranscriptAsk, officialTranscriptAsk], { transcript: ATTACHED });
  assert.deepEqual(controls.outstanding, [], "she gave the file once, so nothing is still asking");
  assert.deepEqual(controls.attached, ["transcript"]);
});

test("the checklist draws one row per kind and keeps the official ask's own door", () => {
  const items = humanInputItems(
    { status: "needs_attention", questions: [], required_documents: [unofficialTranscriptAsk, officialTranscriptAsk] },
    { company: "Databricks" },
  );
  const documentRows = items.filter((item) => item.documentKind === "transcript");
  assert.equal(documentRows.length, 1, "one file, one row");
  const ids = items.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, "every row's key has to be distinct");
});

/* CONFIRMED ONCE IS CONFIRMED, or the ask never ends.
 *
 * The CONFIRM row was decided by the label class alone, which a save cannot change: confirm, save,
 * "Saved. These answers are on this application now" - and the same two amber chips again, driven
 * four full cycles on the DV Trading packet (application e0a0eb84) on 2026-08-17. What a
 * confirmation actually leaves on the row is the server's applicant-claim, so that claim is what
 * flips the row: settled, out of the amber panel and the "N to check" count, control kept so she
 * can still change the answer. */
test("a human-only answer she confirmed renders settled, not as an outstanding CONFIRM ask", () => {
  const round = "2026-08-17T23:00:00.000Z";
  const dv: Pick<ApplicationReview, "attention_reason" | "questions" | "questions_reviewed_at" | "status"> = {
    status: "needs_attention",
    attention_reason: "",
    questions_reviewed_at: round,
    questions: [
      {
        id: "work-auth",
        question: "Are you legally authorized to work for any employer in this country?",
        answer: "Yes",
        kind: "required",
        required: true,
        answer_source: "applicant_review",
        answer_reviewed_at: round,
      },
      {
        id: "sponsorship",
        question: "Will you now or in the future require sponsorship to work for this employer?",
        answer: "Yes, will require firm sponsorship",
        kind: "required",
        required: true,
      },
    ],
  };

  const items = humanInputItems(dv);
  const confirmed = items.find((item) => item.questionId === "work-auth");
  assert.ok(confirmed, "the confirmed answer keeps its row: the way back to Change must not vanish");
  assert.equal(confirmed.settled, true, "but it is settled, so it leaves the amber panel and the count");
  assert.equal(confirmed.detail, "Confirmed by you");
  assert.equal(confirmed.action, "Change");
  const outstanding = items.find((item) => item.questionId === "sponsorship");
  assert.equal(outstanding?.settled, undefined, "the one she has not confirmed still asks");
  assert.equal(outstanding?.detail, "Needs your confirmation");
  assert.equal(outstanding?.action, "Confirm");
});

/* THE ROUND CHECK IS THE SERVER'S OWN. A claim keyed to a review round the row no longer carries is
   one every server reader is about to discard, so showing "confirmed" for it would promise a state
   the next refresh takes away. */
test("a claim from a stale review round still asks for confirmation", () => {
  const items = humanInputItems({
    status: "needs_attention",
    attention_reason: "",
    questions_reviewed_at: "2026-08-17T23:00:00.000Z",
    questions: [{
      id: "sponsorship",
      question: "Will you now or in the future require sponsorship to work for this employer?",
      answer: "Yes",
      kind: "required",
      required: true,
      answer_source: "applicant_review",
      answer_reviewed_at: "2026-08-01T00:00:00.000Z",
    }],
  });

  assert.equal(items[0]?.detail, "Needs your confirmation");
  assert.equal(items[0]?.settled, undefined);
});

/* AND A CLAIM BESIDE NO ROUND AT ALL IS NOT A CONFIRMATION. The save that mints a claim writes the
   round in the same transaction, so a review carrying one without the other is a record no reader
   can check, and the honest row is the asking one. */
test("a claim on a review with no round still asks for confirmation", () => {
  const items = humanInputItems({
    status: "needs_attention",
    attention_reason: "",
    questions: [{
      id: "sponsorship",
      question: "Will you now or in the future require sponsorship to work for this employer?",
      answer: "Yes",
      kind: "required",
      required: true,
      answer_source: "applicant_review",
      answer_reviewed_at: "2026-08-17T23:00:00.000Z",
    }],
  });

  assert.equal(items[0]?.detail, "Needs your confirmation");
  assert.equal(items[0]?.settled, undefined);
});

/* THE TICK, AS THE DOMAIN SEES IT. attention_acknowledgements is the applicant's stored word that
   she handled a blocker on the employer's page herself, written by
   POST /applications/:id/review/attention-acks and keyed by the row id derived here from the
   sentence. The panel's checkbox used to be scenery: no handler, no request, cleared by the next
   poll (measured on the Easy Dynamics rippling packet, 2026-08-20). These tests hold the decision
   half of the repair: which rows take a tick, and what a stored tick renders as. */
test("an acknowledged blocker renders settled with its control kept, and its tick stays live", () => {
  const blocker = '"Willingness to undergo a background check" is required and is still empty';
  const base = {
    status: "needs_attention" as const,
    attention_reason: blocker,
    questions: [],
    filled_fields: [],
  };
  const unticked = humanInputItems(base);
  assert.equal(unticked.length, 1);
  assert.equal(unticked[0]?.acknowledgeable, true, "a blocker only she can resolve takes a tick");
  assert.equal(unticked[0]?.settled, undefined, "and starts outstanding");

  const ticked = humanInputItems({
    ...base,
    attention_acknowledgements: { [unticked[0]!.id]: { label: blocker, acknowledged_at: "2026-08-20T09:00:00.000Z" } },
  });
  assert.equal(ticked[0]?.settled, true, "out of the amber panel and out of the N-to-check count");
  assert.equal(ticked[0]?.acknowledged, true, "and marked as HER tick, so the checkbox stays live to take it back");
  assert.equal(ticked[0]?.acknowledgeable, true);
  assert.equal(ticked[0]?.actionKind, "open-page", "the way back to the employer page survives on the settled row");
  assert.match(ticked[0]?.detail ?? "", /Ticked off by you/, "the settled row says what the tick is: her word, not a re-measurement");
});

test("a tick whose sentence has left the report acknowledges nothing", () => {
  const items = humanInputItems({
    status: "needs_attention",
    attention_reason: '"Discipline" is required and is still empty',
    questions: [],
    filled_fields: [],
    attention_acknowledgements: { "blocker-some-older-sentence": { acknowledged_at: "2026-08-19T09:00:00.000Z" } },
  });
  assert.equal(items[0]?.settled, undefined, "a stale key must not settle a row it never named");
});

test("the captcha row takes a tick like any other attention row", () => {
  const base = {
    status: "needs_attention" as const,
    attention_reason: "CAPTCHA requires your attention",
    questions: [],
    filled_fields: [],
  };
  const [captchaRow] = humanInputItems(base);
  assert.equal(captchaRow?.acknowledgeable, true);
  const [ticked] = humanInputItems({
    ...base,
    attention_acknowledgements: { [captchaRow!.id]: { acknowledged_at: "2026-08-20T09:00:00.000Z" } },
  });
  assert.equal(ticked?.settled, true);
  assert.equal(ticked?.acknowledged, true);
});

/* WHERE THE TICK IS REFUSED, and each refusal is a decision recorded on the type: a question row's
   "done" is the answer landing on the row, a document row feeds the send gate through
   documentControls, and a form-with-no-control row gates the send the same way. A tick on any of
   those would render "settled" beside a Send button still grey because of that exact row. */
test("question and document rows take no tick, because their done is the server's to say", () => {
  const items = humanInputItems({
    status: "needs_attention",
    attention_reason: "Something on the page still needs you",
    questions: [{ id: "start", question: "When can you start?", answer: "", kind: "required", required: true }],
    filled_fields: [],
    required_documents: [{ kind: "transcript", label: "Transcript", official_requested: false }],
    transcript_supported: false,
  }, { company: "Kos" });

  assert.ok(items.length >= 3, "the fixture has to produce a blocker, a question and a document row");
  for (const item of items) {
    if (item.id.startsWith("blocker-")) {
      assert.equal(item.acknowledgeable, true, `${item.id} is an attention row and takes a tick`);
    } else {
      assert.notEqual(item.acknowledgeable, true, `${item.id} must not take a tick`);
    }
  }
});

/* The accessible name is a promise about what pressing the link is FOR, and it changes when she has
   already said the work is done - the same two-sentence rule the attach and confirm controls
   follow. Without this, a screen reader on the settled strip is told to "handle" the row she just
   marked handled. */
test("the settled open-page link stops promising work and still opens the page", () => {
  const blocker = '"Discipline" is required and is still empty';
  const base = {
    status: "needs_attention" as const,
    attention_reason: blocker,
    questions: [],
    filled_fields: [],
  };
  const [row] = humanInputItems(base);
  const [ticked] = humanInputItems({
    ...base,
    attention_acknowledgements: { [row!.id]: { label: blocker, acknowledged_at: "2026-08-20T09:00:00.000Z" } },
  });
  const control = checklistRowControl(ticked!, { portalUrl: "https://example.com/apply" });
  assert.equal(control?.element, "link", "the way back to the page survives the tick");
  assert.match(control?.element === "link" ? control.name : "", /You marked this handled/);
  assert.doesNotMatch(control?.element === "link" ? control.name : "", /to handle:/);
});
