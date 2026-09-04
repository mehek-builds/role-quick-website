import assert from "node:assert/strict";
import test from "node:test";
import {
  checklistRowControl,
  completedSubmissionGroups,
  completedSubmissionItems,
  directInputTaskPlan,
  directQuestionPromptFingerprint,
  directQuestionTaskFingerprint,
  displayQuestionLabel,
  documentAsksByKind,
  documentControls,
  humanInputItems,
  QUESTION_CHOICE_LIST_LIMIT,
  unconfirmedDocumentItems,
} from "./submission-checklist.ts";

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
      // A paragraph Litos wrote and she has not approved - which is what a Review row is FOR.
      answer_source: "litos_draft",
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
      { id: "cover", question: "Cover letter", answer: "A historical draft", kind: "essay", required: false, answer_source: "litos_draft" },
      { id: "why", question: "Why did your cover letter focus on this team?", answer: "Because the work matches my background.", kind: "essay", required: false, answer_source: "litos_draft" },
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

test("optional questions stay actionable until the applicant answers or skips them", () => {
  const base = {
    status: "needs_attention" as const,
    attention_reason: "",
    questions: [{
      id: "optional-location",
      question: "Which other offices would you consider?",
      answer: "",
      answer_state: "unanswered" as const,
      kind: "required" as const,
      required: false,
      portal_input_type: "select-multiple",
      options: ["Chicago", "New York"],
    }],
  };

  assert.deepEqual(humanInputItems(base).map((item) => ({
    questionId: item.questionId,
    detail: item.detail,
    action: item.action,
  })), [{
    questionId: "optional-location",
    detail: "Optional, answer or skip",
    action: "Answer",
  }]);
  const directPlan = directInputTaskPlan(base);
  assert.equal(directPlan.questionTasks[0]?.question.id, "optional-location");
  assert.equal(directPlan.questionTasks[0]?.question.answer_state, "unanswered");
  assert.equal(humanInputItems({
    ...base,
    questions: [{ ...base.questions[0], answer_state: "litos_refused" as const }],
  }).length, 1);
  assert.equal(humanInputItems({
    ...base,
    questions: [{ ...base.questions[0], answer_state: "skipped" as const }],
  }).length, 0);
});

