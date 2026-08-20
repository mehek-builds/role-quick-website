import assert from "node:assert/strict";
import test from "node:test";
import { ATTENTION_TICK_RACED, attentionAckRequest, attentionAcksPath, saveAttentionAcknowledgement } from "./attention-acknowledgement.ts";

/* The module exists so the component cannot quietly diverge from the server's contract: the route,
   the body, and the reading of the 202 all have one definition and one test. See the module header
   for the dead checkbox this replaces. */

test("the tick travels the one route with only the fields the server accepts", () => {
  assert.equal(attentionAcksPath("abc-123"), "/applications/abc-123/review/attention-acks");
  const request = attentionAckRequest("blocker-discipline", '"Discipline" is required and is still empty', true);
  assert.equal(request.method, "POST");
  assert.deepEqual(JSON.parse(request.body), {
    item_id: "blocker-discipline",
    label: '"Discipline" is required and is still empty',
    acknowledged: true,
  });
});

test("a landed tick returns the stored review, so the box only shows what is on the row", async () => {
  const review = { attention_acknowledgements: { "blocker-discipline": { acknowledged_at: "2026-08-20T09:00:00.000Z" } } };
  const result = await saveAttentionAcknowledgement({
    applicationId: "abc-123",
    itemId: "blocker-discipline",
    label: "x",
    acknowledged: true,
    send: async () => ({ application_id: "abc-123", review }),
  });
  assert.deepEqual(result, { saved: true, review });
});

/* A 202 IS NOT A SAVE, AND IT ARRIVES LOOKING EXACTLY LIKE ONE - same discriminator the answers
   save reads, for the same transport reason. Unlike the answers save, the raced result KEEPS the
   response's review: the truth for a tick is the row the winning run left, not local typing. */
test("the raced 202 is not a save, and carries what the winning run actually stored", async () => {
  const refreshed = { attention_reason: "A fresh report from the run that won" };
  const result = await saveAttentionAcknowledgement({
    applicationId: "abc-123",
    itemId: "blocker-discipline",
    label: "x",
    acknowledged: true,
    send: async () => ({ application_id: "abc-123", review: refreshed, saved: false }),
  });
  assert.equal(result.saved, false);
  assert.equal(result.saved === false && result.message, ATTENTION_TICK_RACED);
  assert.equal(result.saved === false && result.review, refreshed, "the panel renders the run's report, not the tick that lost");
});

test("a refusal surfaces the server's own sentence, and a bare failure gets a retryable one", async () => {
  const refused = await saveAttentionAcknowledgement({
    applicationId: "abc-123",
    itemId: "blocker-discipline",
    label: "x",
    acknowledged: false,
    send: async () => { throw new Error("Application review is not available for this resume"); },
  });
  assert.deepEqual(refused, { saved: false, message: "Application review is not available for this resume" });

  const failed = await saveAttentionAcknowledgement({
    applicationId: "abc-123",
    itemId: "blocker-discipline",
    label: "x",
    acknowledged: false,
    send: async () => { throw new Error(""); },
  });
  assert.equal(failed.saved, false);
  assert.match(failed.saved === false ? failed.message : "", /Try it again/);
});
