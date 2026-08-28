import assert from "node:assert/strict";
import { test } from "node:test";
import { humanInputItems } from "./submission-checklist.ts";

/* The live sentence this rewrite exists for: rendered verbatim as the applicant's entire
 * "Your next step" list on a Belvedere needs_attention row, 2026-08-28. */
const UNLABELED_FIELD_BLOCKER = "A required field on the form has no label Litos can read, and is still empty";

const baseReview = {
  attention_reason: UNLABELED_FIELD_BLOCKER,
  attention_categories: [],
  attention_acknowledgements: undefined,
  cover_letter_supported: true,
  filled_fields: [],
  questions: [],
  questions_reviewed_at: undefined,
  required_documents: [],
  transcript_supported: false,
  stall: undefined,
  status: "needs_attention",
} as Parameters<typeof humanInputItems>[0];

test("the unlabeled-field diagnostic renders as an action, not the runner's sentence", () => {
  const items = humanInputItems(baseReview);
  const row = items.find((item) => item.id.startsWith("blocker-"));
  assert.ok(row, "the blocker row still exists");
  assert.equal(row.label, "One required box on the form still needs an answer");
  assert.match(row.detail ?? "", /packet review/i);
  assert.match(row.detail ?? "", /tick this row/i);
  /* The rewrite is copy only: the row still keys, dedupes and acknowledges off the original. */
  assert.equal(row.acknowledgeable, true);
  assert.ok(row.subject, "subject survives for dedupe");
});

test("an acknowledged rewritten row settles and reports the tick, not the rewrite detail", () => {
  const items = humanInputItems({
    ...baseReview,
    attention_acknowledgements: Object.fromEntries(
      humanInputItems(baseReview)
        .filter((item) => item.id.startsWith("blocker-"))
        .map((item) => [item.id, { acknowledged_at: "2026-08-28T00:00:00Z" }]),
    ),
  });
  const row = items.find((item) => item.id.startsWith("blocker-"));
  assert.ok(row);
  assert.equal(row.settled, true);
  assert.match(row.detail ?? "", /Ticked off by you/);
});

test("an unrecognized attention sentence still renders verbatim", () => {
  const items = humanInputItems({
    ...baseReview,
    attention_reason: "The employer's page asked for a notarized unicorn licence",
  });
  const row = items.find((item) => item.id.startsWith("blocker-"));
  assert.ok(row);
  assert.equal(row.label, "The employer's page asked for a notarized unicorn licence");
  assert.equal(row.detail, undefined);
});

test("two distinct blockers matching one rewrite never collapse: the second stays verbatim", () => {
  const second = "Another required field near the demographics section has no label Litos can read, and is still empty";
  const items = humanInputItems({
    ...baseReview,
    attention_reason: `${UNLABELED_FIELD_BLOCKER}\n${second}`,
  });
  const rows = items.filter((item) => item.id.startsWith("blocker-"));
  assert.equal(rows.length, 2, "both blockers render");
  assert.equal(rows[0]?.label, "One required box on the form still needs an answer");
  assert.equal(rows[1]?.label, second);
});

test("a plural fields diagnostic is never rewritten to one-box copy", () => {
  const plural = "Two required fields on the form have no label Litos can read, and are still empty";
  const items = humanInputItems({ ...baseReview, attention_reason: plural });
  const row = items.find((item) => item.id.startsWith("blocker-"));
  assert.ok(row);
  assert.equal(row.label, plural);
});
