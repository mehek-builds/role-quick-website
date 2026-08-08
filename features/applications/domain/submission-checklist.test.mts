import assert from "node:assert/strict";
import test from "node:test";
import { checklistRowControl, completedSubmissionItems, humanInputItems } from "./submission-checklist.ts";
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
    assert.ok(control.element === "link" ? control.href.length > 0 : control.questionId.length > 0);
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
    name: 'Review the drafted answer to: are you willing to work in-person for 12 weeks during the internship?',
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
  assert.match(confirmControl?.name ?? "", /^Confirm your answer to: will you require sponsorship/);
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

  const heard = items.find((item) => item.label === "how did you hear about anduril?");
  assert.ok(heard, "the run reports this field still empty, so it is work the applicant still has");
  assert.equal(heard.detail, "Answered here, still empty on the form");
  assert.equal(heard.action, "Answer");
  assert.equal(heard.questionId, "q-heard");
  assert.equal(
    done.some((item) => item.label === "how did you hear about anduril?"),
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
