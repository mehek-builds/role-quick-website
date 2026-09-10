import test from "node:test";
import assert from "node:assert/strict";
import {
  PRE_SEND_VERIFICATION_NO_JD,
  PRE_SEND_VERIFICATION_NO_PORTAL_URL,
  PRE_SEND_VERIFICATION_NO_TRACKER_ROW,
  PRE_SEND_VERIFICATION_UNNAMED_ISSUE,
  preSendVerificationRefusal,
  preSendVerificationReviewState,
} from "./pre-send-verification.ts";

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

/* The rebuild's three preconditions in their ordinary, workable shape. A case names only the one
   it is about, so a new precondition cannot quietly pass every existing test by defaulting to a
   value nobody wrote down. */
function context(overrides: Partial<Parameters<typeof preSendVerificationReviewState>[1]> = {}) {
  return {
    applicationId: "packet-1",
    jdText: "jd",
    canonicalApplicationId: "canonical-1",
    portalUrl: "https://boards.example.com/jobs/1",
    rebuilding: false,
    ...overrides,
  };
}

test("the review screen disables the send, names the entries, and offers the rebuild", () => {
  const state = preSendVerificationReviewState(
    preSendVerificationRefusal("packet-1", liveRefusal()),
    context({ jdText: "Senior analyst. Requirements: ..." }),
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
      context({ applicationId: "packet-2" }),
    ),
    null,
  );
  assert.equal(
    preSendVerificationReviewState(
      preSendVerificationRefusal("packet-1", liveRefusal()),
      context({ applicationId: null }),
    ),
    null,
  );
  assert.equal(
    preSendVerificationReviewState(null, context()),
    null,
  );
});

test("the screen never claims a list the server did not send", () => {
  const state = preSendVerificationReviewState(
    preSendVerificationRefusal("packet-1", liveRefusal([])),
    context(),
  );
  assert.ok(state);
  assert.deepEqual(state.issues, [PRE_SEND_VERIFICATION_UNNAMED_ISSUE]);
  /* Still a stop and still a rebuild: an unnamed objection is not a reason to re-arm the send. */
  assert.equal(state.sendDisabled, true);
  assert.equal(state.rebuildAvailable, true);
});

test("no frozen job description means the rebuild says why instead of failing on press", () => {
  for (const jdText of [undefined, null, "   "]) {
    const state = preSendVerificationReviewState(
      preSendVerificationRefusal("packet-1", liveRefusal()),
      context({ jdText }),
    );
    assert.ok(state);
    assert.equal(state.sendDisabled, true);
    assert.equal(state.rebuildAvailable, false);
    assert.equal(state.rebuildBlockedReason, PRE_SEND_VERIFICATION_NO_JD);
  }
});

test("a rebuild already running cannot be started a second time from the same banner", () => {
  const state = preSendVerificationReviewState(
    preSendVerificationRefusal("packet-1", liveRefusal()),
    context({ rebuilding: true }),
  );
  assert.ok(state);
  assert.equal(state.rebuildInProgress, true);
  /* The monthly tailoring allowance is spent by the generation this button starts, so a double
     click must not reach it. */
  assert.equal(state.rebuildAvailable, false);
});

/* THE 2026-09-10 DEAD BUTTON, in the two shapes that produced it.
 *
 * The banner rendered with an enabled rebuild, the press issued no request, and nothing on screen
 * changed: the page could not name the Tracker row for the deep-linked packet - `/applications` is
 * read one 200-row window at a time and an older packet's row can sit outside it - and every
 * refusal on the way to /resume/generate was written to the New application composer, which is
 * closed on this screen. Both preconditions now disable the control and say why. */
test("a packet whose Tracker row this page cannot name says so instead of dying on press", () => {
  for (const canonicalApplicationId of [undefined, null, "", "   "]) {
    const state = preSendVerificationReviewState(
      preSendVerificationRefusal("packet-1", liveRefusal()),
      context({ canonicalApplicationId }),
    );
    assert.ok(state);
    assert.equal(state.sendDisabled, true);
    assert.equal(state.rebuildAvailable, false);
    assert.equal(state.rebuildBlockedReason, PRE_SEND_VERIFICATION_NO_TRACKER_ROW);
  }
});

test("a packet with no usable job link says so instead of dying on press", () => {
  for (const portalUrl of [undefined, null, "", "   ", "not a url", "http://boards.example.com/jobs/1"]) {
    const state = preSendVerificationReviewState(
      preSendVerificationRefusal("packet-1", liveRefusal()),
      context({ portalUrl }),
    );
    assert.ok(state);
    assert.equal(state.rebuildAvailable, false);
    assert.equal(state.rebuildBlockedReason, PRE_SEND_VERIFICATION_NO_PORTAL_URL);
  }
});

/* One sentence, and it must be the first true one: a packet missing all three is missing its job
   description first, and telling her to reopen the row would send her somewhere that cannot help. */
test("only the first blocking reason is shown", () => {
  const state = preSendVerificationReviewState(
    preSendVerificationRefusal("packet-1", liveRefusal()),
    context({ jdText: "", canonicalApplicationId: null, portalUrl: "" }),
  );
  assert.ok(state);
  assert.equal(state.rebuildBlockedReason, PRE_SEND_VERIFICATION_NO_JD);
});

/* A blocked rebuild is still a STOP: the send stays withdrawn whatever the reason, because the
   packet's wording is what the server refused and none of these reasons change it. */
test("a blocked rebuild never re-arms the send", () => {
  for (const blocked of [{ jdText: "" }, { canonicalApplicationId: null }, { portalUrl: "" }]) {
    const state = preSendVerificationReviewState(
      preSendVerificationRefusal("packet-1", liveRefusal()),
      context(blocked),
    );
    assert.ok(state);
    assert.equal(state.sendDisabled, true);
    assert.ok(state.rebuildBlockedReason);
  }
});
