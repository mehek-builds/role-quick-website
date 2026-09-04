/* Domain coverage for the two posting_status buckets this feature added to the Tracker's filter:
 * a closed take-down (its own "Closed" view, excluded from Needs you and from Ready) and a stated
 * deadline that has passed but is not yet confirmed open (stays in Needs you, with its own badge,
 * and is excluded from Ready). Mirrors volley-backend's own postingStatusBlocksSend so the two
 * repos agree on what "blocks a send" means for a posting, not only on what "closed" means. */

import test from "node:test";
import assert from "node:assert/strict";
import {
  applicationFilterHeading,
  isApplicationFilter,
  postingStatusBadge,
  postingStatusBlocksSend,
  reviewCanBeSent,
  statusMatchesApplicationFilter,
} from "./application-filter.ts";

const CLOSED = {
  status: "ready_to_submit",
  portal_supported: false,
  posting_status: { state: "closed" as const, reason: "monitor_inactive" as const, observed_at: "2026-09-01T00:00:00.000Z" },
};

const DEADLINE_PASSED_UNCONFIRMED = {
  status: "ready_to_submit",
  portal_supported: false,
  posting_status: { state: "deadline_passed" as const, reason: "stated_deadline" as const, deadline: "2026-08-31T14:59:00.000Z" },
};

const DEADLINE_PASSED_CONFIRMED = {
  status: "ready_to_submit",
  portal_supported: true,
  posting_status: {
    state: "deadline_passed" as const,
    reason: "stated_deadline" as const,
    deadline: "2026-08-31T14:59:00.000Z",
    confirmed_open_at: "2026-09-02T00:00:00.000Z",
  },
};

const ORDINARY_READY = { status: "ready_to_submit", portal_supported: true };

test("isApplicationFilter accepts the new closed filter", () => {
  assert.equal(isApplicationFilter("closed"), true);
});

test("postingStatusBlocksSend is true for a take-down and an unconfirmed deadline, false once confirmed", () => {
  assert.equal(postingStatusBlocksSend(CLOSED), true);
  assert.equal(postingStatusBlocksSend(DEADLINE_PASSED_UNCONFIRMED), true);
  assert.equal(postingStatusBlocksSend(DEADLINE_PASSED_CONFIRMED), false);
  assert.equal(postingStatusBlocksSend(ORDINARY_READY), false);
  assert.equal(postingStatusBlocksSend(null), false);
  assert.equal(postingStatusBlocksSend(undefined), false);
});

test("reviewCanBeSent refuses a closed posting even if portal_supported somehow still read true", () => {
  // Defensive: the backend always pairs 'closed' with portal_supported: false, but this file's own
  // answer must not depend on that pairing holding forever.
  assert.equal(reviewCanBeSent({ ...CLOSED, portal_supported: true }), false);
});

test("reviewCanBeSent refuses an unconfirmed deadline and accepts a confirmed one", () => {
  assert.equal(reviewCanBeSent(DEADLINE_PASSED_UNCONFIRMED), false);
  assert.equal(reviewCanBeSent(DEADLINE_PASSED_CONFIRMED), true);
});

test("reviewCanBeSent is unaffected for a review with no posting_status at all", () => {
  assert.equal(reviewCanBeSent(ORDINARY_READY), true);
});

test("the closed filter matches only a closed take-down, not an unconfirmed deadline", () => {
  assert.equal(statusMatchesApplicationFilter(CLOSED, "closed"), true);
  assert.equal(statusMatchesApplicationFilter(DEADLINE_PASSED_UNCONFIRMED, "closed"), false);
  assert.equal(statusMatchesApplicationFilter(ORDINARY_READY, "closed"), false);
});

test("a closed posting never matches action (Needs you) - it has its own bucket instead", () => {
  assert.equal(statusMatchesApplicationFilter(CLOSED, "action"), false);
  assert.equal(statusMatchesApplicationFilter({ ...CLOSED, status: "needs_attention" }, "action"), false);
});

test("an unconfirmed deadline-passed posting matches action (Needs you), not ready", () => {
  assert.equal(statusMatchesApplicationFilter(DEADLINE_PASSED_UNCONFIRMED, "action"), true);
  assert.equal(statusMatchesApplicationFilter(DEADLINE_PASSED_UNCONFIRMED, "ready"), false);
});

test("a confirmed deadline-passed posting is ready again, and not action", () => {
  assert.equal(statusMatchesApplicationFilter(DEADLINE_PASSED_CONFIRMED, "ready"), true);
  assert.equal(statusMatchesApplicationFilter(DEADLINE_PASSED_CONFIRMED, "action"), false);
});

test("all still shows every row, closed and deadline-passed included", () => {
  assert.equal(statusMatchesApplicationFilter(CLOSED, "all"), true);
  assert.equal(statusMatchesApplicationFilter(DEADLINE_PASSED_UNCONFIRMED, "all"), true);
});

test("postingStatusBadge tags only the unconfirmed deadline-passed case", () => {
  assert.deepEqual(postingStatusBadge(DEADLINE_PASSED_UNCONFIRMED), { label: "Deadline passed", kind: "warn" });
  assert.equal(postingStatusBadge(DEADLINE_PASSED_CONFIRMED), null);
  // Closed gets its own bucket and heading, not a list badge.
  assert.equal(postingStatusBadge(CLOSED), null);
  assert.equal(postingStatusBadge(ORDINARY_READY), null);
});

test("applicationFilterHeading names the closed view", () => {
  assert.equal(applicationFilterHeading("closed"), "Applications whose posting has closed");
});
