import assert from "node:assert/strict";
import test from "node:test";
import { humanInputItems } from "../features/applications/domain/submission-checklist.ts";

/* MEASURED live on ChapsVision US (Teamtailor, application dca5bb9c, 2026-09-06). The dashboard's
 * polled submission carried no server confirmation list, so humanInputItems fell back to its local
 * label guess; the French privacy sentence matched "privacy"/"consent" and the row became a
 * "Needs your confirmation" task that kept Send grey. Its answer_source was consent_permission -
 * Litos's own record of accepting the consent under her standing permission, ticked by the send's
 * guarded consent action - and pressing Confirm on it would have rewritten the answer in her name
 * and un-licensed that tick. The salary row beside it is a real human-only answer and keeps its ask. */
const consentSentence = "Required. En envoyant ma candidature, je déclare avoir lu la Privacy Policy et je consens à ce que ChapsVision stocke mes données personnelles pour pouvoir traiter ma candidature.";
const review = {
  status: "ready_for_final_approval",
  attention_reason: undefined,
  attention_categories: [],
  attention_acknowledgements: undefined,
  cover_letter_supported: false,
  transcript_supported: false,
  filled_fields: [],
  required_documents: [],
  stall: undefined,
  questions_reviewed_at: "2026-09-06T09:22:49.095Z",
  questions: [
    { id: "q-salary", question: "What are your salary expectations for this role?* required", answer: "$20/hour", required: true, kind: "required", portal_input_type: "text", answer_source: "applicant_review" },
    { id: "q-consent", question: consentSentence, answer: "Yes", required: true, kind: "required", portal_input_type: "checkbox", options: [consentSentence], answer_source: "consent_permission" },
  ],
};

test("without a server list, the local guess still asks for the salary but never for a licensed consent", () => {
  const items = humanInputItems(review, { sensitiveConfirmations: undefined });
  const confirms = items.filter((item) => item.actionKind === "confirm");
  assert.deepEqual(confirms.map((item) => item.questionId), ["q-salary"]);
  assert.equal(items.some((item) => item.questionId === "q-consent"), false, "the licensed consent is nobody's task");
});

test("the same consent answered in her own name is still hers to finish", () => {
  // "Yes" typed by the applicant against a one-sentence option is off-list, so the row is a real
  // "Answer" ask (the shared questionReadsAsAnswered rule), never silently dropped.
  const applicantConsent = { ...review, questions: [{ ...review.questions[1], answer_source: "applicant_review" }] };
  const items = humanInputItems(applicantConsent, { sensitiveConfirmations: undefined });
  assert.deepEqual(items.filter((item) => item.questionId === "q-consent").map((item) => item.actionKind), ["answer"]);
  // And her own free-text answer on a human-only label is still hers to confirm.
  const typedConsent = { ...review, questions: [{ ...review.questions[1], options: undefined, portal_input_type: "text", answer: "I agree", answer_source: "applicant_review" }] };
  const confirms = humanInputItems(typedConsent, { sensitiveConfirmations: undefined }).filter((item) => item.actionKind === "confirm");
  assert.deepEqual(confirms.map((item) => item.questionId), ["q-consent"]);
});

test("the server's own list stays authoritative when it is present", () => {
  const named = humanInputItems(review, { sensitiveConfirmations: [consentSentence] }).filter((item) => item.actionKind === "confirm");
  assert.deepEqual(named.map((item) => item.questionId), ["q-consent"]);
  const empty = humanInputItems(review, { sensitiveConfirmations: [] }).filter((item) => item.actionKind === "confirm");
  assert.deepEqual(empty, []);
});
