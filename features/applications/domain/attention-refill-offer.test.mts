import assert from "node:assert/strict";
import test from "node:test";

import { attentionRefillOffered, type AttentionRefillOfferInput } from "./attention-refill-offer.ts";

/* The offered state, spelled out once so every other case is a single named departure from it. */
const OFFERED: AttentionRefillOfferInput = {
  needsAttention: true,
  awaitingUnverifiedSubmission: false,
  packetReviewRequired: false,
  authorityState: "safe_not_sent",
};

test("a stopped row with a reviewed exact packet and no send in doubt carries the re-fill", () => {
  assert.equal(attentionRefillOffered(OFFERED), true);
});

test("every term is load-bearing on its own", () => {
  /* Each of these is a state in which pressing the control would NOT re-fill. Asserted one at a
     time, because a single "all false" case passes just as well against a predicate that returns
     the wrong constant. */
  assert.equal(
    attentionRefillOffered({ ...OFFERED, needsAttention: false }),
    false,
    "the re-fill is the exit from needs_attention and belongs to no other status",
  );
  assert.equal(
    attentionRefillOffered({ ...OFFERED, awaitingUnverifiedSubmission: true }),
    false,
    "a second employer run must wait for the yes/no card: the employer may already hold this one",
  );
  assert.equal(
    attentionRefillOffered({ ...OFFERED, packetReviewRequired: true }),
    false,
    "without current exact-packet evidence the handler routes to packet review instead of filling, "
    + "which is what the button beside it already does",
  );
  for (const authorityState of ["confirmed", "uncertain"] as const) {
    assert.equal(
      attentionRefillOffered({ ...OFFERED, authorityState }),
      false,
      `prepareApplication refuses ${authorityState} before any request is made, so a control offered `
      + "here would be dead on press: this is the arm PR #522 got wrong",
    );
  }
});

test("the terms are conjunctive, so no single satisfied term can carry the control", () => {
  /* A predicate that ORed its terms, or that read only the authority, would pass the happy-path test
     above and every negative case would still need to fail. These are the mixed states that catch
     it: one term right, the rest wrong. */
  assert.equal(attentionRefillOffered({
    needsAttention: true,
    awaitingUnverifiedSubmission: true,
    packetReviewRequired: true,
    authorityState: "uncertain",
  }), false);
  assert.equal(attentionRefillOffered({
    needsAttention: false,
    awaitingUnverifiedSubmission: false,
    packetReviewRequired: false,
    authorityState: "confirmed",
  }), false);
  assert.equal(attentionRefillOffered({
    needsAttention: false,
    awaitingUnverifiedSubmission: false,
    packetReviewRequired: true,
    authorityState: "safe_not_sent",
  }), false);
});
