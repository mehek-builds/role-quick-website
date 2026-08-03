import assert from "node:assert/strict";
import test from "node:test";
import {
  describeRemainingWork,
  describeWait,
  isWaitingOnHuman,
  waitingApplications,
  type StallInfo,
} from "./captcha-queue.ts";

const STALL: StallInfo = {
  kind: "human_verification",
  stalled_at: "2026-08-04T09:00:00.000Z",
  surface: "server_run",
  provider: "recaptcha_v2",
  stage: "at_submit",
  source: "observed",
};

function packet(id: string, review: Record<string, unknown> | null, context?: { company?: string; role?: string }) {
  return { id, job_context: context ?? { company: "Acme", role: "Analyst" }, spec: review ? { _review: review } : null };
}

test("an application waiting on a challenge is in the queue", () => {
  assert.equal(isWaitingOnHuman({ status: "needs_attention", stall: STALL }), true);
});

test("a resolved stall is not waiting on anyone", () => {
  assert.equal(
    isWaitingOnHuman({ status: "needs_attention", stall: { ...STALL, resolved_at: "2026-08-04T09:05:00.000Z" } }),
    false,
  );
});

test("a submitted application is not waiting, whatever its stall history says", () => {
  assert.equal(isWaitingOnHuman({ status: "submitted", stall: STALL }), false);
});

// This queue promises something narrower than "needs attention". A missing field or an unanswered
// attestation is a different problem with a different fix, and putting it here would make the
// heading a lie.
test("an application that needs attention for some other reason is not in this queue", () => {
  assert.equal(isWaitingOnHuman({ status: "needs_attention" }), false);
});

test("no review at all is not waiting", () => {
  assert.equal(isWaitingOnHuman(null), false);
  assert.equal(isWaitingOnHuman(undefined), false);
});

test("the queue puts the longest wait first", () => {
  const queue = waitingApplications([
    packet("newest", { status: "needs_attention", stall: { ...STALL, stalled_at: "2026-08-04T12:00:00.000Z" } }),
    packet("oldest", { status: "needs_attention", stall: { ...STALL, stalled_at: "2026-08-01T08:00:00.000Z" } }),
    packet("middle", { status: "needs_attention", stall: { ...STALL, stalled_at: "2026-08-03T10:00:00.000Z" } }),
  ]);
  assert.deepEqual(queue.map((entry) => entry.id), ["oldest", "middle", "newest"]);
});

test("the queue excludes everything that is not waiting on a human", () => {
  const queue = waitingApplications([
    packet("waiting", { status: "needs_attention", stall: STALL }),
    packet("submitted", { status: "submitted", stall: STALL }),
    packet("other-blocker", { status: "needs_attention" }),
    packet("no-review", null),
  ]);
  assert.deepEqual(queue.map((entry) => entry.id), ["waiting"]);
});

// A blank card reading "This company / this role" is worse than useless, but an application with a
// missing company must still appear: dropping it would hide work the applicant owes.
test("an application with no company still appears, with readable placeholders", () => {
  const [entry] = waitingApplications([
    packet("bare", { status: "needs_attention", stall: STALL }, { company: "  ", role: "" }),
  ]);
  assert.equal(entry?.company, "This company");
  assert.equal(entry?.role, "this role");
});

test("the portal url rides along so the queue can send them back to the right page", () => {
  const [entry] = waitingApplications([
    packet("with-url", {
      status: "needs_attention",
      portal_url: "https://boards.greenhouse.io/acme/jobs/1",
      stall: STALL,
    }),
  ]);
  assert.equal(entry?.portalUrl, "https://boards.greenhouse.io/acme/jobs/1");
});

// ---- wording ----

const NOW = Date.parse("2026-08-04T12:00:00.000Z");

test("a wait is described in the roughest unit that is still true", () => {
  assert.equal(describeWait("2026-08-04T11:40:00.000Z", NOW), "Waiting since today");
  assert.equal(describeWait("2026-08-04T09:00:00.000Z", NOW), "Waiting 3 hours");
  assert.equal(describeWait("2026-08-04T11:00:00.000Z", NOW), "Waiting 1 hour");
  assert.equal(describeWait("2026-08-01T12:00:00.000Z", NOW), "Waiting 3 days");
  assert.equal(describeWait("2026-08-03T12:00:00.000Z", NOW), "Waiting 1 day");
});

test("a wait never reads as negative when clocks disagree", () => {
  assert.equal(describeWait("2026-08-04T18:00:00.000Z", NOW), "Waiting since today");
});

test("an unreadable timestamp degrades to something true rather than throwing", () => {
  assert.equal(describeWait("not a date", NOW), "Waiting");
});

/* The distinction the backend already draws, for the same reason: telling someone their form is
 * filled and one step remains, when the run stopped before touching it, sends them to a blank page
 * and costs the trust to believe the next message. */
test("the remaining work is described honestly for each stage", () => {
  assert.match(describeRemainingWork("at_submit"), /Everything else is filled in/);
  assert.match(describeRemainingWork("before_fill"), /Nothing is filled in yet/);
});
