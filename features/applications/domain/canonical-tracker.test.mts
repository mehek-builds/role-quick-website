import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalApplication, GeneratedResume } from "../../../lib/api.ts";
import {
  canonicalApplicationFromPacket,
  linkedLegacyPacketFromCanonicalTrackerPacket,
  mergeCanonicalApplicationHistory,
  upsertCanonicalApplicationHistory,
} from "./canonical-tracker.ts";

function legacy(overrides: Partial<GeneratedResume> = {}): GeneratedResume {
  return {
    id: "legacy-resume",
    job_context: {
      company: "Acme",
      role: "Product Intern",
      job_id: "11111111-1111-4111-8111-111111111111",
    },
    spec: {
      _review: {
        jd_text: "",
        portal_url: "https://jobs.lever.co/acme/requisition-1",
        status: "resume_ready",
        edited_terms: [],
        questions: [],
        skipped_reasons: [],
        updated_at: "2026-08-13T00:00:00.000Z",
      },
    } as unknown as GeneratedResume["spec"],
    created_at: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

function canonical(overrides: Partial<CanonicalApplication> = {}): CanonicalApplication {
  return {
    id: "canonical-application",
    legacy_generated_resume_id: null,
    job_id: null,
    company: "Acme",
    role: "Product Intern",
    portal_url: "https://jobs.lever.co/acme/requisition-2",
    tracker_state: "applying",
    review_state: "filling",
    submission_state: "not_started",
    created_at: "2026-08-14T00:00:00.000Z",
    updated_at: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

test("canonical-only Free fills become visible Tracker rows that cannot enter autopilot", () => {
  const merged = mergeCanonicalApplicationHistory([], [canonical()]);
  assert.equal(merged.length, 1);
  const application = canonicalApplicationFromPacket(merged[0]);
  assert.equal(application?.id, "canonical-application");
  assert.equal(merged[0].spec._review?.status, "needs_attention");
  assert.equal(merged[0].spec._review?.portal_url, "https://jobs.lever.co/acme/requisition-2");
});

test("the canonical envelope retains linked packet data without a duplicate", () => {
  const packet = legacy();
  const merged = mergeCanonicalApplicationHistory([packet], [canonical({
    legacy_generated_resume_id: packet.id,
    company: "Renamed company",
    role: "Renamed role",
    portal_url: "https://example.com/different",
  })]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "canonical-application");
  assert.equal(merged[0].spec._review?.status, "needs_attention");
  assert.equal(canonicalApplicationFromPacket(merged[0])?.id, "canonical-application");
  assert.equal(linkedLegacyPacketFromCanonicalTrackerPacket(merged[0])?.id, packet.id);
});

test("a submitted canonical application owns the linked packet lifecycle and visible id", () => {
  const packet = legacy({
    download_url: "https://files.example/resume.pdf",
  });
  const application = canonical({
    legacy_generated_resume_id: packet.id,
    tracker_state: "applied",
    review_state: "submitted",
    submission_state: "submitted",
  });

  const merged = mergeCanonicalApplicationHistory([packet], [application]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, application.id);
  assert.equal(merged[0].spec._review?.status, "submitted");
  assert.equal(merged[0].download_url, packet.download_url);
  assert.equal(canonicalApplicationFromPacket(merged[0])?.tracker_state, "applied");
  assert.equal(linkedLegacyPacketFromCanonicalTrackerPacket(merged[0])?.id, packet.id);
  assert.equal(linkedLegacyPacketFromCanonicalTrackerPacket(merged[0])?.spec._review?.status, "submitted");
});

test("exact job and portal identities dedupe during a rolling migration", () => {
  const packet = legacy();
  assert.equal(mergeCanonicalApplicationHistory([packet], [canonical({
    job_id: packet.job_context.job_id,
  })]).length, 1);
  assert.equal(mergeCanonicalApplicationHistory([packet], [canonical({
    portal_url: `${packet.spec._review?.portal_url}/?utm_source=litos#apply`,
  })]).length, 1);
});

test("same company and role do not collapse distinct portal requisitions", () => {
  const merged = mergeCanonicalApplicationHistory([legacy()], [canonical()]);
  assert.equal(merged.length, 2);
  assert.equal(canonicalApplicationFromPacket(merged[1])?.id, "canonical-application");
});

test("canonical rows with no stronger identity use company and role only as a last resort", () => {
  const packet = legacy({
    job_context: { company: "Acme Inc.", role: "Product Intern", job_id: null },
    spec: {
      _review: {
        jd_text: "",
        status: "resume_ready",
        edited_terms: [],
        questions: [],
        skipped_reasons: [],
        updated_at: "2026-08-13T00:00:00.000Z",
      },
    } as unknown as GeneratedResume["spec"],
  });
  const merged = mergeCanonicalApplicationHistory([packet], [canonical({
    job_id: null,
    company: "ACME, Inc",
    role: "Product Intern",
    portal_url: null,
  })]);
  assert.equal(merged.length, 1);
});

test("a Tracker retry replaces canonical state without duplicating the row", () => {
  const initial = mergeCanonicalApplicationHistory([], [canonical({ review_state: "not_started" })]);
  const updated = upsertCanonicalApplicationHistory(initial, canonical({ review_state: "filling" }));
  assert.equal(updated.length, 1);
  assert.equal(canonicalApplicationFromPacket(updated[0])?.review_state, "filling");
});

test("a canonical lifecycle refresh keeps the linked packet while changing its visible status", () => {
  const packet = legacy();
  const initial = mergeCanonicalApplicationHistory([packet], [canonical({
    legacy_generated_resume_id: packet.id,
  })]);
  const updated = upsertCanonicalApplicationHistory(initial, canonical({
    legacy_generated_resume_id: packet.id,
    tracker_state: "applied",
    review_state: "submitted",
    submission_state: "submitted",
  }));

  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, "canonical-application");
  assert.equal(updated[0].spec._review?.status, "submitted");
  assert.equal(linkedLegacyPacketFromCanonicalTrackerPacket(updated[0])?.id, packet.id);
});

test("a canonical row that declares itself ready reaches the Ready queue", () => {
  /* Measured on production 2026-08-17. DRW and Databricks carry submission_state=ready_to_submit AND
     review_state=ready_to_submit on the CANONICAL row, agreeing with their linked packet rather than
     contradicting it, and the Tracker still reported "0 ready to send" over them with no reachable
     send control. */
  const packet = legacy();
  const merged = mergeCanonicalApplicationHistory([packet], [canonical({
    legacy_generated_resume_id: packet.id,
    submission_state: "ready_to_submit",
    review_state: "ready_to_submit",
    tracker_state: "saved",
  })]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].spec._review?.status, "ready_to_submit");
  // The linked packet is still reachable, so opening it still routes to the packet's own id.
  assert.equal(linkedLegacyPacketFromCanonicalTrackerPacket(merged[0])?.id, packet.id);
});

test("readiness needs BOTH canonical fields, not review_state alone", () => {
  /* The adversary that can win, and it is a real row rather than an invention: Mercari and Jump
     Trading both carry review_state=ready while submission_state says not_started. Those two DO have
     a next human step, and promoting them would send an application the ledger never called ready.
     A fix keyed on review_state alone passes the test above and breaks these. */
  const packet = legacy();
  for (const overrides of [
    { submission_state: "not_started" as const, review_state: "ready" as const },
    { submission_state: "not_started" as const, review_state: "ready_to_submit" as const },
    { submission_state: "ready_to_submit" as const, review_state: "filling" as const },
  ]) {
    const merged = mergeCanonicalApplicationHistory([packet], [canonical({
      legacy_generated_resume_id: packet.id,
      ...overrides,
    })]);
    assert.equal(
      merged[0].spec._review?.status,
      "needs_attention",
      `${overrides.submission_state}/${overrides.review_state} must stay with the human`,
    );
  }
});

test("a canonical row with no linked packet can never be sent, even when it says ready", () => {
  // portal_supported is false on the packet-less branch, and reviewCanBeSent requires it not be
  // false, so there is nothing to send and the promotion above cannot reach it.
  const merged = mergeCanonicalApplicationHistory([], [canonical({
    submission_state: "ready_to_submit",
    review_state: "ready_to_submit",
  })]);
  assert.equal(merged[0].spec._review?.portal_supported, false);
});
