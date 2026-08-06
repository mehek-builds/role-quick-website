import assert from "node:assert/strict";
import test from "node:test";
import { completedSubmissionItems, humanInputItems } from "./submission-checklist.ts";
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
