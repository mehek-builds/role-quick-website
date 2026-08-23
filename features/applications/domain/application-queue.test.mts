import test from "node:test";
import assert from "node:assert/strict";
import {
  applicationMatchesQuery,
  applicationNextActionRank,
  applicationWorkflowRevision,
  type ApplicationQueueItem,
} from "./application-queue.ts";

const packet: ApplicationQueueItem = {
  job_context: {
    role: "Machine-Learning Intern",
    company: "Quandela",
  },
  spec: {
    _review: {
      status: "needs_attention",
      ats_name: "Greenhouse",
      portal_url: "https://boards.greenhouse.io/quandela/jobs/25",
    },
  },
};

test("queue search is case, spacing, punctuation, and accent insensitive", () => {
  const accentedPacket: ApplicationQueueItem = {
    ...packet,
    job_context: { ...packet.job_context, company: "Quandéla Labs" },
  };

  assert.equal(applicationMatchesQuery(accentedPacket, "  MACHINE learning  "), true);
  assert.equal(applicationMatchesQuery(accentedPacket, "quandela"), true);
  assert.equal(applicationMatchesQuery(accentedPacket, "GREENHOUSE"), true);
  assert.equal(applicationMatchesQuery(accentedPacket, "intern greenhouse"), true);
  assert.equal(applicationMatchesQuery(accentedPacket, "lever"), false);
  assert.equal(applicationMatchesQuery(accentedPacket, "   "), true);
});

test("queue search uses an explicit portal name or portal URL when ATS metadata is sparse", () => {
  const portalPacket: ApplicationQueueItem = {
    job_context: { role: "Product Designer", company: "Mytos" },
    spec: {
      _review: {
        portal_name: "Ashby Hiring",
        portal_url: "https://jobs.ashbyhq.com/mytos/role-1",
      },
    },
  };

  assert.equal(applicationMatchesQuery(portalPacket, "ashby hiring"), true);
  assert.equal(applicationMatchesQuery(portalPacket, "ashbyhq"), true);
  assert.equal(applicationMatchesQuery(portalPacket, "mytos designer"), true);
});

test("next-action rank orders needs-user, ready, working, and terminal states", () => {
  for (const status of ["needs_attention", "ready_for_final_approval", "awaiting_security_code", "failed"]) {
    assert.equal(applicationNextActionRank({ status }), 0, status);
  }
  for (const status of ["resume_ready", "questions_ready", "ready_to_submit"]) {
    assert.equal(applicationNextActionRank({ status }), 1, status);
  }
  for (const status of ["submit_requested", "preparing", "filling", "submitting", "submission_claimed"]) {
    assert.equal(applicationNextActionRank({ status }), 2, status);
  }
  assert.equal(applicationNextActionRank({ status: "submitted" }), 3);
  assert.equal(applicationNextActionRank({ status: "withdrawn" }), 3);
  assert.equal(applicationNextActionRank(null), 3);
});

test("equal priority receives an equal rank so a stable sort keeps ledger order", () => {
  const rows = [
    { id: "sent", status: "submitted" },
    { id: "ready-older", status: "resume_ready" },
    { id: "needs-older", status: "needs_attention" },
    { id: "ready-newer", status: "questions_ready" },
    { id: "working", status: "preparing" },
    { id: "needs-newer", status: "awaiting_security_code" },
  ];

  const ordered = [...rows].sort(
    (left, right) => applicationNextActionRank(left) - applicationNextActionRank(right),
  );

  assert.deepEqual(
    ordered.map((row) => row.id),
    ["needs-older", "needs-newer", "ready-older", "ready-newer", "working", "sent"],
  );
});

test("workflow revision changes with server-owned status, questions, or resume identity", () => {
  const base = {
    id: "packet-1",
    resume_object_key: "resume/one.pdf",
    spec: { _review: { status: "ready_to_submit", updated_at: "2026-08-23T10:00:00Z", questions: [] } },
  };

  assert.equal(applicationWorkflowRevision(base), applicationWorkflowRevision({ ...base }));
  assert.notEqual(
    applicationWorkflowRevision(base),
    applicationWorkflowRevision({
      ...base,
      spec: { _review: { status: "submitted", updated_at: "2026-08-23T10:01:00Z", questions: [] } },
    }),
  );
  assert.notEqual(
    applicationWorkflowRevision(base),
    applicationWorkflowRevision({ ...base, resume_object_key: "resume/two.pdf" }),
  );
});