test("a stale exact multi-select is repaired as an in-Litos answer task", () => {
  const reviewWithStaleAnswer = {
    status: "needs_attention" as const,
    attention_reason: "Select every location where you can work: unsupported multi value",
    question_metadata_blockers: [{
      kind: "unsupported_multi_value" as const,
      required: true,
      portal_input_type: "select-multiple",
      portal_selector: "#locations",
      question: "Select every location where you can work",
    }],
    questions: [{
      id: "locations",
      question: "Select every location where you can work",
      answer: "A, B",
      kind: "required" as const,
      required: true,
      portal_input_type: "select-multiple",
      portal_selector: "#locations",
      options: ["A", "A, B", "B"],
      options_complete: true,
    }],
  };

  const plan = directInputTaskPlan(reviewWithStaleAnswer);
  assert.equal(plan.metadataBlockers.length, 0);
  assert.equal(plan.nonQuestionTasks.length, 0);
  assert.equal(plan.questionTasks[0]?.question.id, "locations");
  assert.equal(plan.questionTasks[0]?.question.answer, "");
  assert.equal(plan.questionTasks[0]?.question.answer_draft, "A, B");
  assert.deepEqual(plan.questionTasks[0]?.question.options, ["A", "A, B", "B"]);
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

  /* No "Application files" line: this packet is not submitted, so the resume upload is a claim the
     run made about its own work and nothing here has seen the employer's form. It is named by
     unconfirmedDocumentItems instead, pinned in its own tests below. */
  assert.deepEqual(groups.map(({ label, detail }) => ({ label, detail })), [
    { label: "Contact details", detail: "6 items completed" },
    { label: "Education", detail: "5 items completed" },
    { label: "Professional links", detail: "1 item completed" },
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
    { id: "q-in-person", question: "are you willing to work in-person for 12 weeks during the internship?", answer: "Yes, I'm fully willing and glad to work in-person for the full twelve weeks.", kind: "essay", required: false, answer_source: "litos_draft" },
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
        /* The confirmation itself. answer_source rides along because a confirming save mints both,
           but it is THIS field that settles the row, and the test below proves it. */
        answer_confirmed_of: "Are you legally authorized to work for any employer in this country?",
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

/* THE APPLICANT-CLAIM IS NOT A CONFIRMATION, and reading it as one is a dead end with no control in
 * it.
 *
 * Measured live 2026-09-04 on Exa "Software Engineer, Intern", packet 73768339 (ashby). Its visa
 * question carried answer_source 'applicant_review' with answer_reviewed_at equal to
 * questions_reviewed_at and NO answer_confirmed_of. This function read that as confirmed, so the row
 * rendered settled inside "Employer questions - 4 items completed" and the screen offered nothing to
 * press. The backend's sensitive gate reads answer_confirmed_of, found none, and refused the send
 * with FINAL_APPROVAL_VERIFICATION_FAILED: "Sensitive question requires your attention: do you
 * require visa sponsorship...". Client said done, server said not done, and the packet could not
 * move in either direction.
 *
 * The two claims are minted by different acts on purpose: any bulk review save mints
 * applicant_review, while answer_confirmed_of is minted only by a per-question `confirmed: true`.
 * Testing the looser one here is what put a settled row in front of a refusal. */
test("an applicant-claim without a confirmation still asks, so the send gate has a control", () => {
  const round = "2026-09-02T12:23:29.281Z";
  const exa: Pick<ApplicationReview, "attention_reason" | "questions" | "questions_reviewed_at" | "status"> = {
    status: "needs_attention",
    attention_reason: "",
    questions_reviewed_at: round,
    questions: [
      {
        id: "visa",
        question: "Do you require visa sponsorship to work in your selected location? If so, which one? And when does your visa expire?",
        answer: "I am authorized to work in the US on F-1 status (CPT/OPT), so I do not require sponsorship for an internship.",
        kind: "required",
        required: true,
        answer_source: "applicant_review",
        answer_reviewed_at: round,
      },
    ],
  };

  const asking = humanInputItems(exa).find((item) => item.questionId === "visa");
  assert.ok(asking, "the question the server is refusing on must have a row");
  assert.equal(asking.settled, undefined, "it is NOT settled: nothing has confirmed it");
  assert.equal(asking.detail, "Needs your confirmation");
  assert.equal(asking.action, "Confirm");
  assert.equal(asking.actionKind, "confirm", "and the control posts the confirmed flag the gate wants");
});

/* A confirmation that names a DIFFERENT question does not settle this one - the field carries the
 * question's own text precisely so a rename cannot inherit it, and the server's reader compares it
 * the same way. */
test("a confirmation naming another question does not settle this one", () => {
  const renamed: Pick<ApplicationReview, "attention_reason" | "questions" | "questions_reviewed_at" | "status"> = {
    status: "needs_attention",
    attention_reason: "",
    questions_reviewed_at: "2026-09-02T12:23:29.281Z",
    questions: [
      {
        id: "visa",
        question: "Do you require visa sponsorship, and when does your visa expire?",
        answer: "No sponsorship needed for an internship.",
        kind: "required",
        required: true,
        /* The applicant-claim is present and current ON PURPOSE. Without it this test passed on the
           old predicate too - for the wrong reason, since that predicate returned false on the
           missing answer_source and never reached the rename at all. Carrying the claim makes the
           rename the ONLY thing that can decide the row. */
        answer_source: "applicant_review",
        answer_reviewed_at: "2026-09-02T12:23:29.281Z",
        answer_confirmed_of: "Do you require visa sponsorship?",
      },
    ],
  };

  const asking = humanInputItems(renamed).find((item) => item.questionId === "visa");
  assert.equal(asking?.settled, undefined, "a stale confirmation must not survive the rename");
  assert.equal(asking?.action, "Confirm");
});

/* THE SERVER NAMES THE ROWS, because only the server can.
 *
 * Its verdict is computed against the resolver, the applicant profile, the JD and the posting
 * country, none of which exist on this client, so any label regex here is a guess at it. Two
 * families were measured missing from the local classes: EEO self-identification, and US-scoped
 * work authorization (excluded outright by isHumanOnlyChecklistLabel). For those the send gate
 * refused and this screen built no row at all - the same dead end, one question family over.
 *
 * The list ships on GET /applications/:id/submission as
 * sensitive_questions_requiring_confirmation. Measured live 2026-09-04 on Exa packet 73768339, it
 * held exactly the visa label. */
test("a question the server names for confirmation gets a row the local classes would never build", () => {
  const EEO = "What is your gender?";
  const review: Pick<ApplicationReview, "attention_reason" | "questions" | "questions_reviewed_at" | "status"> = {
    status: "needs_attention",
    attention_reason: "",
    questions_reviewed_at: "2026-09-04T00:00:00.000Z",
    questions: [
      { id: "gender", question: EEO, answer: "Woman", kind: "required", required: true },
    ],
  };

  // Without the server's list the local classes build nothing for this label - the measured gap.
  assert.equal(humanInputItems(review).find((item) => item.questionId === "gender"), undefined);

  const asking = humanInputItems(review, { sensitiveConfirmations: [EEO] })
    .find((item) => item.questionId === "gender");
  assert.ok(asking, "the server named it, so it must be on screen");
  assert.equal(asking.action, "Confirm");
  assert.equal(asking.actionKind, "confirm");
  assert.equal(asking.settled, undefined);
});

test("the server's list matches a label regardless of case and surrounding space", () => {
  const review: Pick<ApplicationReview, "attention_reason" | "questions" | "questions_reviewed_at" | "status"> = {
    status: "needs_attention",
    attention_reason: "",
    questions_reviewed_at: "2026-09-04T00:00:00.000Z",
    questions: [
      { id: "visa", question: "Do You Require Visa Sponsorship?", answer: "No", kind: "required", required: true },
    ],
  };
  const asking = humanInputItems(review, { sensitiveConfirmations: ["  do you require visa sponsorship?  "] })
    .find((item) => item.questionId === "visa");
  assert.equal(asking?.action, "Confirm", "the two sides carry the same label through different transports");
});

/* THE LIST IS THE WHOLE ANSWER, and an EMPTY list means nothing is outstanding.
 *
 * Measured live 2026-09-04 on Exa packet 73768339, immediately after the confirmation saved: the
 * server dropped the visa question from its list, and `answer_confirmed_of` was ABSENT from the
 * served question - it does not round-trip to this client. While the local label classes were ORed
 * into the condition, that combination built a row nothing could settle: still asking, still
 * blocking Send, after a confirmation the server had already accepted. */
test("an empty server list clears the row even for a label the local classes match", () => {
  const VISA = "Do you require visa sponsorship to work in your selected location?";
  const review: Pick<ApplicationReview, "attention_reason" | "questions" | "questions_reviewed_at" | "status"> = {
    status: "ready_for_final_approval",
    attention_reason: "",
    questions_reviewed_at: "2026-09-04T00:00:00.000Z",
    questions: [
      // No answer_confirmed_of, because the server does not serve one.
      { id: "visa", question: VISA, answer: "No sponsorship for an internship.", kind: "required", required: true, answer_source: "applicant_review" },
    ],
  };

  assert.ok(
    humanInputItems(review, { sensitiveConfirmations: [VISA] }).some((item) => item.questionId === "visa"),
    "while the server names it, it asks",
  );
  assert.equal(
    humanInputItems(review, { sensitiveConfirmations: [] }).find((item) => item.questionId === "visa"),
    undefined,
    "once the server stops naming it, the row is gone - not merely settled",
  );
  // And with no list at all the old label-class behaviour is untouched.
  assert.ok(
    humanInputItems(review).some((item) => item.questionId === "visa"),
    "an older payload with no list still falls back to the label classes",
  );
});

test("a question the server has stopped naming settles once it is confirmed", () => {
  const LABEL = "What is your gender?";
  const review: Pick<ApplicationReview, "attention_reason" | "questions" | "questions_reviewed_at" | "status"> = {
    status: "needs_attention",
    attention_reason: "",
    questions_reviewed_at: "2026-09-04T00:00:00.000Z",
    questions: [
      { id: "gender", question: LABEL, answer: "Woman", kind: "required", required: true, answer_confirmed_of: LABEL },
    ],
  };
  const settled = humanInputItems(review, { sensitiveConfirmations: [LABEL] })
    .find((item) => item.questionId === "gender");
  assert.equal(settled?.settled, true, "confirmed is confirmed, or the ask never ends");
  assert.equal(settled?.action, "Change");
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

test("the direct input plan keeps safe open and closed questions in employer order with their intent", () => {
  const employerOptions = ["New York, NY", "San Francisco, CA", "Remote"];
  const plan = directInputTaskPlan({
    status: "needs_attention",
    attention_reason: "Complete the laboratory access check on the company page",
    questions: [
      {
        id: "why-role",
        question: "Why are you interested in this role?",
        answer: "The work joins product judgment with systems thinking.",
        kind: "essay",
        required: true,
        portal_input_type: "textarea",
        answer_source: "litos_draft",
      },
      {
        id: "location",
        question: "Which office would you work from?",
        answer: "",
        kind: "required",
        required: true,
        portal_input_type: "radio",
        options: employerOptions,
      },
      {
        id: "salary",
        question: "What are your compensation expectations?",
        answer: "USD 150,000",
        kind: "required",
        required: true,
        portal_input_type: "text",
      },
      {
        id: "start",
        question: "When can you start?",
        answer: "",
        kind: "required",
        required: true,
        portal_input_type: "textarea",
      },
    ],
  });

  assert.deepEqual(plan.questionTasks.map((task) => task.question.id), [
    "why-role",
    "location",
    "salary",
    "start",
  ]);
  assert.deepEqual(plan.questionTasks.map((task) => task.intent), [
    "review",
    "answer",
    "confirm",
    "answer",
  ]);
  assert.deepEqual(plan.questionTasks[1]?.question.options, employerOptions, "closed options stay in the employer's order");
  assert.equal(plan.current?.kind, "question", "the first direct question takes precedence over external work");
  assert.equal(plan.current?.id, "review-why-role");
  assert.deepEqual(plan.nonQuestionTasks.map((task) => task.item.label), [
    "Complete the laboratory access check on the company page",
  ]);
  assert.equal(plan.remaining, 5);
});

test("a closed question without exact options cannot become a direct text prompt", () => {
  const plan = directInputTaskPlan({
    status: "needs_attention",
    questions: [{
      id: "relocation",
      question: "Are you willing to relocate?",
      answer: "",
      kind: "required",
      required: true,
      portal_input_type: "select-one",
      options: null,
    }],
  });

  assert.deepEqual(plan.questionTasks, []);
  assert.deepEqual(plan.nonQuestionTasks, [], "an unsafe question is not relabeled as generic external work");
  assert.equal(plan.metadataBlockers[0]?.kind, "missing_exact_options");
  assert.equal(plan.metadataBlockers[0]?.question, "Are you willing to relocate?");
  assert.equal(plan.current, null);
  assert.equal(plan.remaining, 0);
});

test("a multi-value employer field with exact options becomes a direct multi-answer prompt", () => {
  const plan = directInputTaskPlan({
    status: "needs_attention",
    questions: [{
      id: "locations",
      question: "Select every location where you can work",
      answer: "",
      kind: "required",
      required: true,
      portal_input_type: "select-multiple",
      options: ["New York", "San Francisco"],
    }],
  });

  assert.equal(plan.questionTasks.length, 1);
  assert.equal(plan.questionTasks[0]?.question.id, "locations");
  assert.deepEqual(plan.questionTasks[0]?.question.options, ["New York", "San Francisco"]);
  assert.equal(plan.questionTasks[0]?.question.portal_input_type, "select-multiple");
  assert.deepEqual(plan.metadataBlockers, []);
});

test("ambiguous or blank employer questions remain blockers after safe answers finish", () => {
  const plan = directInputTaskPlan({
    status: "needs_attention",
    questions: [{
      id: "start-date",
      question: "When can you start?",
      answer: "",
      kind: "required",
      required: true,
      portal_input_type: "text",
    }, {
      id: "duplicate",
      question: "Which office is your first choice?",
      answer: "",
      kind: "required",
      required: true,
      portal_input_type: "text",
      portal_selector: "#first-office",
    }, {
      id: "duplicate",
      question: "Which office is your second choice?",
      answer: "",
      kind: "required",
      required: true,
      portal_input_type: "text",
      portal_selector: "#second-office",
    }, {
      id: "blank-label",
      question: " ",
      answer: "",
      kind: "required",
      required: true,
      portal_input_type: "text",
      portal_selector: "#unknown-field",
    }, {
      id: "",
      question: "Are you authorized to work here?",
      answer: "",
      kind: "required",
      required: true,
      portal_input_type: "radio",
      portal_selector: "#work-authorization",
      options: ["Yes", "No"],
    }],
  });

  assert.deepEqual(plan.questionTasks.map((task) => task.question.id), ["start-date"]);
  assert.ok(plan.metadataBlockers.some((blocker) => blocker.kind === "ambiguous_question_identity"));
  assert.ok(plan.metadataBlockers.some((blocker) => blocker.kind === "missing_question_text"));
  assert.equal(plan.current?.kind, "question");
  assert.equal(plan.remaining, 1, "only the safe prompt counts as a direct task");
});

test("direct question fingerprints separate the prompt from the current answer state", () => {
  const first = directInputTaskPlan({
    status: "needs_attention",
    questions: [{
      id: "location",
      question: "Where are you currently located?",
      answer: "",
      kind: "required",
      required: true,
      portal_input_type: "text",
      portal_selector: "#location",
    }],
  }).questionTasks[0]!;
  const answered = {
    ...first,
    intent: "review" as const,
    question: { ...first.question, answer: "Los Angeles, CA" },
  };
  const changed = {
    ...first,
    question: { ...first.question, question: "Which city and country are you based in?" },
  };

  assert.equal(directQuestionPromptFingerprint(first), directQuestionPromptFingerprint(answered));
  assert.notEqual(directQuestionTaskFingerprint(first), directQuestionTaskFingerprint(answered));
  assert.notEqual(directQuestionPromptFingerprint(first), directQuestionPromptFingerprint(changed));
});

test("an authoritative metadata blocker excludes its matching question while other questions remain direct", () => {
  const blocker = {
    kind: "missing_exact_options" as const,
    required: true,
    portal_input_type: "radio",
    portal_selector: "#work-location",
    question: "Where would you work?",
  };
  const plan = directInputTaskPlan({
    status: "needs_attention",
    question_metadata_blockers: [blocker],
    questions: [
      {
        id: "work-location",
        question: "Where would you work?",
        answer: "",
        kind: "required",
        required: true,
        portal_input_type: "radio",
        portal_selector: "#work-location",
        options: ["Office", "Remote"],
      },
      {
        id: "start-date",
        question: "What date can you start?",
        answer: "",
        kind: "required",
        required: true,
        portal_input_type: "text",
      },
    ],
  });

  assert.deepEqual(plan.questionTasks.map((task) => task.question.id), ["start-date"]);
  assert.deepEqual(plan.metadataBlockers, [blocker]);
});

test("raw attention lines remain non-question work rather than becoming answer controls", () => {
  const line = "Bring the company page to the foreground to complete the background check";
  const plan = directInputTaskPlan({
    status: "needs_attention",
    attention_reason: line,
    questions: [],
  });

  assert.equal(plan.questionTasks.length, 0);
  assert.equal(plan.nonQuestionTasks.length, 1);
  assert.equal(plan.nonQuestionTasks[0]?.item.label, line);
  assert.equal(plan.nonQuestionTasks[0]?.item.actionKind, "open-page");
  assert.equal(plan.current?.kind, "non-question");
});

test("CAPTCHA stops the direct question queue and remains the only current input task", () => {
  const plan = directInputTaskPlan({
    status: "needs_attention",
    attention_reason: "reCAPTCHA requires your attention",
    attention_categories: ["captcha"],
    questions: [{
      id: "start-date",
      question: "When can you start?",
      answer: "",
      kind: "required",
      required: true,
      portal_input_type: "text",
    }],
  });

  assert.deepEqual(plan.questionTasks, []);
  assert.deepEqual(plan.nonQuestionTasks.map((task) => task.item.id), [
    "blocker-captcha-requires-your-attention",
  ]);
  assert.equal(plan.current?.kind, "non-question");
  assert.equal(plan.remaining, 1);
});

test("document work remains outside the answer queue and attached files become settled", () => {
  const ask = { kind: "transcript", label: "Unofficial transcript", official_requested: false };
  const unanswered = directInputTaskPlan({
    status: "needs_attention",
    questions: [],
    required_documents: [ask],
    transcript_supported: true,
  }, { company: "Databricks" });

  assert.deepEqual(unanswered.questionTasks, []);
  assert.deepEqual(unanswered.nonQuestionTasks.map((task) => task.item.documentKind), ["transcript"]);
  assert.equal(unanswered.nonQuestionTasks[0]?.item.actionKind, "attach");

  const attached = directInputTaskPlan({
    status: "needs_attention",
    questions: [],
    required_documents: [ask],
    transcript_supported: true,
  }, {
    company: "Databricks",
    documents: { transcript: { file_name: "transcript.pdf", attached_at: "2026-08-24T10:00:00.000Z" } },
  });

  assert.deepEqual(attached.nonQuestionTasks, []);
  assert.deepEqual(attached.settled.map((item) => item.id), ["document-attached-transcript"]);
  assert.equal(attached.remaining, 0);
});

test("settled confirmations and ambiguous question identities never enter the direct queue", () => {
  const round = "2026-08-24T10:00:00.000Z";
  const plan = directInputTaskPlan({
    status: "needs_attention",
    questions_reviewed_at: round,
    questions: [
      {
        id: "authorization",
        question: "Are you legally authorized to work in Canada?",
        answer: "Yes",
        kind: "required",
        required: true,
        answer_source: "applicant_review",
        answer_reviewed_at: round,
        // Settled by the confirmation, not by the applicant-claim beside it. See
        // "an applicant-claim without a confirmation still asks".
        answer_confirmed_of: "Are you legally authorized to work in Canada?",
      },
      { id: "duplicate", question: "First duplicate prompt", answer: "", kind: "required", required: true },
      { id: "duplicate", question: "Second duplicate prompt", answer: "", kind: "required", required: true },
      { id: "blank-label", question: "   ", answer: "", kind: "required", required: true },
    ],
  });

  assert.deepEqual(plan.questionTasks, []);
  assert.deepEqual(plan.settled.map((item) => item.questionId), ["authorization"]);
  assert.equal(plan.remaining, 0);
});

/* The final flow occlusion on the Mytos Lever packet, 2026-08-28 (application
   55de7c9e-13c0-44fd-8f78-0dee280dbd33). After the required-marker route fix, the unreadable
   university combobox correctly demands metadata_refresh, but the attention screen still led with
   the row's STANDING attention: a withheld press, "could not confirm one of the required answers
   had been accepted", categories ["unknown"], written before the named answer (degree
   classification) was re-answered with an exact employer option. That one task occluded the
   metadata-refresh panel, the only control on the screen that starts the managed re-read, so every
   save returned to a screen with no launch on it. metadataRefreshOutranksStandingAttention is the
   fail-closed decision for when the panel may lead instead. */
import { readFileSync } from "node:fs";
import { metadataRefreshOutranksStandingAttention, reviewedAnswersSaveLanding } from "./submission-checklist.ts";

function mytosReview() {
  return {
    status: "needs_attention" as const,
    attention_reason: "Litos could not confirm one of the required answers had been accepted, so it did not press submit.",
    attention_categories: ["unknown" as const],
    questions: [
      {
        id: "degree-classification",
        question: "What classification did you achieve or are you expecting? ✱",
        answer: "First-Class Honours",
        kind: "required" as const,
        required: true,
        portal_input_type: "select-one",
        portal_selector: '[name="cards[62541ff1][field2]"]',
        options: ["First-Class Honours", "Upper Second-Class Honours", "Lower Second-Class Honours", "Other"],
      },
      {
        id: "university",
        question: "which was the most recent university you attended? ✱",
        answer: "University of Southern California",
        kind: "required" as const,
        required: false,
        portal_input_type: "combobox",
        portal_selector: '[name="cards[62541ff1][field0]"]',
        options: null,
      },
    ],
  };
}

test("the Mytos stale withheld-press attention yields to the metadata-refresh launch once the audit is acknowledged", () => {
  const review = mytosReview();
  /* Prove the fixture is production-shaped first: without the yield, this exact state occludes the
     launch, because the stale sentence stands as the one non-question task while the route demands
     the managed re-read. */
  const plan = directInputTaskPlan(review);
  assert.deepEqual(plan.questionTasks, []);
  assert.equal(plan.nonQuestionTasks.length, 1);
  assert.ok(plan.nonQuestionTasks[0]?.id.startsWith("blocker-"), "the stale sentence must stand as an attention row");
  assert.ok(plan.metadataBlockers.some((blocker) => blocker.required), "the unreadable university combobox must demand the re-read");

  assert.equal(metadataRefreshOutranksStandingAttention(review, true), true);
});

test("without an acknowledged passing audit the standing attention keeps the screen", () => {
  assert.equal(metadataRefreshOutranksStandingAttention(mytosReview(), false), false);
});

test("only unknown-category attention is supersedable, and no category at all is unreadable, not supersedable", () => {
  assert.equal(metadataRefreshOutranksStandingAttention({ ...mytosReview(), attention_categories: ["unknown", "captcha"] }, true), false);
  assert.equal(metadataRefreshOutranksStandingAttention({ ...mytosReview(), attention_categories: ["required_field"] }, true), false);
  assert.equal(metadataRefreshOutranksStandingAttention({ ...mytosReview(), attention_categories: [] }, true), false);
  assert.equal(metadataRefreshOutranksStandingAttention({ ...mytosReview(), attention_categories: undefined }, true), false);
});

test("an unresolved stall or an open unverified submission always keeps the screen", () => {
  const stalled = {
    ...mytosReview(),
    stall: { kind: "human_verification" as const, stalled_at: "2026-08-28T09:00:00.000Z", surface: "server_run" as const, provider: "unknown" as const, stage: "at_submit" as const, source: "observed" as const },
  };
  assert.equal(metadataRefreshOutranksStandingAttention(stalled, true), false);
  assert.equal(
    metadataRefreshOutranksStandingAttention({ ...stalled, stall: { ...stalled.stall, resolved_at: "2026-08-28T10:00:00.000Z" } }, true),
    false,
    "even a resolved stall still renders the captcha row, and that row is never superseded",
  );
  const unverified = {
    ...mytosReview(),
    unverified_submission: { at: "2026-08-28T09:00:00.000Z", cause: "run_timed_out" as const },
  };
  assert.equal(metadataRefreshOutranksStandingAttention(unverified, true), false);
});

test("a document ask or a captcha sentence is never superseded", () => {
  const withDocument = {
    ...mytosReview(),
    required_documents: [{ kind: "transcript", label: "Unofficial transcript", official_requested: false }],
    transcript_supported: true,
  };
  assert.equal(metadataRefreshOutranksStandingAttention(withDocument, true), false);
  const captchaSentence = {
    ...mytosReview(),
    /* The category classifier can miss a captcha the sentence still names. The row id this module
       mints for it is excluded on its own, so the text alone keeps the screen. */
    attention_reason: "reCAPTCHA requires your attention",
  };
  assert.equal(metadataRefreshOutranksStandingAttention(captchaSentence, true), false);
});

test("a blank required answer or a complete packet routes normally instead of outranking attention", () => {
  const blankRequired = mytosReview();
  blankRequired.questions[0]!.answer = "";
  assert.equal(metadataRefreshOutranksStandingAttention(blankRequired, true), false, "an answer route belongs to the answers screen");
  const readableUniversity = mytosReview();
  readableUniversity.questions[1]!.options = ["University of Southern California", "Other"];
  readableUniversity.questions[1]!.portal_input_type = "select-one";
  assert.equal(metadataRefreshOutranksStandingAttention(readableUniversity, true), false, "a continue route has no re-read to launch");
});

test("only a needs_attention review is occluded at all", () => {
  assert.equal(metadataRefreshOutranksStandingAttention({ ...mytosReview(), status: "ready_for_final_approval" as const }, true), false);
});

test("the attention screen resolves its occlusion through the domain decision, with the acknowledged-audit fact", () => {
  const page = readFileSync("app/dashboard/applications/page.tsx", "utf8");
  const site = page.indexOf("metadataRefreshOutranksStandingAttention(attentionReview, packetEvidenceReviewed");
  assert.ok(site > 0, "the SubmissionScreen must route the occlusion through metadataRefreshOutranksStandingAttention");
  assert.match(page.slice(site - 900, site + 900), /standingNonQuestionTask/);
});

/* The last leg of the same Mytos loop: with the route fixed and the occlusion resolvable, the
   answers screen's Save still routed on the bare status and destroyed the acknowledged audit the
   launch decision needs, so the applicant landed on the attention screen with the panel occluded
   again, forever. reviewedAnswersSaveLanding is where the save now lands, stated once. */
test("a clean Mytos save lands on the attention screen where the launch panel provably leads", () => {
  const landing = reviewedAnswersSaveLanding(mytosReview(), true);
  assert.deepEqual(landing, { screen: "portal", kind: "metadata_refresh_launch" });
  /* The binding fact that makes "hosts the launch action" true rather than hopeful: the screen the
     save lands on resolves its occlusion through the same decision, with the same inputs. */
  assert.equal(metadataRefreshOutranksStandingAttention(mytosReview(), true), true);
});

test("a save that leaves a required answer blank keeps the answers screen", () => {
  const blankRequired = mytosReview();
  blankRequired.questions[0]!.answer = "";
  assert.deepEqual(reviewedAnswersSaveLanding(blankRequired, true), { screen: "questions", kind: "unanswered_required" });
  assert.deepEqual(reviewedAnswersSaveLanding(blankRequired, false), { screen: "questions", kind: "unanswered_required" });
});

test("without the acknowledged audit the save routes exactly as it always has", () => {
  assert.deepEqual(reviewedAnswersSaveLanding(mytosReview(), false), { screen: "portal", kind: "status" });
});

test("every fail-closed arm of the launch decision keeps plain status routing", () => {
  const captchaSentence = { ...mytosReview(), attention_reason: "reCAPTCHA requires your attention" };
  assert.deepEqual(reviewedAnswersSaveLanding(captchaSentence, true), { screen: "portal", kind: "status" });
  const withDocument = {
    ...mytosReview(),
    required_documents: [{ kind: "transcript", label: "Unofficial transcript", official_requested: false }],
    transcript_supported: true,
  };
  assert.deepEqual(reviewedAnswersSaveLanding(withDocument, true), { screen: "portal", kind: "status" });
  const stalled = {
    ...mytosReview(),
    stall: { kind: "human_verification" as const, stalled_at: "2026-08-28T09:00:00.000Z", surface: "server_run" as const, provider: "unknown" as const, stage: "at_submit" as const, source: "observed" as const },
  };
  assert.deepEqual(reviewedAnswersSaveLanding(stalled, true), { screen: "portal", kind: "status" });
  const unverified = {
    ...mytosReview(),
    unverified_submission: { at: "2026-08-28T09:00:00.000Z", cause: "run_timed_out" as const },
  };
  assert.deepEqual(reviewedAnswersSaveLanding(unverified, true), { screen: "portal", kind: "status" });
});

test("a save that moved the run off needs_attention follows the status, never the launch", () => {
  assert.deepEqual(
    reviewedAnswersSaveLanding({ ...mytosReview(), status: "ready_for_final_approval" as const }, true),
    { screen: "portal", kind: "status" },
  );
  assert.deepEqual(
    reviewedAnswersSaveLanding({ ...mytosReview(), status: "submitted" as const }, true),
    { screen: "submitted", kind: "status" },
  );
  assert.deepEqual(
    reviewedAnswersSaveLanding({ ...mytosReview(), status: "questions_ready" as const }, true),
    { screen: "review", kind: "status" },
  );
});

test("the answers screen's save routes through the landing with the reconciled acknowledged-audit fact", () => {
  const page = readFileSync("app/dashboard/applications/page.tsx", "utf8");
  const reconcile = page.indexOf("const nextEvidence = reconcilePacketEvidenceWithSubmission(\n          packetEvidenceRef.current,\n          applicationId,\n          published.review.questions,\n          published.review.packet_audit,\n        )");
  assert.ok(reconcile > 0, "the accepted save must reconcile standing evidence against the stored answers instead of wiping it");
  const landing = page.indexOf("reviewedAnswersSaveLanding(published.review, Boolean(nextEvidence?.acknowledged)");
  assert.ok(landing > reconcile, "the bulk save must land through the domain decision, fed the surviving acknowledgement");
  assert.match(
    page.slice(reconcile, landing),
    /moveToScreen\(direct\s*\?\s*screenForStatus\(published\.review\.status, "portal"\)/,
    "the direct flow keeps its own status routing",
  );
});

import { documentStepsInPlan, isDocumentChecklistItem } from "./submission-checklist.ts";

/* TWO PACKETS, ONE ACCOUNT, ONE MEASUREMENT, TWO DIFFERENT SCREENS - 2026-09-03.
 *
 * Both greenhouse, both needs_attention, both carrying the same measured ask and the same
 * `transcript_supported: true`. The Databricks packet drew the step with a working Add transcript
 * control. The Verkada packet carried an unresolved `unverified_submission` as well, and the
 * dashboard's mode for that replaced the whole amber panel with the raw attention prose and a
 * yes/no, so the requirement was stated by a screen that could not act on it.
 *
 * The review below is Verkada's, verbatim in the fields that decide any of this. */
function transcriptAskReview() {
  return {
    status: "needs_attention" as const,
    attention_reason: '"Undergraduate Transcript" is required and is still empty\n'
      + '1 required field has no question you can answer in Litos: "Undergraduate Transcript"',
    attention_categories: ["required_document" as const],
    questions: [],
    filled_fields: [],
    required_documents: [{ kind: "transcript", label: "Undergraduate Transcript", official_requested: false }],
    transcript_supported: true,
  };
}

const VERKADA = { company: "Verkada", role: "Embedded Software Engineering Intern 2027" };

test("the employer's two attention sentences collapse into one row that carries a control", () => {
  /* Both lines name the same field, so the document row's subject collides with the first and
     addUnique drops it. The row that survives is the one with somewhere to press, which is the whole
     reason documentAskItems is emitted before the blocker loop. */
  const items = humanInputItems(transcriptAskReview(), VERKADA);
  assert.deepEqual(items.map((item) => item.id), ["document-transcript"]);
  assert.equal(items[0].label, "Verkada needs your transcript");
  assert.equal(items[0].actionKind, "attach");
  assert.equal(items[0].documentKind, "transcript");
});

test("a document row is recognised by either half of what makes it one", () => {
  /* Both halves are kept because a row losing one of them must still read as a document row rather
     than quietly becoming a blocker with no control. */
  assert.equal(isDocumentChecklistItem({ id: "a", label: "a", documentKind: "transcript" }), true);
  assert.equal(isDocumentChecklistItem({ id: "b", label: "b", actionKind: "attach" }), true);
  assert.equal(isDocumentChecklistItem({ id: "c", label: "c", actionKind: "open-page" }), false);
  assert.equal(isDocumentChecklistItem({ id: "d", label: "d" }), false);
});

test("the document step survives a plan whose other rows the unverified mode must suppress", () => {
  /* The plan is the same one the ordinary panel reads. What the screen does with it differs by mode;
     what counts as a document row must not. */
  const plan = directInputTaskPlan(transcriptAskReview(), VERKADA);
  assert.deepEqual(
    documentStepsInPlan(plan).map((item) => item.id),
    ["document-transcript"],
    "the one row that can resolve the employer's requirement was not offered to the suppressed mode",
  );
});

test("only document rows survive: an ordinary blocker is not smuggled through with them", () => {
  /* The point of the carve-out is that attaching a file sends nothing. A row that opens the
     employer's page or re-runs the fill could send a second application while Litos still does not
     know whether the first one landed, so it stays suppressed. */
  const plan = directInputTaskPlan({ ...transcriptAskReview(), required_documents: [] }, VERKADA);
  assert.ok(plan.nonQuestionTasks.length > 0, "the fixture must still produce blocker rows to be a real negative");
  assert.deepEqual(documentStepsInPlan(plan), []);
});

test("the attached confirmation stays in the list, because it is the only way back to Remove", () => {
  /* Settled rows live in `plan.settled`, not in `nonQuestionTasks`. A list built from the outstanding
     half alone would vanish the instant she attached the file, taking with it the control that opens
     the modal where "Remove this file" lives, while /privacy publishes "we keep it until you remove
     it". */
  const plan = directInputTaskPlan(transcriptAskReview(), {
    ...VERKADA,
    documents: { transcript: { file_name: "USC Transcript.pdf", attached_at: "2026-09-03T12:00:00.000Z" } },
  });
  const steps = documentStepsInPlan(plan);
  assert.deepEqual(steps.map((item) => item.id), ["document-attached-transcript"]);
  assert.equal(steps[0].settled, true);
  assert.equal(steps[0].actionKind, "attach", "the confirmation lost the control that reopens the modal");
});

test("the screen keeps the document step alive in the unverified-submission mode", () => {
  /* A source pin, because this is a render branch and the defect it repairs was invisible in every
     domain test: the plan was correct all along and the screen threw it away. The mode still
     suppresses the sending controls, so the pin is on the document list existing beside the card,
     not on the card going away. */
  const page = readFileSync("app/dashboard/applications/page.tsx", "utf8");
  assert.match(
    page,
    /const unverifiedDocumentSteps = documentStepsInPlan\(directTaskPlan\);/,
    "the document steps must be read off the same plan every other row on this screen uses",
  );
  assert.match(
    page,
    /\{awaitingUnverifiedSubmission && unverifiedDocumentSteps\.length > 0 && \(\s*<BlockerList\s+items=\{unverifiedDocumentSteps\}\s+onAddDocument=\{onAddDocument\}/,
    "the unverified-submission mode must still draw the document steps, with the control that resolves them",
  );
  /* The third conjunct arrived with the stalled-fill fix (Palantir packet f1cfb841, 2026-09-04) and
     is a SECOND independent suppression, not a replacement for this one: a quarantined authority
     rewrites a live `filling` row into "needs_attention", so this button used to render on a packet
     whose handler returns before its fetch. Pinned together so neither can be dropped by an edit
     aimed at the other - this test still owns `!awaitingUnverifiedSubmission`. */
  assert.match(
    page,
    /\{needsAttention && !awaitingUnverifiedSubmission && !employerActionRefusal && <Button onClick=\{onRetry\}/,
    "Try again must stay suppressed while Litos does not know whether the first application landed",
  );
});

/**
 * DSI Innovations, Recruitee, packet a34e5ce2, measured live on 2026-09-03.
 *
 * The review screen printed "Application files, 2 items completed" with a green tick, DIRECTLY
 * BESIDE its own evidence image, in which the required "CV or resume *" dropzone and the cover
 * letter dropzone both still read "Upload a file or drag and drop here" with no filename anywhere.
 * Send application was enabled. `filled_fields` is the runner's claim about its own work and nothing
 * had cross-checked it against the employer's form.
 */
const dsi: Pick<ApplicationReview, "attention_reason" | "filled_fields" | "questions" | "receipt" | "skipped_reasons" | "status"> = {
  status: "ready_for_final_approval",
  attention_reason: "",
  skipped_reasons: [],
  questions: [],
  filled_fields: ["name", "email", "phone", "resume", "cover_letter"],
};

test("a file the run only CLAIMS it attached is not Done", () => {
  const groups = completedSubmissionGroups(dsi);
  const items = completedSubmissionItems(dsi);

  assert.equal(
    groups.some((group) => group.label === "Application files"),
    false,
    'Done said "Application files, 2 items completed" beside a screenshot of two empty dropzones',
  );
  assert.equal(items.some((item) => item.label === "Resume"), false);
  assert.equal(items.some((item) => item.label === "Cover letter"), false);

  // Targeted, not a blanket deletion: everything the run typed INTO the form still counts.
  assert.deepEqual(groups.map(({ label, detail }) => ({ label, detail })), [
    { label: "Contact details", detail: "2 items completed" },
    { label: "Other details", detail: "1 item completed" },
  ]);
});

test("an unconfirmed file is named in its own state rather than dropped in silence", () => {
  const unconfirmed = unconfirmedDocumentItems(dsi);

  assert.deepEqual(unconfirmed.map((item) => item.label), ["Resume", "Cover letter"]);
  assert.equal(
    unconfirmed[0]?.detail,
    "Litos says it attached this. Nothing has confirmed it on the company's form, so check the picture of the filled form for the file name.",
  );
  assert.equal(unconfirmed[0]?.badge, "Not confirmed");
  // It states uncertainty and refuses nothing: no control, no tick, nothing the send gate reads.
  assert.equal(unconfirmed[0]?.actionKind, undefined);
  assert.equal(unconfirmed[0]?.acknowledgeable, undefined);
  assert.equal(unconfirmed[0]?.settled, undefined);
  assert.equal(checklistRowControl(unconfirmed[0]!, { portalUrl: "https://example.com" }), null);
});

test("the run's own report that a file is still missing sharpens the sentence", () => {
  const unconfirmed = unconfirmedDocumentItems({
    ...dsi,
    attention_reason: '"CV or resume" is required and is still empty',
  });

  const resume = unconfirmed.find((item) => item.label === "Resume");
  assert.equal(resume?.detail, "The run reports this file is still missing from the company's form.");
  assert.equal(resume?.badge, "Missing");
  // The cover letter has no such report, so it keeps the weaker, honest sentence rather than
  // borrowing the resume's.
  assert.equal(unconfirmed.find((item) => item.label === "Cover letter")?.badge, "Not confirmed");
});

test("a file the runner drops from filled_fields is still named from skipped_reasons", () => {
  /* litos-stratus #152: a runner that cannot confirm an upload stops listing the label as filled
     and names the reason instead. There is no claim left to demote, so nothing but this keeps the
     file on screen. */
  const after = unconfirmedDocumentItems({
    ...dsi,
    filled_fields: ["name", "email", "phone"],
    skipped_reasons: ["resume: upload control never reported a file after the drop"],
  });

  assert.deepEqual(after.map(({ label, badge }) => ({ label, badge })), [{ label: "Resume", badge: "Missing" }]);

  // And the same file reported in both places is still ONE row.
  const both = unconfirmedDocumentItems({
    ...dsi,
    skipped_reasons: ["resume: upload control never reported a file after the drop"],
  });
  assert.deepEqual(both.map((item) => item.label), ["Resume", "Cover letter"]);
  assert.equal(both.find((item) => item.label === "Resume")?.badge, "Missing");
});

test("a skipped reason that names no file does not invent a row", () => {
  const unconfirmed = unconfirmedDocumentItems({
    ...dsi,
    filled_fields: ["name", "email"],
    skipped_reasons: ["an upload control was left alone", "salary: left for the applicant"],
  });
  assert.deepEqual(unconfirmed, []);
});

test("the employer's own record is what makes a file Done", () => {
  const filed: Pick<ApplicationReview, "attention_reason" | "filled_fields" | "questions" | "receipt" | "skipped_reasons" | "status"> = {
    ...dsi,
    status: "submitted",
    receipt: {
      confirmation_text: "Thanks for applying to DSI Innovations.",
      final_url: "https://dsiinnovations.recruitee.com/o/intern/c/new",
      captured_at: "2026-09-03T09:00:00.000Z",
    },
  };

  assert.deepEqual(
    completedSubmissionGroups(filed).find((group) => group.label === "Application files")?.detail,
    "2 items completed",
    "once the employer has answered, the claim is settled and Done is allowed to say so",
  );
  assert.deepEqual(unconfirmedDocumentItems(filed), []);
  assert.equal(
    unconfirmedDocumentItems({ ...filed, skipped_reasons: ["resume: upload control never reported a file"] }).length,
    0,
    "a receipt outranks a run's report about its own attempt",
  );
});

/**
 * GET /applications carries resume_attached, resume_source and resume_attached_at on every canonical
 * row, and until now nothing in the dashboard read any of them. On DSI Innovations the same database
 * held resume_attached false and resume_source "none" WHILE submission_state was
 * ready_for_final_approval and this screen printed "Application files, 2 items completed".
 */
test("the application record adds its own sentence about the resume", () => {
  const unconfirmed = unconfirmedDocumentItems(dsi, {
    resume: { resume_attached: false, resume_source: "none", resume_attached_at: null },
  });

  const resume = unconfirmed.find((item) => item.label === "Resume");
  assert.equal(
    resume?.detail,
    "Litos says it attached this, and Litos's own application record has no resume linked to it either. Nothing here can confirm the company got one, so check the picture of the filled form.",
  );
  /* NOT raised to Missing. The column is `not null default false` and only a managed prepare or a
     post-receipt artifact sync ever writes it true, so false on a legacy-flow packet is the ordinary
     state of a healthy application, not a measurement that anything is gone. Calling it Missing
     would send her to re-upload a resume that was fine. */
  assert.equal(resume?.badge, "Not confirmed");
  /* One row of the ledger, one file. The record says nothing about the cover letter, so the cover
     letter keeps the sentence the run earned it. */
  const cover = unconfirmed.find((item) => item.label === "Cover letter");
  assert.equal(cover?.badge, "Not confirmed");
  assert.equal(cover?.detail, "Litos says it attached this. Nothing has confirmed it on the company's form, so check the picture of the filled form for the file name.");
});

test("a run that reports the resume empty outranks the record's weaker sentence", () => {
  /* Both are true, and the run measured the employer's own form while the record only knows what
     Litos linked. The stronger, more specific report is the one worth printing. */
  const unconfirmed = unconfirmedDocumentItems(
    { ...dsi, attention_reason: '"CV or resume" is required and is still empty' },
    { resume: { resume_attached: false, resume_source: "none", resume_attached_at: null } },
  );
  const resume = unconfirmed.find((item) => item.label === "Resume");
  assert.equal(resume?.detail, "The run reports this file is still missing from the company's form.");
  assert.equal(resume?.badge, "Missing");
});

const PLAIN_UNVERIFIED_DETAIL = "Litos says it attached this. Nothing has confirmed it on the company's form, so check the picture of the filled form for the file name.";

test("an attached resume on the record still does not make a Done line", () => {
  /* Hudson River Trading and EQL Tech both read resume_attached true with submission_state
     not_started on 2026-09-03, so this field says a resume artifact is linked to the RECORD, not
     that an employer's form received one. Promoting it would be the original defect with a new
     source. */
  const attached = { resume: { resume_attached: true, resume_source: "artifact", resume_attached_at: "2026-09-01T21:27:37.000Z" } };

  assert.equal(
    completedSubmissionGroups(dsi).some((group) => group.label === "Application files"),
    false,
    "a resume linked to the application record is not the employer's form having received it",
  );
  const unconfirmed = unconfirmedDocumentItems(dsi, attached);
  assert.deepEqual(unconfirmed.map(({ label, badge, detail }) => ({ label, badge, detail })), [
    { label: "Resume", badge: "Not confirmed", detail: PLAIN_UNVERIFIED_DETAIL },
    { label: "Cover letter", badge: "Not confirmed", detail: PLAIN_UNVERIFIED_DETAIL },
  ], "an attached record must read exactly like no record at all, in the words as well as the badge");
});

test("a record this ledger never loaded is silence, not a verdict", () => {
  /* resume_attached is optional on the wire and absent on any backend that predates it, and the row
     is only present when this page's ledger loaded it. Absent must read exactly like today. */
  assert.deepEqual(unconfirmedDocumentItems(dsi, {}), unconfirmedDocumentItems(dsi));
  assert.deepEqual(unconfirmedDocumentItems(dsi, { resume: {} }), unconfirmedDocumentItems(dsi));
  assert.deepEqual(
    unconfirmedDocumentItems(dsi, { resume: { resume_source: "none" } }),
    unconfirmedDocumentItems(dsi),
    "resume_source is typed as an open set and must not be branched on",
  );
});

test("the record never creates a row on its own, and never outranks a receipt", () => {
  const noResume = { resume: { resume_attached: false, resume_source: "none", resume_attached_at: null } };

  assert.deepEqual(
    unconfirmedDocumentItems({ ...dsi, filled_fields: ["name", "email"] }, noResume),
    [],
    "nothing here claimed a resume, so this list has nothing to correct",
  );
  assert.deepEqual(
    unconfirmedDocumentItems({
      ...dsi,
      status: "submitted",
      receipt: { confirmation_text: "Received.", final_url: "https://example.com/done", captured_at: "2026-09-03T09:00:00.000Z" },
    }, noResume),
    [],
    "the employer's own record outranks Litos's record about Litos",
  );
});

test("a question about a file is not a file", () => {
  /* `question:cover letter` is a text area the run typed into. completedSubmissionGroups already
     skips every question-prefixed key, and a list of unconfirmed FILES that included it would be a
     fresh false statement in the column built to stop making them. */
  const unconfirmed = unconfirmedDocumentItems({
    ...dsi,
    filled_fields: ["name", "question:cover letter"],
    skipped_reasons: ["question: cover letter left for the applicant"],
  });
  assert.deepEqual(unconfirmed, []);
});

test("the review screen renders the unconfirmed files outside the Done column", () => {
  const page = readFileSync("app/dashboard/applications/page.tsx", "utf8");
  assert.match(
    page,
    /const unconfirmedDocuments = unconfirmedDocumentItems\(review, \{ resume: resumeRecord \}\);/,
    "the review screen must read the unconfirmed files off the review AND the canonical row's resume record",
  );
  assert.match(
    page,
    /\{unconfirmedDocuments\.length > 0 && \([\s\S]{0,400}?Not confirmed[\s\S]{0,400}?<ChecklistRow key=\{item\.id\} item=\{item\} checked=\{false\} \/>/,
    "an unconfirmed file must render under its own heading with checked={false}, never as a green Done row",
  );
  assert.equal(
    /completedItems\.slice\(0, 12\)[\s\S]{0,200}unconfirmedDocuments/.test(page),
    false,
    "it must never be folded into the list counted as checks already complete",
  );
});

test("the canonical row's resume record reaches both screens by either of its two ids", () => {
  /* The review flow hands SubmissionScreen the RESTORED legacy packet, so canonicalApplicationFromPacket
     answers null on exactly the screen with the Send button and the legacy id is the only handle
     left. A map keyed only by the canonical id would be silently empty there, which reads identical
     to a backend that never served the field. */
  const page = readFileSync("app/dashboard/applications/page.tsx", "utf8");
  assert.match(
    page,
    /const canonicalApplicationsByAnyId = useMemo\(\(\) => \{[\s\S]{0,600}?canonicalApplicationFromPacket\(packet\)[\s\S]{0,300}?rows\[application\.id\] = application;[\s\S]{0,200}?rows\[application\.legacy_generated_resume_id\] = application;/,
    "the record must be reachable by the canonical id AND by the legacy packet id",
  );
  assert.match(page, /\[packets\]\);/, "it is derived off the ledger on screen, never a second copy that can drift");
  assert.match(page, /resumeRecord=\{canonicalApplicationsByAnyId\[selected\.id\]\}/);
  assert.match(page, /resumeRecord=\{canonicalApplicationsByAnyId\[revisitingPacket\.id\]\}/);
});

test("the packet record says the same thing the review screen does", () => {
  const packet = readFileSync("components/app/ApplicationPacket.tsx", "utf8");
  assert.match(packet, /const unconfirmedDocuments = unconfirmedDocumentItems\(safeContentReview, \{ resume: resumeRecord \}\);/);
  assert.match(
    packet,
    /\{unconfirmedDocuments\.length > 0 && \([\s\S]{0,400}?Not confirmed on their form[\s\S]{0,400}?<CheckRow key=\{item\.id\} item=\{item\} checked=\{false\} \/>/,
    "the read-only record must not list under Done by Litos a file the review screen calls unconfirmed",
  );
});

/* THE ONE-QUESTION QUEUE HAS TO READ THE SERVER'S LIST TOO, not only the packet screen's
 * confirmation block.
 *
 * Measured live 2026-09-04, Hudson River Trading application 4a79eec1-5c65-4dd4-8e72-e119fbfbd733:
 * sensitive_questions_requiring_confirmation was [], packet_audit.status was "passed", 0 required
 * questions were unanswered, and the sponsorship question already carried answer_source
 * "applicant_review" with answer_reviewed_at equal to questions_reviewed_at. The server had nothing
 * left to ask. The one-question queue asked anyway: directInputTaskPlan built its plan by calling
 * humanInputItems WITHOUT the server's list, so it fell back to isHumanOnlyChecklistLabel, which
 * matches this exact label regardless of what the server says. The screen showed "1 of 1", the
 * question pre-answered "Yes", and a live "Confirm answer" button over a question already settled.
 *
 * These two cases are the whole of the regression: the plan must agree with the server when the
 * server has spoken, and keep the old label-guess only when it has not. */
test("the direct plan drops a question the server's own list has already cleared", () => {
  const SPONSORSHIP =
    "Will you now, or in the future, require visa sponsorship to legally work in the country specified for this position?";
  const ROUND = "2026-09-01T21:28:12.934Z";
  const review: Pick<ApplicationReview, "attention_reason" | "questions" | "questions_reviewed_at" | "status"> = {
    status: "needs_attention",
    attention_reason: "",
    questions_reviewed_at: ROUND,
    questions: [{
      id: "sponsorship",
      question: SPONSORSHIP,
      answer: "Yes",
      kind: "required",
      required: true,
      portal_input_type: "select-one",
      options: ["Yes", "No"],
      answer_source: "applicant_review",
      answer_reviewed_at: ROUND,
      // No answer_confirmed_of: the server does not serve one for a question it is not asking about.
    }],
  };

  // With no server list at all (an older payload), the previous label-guess behaviour is untouched.
  const fallbackPlan = directInputTaskPlan(review);
  assert.equal(fallbackPlan.questionTasks[0]?.intent, "confirm", "an older payload still falls back to the label classes");
  assert.equal(fallbackPlan.current?.id, "confirm-sponsorship");
  assert.equal(fallbackPlan.remaining, 1);

  // The server's own list, exactly as measured: empty. Nothing is outstanding, so nothing is asked.
  const clearedPlan = directInputTaskPlan(review, { sensitiveConfirmations: [] });
  assert.deepEqual(clearedPlan.questionTasks, [], "the server named nothing, so the queue has no question left to ask");
  assert.equal(clearedPlan.current, null, "there is no packet-review dead end left to route to");
  assert.equal(clearedPlan.remaining, 0);

  // The server's list still names the label: the queue must still ask, or a genuine confirmation
  // requirement would go silent instead of merely a stale one.
  const namedPlan = directInputTaskPlan(review, { sensitiveConfirmations: [SPONSORSHIP] });
  assert.equal(namedPlan.questionTasks[0]?.intent, "confirm");
  assert.equal(namedPlan.current?.id, "confirm-sponsorship");
});

test("the direct plan's server list clears one label without silencing a genuinely outstanding one", () => {
  const SPONSORSHIP = "Do you require visa sponsorship?";
  const GENDER = "What is your gender?";
  const ROUND = "2026-09-01T21:28:12.934Z";
  const review: Pick<ApplicationReview, "attention_reason" | "questions" | "questions_reviewed_at" | "status"> = {
    status: "needs_attention",
    attention_reason: "",
    questions_reviewed_at: ROUND,
    questions: [
      {
        id: "sponsorship", question: SPONSORSHIP, answer: "No", kind: "required", required: true,
        portal_input_type: "select-one", options: ["Yes", "No"],
        answer_source: "applicant_review", answer_reviewed_at: ROUND,
      },
      {
        id: "gender", question: GENDER, answer: "Woman", kind: "required", required: true,
        portal_input_type: "select-one", options: ["Woman", "Man", "Non-binary"],
        answer_source: "applicant_review", answer_reviewed_at: ROUND,
      },
    ],
  };

  // The server names only gender now: sponsorship is cleared, gender still asks.
  const plan = directInputTaskPlan(review, { sensitiveConfirmations: [GENDER] });
  const ids = plan.questionTasks.map((task) => task.question.id);
  assert.ok(!ids.includes("sponsorship"), "the server dropped this one, so the queue must not invent it back");
  assert.ok(ids.includes("gender"), "the server still names this one, so the queue must still ask");
  assert.equal(plan.remaining, 1);
});

/* A CONFIRMED ESSAY IS NOT A DRAFT, and while this row could not tell the two apart it asked forever.
 *
 * The condition was `kind === "essay" && answer`, true of every answered essay for the life of the
 * packet. The row says "Drafted answer ready for review"; pressing Review, saving, and returning
 * rebuilt the identical row, because nothing in the test could observe that anything had happened.
 *
 * Measured live 2026-09-04 on Exa "Software Engineer, Intern", packet 73768339 (ashby): all four of
 * its essays carry answer_source "applicant_review" - every one confirmed - and the screen still
 * walked them as "1 of 4", indefinitely, with no exit.
 *
 * litos_draft is exactly the provenance the row's own sentence describes, and it is what the
 * backend's send gate reads (unapprovedLitosDraftQuestionLabels), so gating on it makes the row mean
 * what the send means.
 */
test("a confirmed essay is not a draft, so it stops asking", () => {
  const review: Pick<ApplicationReview, "attention_reason" | "questions" | "questions_reviewed_at" | "status"> = {
    status: "needs_attention",
    attention_reason: "",
    questions_reviewed_at: "2026-09-04T00:00:00.000Z",
    questions: [
      {
        id: "confirmed-essay",
        question: "Why are you interested in working at exa?",
        answer: "Exa's work on retrieval connects directly to the systems I have been building.",
        kind: "essay",
        required: true,
        answer_source: "applicant_review",
      },
      {
        id: "drafted-essay",
        question: "What motivates you?",
        answer: "A paragraph Litos wrote that she has not read yet.",
        kind: "essay",
        required: true,
        answer_source: "litos_draft",
      },
    ],
  };

  const items = humanInputItems(review);
  assert.equal(
    items.find((item) => item.questionId === "confirmed-essay"),
    undefined,
    "she confirmed it; asking again is the loop this test exists to stop",
  );
  const drafted = items.find((item) => item.questionId === "drafted-essay");
  assert.ok(drafted, "an unapproved Litos draft still needs her eyes");
  assert.equal(drafted.detail, "Drafted answer ready for review");
  assert.equal(drafted.actionKind, "review");
});

test("an essay with NO provenance is still an unapproved draft and keeps its Review row", () => {
  /* Corrected after review measured the backend: machineAuthored is `source === undefined ||
     source === 'litos_draft'`, and submissionSafety records that "the essay drafter used to push its
     paragraph with no flag at all". So an absent provenance is a Litos-written paragraph on an older
     packet, not a machine-resolved field - and unapprovedLitosDraftQuestionLabels matches the literal
     only, so the send gate does not stop it either. This row is the only thing that shows it to her. */
  const review: Pick<ApplicationReview, "attention_reason" | "questions" | "questions_reviewed_at" | "status"> = {
    status: "needs_attention",
    attention_reason: "",
    questions_reviewed_at: "2026-09-04T00:00:00.000Z",
    questions: [
      { id: "machine", question: "Why here?", answer: "Because the work matches.", kind: "essay", required: true },
    ],
  };
  const row = humanInputItems(review).find((item) => item.id === "review-machine");
  assert.ok(row, "an AI-written paragraph nobody flagged must still be shown before it is sent");
  assert.equal(row.detail, "Drafted answer ready for review");
});

/* THE LOOP MUST NOT COME BACK WEARING A DIFFERENT WORD.
 *
 * Letting a confirmed essay through the Review branch newly exposed it to the confirm branch below,
 * whose label guess matches salary, consent/recording and non-US sponsorship wording. Measured before
 * the guard: an answered essay labelled "What are your compensation expectations?" produced
 * "Needs your confirmation" on the fallback path, and it could never settle - settling reads
 * answer_confirmed_of, which does not reach this client - so directInputTaskPlan still reported
 * remaining: 1 after a save. The local guess is therefore barred from claiming essays; the SERVER's
 * list is not, because a question the backend names has a real exit. */
test("a confirmed essay whose label reads human-only does not fall into an unsettleable confirm row", () => {
  const SALARY_ESSAY = "What are your compensation expectations?";
  const review: Pick<ApplicationReview, "attention_reason" | "questions" | "questions_reviewed_at" | "status"> = {
    status: "needs_attention",
    attention_reason: "",
    questions_reviewed_at: "2026-09-04T00:00:00.000Z",
    questions: [
      {
        id: "salary-essay",
        question: SALARY_ESSAY,
        answer: "I am flexible and would defer to the band for the role.",
        kind: "essay",
        required: true,
        answer_source: "applicant_review",
      },
    ],
  };

  // Fallback path: no server list, so only the local label guess is available - and it must not fire.
  assert.equal(
    humanInputItems(review).find((item) => item.questionId === "salary-essay"),
    undefined,
    "she confirmed it; a label guess must not re-ask it as a confirmation it can never settle",
  );

  // But when the SERVER names it, the ask is real and the row appears.
  const named = humanInputItems(review, { sensitiveConfirmations: [SALARY_ESSAY] })
    .find((item) => item.questionId === "salary-essay");
  assert.ok(named, "the backend naming a question outranks the local guess");
  assert.equal(named.actionKind, "confirm");
});
