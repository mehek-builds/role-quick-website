import assert from "node:assert/strict";
import test from "node:test";
import { packetEntryScreen } from "./packet-entry-screen.ts";
import type { ApplicationReview } from "../../../lib/api.ts";

const packet = (over: Partial<ApplicationReview> = {}): ApplicationReview => ({
  status: "ready_for_final_approval", jd_text: "Internship", questions: [], ...over,
} as ApplicationReview);
const question = { id: "gender", question: "Which programming language?", answer: "Rust", required: true,
  options: ["Python", "TypeScript"], options_complete: true, portal_input_type: "select", kind: "required" as const };

test("Akuna and every other employer enter correction for off-list required answers", () => {
  for (const status of ["ready_for_final_approval", "ready_to_submit", "questions_ready"] as const) {
    assert.equal(packetEntryScreen(packet({ status, questions: [question] })), "questions");
  }
});
test("a blank answer enters questions while an accepted answer still requires the packet audit", () => {
  assert.equal(packetEntryScreen(packet({ questions: [{ ...question, answer: "" }] })), "questions");
  assert.equal(packetEntryScreen(packet({ questions: [{ ...question, answer: "Python" }] })), "review");
});
test("a held or unresolved attempt cannot enter editable questions", () => {
  assert.equal(packetEntryScreen(packet({ questions: [question], submission_claim_id: "held" })), "portal");
  assert.equal(packetEntryScreen(packet({ status: "needs_attention", questions: [question],
    unverified_submission: { at: "2026-09-05T10:00:00.000Z", cause: "no_confirmation_state" } })), "portal");
  assert.equal(packetEntryScreen(packet({ status: "submitted", questions: [question], submitted_at: "2026-09-05T10:00:00.000Z" })), "submitted");
});

test("needs-attention packets retain the guided inline question flow", () => {
  assert.equal(packetEntryScreen(packet({ status: "needs_attention", questions: [question] })), "portal");
});
