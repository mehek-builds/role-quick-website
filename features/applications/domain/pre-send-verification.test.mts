import test from "node:test";
import assert from "node:assert/strict";
import {
  PRE_SEND_VERIFICATION_UNNAMED_ISSUE,
  groundingPacketRebuilt,
  preSendVerificationRefusal,
  preSendVerificationReviewState,
} from "./pre-send-verification.ts";

test("a typed grounding repair accepts only two UUID identities", () => {
  const canonicalApplicationId = "8b9b0722-7e23-4aa5-88ea-8877c11df17f";
  const packetId = "34d93673-3298-4c98-b6d4-a15916b91c79";
  assert.deepEqual(groundingPacketRebuilt(new FakeApiError(409, "updated", [], {
    code: "GROUNDING_PACKET_REBUILT",
    canonical_application_id: canonicalApplicationId,
    packet_id: packetId,
  })), { canonicalApplicationId, packetId });
});

test("grounding repair rejects wrong status, code, or malformed identity", () => {
  const body = {
    code: "GROUNDING_PACKET_REBUILT",
    canonical_application_id: "8b9b0722-7e23-4aa5-88ea-8877c11df17f",
    packet_id: "34d93673-3298-4c98-b6d4-a15916b91c79",
  };
  assert.equal(groundingPacketRebuilt(new FakeApiError(422, "updated", [], body)), null);
  assert.equal(groundingPacketRebuilt(new FakeApiError(409, "updated", [], { ...body, code: "PACKET_AUDIT_STALE" })), null);
  assert.equal(groundingPacketRebuilt(new FakeApiError(409, "updated", [], { ...body, packet_id: "not-a-uuid" })), null);
});

/* MEASURED 2026-09-07. volley-backend PR #1058 put a pre-send resume verification in front of
   POST /applications/:id/submit-request, and every one of this account's roughly two hundred stored
   packets - all tailored before the rule existed - answers it. The dashboard's response was a red
   sentence over a still-enabled "Approve packet and fill form", which re-fired the same 422 on every
   press, with no rebuild control anywhere on the review screen. */

class FakeApiError extends Error {
  status: number;
  issues: string[];
  data: unknown;
  constructor(status: number, message: string, issues: string[], data: unknown) {
    super(message);
    this.status = status;
    this.issues = issues;
    this.data = data;
  }
}

const GROUNDING_ISSUE =
  "grounding: a <entry> metric is stored as a target, plan, or forecast but rendered as an achieved result";

function liveRefusal(issues: string[] = [GROUNDING_ISSUE]) {
  return new FakeApiError(
    422,
    `Verify the resume before sending. The current packet is not ready for submission. Issues: ${issues.join("; ")}.`,
    issues,
    {
      error: "Verify the resume before sending. The current packet is not ready for submission.",
      code: "PRE_SEND_VERIFICATION_FAILED",
      issues,
    },
  );
}

test("the refusal is recognised from the body's code, not from the sentence", () => {
  const refusal = preSendVerificationRefusal("packet-1", liveRefusal());
  assert.ok(refusal);
  assert.equal(refusal.applicationId, "packet-1");
  /* The server's own sentence, WITHOUT the "Issues: ..." tail lib/api.ts folds into Error.message.
     The issues are rendered as their own list, so repeating them inside the sentence reads as two
     different findings. */
  assert.equal(
    refusal.message,
    "Verify the resume before sending. The current packet is not ready for submission.",
  );
  assert.deepEqual(refusal.issues, [GROUNDING_ISSUE]);
});

test("a differently worded refusal carrying the same code is still recognised", () => {
  const reworded = new FakeApiError(422, "Anything at all.", [], {
    error: "The current packet is not ready for extension submission.",
    code: "PRE_SEND_VERIFICATION_FAILED",
    issues: ["grounding: one line"],
  });
  assert.equal(
    preSendVerificationRefusal("packet-1", reworded)?.message,
    "The current packet is not ready for extension submission.",
  );
});

test("other send refusals are not mistaken for this one", () => {
  assert.equal(preSendVerificationRefusal("packet-1", null), null);
  assert.equal(preSendVerificationRefusal("packet-1", new Error("offline")), null);
  /* Same 422 status, different rule: the education-drift and optional-question gates both answer
     422 on this route and are answered on their own screens. */
  assert.equal(preSendVerificationRefusal("packet-1", new FakeApiError(422, "x", [], {
    error: "Choose Answer or Skip for every optional question before submitting.",
    code: "OPTIONAL_QUESTION_DECISION_REQUIRED",
  })), null);
  /* Same code cannot arrive under a different status; matching on the code alone would let a 409
     packet-audit body through if the backend ever reused the string. */
  assert.equal(preSendVerificationRefusal("packet-1", new FakeApiError(409, "x", [], {
    code: "PRE_SEND_VERIFICATION_FAILED",
  })), null);
});

test("issues are cleaned and deduped, and the untruncated body list is what is read", () => {
  const many = Array.from({ length: 7 }, (_, index) => `grounding:  line\n ${index}`);
  const refusal = preSendVerificationRefusal("packet-1", liveRefusal([...many, many[0]!]));
  assert.ok(refusal);
  /* Seven, not the five lib/api.ts leaves in the sentence before it starts saying "2 more issues
     hidden". A list of what to rebuild must not be the truncated one. */
  assert.equal(refusal.issues.length, 7);
  assert.equal(refusal.issues[0], "grounding: line 0");
});

test("the review screen disables the send, names the entries, and offers the rebuild", () => {
  const state = preSendVerificationReviewState(
    preSendVerificationRefusal("packet-1", liveRefusal()),
    { applicationId: "packet-1", jdText: "Senior analyst. Requirements: ...", rebuilding: false },
  );
  assert.ok(state);
  assert.equal(state.sendDisabled, true);
  assert.deepEqual(state.issues, [GROUNDING_ISSUE]);
  assert.equal(state.rebuildAvailable, true);
  assert.equal(state.rebuildBlockedReason, null);
  assert.equal(state.rebuildInProgress, false);
});

test("a refusal earned by another packet does not stop the one on screen", () => {
  assert.equal(
    preSendVerificationReviewState(
      preSendVerificationRefusal("packet-1", liveRefusal()),
      { applicationId: "packet-2", jdText: "jd", rebuilding: false },
    ),
    null,
  );
  assert.equal(
    preSendVerificationReviewState(
      preSendVerificationRefusal("packet-1", liveRefusal()),
      { applicationId: null, jdText: "jd", rebuilding: false },
    ),
    null,
  );
  assert.equal(
    preSendVerificationReviewState(null, { applicationId: "packet-1", jdText: "jd", rebuilding: false }),
    null,
  );
});

test("the screen never claims a list the server did not send", () => {
  const state = preSendVerificationReviewState(
    preSendVerificationRefusal("packet-1", liveRefusal([])),
    { applicationId: "packet-1", jdText: "jd", rebuilding: false },
  );
  assert.ok(state);
  assert.deepEqual(state.issues, [PRE_SEND_VERIFICATION_UNNAMED_ISSUE]);
  /* Still a stop and still a rebuild: an unnamed objection is not a reason to re-arm the send. */
  assert.equal(state.sendDisabled, true);
  assert.equal(state.rebuildAvailable, true);
});

test("system repair remains available without a client-side job description", () => {
  for (const jdText of [undefined, null, "   "]) {
    const state = preSendVerificationReviewState(
      preSendVerificationRefusal("packet-1", liveRefusal()),
      { applicationId: "packet-1", jdText, rebuilding: false },
    );
    assert.ok(state);
    assert.equal(state.sendDisabled, true);
    assert.equal(state.rebuildAvailable, true);
    assert.equal(state.rebuildBlockedReason, null);
  }
});

test("a rebuild already running cannot be started a second time from the same banner", () => {
  const state = preSendVerificationReviewState(
    preSendVerificationRefusal("packet-1", liveRefusal()),
    { applicationId: "packet-1", jdText: "jd", rebuilding: true },
  );
  assert.ok(state);
  assert.equal(state.rebuildInProgress, true);
  /* A double click must not start two audits or race two replacement handoffs. */
  assert.equal(state.rebuildAvailable, false);
});
